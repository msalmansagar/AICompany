import {
  EligibilityDecisionSchema,
  RuleEngineError,
  StrategySelectionSchema,
  ContactHoldDecisionSchema,
  type ContactHoldEvaluation,
  type ContactHoldInput,
  type CrmCallContext,
  type CrmRecord,
  type EligibilityDecision,
  type EligibilityInput,
  type ICollectionLogger,
  type ICrmAdapter,
  type IRuleEngine,
  type RuleEngineOperations,
  type StrategyInput,
  type StrategySelection,
  buildLogSource,
} from '@dcp/domain';

const SOURCE = buildLogSource('RuleEngine');

/** Which decision is being asked, for error messages and technical logging. */
type Decision = 'eligibility' | 'strategy' | 'contactHold';

/**
 * The QDB Rule Engine, reached by operation name.
 *
 * On cloud each operation is a Custom API; on-premises the same name is a Process Action. Both go
 * through `ICrmAdapter.execute`, so nothing here knows which platform it is on — that is the whole
 * point of the seam.
 *
 * Every response is parsed against its contract before it is believed. A ruleset that returns an
 * outcome outside the approved set, or omits the version that identifies which rules decided, is
 * treated as a failure: an unattributable decision about a customer's debt is not a decision.
 * Failures are logged to `qdb_crmlogs` through the collection logger and rethrown — never swallowed,
 * never defaulted.
 */
export class RuleEngineClient implements IRuleEngine {
  constructor(
    private readonly crm: ICrmAdapter,
    private readonly operations: RuleEngineOperations,
    private readonly logger: ICollectionLogger,
  ) {}

  /** @inheritdoc */
  async evaluateEligibility(input: EligibilityInput, context: CrmCallContext = {}): Promise<EligibilityDecision> {
    const response = await this.invoke('eligibility', input.rulesetCode, {
      RulesetCode: input.rulesetCode,
      Observation: JSON.stringify(input.record),
      Customer: input.customer ? JSON.stringify(input.customer) : null,
      ActiveCase: input.activeCase ? JSON.stringify(input.activeCase) : null,
    }, context);

    const body = asObject(response);
    const parsed = EligibilityDecisionSchema.safeParse({
      outcome: body['Outcome'],
      ...(typeof body['Reason'] === 'string' ? { reason: body['Reason'] } : {}),
      rulesetCode: input.rulesetCode,
      rulesetVersion: body['RulesetVersion'],
      evaluatedOn: new Date().toISOString(),
    });
    if (!parsed.success) {
      throw await this.reject('eligibility', input.rulesetCode,
        `the response did not match the eligibility contract: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`, context);
    }
    return parsed.data;
  }

  /** @inheritdoc */
  async selectStrategy(input: StrategyInput, context: CrmCallContext = {}): Promise<StrategySelection> {
    const response = await this.invoke('strategy', input.rulesetCode, {
      RulesetCode: input.rulesetCode,
      Case: JSON.stringify(input.case),
      Customer: input.customer ? JSON.stringify(input.customer) : null,
    }, context);

    const body = asObject(response);
    const parsed = StrategySelectionSchema.safeParse({
      strategyCodes: readStrategyCodes(body['StrategyCodes'] ?? body['StrategyCode']),
      ...(typeof body['Reason'] === 'string' ? { reason: body['Reason'] } : {}),
      rulesetCode: input.rulesetCode,
      rulesetVersion: body['RulesetVersion'],
      evaluatedOn: new Date().toISOString(),
    });
    if (!parsed.success) {
      throw await this.reject('strategy', input.rulesetCode,
        `the response did not match the strategy contract: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`, context);
    }
    return parsed.data;
  }

  /** @inheritdoc */
  async evaluateContactHold(input: ContactHoldInput, context: CrmCallContext = {}): Promise<ContactHoldEvaluation> {
    const response = await this.invoke('contactHold', input.rulesetCode, {
      RulesetCode: input.rulesetCode,
      Customer: JSON.stringify(input.customer),
      Channel: input.channel ?? null,
      CaseId: input.caseId ?? null,
      FacilityNumber: input.facilityNumber ?? null,
      SourceSystem: input.sourceSystem ?? null,
    }, context);

    const body = asObject(response);
    const parsed = ContactHoldDecisionSchema.safeParse({
      hold: body['Hold'],
      ...(typeof body['Reason'] === 'string' ? { reason: body['Reason'] } : {}),
      rulesetCode: input.rulesetCode,
      rulesetVersion: body['RulesetVersion'],
      evaluatedOn: new Date().toISOString(),
    });
    if (!parsed.success) {
      // A hold decision that cannot be read is a refusal to contact, not a permission: the caller
      // sees the error and stops. Nothing here turns an unreadable answer into `hold: false`.
      throw await this.reject('contactHold', input.rulesetCode,
        `the response did not match the contact-hold contract: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`, context);
    }
    return parsed.data;
  }

  /** Resolves the configured operation name and calls it. */
  private async invoke(decision: Decision, rulesetCode: string, parameters: CrmRecord, context: CrmCallContext): Promise<unknown> {
    const operation = this.operations[decision];
    if (!operation) {
      throw await this.reject(decision, rulesetCode,
        `this deployment has not configured a Rule Engine operation for '${decision}' ` +
        '(qdb_platformconfiguration.qdb_featureflags → ruleEngineOperations). It has no default.', context);
    }
    if (!rulesetCode) {
      throw await this.reject(decision, rulesetCode, `no ruleset code is configured for '${decision}'`, context);
    }
    try {
      return await this.crm.execute(operation, parameters, context);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw await this.reject(decision, rulesetCode, `operation '${operation}' failed: ${detail}`, context);
    }
  }

  /** Logs the refusal to the technical log and returns the error to throw. */
  private async reject(decision: Decision, rulesetCode: string, detail: string, context: CrmCallContext): Promise<RuleEngineError> {
    await this.logger.log({
      source: SOURCE,
      operation: decision,
      operationKind: decision === 'contactHold' ? 'ContactHoldEvaluation' : 'EligibilityEvaluation',
      severity: 'Error',
      succeeded: false,
      errorCode: 'rule_engine_unusable',
      errorMessage: detail,
      ...(rulesetCode ? { sourceReference: rulesetCode } : {}),
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
    return new RuleEngineError(`Rule Engine ${decision} decision refused — ${detail}`, rulesetCode);
  }
}

function asObject(response: unknown): Record<string, unknown> {
  return response !== null && typeof response === 'object' ? response as Record<string, unknown> : {};
}

/** Accepts either a list of codes or a single code; anything else parses as no codes and fails the contract. */
function readStrategyCodes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === 'string' && c.length > 0);
  if (typeof raw === 'string' && raw.length > 0) return [raw];
  if (typeof raw === 'string') return [];
  return [];
}
