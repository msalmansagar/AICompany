import {
  CollectionSettingsError,
  buildSnapshot,
  checkFacilityIdentity,
  createsOrUpdatesCase,
  decideEpisodeAction,
  shouldPersistSnapshot,
  toCachedPosition,
  buildLogSource,
  type CaseSummary,
  type CrmCallContext,
  type EligibilityDecision,
  type EpisodeAction,
  type EpisodePolicy,
  type FacilityIdentity,
  type ICollectionLogger,
  type CaseNumberSourceKind,
  type ICustomerResolver,
  type IRuleEngine,
  type MisDelinquencyRecord,
  type PlatformConfiguration,
  type ResolvedCustomer,
  type SnapshotPolicy,
} from '@dcp/domain';
import type { CollectionCaseRepository } from './CollectionCaseRepository.js';
import type { DelinquencySnapshotRepository } from './DelinquencySnapshotRepository.js';
import type { IdentityExceptionRepository } from './IdentityExceptionRepository.js';
import type { ExceptionReason } from './qdbBindings.js';

/** What happened to one observation. */
export type RecordAction =
  | 'CaseCreated' | 'CaseUpdated' | 'CaseReopened' | 'CureRecorded' | 'Ignored'
  | 'GraceMonitored' | 'Excluded' | 'IdentityException' | 'FacilityException' | 'Failed';

export interface RecordOutcome {
  facilityNumber: string;
  sourceSystem: string;
  action: RecordAction;
  caseId?: string;
  episodeNumber?: number;
  eligibility?: EligibilityDecision;
  snapshot?: { key: string; written: boolean };
  detail?: string;
}

export interface BatchOutcome {
  batchId: string;
  outcomes: RecordOutcome[];
  counts: Partial<Record<RecordAction, number>>;
}

export interface SyncDependencies {
  configuration: PlatformConfiguration;
  customers: ICustomerResolver;
  /** The Rule Engine facade. Eligibility is one of its decisions; nothing else may decide it. */
  ruleEngine: IRuleEngine;
  cases: CollectionCaseRepository;
  snapshots: DelinquencySnapshotRepository;
  exceptions: IdentityExceptionRepository;
  logger: ICollectionLogger;
  episodePolicy: EpisodePolicy;
  /** Whether DCP composes the case number or the configured QDB mechanism does (KI-49). */
  caseNumbering: CaseNumberSourceKind;
  /** Injected clock, so cure dates and reopen windows are testable. */
  now: () => string;
}

const SOURCE = buildLogSource('DelinquencySync');

/**
 * Background MIS synchronisation — the pipeline the approved architecture describes:
 *
 *   MIS record → facility identity check → resolve CRM customer → eligibility (ruleset)
 *              → episode decision → create / update / reopen / cure the case → snapshot per policy
 *
 * Three things it never does. It never asks the organisation for a facility record — the MIS
 * business identity is the facility. It never decides eligibility itself — the configured ruleset
 * does, and nothing here knows a threshold. And it never writes a second copy of MIS: the case
 * caches a position, the snapshot records an observation, MIS stays the truth.
 *
 * Each record is isolated: one failure is logged and reported, and the batch continues.
 */
export class DelinquencySyncService {
  private readonly snapshotPolicy: SnapshotPolicy;
  private readonly rulesetCode: string;

  constructor(private readonly deps: SyncDependencies) {
    const { configuration } = deps;
    if (!configuration.snapshotPolicy) {
      throw new CollectionSettingsError(`Organisation ${configuration.organizationCode} has no snapshot policy configured; it has no default`);
    }
    if (!configuration.eligibilityRulesetCode) {
      throw new CollectionSettingsError(`Organisation ${configuration.organizationCode} has no eligibility ruleset configured; synchronisation must fail closed`);
    }
    this.snapshotPolicy = configuration.snapshotPolicy;
    this.rulesetCode = configuration.eligibilityRulesetCode;
  }

  async processBatch(records: readonly MisDelinquencyRecord[], batchId: string): Promise<BatchOutcome> {
    const outcomes: RecordOutcome[] = [];
    for (const record of records) outcomes.push(await this.processRecord(record));
    const counts: Partial<Record<RecordAction, number>> = {};
    for (const o of outcomes) counts[o.action] = (counts[o.action] ?? 0) + 1;
    await this.deps.logger.log({
      source: SOURCE, operation: 'processBatch', operationKind: 'MisBackgroundSync', severity: 'Info',
      batchId, succeeded: outcomes.every(o => o.action !== 'Failed'),
      recordsRead: records.length, recordsWritten: outcomes.filter(o => o.caseId || o.snapshot?.written).length,
    });
    return { batchId, outcomes, counts };
  }

  /** Processes one observation end to end. Never throws: a failure becomes a `Failed` outcome. */
  async processRecord(record: MisDelinquencyRecord): Promise<RecordOutcome> {
    const context: CrmCallContext = record.correlationId ? { correlationId: record.correlationId } : {};
    try {
      return await this.process(record, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.deps.logger.log({
        source: SOURCE, operation: 'processRecord', operationKind: 'MisBackgroundSync', severity: 'Error',
        batchId: record.integrationBatchId, sourceReference: `${record.sourceSystem}/${record.facilityNumber}`,
        succeeded: false, errorMessage: message, ...(record.correlationId ? { correlationId: record.correlationId } : {}),
      });
      return { facilityNumber: record.facilityNumber, sourceSystem: record.sourceSystem, action: 'Failed', detail: message };
    }
  }

  private async process(record: MisDelinquencyRecord, context: CrmCallContext): Promise<RecordOutcome> {
    const base = { facilityNumber: record.facilityNumber, sourceSystem: record.sourceSystem };

    const facilityCheck = checkFacilityIdentity(record);
    if (!facilityCheck.ok) {
      // No snapshot: there is no valid facility identity to store the observation under; the exception row is the record.
      return this.recordException(record, 'InvalidIdentifier', `${facilityCheck.problem}: ${facilityCheck.detail}`, 'FacilityException', context, { snapshot: false });
    }
    const facility = facilityCheck.identity;

    const resolution = await this.deps.customers.resolve(record.customer, context);
    if (resolution.kind === 'Failed') {
      const reason: ExceptionReason = resolution.failure === 'DuplicateCustomer' ? 'DuplicateCustomer'
        : resolution.failure === 'CustomerNotFound' ? 'CustomerNotFound' : 'InvalidIdentifier';
      return this.recordException(record, reason, `${resolution.failure}: ${resolution.detail}`, 'IdentityException', context);
    }

    const activeCase = await this.deps.cases.findActiveByFacility(facility, context);
    const decision = await this.deps.ruleEngine.evaluateEligibility({
      record, customer: resolution.customer, rulesetCode: this.rulesetCode,
      ...(activeCase ? { activeCase: { id: activeCase.id, status: activeCase.status, episodeNumber: activeCase.episodeNumber } } : {}),
    }, context);

    if (!createsOrUpdatesCase(decision.outcome)) {
      return this.recordNonCaseOutcome(record, decision, activeCase, base, context);
    }

    const latestClosedCase = activeCase ? null : await this.deps.cases.findLatestClosedByFacility(facility, context);
    const action = decideEpisodeAction({
      record, policy: this.deps.episodePolicy, asOf: this.deps.now(),
      ...(activeCase ? { activeCase } : {}), ...(latestClosedCase ? { latestClosedCase } : {}),
    });
    return this.applyEpisodeAction(action, record, facility, resolution.customer, decision, context);
  }

  private async applyEpisodeAction(
    action: EpisodeAction, record: MisDelinquencyRecord, facility: FacilityIdentity,
    customer: ResolvedCustomer, decision: EligibilityDecision, context: CrmCallContext,
  ): Promise<RecordOutcome> {
    const now = this.deps.now();
    const base = { facilityNumber: facility.facilityNumber, sourceSystem: facility.sourceSystem, eligibility: decision };

    switch (action.kind) {
      case 'Create': {
        const caseId = await this.deps.cases.create({
          ...this.deps.cases.caseNumberFor(this.deps.caseNumbering, facility, action.episodeNumber),
          customer: { entity: customer.entity, id: customer.id },
          customerBusinessId: customer.businessId,
          facility,
          organizationCode: this.deps.configuration.organizationCode,
          episodeNumber: action.episodeNumber,
          status: 'New',
          openDate: now,
          cachedPosition: toCachedPosition(record, now),
          eligibilityRulesetVersion: decision.rulesetVersion,
          ...(record.correlationId ? { correlationId: record.correlationId } : {}),
        }, context);
        const snapshot = await this.persistSnapshot(record, decision, true, caseId, context);
        return { ...base, action: 'CaseCreated', caseId, episodeNumber: action.episodeNumber, ...(snapshot ? { snapshot } : {}) };
      }
      case 'Update': {
        await this.deps.cases.updateCachedPosition(action.caseId, toCachedPosition(record, now), context);
        const snapshot = await this.persistSnapshot(record, decision, action.changed, action.caseId, context);
        return { ...base, action: 'CaseUpdated', caseId: action.caseId, ...(snapshot ? { snapshot } : {}) };
      }
      case 'Reopen': {
        await this.deps.cases.transition(action.caseId, 'Reopened', context);
        await this.deps.cases.updateCachedPosition(action.caseId, toCachedPosition(record, now), context);
        const snapshot = await this.persistSnapshot(record, decision, true, action.caseId, context);
        return { ...base, action: 'CaseReopened', caseId: action.caseId, episodeNumber: action.episodeNumber, ...(snapshot ? { snapshot } : {}) };
      }
      case 'Cure': {
        // Settled records the cure; closure follows a configured rule, not this sync (MISIntegration §6).
        await this.deps.cases.updateCachedPosition(action.caseId, toCachedPosition(record, now), context);
        await this.deps.cases.markCure(action.caseId, now, 'Cured', context);
        await this.deps.cases.transition(action.caseId, 'Settled', context);
        const snapshot = await this.persistSnapshot(record, decision, true, action.caseId, context);
        return { ...base, action: 'CureRecorded', caseId: action.caseId, ...(snapshot ? { snapshot } : {}) };
      }
      case 'Ignore': {
        const snapshot = await this.persistSnapshot(record, decision, false, undefined, context);
        return { ...base, action: 'Ignored', ...(snapshot ? { snapshot } : {}) };
      }
    }
  }

  /** GraceMonitor and ExcludedSpecialHandling: no case is touched; the observation may still be kept. */
  private async recordNonCaseOutcome(
    record: MisDelinquencyRecord, decision: EligibilityDecision, activeCase: CaseSummary | null,
    base: { facilityNumber: string; sourceSystem: string }, context: CrmCallContext,
  ): Promise<RecordOutcome> {
    if (decision.outcome === 'IdentityException' || decision.outcome === 'FacilityException') {
      return this.recordException(record, 'InvalidIdentifier', decision.reason ?? `ruleset returned ${decision.outcome}`, decision.outcome, context);
    }
    if (activeCase) {
      await this.deps.logger.log({
        source: SOURCE, operation: 'processRecord', operationKind: 'MisBackgroundSync', severity: 'Warn',
        batchId: record.integrationBatchId, sourceReference: `${record.sourceSystem}/${record.facilityNumber}`, succeeded: true,
        errorMessage: `ruleset returned ${decision.outcome} while case ${activeCase.id} is open; the case was left untouched`,
      });
    }
    const snapshot = await this.persistSnapshot(record, decision, !activeCase, undefined, context);
    const action: RecordAction = decision.outcome === 'GraceMonitor' ? 'GraceMonitored' : 'Excluded';
    return { ...base, action, eligibility: decision, ...(snapshot ? { snapshot } : {}) };
  }

  private async recordException(
    record: MisDelinquencyRecord, reason: ExceptionReason, detail: string,
    action: 'IdentityException' | 'FacilityException', context: CrmCallContext, options: { snapshot: boolean } = { snapshot: true },
  ): Promise<RecordOutcome> {
    const now = this.deps.now();
    await this.deps.exceptions.create({ reason, detail, record, receivedOn: now }, context);
    const decision: EligibilityDecision = {
      outcome: action, reason: detail.slice(0, 500), rulesetCode: this.rulesetCode, rulesetVersion: 'n/a', evaluatedOn: now,
    };
    const snapshot = options.snapshot ? await this.persistSnapshot(record, decision, true, undefined, context) : undefined;
    await this.deps.logger.log({
      source: SOURCE, operation: 'recordException', operationKind: 'IdentityResolution', severity: 'Warn',
      batchId: record.integrationBatchId, sourceReference: `${record.sourceSystem}/${record.facilityNumber}`,
      succeeded: true, errorCode: reason, errorMessage: detail,
    });
    return { facilityNumber: record.facilityNumber, sourceSystem: record.sourceSystem, action, detail, eligibility: decision, ...(snapshot ? { snapshot } : {}) };
  }

  /** Persists the observation when the policy says so; an observation with no customer identifier at all cannot be stored and is logged instead. */
  private async persistSnapshot(
    record: MisDelinquencyRecord, decision: EligibilityDecision, changed: boolean, caseId: string | undefined, context: CrmCallContext,
  ): Promise<{ key: string; written: boolean } | undefined> {
    if (!shouldPersistSnapshot(this.snapshotPolicy, decision.outcome, changed)) return undefined;
    const snapshot = buildSnapshot(record, decision, { receivedOn: this.deps.now(), ...(caseId ? { caseId } : {}) });
    if (snapshot.customerBusinessId === '') {
      await this.deps.logger.log({
        source: SOURCE, operation: 'persistSnapshot', operationKind: 'MisBackgroundSync', severity: 'Warn',
        batchId: record.integrationBatchId, sourceReference: `${record.sourceSystem}/${record.facilityNumber}`, succeeded: false,
        errorMessage: 'observation carries no customer identifier; the snapshot cannot be stored on source identity',
      });
      return undefined;
    }
    return this.deps.snapshots.appendIfAbsent(snapshot, context);
  }
}
