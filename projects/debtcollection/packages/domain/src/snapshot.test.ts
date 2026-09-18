import { describe, expect, it } from 'vitest';
import { SnapshotKeyError, buildSnapshot, composeSnapshotKey, SNAPSHOT_KEY_MAX_LENGTH } from './snapshot.js';
import { sampleRecord } from './misObservation.test.js';
import type { EligibilityDecision } from './eligibility.js';

const decision: EligibilityDecision = {
  outcome: 'EligibleCreateCase', rulesetCode: 'HL-ELIG', rulesetVersion: '1.0', evaluatedOn: '2026-07-01T02:00:00Z',
};

describe('building a snapshot', () => {
  it('retains the MIS source identity — customer id, facility number, source system', () => {
    const snapshot = buildSnapshot(sampleRecord, decision, { receivedOn: '2026-07-01T02:00:00Z' });
    expect(snapshot.customerBusinessId).toBe('28912345678');
    expect(snapshot.facility).toEqual({ facilityNumber: '123456789', sourceSystem: 'HL' });
  });

  it('can exist without a case — a GraceMonitor observation has none', () => {
    const snapshot = buildSnapshot(sampleRecord, { ...decision, outcome: 'GraceMonitor' }, { receivedOn: '2026-07-01T02:00:00Z' });
    expect(snapshot.caseId).toBeUndefined();
    expect(snapshot.eligibility.outcome).toBe('GraceMonitor');
  });

  it('links to the case when one was created or updated', () => {
    const snapshot = buildSnapshot(sampleRecord, decision, { receivedOn: '2026-07-01T02:00:00Z', caseId: '33333333-3333-4333-8333-333333333333' });
    expect(snapshot.caseId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('falls back to the customer number as the source identifier when no national id was delivered', () => {
    const snapshot = buildSnapshot({ ...sampleRecord, customer: { customerNumber: 'C-1001' } }, decision, { receivedOn: '2026-07-01T02:00:00Z' });
    expect(snapshot.customerBusinessId).toBe('C-1001');
  });

  it('carries the position verbatim and the observation identity', () => {
    const snapshot = buildSnapshot({ ...sampleRecord, sourceTimestamp: '2026-06-30T23:59:00Z' }, decision, { receivedOn: '2026-07-01T02:00:00Z' });
    expect(snapshot).toMatchObject({ dpd: 45, arrearBucket: '31-60', totalArrears: 12_500, snapshotDate: '2026-06-30', sourceTimestamp: '2026-06-30T23:59:00Z', integrationBatchId: 'BATCH-2026-06-30' });
  });
});

describe('the idempotency key — composition is configuration', () => {
  const snapshot = buildSnapshot({ ...sampleRecord, sourceTimestamp: '2026-06-30T23:59:00Z' }, decision, { receivedOn: '2026-07-01T02:00:00Z' });

  it('composes the configured parts in the configured order', () => {
    expect(composeSnapshotKey(snapshot, ['sourceSystem', 'facilityNumber', 'snapshotDate'])).toBe('HL|123456789|2026-06-30');
  });

  it('yields the same key for the same observation on replay', () => {
    const replay = buildSnapshot({ ...sampleRecord, sourceTimestamp: '2026-06-30T23:59:00Z', integrationBatchId: 'BATCH-RERUN' }, decision, { receivedOn: '2026-07-02T02:00:00Z' });
    const composition = ['facilityNumber', 'sourceTimestamp'] as const;
    expect(composeSnapshotKey(replay, [...composition])).toBe(composeSnapshotKey(snapshot, [...composition]));
  });

  it('refuses to compose when a configured part is absent — a partial key would collide', () => {
    expect(() => composeSnapshotKey(snapshot, ['facilityNumber', 'sourceRecordId'])).toThrow(SnapshotKeyError);
  });

  it('refuses an empty composition rather than defaulting one', () => {
    expect(() => composeSnapshotKey(snapshot, [] as never)).toThrow(SnapshotKeyError);
  });

  it('refuses a part that contains the separator', () => {
    const odd = { ...snapshot, facility: { ...snapshot.facility, facilityNumber: 'A|B' } };
    expect(() => composeSnapshotKey(odd, ['facilityNumber'])).toThrow(/separator/);
  });

  it('refuses a key the column cannot hold', () => {
    const long = { ...snapshot, sourceRecordId: 'R'.repeat(SNAPSHOT_KEY_MAX_LENGTH) };
    expect(() => composeSnapshotKey(long, ['facilityNumber', 'sourceRecordId'])).toThrow(/characters/);
  });
});
