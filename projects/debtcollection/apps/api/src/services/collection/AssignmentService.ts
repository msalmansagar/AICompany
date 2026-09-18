import {
  AssignmentConfigurationSchema,
  AssignmentError,
  buildLogSource,
  resolveAssignmentConfiguration,
  type AssignmentConfiguration,
  type AssignmentInput,
  type AssignmentOutcome,
  type CrmCallContext,
  type CrmRecord,
  type IAssignmentEngine,
  type ICollectionLogger,
  type ICrmAdapter,
} from '@dcp/domain';
import { ASSIGNMENT, ASSIGNMENT_METHOD_VALUES, CUSTOMER_TYPE_VALUES, ENTITY_SETS, labelOf } from './qdbBindings.js';

const SOURCE = buildLogSource('AssignmentService');

const ASSIGNMENT_COLUMNS = [
  ASSIGNMENT.id, ASSIGNMENT.name, ASSIGNMENT.method, ASSIGNMENT.priority, ASSIGNMENT.isActive,
  ASSIGNMENT.effectiveFrom, ASSIGNMENT.effectiveTo, ASSIGNMENT.customerType, ASSIGNMENT.productType,
  ASSIGNMENT.region, ASSIGNMENT.riskLevel, ASSIGNMENT.legalStatus, ASSIGNMENT.slaHours,
  ASSIGNMENT.smartAssignmentRef,
];

/** Reads `qdb_assignmentconfiguration`. */
export class AssignmentRepository {
  constructor(private readonly crm: ICrmAdapter) {}

  async listAll(context: CrmCallContext = {}): Promise<AssignmentConfiguration[]> {
    const rows = await this.crm.retrieveMultiple(ENTITY_SETS.assignmentConfiguration, { select: ASSIGNMENT_COLUMNS }, context);
    return rows.map(toConfiguration);
  }
}

/**
 * Chooses the assignment configuration that applies and hands the case to whichever engine that
 * configuration names.
 *
 * DCP does not route. Where the configuration says `SmartAssignment`, the work belongs to QDB's Smart
 * Assignment capability through `IAssignmentEngine`; where that capability has not been supplied, the
 * injected engine refuses and says so (KI-09). The one thing this service will not do is invent a
 * routing algorithm to fill the gap — a plausible round-robin here would quietly become the
 * platform's assignment policy.
 */
export class AssignmentService {
  constructor(
    private readonly repository: AssignmentRepository,
    private readonly engines: Partial<Record<AssignmentConfiguration['method'], IAssignmentEngine>>,
    private readonly logger: ICollectionLogger,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** The configuration in force, or a named failure. */
  async resolveConfiguration(context: CrmCallContext = {}): Promise<AssignmentConfiguration> {
    const configured = await this.repository.listAll(context);
    return resolveAssignmentConfiguration(configured, this.now());
  }

  /**
   * Assigns a case through the engine its configuration names.
   * @throws AssignmentError when no configuration applies, two tie, or the named engine is unavailable.
   */
  async assign(caseFacts: AssignmentInput['case'], context: CrmCallContext = {}): Promise<AssignmentOutcome> {
    const configuration = await this.resolveConfiguration(context);
    const engine = this.engines[configuration.method];
    if (!engine) {
      const error = new AssignmentError(
        `Assignment configuration '${configuration.name}' selects method '${configuration.method}', ` +
        'for which no engine is wired in this deployment. No assignment is performed and none is guessed.',
        'Unavailable');
      await this.logFailure(caseFacts, configuration, error, context);
      throw error;
    }

    try {
      const outcome = await engine.assign({ case: caseFacts, configuration }, context);
      await this.logger.log({
        source: SOURCE, operation: 'assign', operationKind: 'CaseLifecycle', severity: 'Info', succeeded: true,
        sourceReference: `${caseFacts.sourceSystem}/${caseFacts.facilityNumber}`,
        errorMessage: `assigned by ${configuration.method} via configuration '${configuration.name}'`,
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      });
      return outcome;
    } catch (error) {
      if (error instanceof AssignmentError) await this.logFailure(caseFacts, configuration, error, context);
      throw error;
    }
  }

  private async logFailure(
    caseFacts: AssignmentInput['case'], configuration: AssignmentConfiguration, error: AssignmentError, context: CrmCallContext,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE, operation: 'assign', operationKind: 'CaseLifecycle', severity: 'Error', succeeded: false,
      sourceReference: `${caseFacts.sourceSystem}/${caseFacts.facilityNumber}`,
      errorCode: `assignment_${error.kind}`,
      errorMessage: `${error.message} (configuration '${configuration.name}', method ${configuration.method})`,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }
}

function toConfiguration(row: CrmRecord): AssignmentConfiguration {
  const optional = <T>(key: string, value: T | undefined): Record<string, T> =>
    value === undefined ? {} : { [key]: value };
  const asString = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  const asNumber = (v: unknown) => (typeof v === 'number' ? v : undefined);

  return AssignmentConfigurationSchema.parse({
    id: String(row[ASSIGNMENT.id]),
    name: String(row[ASSIGNMENT.name] ?? ''),
    method: labelOf(ASSIGNMENT_METHOD_VALUES, row[ASSIGNMENT.method]) ?? 'Queue',
    priority: Number(row[ASSIGNMENT.priority] ?? 0),
    isActive: row[ASSIGNMENT.isActive] === true,
    effective: {
      ...optional('effectiveFrom', asString(row[ASSIGNMENT.effectiveFrom])),
      ...optional('effectiveTo', asString(row[ASSIGNMENT.effectiveTo])),
    },
    ...optional('customerType', labelOf(CUSTOMER_TYPE_VALUES, row[ASSIGNMENT.customerType])),
    ...optional('productType', asString(row[ASSIGNMENT.productType])),
    ...optional('region', asString(row[ASSIGNMENT.region])),
    ...optional('riskLevel', asString(row[ASSIGNMENT.riskLevel])),
    ...optional('legalStatus', asString(row[ASSIGNMENT.legalStatus])),
    ...optional('slaHours', asNumber(row[ASSIGNMENT.slaHours])),
    ...optional('smartAssignmentRef', asString(row[ASSIGNMENT.smartAssignmentRef])),
  });
}
