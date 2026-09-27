/**
 * Turning a raw MIS row into a canonical observation.
 *
 * This is the boundary the architecture requires: **no raw MIS payload reaches Collection logic, a
 * repository, or React.** Everything past this module speaks `MisDelinquencyRecord`.
 *
 * Every rule here is answerable to something measured in `docs/MISContractEvidence.md`, read from the
 * supplied Housing Loan files (4,359 rows, as-of 30/06/2026) rather than from a specification:
 *
 *   • **The `1-30` bucket arrives as a DATE on 1,670 rows** — 38 % of the population — because the
 *     export coerced `1-30` into 30 January. A normalizer that expects a string loses the largest
 *     bucket in the book, silently.
 *   • **`First Arrear Date` is a `DD/MM/YYYY` string** on 4,348 rows. Read month-first, `30/06/2026`
 *     is invalid and `06/07/2026` is the wrong date entirely.
 *   • **48 rows carry a zero `Installment Amount`**, and those same rows carry no `Arrear %`. MIS
 *     itself declines to divide by zero, and so does this.
 *   • **`Account Status` is an integer** (`7`, `8`) — the architecture document said string. It stays
 *     an **opaque code** either way: nothing here branches on its value, because its meaning is still
 *     unconfirmed.
 *   • **Leading zeros are already gone** on 6 ID numbers and 50 mobile numbers, destroyed by numeric
 *     typing at the source. Normalization records identifiers as strings from here on so that no
 *     further digits are lost, but it cannot restore what the source dropped.
 *   • **Two rows are entirely blank.** A feed contains rows that are not records.
 *
 * What this module deliberately does **not** do is invent. `customerType`, a per-row as-of date, a
 * source timestamp and a source record id are absent from the evidenced feed, so they are absent
 * here. The as-of date is a property of the **run**, not the row, and is supplied as context.
 */

import { z } from 'zod';
import {
  MisDelinquencyRecordSchema,
  type MisDelinquencyRecord,
} from './misObservation.js';

/**
 * The ten arrear buckets, **confirmed from the supplied data** rather than assumed: every one of the
 * 4,359 evidenced rows falls into exactly one of these, and they match the approved taxonomy.
 *
 * The taxonomy is enforced *here*, at the normalization boundary, and not on
 * `MisDelinquencyRecordSchema`, which stays permissive because it mirrors what the organisation's
 * column accepts. A bucket this platform has never seen is a record-level refusal for an operator to
 * look at — not something to store and discover later.
 */
export const ARREAR_BUCKET_CODES = [
  '1-30', '31-60', '61-90', '91-180', '181-270',
  '271-360', '361-500', '501-1000', '1001-2000', '>2000',
] as const;

export const ConfirmedArrearBucketSchema = z.enum(ARREAR_BUCKET_CODES);
export type ArrearBucketCode = z.infer<typeof ConfirmedArrearBucketSchema>;

/** A raw row exactly as a source hands it over: names we do not control, values we do not trust. */
export type RawMisRow = Record<string, unknown>;

/** What the run supplies that the row cannot. */
export interface NormalizationContext {
  /** Organisation code of the system of record — `HL`, `BFD`. Never guessed from the data. */
  sourceSystem: string;
  /**
   * The financial as-of date for the whole run, ISO-8601.
   *
   * It is context rather than a field because the evidenced feed carries it in the report title, not
   * on the row. If a future MIS contract supplies it per row, that row wins.
   */
  misAsOfDate: string;
  /** Groups one synchronisation run. Never on its own an idempotency key. */
  integrationBatchId: string;
  correlationId?: string;
}

export const NormalizationProblemSchema = z.enum([
  'EmptyRow',
  'MissingCustomerIdentity',
  'MissingFacilityNumber',
  'MissingDpd',
  'MalformedDpd',
  'MalformedAmount',
  'MalformedDate',
  'UnknownArrearBucket',
]);
export type NormalizationProblem = z.infer<typeof NormalizationProblemSchema>;

export interface NormalizationFailure {
  ok: false;
  problem: NormalizationProblem;
  detail: string;
}
export interface NormalizationSuccess {
  ok: true;
  record: MisDelinquencyRecord;
  /** Non-fatal observations about the row, for the technical log. Never silently dropped. */
  warnings: readonly string[];
}
export type NormalizationResult = NormalizationSuccess | NormalizationFailure;

const fail = (problem: NormalizationProblem, detail: string): NormalizationFailure =>
  ({ ok: false, problem, detail });

// ── Field-level readers ──────────────────────────────────────────────────────

/** Trimmed text, or undefined. Numbers become their digits — identifiers must not stay numeric. */
export function readText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/** A finite number, accepting the numeric strings an export produces. */
export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '');
    if (cleaned === '') return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * A `DD/MM/YYYY` date as ISO-8601.
 *
 * Day-first is not a preference, it is what the data is: `30/06/2026` appears throughout, and there is
 * no reading of it in which 30 is a month. A value that is already a Date or already ISO passes
 * through, so a future MIS contract that supplies a real date type needs no change here.
 */
export function readDayFirstDate(value: unknown): { iso?: string; malformed?: string } {
  if (value === null || value === undefined || value === '') return {};
  if (value instanceof Date) return { iso: value.toISOString().slice(0, 10) };

  const text = readText(value);
  if (text === undefined) return {};
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return { iso: text.slice(0, 10) };

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!match) return { malformed: text };
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return { malformed: text };

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return { malformed: text };
  return { iso: utc.toISOString().slice(0, 10) };
}

/**
 * The arrear bucket, surviving the export's coercion.
 *
 * `1-30` is a valid month-day pair, so the export turned 1,670 of them into 30 January. Nothing else
 * in the taxonomy coerces — there is no month 31, 61 or 91 — which is exactly why this defect hides:
 * it damages one bucket, and that bucket is the largest one.
 */
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The calendar days a coerced date could have meant, most likely first.
 *
 * A spreadsheet serial denotes a calendar date and carries no timezone, so no parser artefact may be
 * allowed to change which date that is. Two artefacts are real and both were observed on the live
 * Housing Loan report:
 *
 *   * **Timezone.** SheetJS materialises the serial as *local* midnight. On a machine in Qatar
 *     (+03:00) 30 January becomes `2026-01-29T21:00Z`, whose UTC components say the 29th.
 *   * **Drift.** SheetJS's serial arithmetic lands eight seconds short, at `23:59:52` on the 29th —
 *     so reading the components of *either* frame still says the 29th.
 *
 * Truncating is therefore the wrong operation; the value is rounded to the nearest midnight instead,
 * in both the UTC and the local frame. Reading UTC components alone lost all 1,670 coerced rows —
 * 38 % of the book — to `unknown`: the exact failure this function exists to prevent, reintroduced
 * by the fix for it. Every unit test passed, because each one built its date with `Date.UTC` at
 * exact midnight and so met neither artefact.
 *
 * Trying both frames cannot invent a bucket. A month-day pair has a month of at most 12 and a day of
 * at most 31, so `1-30` is the only code in the taxonomy a date can ever produce — there is nothing
 * for a second candidate to collide with.
 */
function calendarDayCandidates(value: Date): readonly string[] {
  const localOffsetMs = -value.getTimezoneOffset() * 60_000;
  return [0, localOffsetMs].map(offset => {
    const midnight = new Date(Math.round((value.getTime() + offset) / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY);
    return `${midnight.getUTCMonth() + 1}-${midnight.getUTCDate()}`;
  });
}

export function readArrearBucket(value: unknown): { bucket?: ArrearBucketCode; unknown?: string } {
  if (value === null || value === undefined || value === '') return {};

  if (value instanceof Date) {
    for (const candidate of calendarDayCandidates(value)) {
      const parsed = ConfirmedArrearBucketSchema.safeParse(candidate);
      if (parsed.success) return { bucket: parsed.data };
    }
    return { unknown: `date ${value.toISOString().slice(0, 10)}` };
  }

  const text = readText(value);
  if (text === undefined) return {};
  const parsed = ConfirmedArrearBucketSchema.safeParse(text.replace(/\s+/g, ''));
  return parsed.success ? { bucket: parsed.data } : { unknown: text };
}

/** `true` only for the evidenced `DEAD`; anything else, including blank, is not a positive assertion. */
export function readQcbDeceased(value: unknown): boolean | undefined {
  const text = readText(value);
  if (text === undefined) return undefined;
  return text.toUpperCase() === 'DEAD';
}

// ── The row ──────────────────────────────────────────────────────────────────

/** Column names as the evidenced Housing Loan feed supplies them. */
export const HOUSING_LOAN_COLUMNS = {
  customerNumber: 'Customer Number',
  customerName: 'Customer Name',
  accountNumber: 'Account Number',
  loanTypeCode: 'Loan Type Code',
  loanTypeDescription: 'Loan Type Description',
  nationalId: 'ID Number',
  qcbDeceasedStatus: 'QCB Deceased Status',
  loanBalance: 'Loan Balance',
  accountStatus: 'Account Status',
  firstArrearDate: 'First Arrear Date',
  arrearDays: 'Arrear Days',
  totalArrears: 'Total Arrears',
  installmentAmount: 'Installment Amount',
  lastArrearAmount: 'Last Arrear Amount',
  arrearPercent: 'Arrear %',
  exemptionPercentage: 'Exemption Percentage',
  exemptionAmount: 'Exemption Amount',
  arrearBuckets: 'Arrear Buckets',
  mobileNumber: 'Mobile Number',
} as const;

/** Every value in the row is absent or blank — a row that is not a record. Two exist in the feed. */
export function isEmptyRow(row: RawMisRow): boolean {
  return Object.values(row).every(v => v === null || v === undefined || (typeof v === 'string' && v.trim() === ''));
}

/**
 * Normalizes one raw row into a canonical observation, or says precisely why it cannot.
 *
 * A failure here is a record-level outcome, not a run-level one: the caller isolates it, logs it and
 * carries on, because one malformed row must not end a synchronisation of thousands.
 */
export function normalizeHousingLoanRow(
  row: RawMisRow,
  context: NormalizationContext,
  columns: Record<keyof typeof HOUSING_LOAN_COLUMNS, string> = HOUSING_LOAN_COLUMNS,
): NormalizationResult {
  if (isEmptyRow(row)) return fail('EmptyRow', 'every column is blank');

  const warnings: string[] = [];
  const nationalId = readText(row[columns.nationalId]);
  const customerNumber = readText(row[columns.customerNumber]);
  if (nationalId === undefined && customerNumber === undefined) {
    return fail('MissingCustomerIdentity', 'neither ID Number nor Customer Number is present');
  }
  if (nationalId !== undefined && nationalId.length < 8) {
    warnings.push(`ID Number '${nationalId}' is shorter than 8 digits; leading zeros were lost by numeric typing at the source`);
  }

  const facilityNumber = readText(row[columns.accountNumber]);
  if (facilityNumber === undefined) return fail('MissingFacilityNumber', 'Account Number is absent');

  const dpd = readNumber(row[columns.arrearDays]);
  if (dpd === undefined) return fail('MissingDpd', 'Arrear Days is absent');
  if (!Number.isInteger(dpd) || dpd < 0) return fail('MalformedDpd', `Arrear Days is '${String(row[columns.arrearDays])}'`);

  const loanBalance = readNumber(row[columns.loanBalance]);
  const totalArrears = readNumber(row[columns.totalArrears]);
  if (loanBalance === undefined || totalArrears === undefined) {
    return fail('MalformedAmount', 'Loan Balance or Total Arrears is absent or not a number');
  }

  const firstArrear = readDayFirstDate(row[columns.firstArrearDate]);
  if (firstArrear.malformed !== undefined) {
    return fail('MalformedDate', `First Arrear Date '${firstArrear.malformed}' is not DD/MM/YYYY`);
  }

  const bucket = readArrearBucket(row[columns.arrearBuckets]);
  if (bucket.unknown !== undefined) {
    return fail('UnknownArrearBucket', `Arrear Buckets '${bucket.unknown}' is outside the approved taxonomy`);
  }

  const installmentAmount = readNumber(row[columns.installmentAmount]);
  const ratio = readNumber(row[columns.arrearPercent]);
  if (installmentAmount === 0) {
    warnings.push('Installment Amount is zero; no coverage ratio is derived, matching what MIS itself supplies');
  }

  const mobileNumber = readText(row[columns.mobileNumber]);
  if (mobileNumber !== undefined && mobileNumber.length < 8) {
    warnings.push(`Mobile Number is shorter than 8 digits; leading zeros were lost at the source. Contact data only — never identity`);
  }

  const candidate = {
    customer: {
      ...(nationalId !== undefined ? { nationalId } : {}),
      ...(customerNumber !== undefined ? { customerNumber } : {}),
    },
    ...optional('customerName', readText(row[columns.customerName])),
    facilityNumber,
    sourceSystem: context.sourceSystem,
    ...optional('loanTypeCode', readText(row[columns.loanTypeCode])),
    ...optional('loanTypeDescription', readText(row[columns.loanTypeDescription])),
    // Opaque by contract: an integer in the data, a string here, and nothing branches on it.
    ...optional('accountStatusCode', readText(row[columns.accountStatus])),
    ...optional('isDeceasedPerQcb', readQcbDeceased(row[columns.qcbDeceasedStatus])),
    dpd,
    ...optional('arrearBucket', bucket.bucket),
    loanBalance,
    totalArrears,
    ...optional('installmentAmount', installmentAmount),
    ...optional('lastArrearAmount', readNumber(row[columns.lastArrearAmount])),
    // Clamped to the schema's 0..1, because 5 rows in the evidenced feed exceed 1.
    ...optional('instalmentCoverageRatio', ratio === undefined ? undefined : Math.min(1, Math.max(0, ratio))),
    ...optional('firstArrearDate', firstArrear.iso),
    ...optional('exemptionPercentage', readNumber(row[columns.exemptionPercentage])),
    ...optional('exemptionAmount', readNumber(row[columns.exemptionAmount])),
    misAsOfDate: context.misAsOfDate,
    integrationBatchId: context.integrationBatchId,
    ...optional('correlationId', context.correlationId),
    ...optional('mobileNumber', mobileNumber),
  };

  const parsed = MisDelinquencyRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail('MalformedAmount',
      `the normalized row did not satisfy the canonical contract: ${parsed.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return { ok: true, record: parsed.data, warnings };
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
