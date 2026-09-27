import {
  composeSnapshotKey,
  type CrmCallContext,
  type CrmRecord,
  type DelinquencySnapshot,
  type ICrmAdapter,
  type SnapshotKeyComposition,
} from '@dcp/domain';
import { ARREAR_BUCKET_VALUES, ELIGIBILITY_OUTCOME_VALUES, ENTITY_SETS, NAVIGATION, SNAPSHOT, bind } from './qdbBindings.js';

/** Column length of `qdb_name`, the snapshot's display name. */
const NAME_MAX_LENGTH = 100;

/**
 * Appends Delinquency Snapshots. Append only: there is no update method, and the plugin refuses
 * one anyway. Replay idempotency is a lookup on the configured key before every append.
 *
 * Both halves of the canonical facility identity are stored explicitly — the number and the source
 * system (KI-47). The idempotency key may also carry the source system, but a key is an
 * implementation mechanism; the business data model does not depend on being able to parse one.
 */
export class DelinquencySnapshotRepository {
  constructor(
    private readonly crm: ICrmAdapter,
    private readonly keyComposition: SnapshotKeyComposition,
  ) {}

  /** The key this observation would be stored under. */
  keyFor(snapshot: DelinquencySnapshot): string {
    return composeSnapshotKey(snapshot, this.keyComposition);
  }

  /** Whether an observation with this key is already stored — the replay check. */
  async existsByKey(key: string, context: CrmCallContext = {}): Promise<boolean> {
    const found = await this.crm.retrieveByKey(ENTITY_SETS.delinquencySnapshot, { field: SNAPSHOT.snapshotKey, value: key }, [SNAPSHOT.id], context);
    return found !== null;
  }

  /**
   * Appends the observation unless its key is already present. Returns the stored id and whether a
   * row was written, so a replay is visible to the caller rather than silently absorbed.
   */
  async appendIfAbsent(snapshot: DelinquencySnapshot, context: CrmCallContext = {}): Promise<{ key: string; written: boolean }> {
    const key = this.keyFor(snapshot);
    if (await this.existsByKey(key, context)) return { key, written: false };
    await this.crm.create(ENTITY_SETS.delinquencySnapshot, toValues(snapshot, key), context);
    return { key, written: true };
  }
}

function toValues(snapshot: DelinquencySnapshot, key: string): CrmRecord {
  const optional = (column: string, value: unknown): CrmRecord => (value === undefined ? {} : { [column]: value });
  const bucketValue = snapshot.arrearBucket !== undefined ? ARREAR_BUCKET_VALUES[snapshot.arrearBucket] : undefined;
  return {
    [SNAPSHOT.name]: `${snapshot.facility.sourceSystem}/${snapshot.facility.facilityNumber} @ ${snapshot.snapshotDate}`.slice(0, NAME_MAX_LENGTH),
    [SNAPSHOT.snapshotKey]: key,
    [SNAPSHOT.customerBusinessId]: snapshot.customerBusinessId,
    [SNAPSHOT.facilityNumber]: snapshot.facility.facilityNumber,
    [SNAPSHOT.facilitySourceSystem]: snapshot.facility.sourceSystem,
    [SNAPSHOT.snapshotDate]: snapshot.snapshotDate,
    [SNAPSHOT.receivedOn]: snapshot.receivedOn,
    [SNAPSHOT.integrationBatchId]: snapshot.integrationBatchId,
    ...optional(SNAPSHOT.misSourceTimestamp, snapshot.sourceTimestamp),
    ...optional(SNAPSHOT.dpdAsOfDate, snapshot.dpdAsOfDate),
    [SNAPSHOT.dpd]: snapshot.dpd,
    ...optional(SNAPSHOT.arrearBucket, bucketValue),
    [SNAPSHOT.loanBalance]: snapshot.loanBalance,
    [SNAPSHOT.totalArrears]: snapshot.totalArrears,
    ...optional(SNAPSHOT.installmentAmount, snapshot.installmentAmount),
    ...optional(SNAPSHOT.firstArrearDate, snapshot.firstArrearDate),
    ...optional(SNAPSHOT.lastArrearAmount, snapshot.lastArrearAmount),
    ...optional(SNAPSHOT.arrearPercentage, snapshot.instalmentCoverageRatio),
    ...optional(SNAPSHOT.productTypeCode, snapshot.productTypeCode),
    ...optional(SNAPSHOT.accountStatusCode, snapshot.accountStatusCode),
    ...optional(SNAPSHOT.isDeceasedPerQcb, snapshot.isDeceasedPerQcb),
    ...optional(SNAPSHOT.exemptionPercentage, snapshot.exemptionPercentage),
    ...optional(SNAPSHOT.exemptionAmount, snapshot.exemptionAmount),
    ...optional(SNAPSHOT.correlationId, snapshot.correlationId),
    [SNAPSHOT.eligibilityOutcome]: ELIGIBILITY_OUTCOME_VALUES[snapshot.eligibility.outcome],
    ...optional(SNAPSHOT.eligibilityReason, snapshot.eligibility.reason),
    [SNAPSHOT.eligibilityRulesetCode]: snapshot.eligibility.rulesetCode,
    [SNAPSHOT.eligibilityRulesetVersion]: snapshot.eligibility.rulesetVersion,
    [SNAPSHOT.eligibilityEvaluatedOn]: snapshot.eligibility.evaluatedOn,
    ...(snapshot.caseId ? bind(NAVIGATION.snapshotCase, ENTITY_SETS.collectionCase, snapshot.caseId) : {}),
  };
}
