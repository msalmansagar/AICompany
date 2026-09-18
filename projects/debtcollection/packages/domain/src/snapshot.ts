/**
 * The Delinquency Snapshot — one historical MIS observation, append-only.
 *
 * Current truth is MIS; the snapshot is what MIS said at a point in time, kept so a decision can be
 * explained months later. It is not a facility master and it does not need a case: an observation
 * that produced GraceMonitor or an exception is persisted on its source identifiers alone.
 *
 * Idempotency is mandatory and its physical key composition is deliberately NOT frozen here: MIS
 * timestamp and change-feed semantics are unconfirmed. The composition is deployment configuration
 * (`snapshotKeyComposition` in the platform configuration's feature flags) drawn from a fixed
 * vocabulary of candidate inputs. Persisting without one is refused rather than defaulted.
 */

import { z } from 'zod';
import { EligibilityDecisionSchema } from './eligibility.js';
import { FacilityIdentitySchema, ArrearBucketCodeSchema, type MisDelinquencyRecord } from './misObservation.js';

export const DelinquencySnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  /** Source identity — persistable without any CRM resolution. */
  customerBusinessId: z.string().min(1),
  facility: FacilityIdentitySchema,
  /** Set only when the observation created or updated a case. */
  caseId: z.string().uuid().optional(),

  /** Observation identity. */
  snapshotDate: z.string(),
  dpdAsOfDate: z.string().optional(),
  sourceTimestamp: z.string().optional(),
  sourceRecordId: z.string().optional(),
  integrationBatchId: z.string().min(1),
  receivedOn: z.string(),

  /** The position, verbatim from MIS. */
  dpd: z.number().int().nonnegative(),
  arrearBucket: ArrearBucketCodeSchema.optional(),
  loanBalance: z.number(),
  totalArrears: z.number(),
  installmentAmount: z.number().optional(),
  firstArrearDate: z.string().optional(),
  lastArrearAmount: z.number().optional(),
  instalmentCoverageRatio: z.number().optional(),
  productTypeCode: z.string().optional(),
  accountStatusCode: z.string().optional(),
  isDeceasedPerQcb: z.boolean().optional(),
  exemptionPercentage: z.number().optional(),
  exemptionAmount: z.number().optional(),

  eligibility: EligibilityDecisionSchema,
  correlationId: z.string().optional(),
});
export type DelinquencySnapshot = z.infer<typeof DelinquencySnapshotSchema>;

/** The candidate inputs a deployment may compose its idempotency key from. */
export const SnapshotKeyPartSchema = z.enum([
  'facilityNumber',
  'sourceSystem',
  'snapshotDate',
  'dpdAsOfDate',
  'sourceTimestamp',
  'sourceRecordId',
  'integrationBatchId',
]);
export type SnapshotKeyPart = z.infer<typeof SnapshotKeyPartSchema>;

export const SnapshotKeyCompositionSchema = z.array(SnapshotKeyPartSchema).min(1);
export type SnapshotKeyComposition = z.infer<typeof SnapshotKeyCompositionSchema>;

/** Column length of `qdb_snapshotkey`. */
export const SNAPSHOT_KEY_MAX_LENGTH = 200;
const KEY_SEPARATOR = '|';

export class SnapshotKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotKeyError';
  }
}

/**
 * Composes the idempotency key from the configured parts, in the configured order. Every configured
 * part must be present on the observation: a key that silently omits a missing part would collide
 * with a different observation.
 */
export function composeSnapshotKey(snapshot: DelinquencySnapshot, composition: SnapshotKeyComposition): string {
  if (composition.length === 0) {
    throw new SnapshotKeyError('snapshot key composition is empty; the deployment must configure it before snapshots can be persisted');
  }
  const values = composition.map(part => {
    const value = readKeyPart(snapshot, part);
    if (value === undefined || value === '') {
      throw new SnapshotKeyError(`snapshot key part '${part}' is configured but absent from the observation for facility ${snapshot.facility.facilityNumber}`);
    }
    if (value.includes(KEY_SEPARATOR)) {
      throw new SnapshotKeyError(`snapshot key part '${part}' contains the separator '${KEY_SEPARATOR}'`);
    }
    return value;
  });
  const key = values.join(KEY_SEPARATOR);
  if (key.length > SNAPSHOT_KEY_MAX_LENGTH) {
    throw new SnapshotKeyError(`composed snapshot key is ${key.length} characters; the column holds ${SNAPSHOT_KEY_MAX_LENGTH}`);
  }
  return key;
}

function readKeyPart(snapshot: DelinquencySnapshot, part: SnapshotKeyPart): string | undefined {
  switch (part) {
    case 'facilityNumber': return snapshot.facility.facilityNumber;
    case 'sourceSystem': return snapshot.facility.sourceSystem;
    case 'snapshotDate': return snapshot.snapshotDate;
    case 'dpdAsOfDate': return snapshot.dpdAsOfDate;
    case 'sourceTimestamp': return snapshot.sourceTimestamp;
    case 'sourceRecordId': return snapshot.sourceRecordId;
    case 'integrationBatchId': return snapshot.integrationBatchId;
  }
}

/** Builds the snapshot for an observation and the decision made about it. */
export function buildSnapshot(
  record: MisDelinquencyRecord,
  eligibility: DelinquencySnapshot['eligibility'],
  context: { receivedOn: string; caseId?: string },
): DelinquencySnapshot {
  const optional = <T>(key: string, value: T | undefined): Record<string, T> =>
    value === undefined ? {} : { [key]: value };

  return {
    customerBusinessId: record.customer.nationalId ?? record.customer.customerNumber ?? '',
    facility: { facilityNumber: record.facilityNumber, sourceSystem: record.sourceSystem },
    ...optional('caseId', context.caseId),
    snapshotDate: record.misAsOfDate,
    ...optional('dpdAsOfDate', record.dpdAsOfDate),
    ...optional('sourceTimestamp', record.sourceTimestamp),
    ...optional('sourceRecordId', record.sourceRecordId),
    integrationBatchId: record.integrationBatchId,
    receivedOn: context.receivedOn,
    dpd: record.dpd,
    ...optional('arrearBucket', record.arrearBucket),
    loanBalance: record.loanBalance,
    totalArrears: record.totalArrears,
    ...optional('installmentAmount', record.installmentAmount),
    ...optional('firstArrearDate', record.firstArrearDate),
    ...optional('lastArrearAmount', record.lastArrearAmount),
    ...optional('instalmentCoverageRatio', record.instalmentCoverageRatio),
    ...optional('productTypeCode', record.loanTypeCode),
    ...optional('accountStatusCode', record.accountStatusCode),
    ...optional('isDeceasedPerQcb', record.isDeceasedPerQcb),
    ...optional('exemptionPercentage', record.exemptionPercentage),
    ...optional('exemptionAmount', record.exemptionAmount),
    eligibility,
    ...optional('correlationId', record.correlationId),
  };
}
