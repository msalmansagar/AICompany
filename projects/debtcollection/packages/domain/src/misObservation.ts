/**
 * The canonical MIS delinquency observation and the two identities it carries.
 *
 * MIS is the authoritative source for the current financial and delinquency position. DCP never
 * computes DPD, buckets or arrears; it receives them. The record below is `ArrearDetail` from
 * `MISIntegration.md` §4.1 after the adapter has normalised it — dates as ISO strings, the bucket as
 * the verbatim MIS code, numbers as numbers.
 *
 * Two identities live on the record and are kept structurally separate:
 *   - **customer identity** — the national id (QID) and the MIS customer number. These resolve to the
 *     CRM customer master. A mobile number is a contact point and is NEVER an identity (F4, F11);
 *     `CustomerIdentitySchema` is strict so one cannot be smuggled in.
 *   - **facility identity** — the MIS facility/account number plus the system it came from. This IS
 *     the facility as far as Collection is concerned. No CRM facility record is required to exist.
 */

import { z } from 'zod';

/** The customer identifiers Collection may resolve on. Strict: nothing else counts as identity. */
export const CustomerIdentitySchema = z.object({
  /** National id (QID). The primary identifier where present. */
  nationalId: z.string().trim().min(1).optional(),
  /** MIS customer number. Cross-checks the national id, or stands alone where no QID is supplied. */
  customerNumber: z.string().trim().min(1).optional(),
}).strict();
export type CustomerIdentity = z.infer<typeof CustomerIdentitySchema>;

export function hasUsableCustomerIdentity(identity: CustomerIdentity): boolean {
  return identity.nationalId !== undefined || identity.customerNumber !== undefined;
}

/** Column length of `qdb_facilitynumber`; a longer value cannot be stored and is malformed here. */
export const FACILITY_NUMBER_MAX_LENGTH = 50;

/**
 * The canonical facility identity: the MIS business identifier and where it came from.
 * Whether the final uniqueness composition needs a further MIS identifier is `TBD` against the actual
 * MIS contract; this is what is proven necessary today.
 */
export const FacilityIdentitySchema = z.object({
  facilityNumber: z.string().min(1).max(FACILITY_NUMBER_MAX_LENGTH),
  sourceSystem: z.string().min(1),
}).strict();
export type FacilityIdentity = z.infer<typeof FacilityIdentitySchema>;

export const FacilityIdentityProblemSchema = z.enum([
  'MissingFacilityNumber',
  'MalformedFacilityNumber',
  'MissingSourceSystem',
]);
export type FacilityIdentityProblem = z.infer<typeof FacilityIdentityProblemSchema>;

export type FacilityIdentityCheck =
  | { ok: true; identity: FacilityIdentity }
  | { ok: false; problem: FacilityIdentityProblem; detail: string };

/**
 * Validates the facility identity on its own terms. A failure here is the ONLY thing that produces a
 * FacilityException: a CRM facility record being absent is not a problem, because none is required.
 */
export function checkFacilityIdentity(raw: { facilityNumber?: string | null; sourceSystem?: string | null }): FacilityIdentityCheck {
  const facilityNumber = raw.facilityNumber?.trim() ?? '';
  const sourceSystem = raw.sourceSystem?.trim() ?? '';

  if (facilityNumber === '') return { ok: false, problem: 'MissingFacilityNumber', detail: 'facility number is empty' };
  if (/[\s\p{C}]/u.test(facilityNumber)) {
    return { ok: false, problem: 'MalformedFacilityNumber', detail: 'facility number contains whitespace or control characters' };
  }
  if (facilityNumber.length > FACILITY_NUMBER_MAX_LENGTH) {
    return { ok: false, problem: 'MalformedFacilityNumber', detail: `facility number exceeds ${FACILITY_NUMBER_MAX_LENGTH} characters` };
  }
  if (sourceSystem === '') return { ok: false, problem: 'MissingSourceSystem', detail: 'source system is empty' };

  return { ok: true, identity: { facilityNumber, sourceSystem } };
}

/** The verbatim MIS bucket code. Stored as delivered; the ten codes are MIS data, not a constant here. */
export const ArrearBucketCodeSchema = z.string().min(1);

/**
 * One normalised MIS delinquency record. Optional fields are optional because the supplied report
 * does not carry them for every row, not because they are unimportant.
 */
export const MisDelinquencyRecordSchema = z.object({
  customer: CustomerIdentitySchema,
  customerName: z.string().optional(),
  /** The MIS facility/account number. Validated by `checkFacilityIdentity`, not by this schema. */
  facilityNumber: z.string(),
  /** Which system of record delivered this row (an organisation code such as HL or BFD). */
  sourceSystem: z.string(),

  loanTypeCode: z.string().optional(),
  loanTypeDescription: z.string().optional(),
  accountStatusCode: z.string().optional(),
  isDeceasedPerQcb: z.boolean().optional(),

  /** Days past due as MIS reports it. Zero or absent means the facility is not delinquent. */
  dpd: z.number().int().nonnegative(),
  dpdAsOfDate: z.string().optional(),
  arrearBucket: ArrearBucketCodeSchema.optional(),
  loanBalance: z.number(),
  totalArrears: z.number(),
  installmentAmount: z.number().optional(),
  lastArrearAmount: z.number().optional(),
  instalmentCoverageRatio: z.number().min(0).max(1).optional(),
  firstArrearDate: z.string().optional(),
  exemptionPercentage: z.number().optional(),
  exemptionAmount: z.number().optional(),

  /** The financial as-of date MIS reports for balance and arrears. */
  misAsOfDate: z.string(),
  sourceTimestamp: z.string().optional(),
  /** MIS-side record or version identifier, if the contract exposes one. */
  sourceRecordId: z.string().optional(),
  /** Groups one synchronisation run. Never on its own an idempotency key. */
  integrationBatchId: z.string().min(1),
  correlationId: z.string().optional(),

  /** A contact point for recipient validation later. Not identity; not part of `customer` on purpose. */
  mobileNumber: z.string().optional(),
});
export type MisDelinquencyRecord = z.infer<typeof MisDelinquencyRecordSchema>;

/**
 * True when MIS reports the facility as delinquent.
 *
 * Zero is not a policy threshold — it is the arithmetic definition of "past due at all", and it is
 * what separates a delinquent facility from a cured one. Every boundary that *is* policy (a DPD band,
 * an arrears floor, a grace period) belongs in the ruleset; `collection-portability.test.ts` enforces
 * that, and allows this comparison for the same reason.
 */
export function isDelinquent(record: Pick<MisDelinquencyRecord, 'dpd'>): boolean {
  return record.dpd > 0;
}

/**
 * The current financial position as the Collection Case caches it. Explicitly a *cache*: the UI must
 * distinguish these values from a live MIS read, and nothing here is the source of truth.
 */
export const CachedMisPositionSchema = z.object({
  dpd: z.number().int().nonnegative(),
  arrearBucket: ArrearBucketCodeSchema.optional(),
  loanBalance: z.number(),
  totalArrears: z.number(),
  installmentAmount: z.number().optional(),
  /** The MIS as-of date the cached values belong to. */
  misAsOfDate: z.string(),
  /** When the cache was last written from a synchronisation run. */
  syncedOn: z.string(),
});
export type CachedMisPosition = z.infer<typeof CachedMisPositionSchema>;

export function toCachedPosition(record: MisDelinquencyRecord, syncedOn: string): CachedMisPosition {
  return {
    dpd: record.dpd,
    ...(record.arrearBucket !== undefined ? { arrearBucket: record.arrearBucket } : {}),
    loanBalance: record.loanBalance,
    totalArrears: record.totalArrears,
    ...(record.installmentAmount !== undefined ? { installmentAmount: record.installmentAmount } : {}),
    misAsOfDate: record.misAsOfDate,
    syncedOn,
  };
}

/**
 * Whether the incoming observation differs from what the case last cached — the input to the
 * `ChangedOnly` snapshot policy and to bucket-movement automation. Compares position only; the
 * as-of date advancing with identical figures is not a change.
 */
export function hasPositionChanged(cached: CachedMisPosition | undefined, incoming: MisDelinquencyRecord): boolean {
  if (!cached) return true;
  return cached.dpd !== incoming.dpd
    || cached.arrearBucket !== incoming.arrearBucket
    || cached.loanBalance !== incoming.loanBalance
    || cached.totalArrears !== incoming.totalArrears;
}
