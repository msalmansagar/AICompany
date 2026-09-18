import { describe, expect, it } from 'vitest';
import {
  HOUSING_LOAN_COLUMNS as C,
  isEmptyRow,
  normalizeHousingLoanRow,
  readArrearBucket,
  readDayFirstDate,
  readNumber,
  readQcbDeceased,
  readText,
  type NormalizationContext,
  type RawMisRow,
} from './misNormalization.js';

const CONTEXT: NormalizationContext = {
  sourceSystem: 'HL',
  misAsOfDate: '2026-06-30',
  integrationBatchId: 'batch-1',
};

/** A row shaped exactly like the evidenced Housing Loan feed. */
function row(overrides: RawMisRow = {}): RawMisRow {
  return {
    [C.customerNumber]: 123456,
    [C.customerName]: 'SMOKE CUSTOMER',
    [C.accountNumber]: 9001234,
    [C.loanTypeCode]: 1011,
    [C.loanTypeDescription]: 'Building Housing',
    [C.nationalId]: 28912345678,
    [C.qcbDeceasedStatus]: null,
    [C.loanBalance]: 850000.5,
    [C.accountStatus]: 8,
    [C.firstArrearDate]: '30/06/2026',
    [C.arrearDays]: 45,
    [C.totalArrears]: 12000,
    [C.installmentAmount]: 6000,
    [C.lastArrearAmount]: 6000,
    [C.arrearPercent]: 1,
    [C.exemptionPercentage]: null,
    [C.exemptionAmount]: null,
    [C.arrearBuckets]: '31-60',
    [C.mobileNumber]: 55512345,
    ...overrides,
  };
}

const ok = (result: ReturnType<typeof normalizeHousingLoanRow>) => {
  if (!result.ok) throw new Error(`expected success, got ${result.problem}: ${result.detail}`);
  return result;
};

describe('reading a field', () => {
  it('turns a numeric identifier into digits, so nothing further is lost', () => {
    expect(readText(28912345678)).toBe('28912345678');
  });

  it('treats a blank string as absent rather than as an empty identifier', () => {
    expect(readText('   ')).toBeUndefined();
  });

  it('accepts the thousands separators an export produces', () => {
    expect(readNumber('12,000')).toBe(12000);
  });

  it('refuses text that is not a number rather than yielding NaN', () => {
    expect(readNumber('not a number')).toBeUndefined();
  });

  it('reads DEAD as deceased per QCB', () => {
    expect(readQcbDeceased('DEAD')).toBe(true);
  });

  it('treats a blank QCB status as no assertion, not as "alive"', () => {
    expect(readQcbDeceased(null)).toBeUndefined();
  });

  it('does not read any other value as deceased', () => {
    expect(readQcbDeceased('Deceased not applied')).toBe(false);
  });
});

describe('dates are day-first, because that is what the data is', () => {
  it('reads 30/06/2026 as 30 June', () => {
    expect(readDayFirstDate('30/06/2026').iso).toBe('2026-06-30');
  });

  it('reads 06/07/2026 as 6 July, not 7 June', () => {
    expect(readDayFirstDate('06/07/2026').iso).toBe('2026-07-06');
  });

  it('passes an ISO date through unchanged, so a future MIS contract needs no change here', () => {
    expect(readDayFirstDate('2026-06-30').iso).toBe('2026-06-30');
  });

  it('passes a real Date through', () => {
    expect(readDayFirstDate(new Date(Date.UTC(2026, 5, 30))).iso).toBe('2026-06-30');
  });

  it('reports an impossible day rather than rolling it into the next month', () => {
    expect(readDayFirstDate('31/06/2026').malformed).toBe('31/06/2026');
  });

  it('reports a month above twelve as malformed instead of guessing it was day-first', () => {
    expect(readDayFirstDate('06/31/2026').malformed).toBe('06/31/2026');
  });

  it('treats an absent date as absent, not as an error', () => {
    expect(readDayFirstDate(null)).toEqual({});
  });
});

describe('the arrear bucket survives the export coercion', () => {
  it('recovers 1-30 from the date the export turned it into — 1,670 rows in the evidenced feed', () => {
    expect(readArrearBucket(new Date(Date.UTC(2026, 0, 30))).bucket).toBe('1-30');
  });

  it('recovers 1-30 whatever year the coercion used', () => {
    expect(readArrearBucket(new Date(Date.UTC(1999, 0, 30))).bucket).toBe('1-30');
  });

  it('reads every other bucket as the string it stayed', () => {
    for (const code of ['31-60', '61-90', '91-180', '181-270', '271-360', '361-500', '501-1000', '1001-2000', '>2000']) {
      expect(readArrearBucket(code).bucket, code).toBe(code);
    }
  });

  it('tolerates stray whitespace around a bucket', () => {
    expect(readArrearBucket(' 91-180 ').bucket).toBe('91-180');
  });

  it('reports a bucket outside the taxonomy rather than accepting it', () => {
    expect(readArrearBucket('9000-9999').unknown).toBe('9000-9999');
  });

  it('reports a date that is not a bucket rather than inventing one', () => {
    expect(readArrearBucket(new Date(Date.UTC(2026, 6, 15))).unknown).toContain('2026-07-15');
  });
});

describe('normalizing a row', () => {
  it('produces a canonical observation from the evidenced shape', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), CONTEXT));
    expect(record).toMatchObject({
      facilityNumber: '9001234',
      sourceSystem: 'HL',
      dpd: 45,
      totalArrears: 12000,
      arrearBucket: '31-60',
      firstArrearDate: '2026-06-30',
      misAsOfDate: '2026-06-30',
    });
  });

  it('carries the national id and customer number as strings', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), CONTEXT));
    expect(record.customer).toEqual({ nationalId: '28912345678', customerNumber: '123456' });
  });

  it('never puts the mobile number in the identity', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), CONTEXT));
    expect(Object.keys(record.customer)).not.toContain('mobileNumber');
    expect(record.mobileNumber).toBe('55512345');
  });

  it('keeps Account Status as an opaque string and branches on nothing', () => {
    const { record } = ok(normalizeHousingLoanRow(row({ [C.accountStatus]: 7 }), CONTEXT));
    expect(record.accountStatusCode).toBe('7');
  });

  it('takes the as-of date from the run, because the feed has none per row', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), { ...CONTEXT, misAsOfDate: '2026-05-31' }));
    expect(record.misAsOfDate).toBe('2026-05-31');
  });

  it('does not invent a customer type, which the feed does not supply', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), CONTEXT));
    expect(record as Record<string, unknown>).not.toHaveProperty('customerType');
  });

  it('does not invent a source timestamp or record id', () => {
    const { record } = ok(normalizeHousingLoanRow(row(), CONTEXT));
    expect(record.sourceTimestamp).toBeUndefined();
    expect(record.sourceRecordId).toBeUndefined();
  });

  it('marks QCB DEAD without treating it as a contact hold', () => {
    const { record } = ok(normalizeHousingLoanRow(row({ [C.qcbDeceasedStatus]: 'DEAD' }), CONTEXT));
    expect(record.isDeceasedPerQcb).toBe(true);
  });
});

describe('the data-quality facts measured in the real feed', () => {
  it('recovers the 1-30 bucket end to end from a coerced date', () => {
    const { record } = ok(normalizeHousingLoanRow(row({ [C.arrearBuckets]: new Date(Date.UTC(2026, 0, 30)), [C.arrearDays]: 12 }), CONTEXT));
    expect(record.arrearBucket).toBe('1-30');
  });

  it('derives no coverage ratio when the instalment is zero, matching MIS', () => {
    const { record, warnings } = ok(normalizeHousingLoanRow(
      row({ [C.installmentAmount]: 0, [C.arrearPercent]: null }), CONTEXT));
    expect(record.instalmentCoverageRatio).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/Installment Amount is zero/);
  });

  it('clamps a ratio above one rather than failing the row — 5 such rows exist', () => {
    const { record } = ok(normalizeHousingLoanRow(row({ [C.arrearPercent]: 1.4 }), CONTEXT));
    expect(record.instalmentCoverageRatio).toBe(1);
  });

  it('warns that a short id lost its leading zeros, without rejecting the row', () => {
    const { warnings } = ok(normalizeHousingLoanRow(row({ [C.nationalId]: 1234567 }), CONTEXT));
    expect(warnings.join(' ')).toMatch(/leading zeros/);
  });

  it('warns about a short mobile number and says it is never identity', () => {
    const { warnings } = ok(normalizeHousingLoanRow(row({ [C.mobileNumber]: 5551234 }), CONTEXT));
    expect(warnings.join(' ')).toMatch(/never identity/);
  });

  it('recognises the blank rows the feed contains', () => {
    expect(isEmptyRow({ a: null, b: '', c: undefined })).toBe(true);
    expect(isEmptyRow({ a: null, b: 'x' })).toBe(false);
  });
});

describe('a row that cannot be normalized says why, and does not end the run', () => {
  it('names an empty row', () => {
    const result = normalizeHousingLoanRow({ [C.accountNumber]: null }, CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'EmptyRow' });
  });

  it('refuses a row with neither national id nor customer number', () => {
    const result = normalizeHousingLoanRow(row({ [C.nationalId]: null, [C.customerNumber]: null }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MissingCustomerIdentity' });
  });

  it('accepts a row with only a customer number', () => {
    expect(normalizeHousingLoanRow(row({ [C.nationalId]: null }), CONTEXT).ok).toBe(true);
  });

  it('accepts a row with only a national id', () => {
    expect(normalizeHousingLoanRow(row({ [C.customerNumber]: null }), CONTEXT).ok).toBe(true);
  });

  it('refuses a row with no account number', () => {
    const result = normalizeHousingLoanRow(row({ [C.accountNumber]: null }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MissingFacilityNumber' });
  });

  it('refuses a row with no arrear days', () => {
    const result = normalizeHousingLoanRow(row({ [C.arrearDays]: null }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MissingDpd' });
  });

  it('refuses a negative DPD', () => {
    const result = normalizeHousingLoanRow(row({ [C.arrearDays]: -5 }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MalformedDpd' });
  });

  it('refuses a missing balance rather than defaulting it to zero', () => {
    const result = normalizeHousingLoanRow(row({ [C.loanBalance]: null }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MalformedAmount' });
  });

  it('refuses an unparseable first arrear date', () => {
    const result = normalizeHousingLoanRow(row({ [C.firstArrearDate]: '31/13/2026' }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'MalformedDate' });
  });

  it('refuses a bucket outside the approved taxonomy', () => {
    const result = normalizeHousingLoanRow(row({ [C.arrearBuckets]: 'quite overdue' }), CONTEXT);
    expect(result).toMatchObject({ ok: false, problem: 'UnknownArrearBucket' });
  });

  it('explains the refusal in terms an operator can act on', () => {
    const result = normalizeHousingLoanRow(row({ [C.arrearBuckets]: '9000-9999' }), CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain('9000-9999');
  });

  it('accepts a cured facility reporting zero DPD — cure is an observation, not a malformation', () => {
    const { record } = ok(normalizeHousingLoanRow(row({ [C.arrearDays]: 0, [C.totalArrears]: 0 }), CONTEXT));
    expect(record.dpd).toBe(0);
  });
});
