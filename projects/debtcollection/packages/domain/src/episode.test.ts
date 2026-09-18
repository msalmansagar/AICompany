import { describe, expect, it } from 'vitest';
import { decideEpisodeAction } from './episode.js';
import type { CaseSummary } from './collectionCase.js';
import { sampleRecord } from './misObservation.test.js';

const openCase: CaseSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  caseNumber: 'HL-123456789-E1',
  facility: { facilityNumber: '123456789', sourceSystem: 'HL' },
  episodeNumber: 1,
  status: 'InProgress',
  openDate: '2026-05-01',
  cachedPosition: { dpd: 45, arrearBucket: '31-60', loanBalance: 800_000, totalArrears: 12_500, misAsOfDate: '2026-06-30', syncedOn: '2026-07-01T02:00:00Z' },
};

const closedCase: CaseSummary = {
  ...openCase,
  id: '44444444-4444-4444-8444-444444444444',
  status: 'Closed',
  cureDate: '2026-07-10',
  closedDate: '2026-07-15',
};

const asOf = '2026-08-01T00:00:00Z';

describe('opening an episode', () => {
  it('creates episode 1 for a delinquent facility with no case history', () => {
    expect(decideEpisodeAction({ record: sampleRecord, policy: {}, asOf })).toEqual({ kind: 'Create', episodeNumber: 1 });
  });

  it('creates the next episode after a closed one — re-delinquency normally starts anew', () => {
    expect(decideEpisodeAction({ record: sampleRecord, latestClosedCase: closedCase, policy: {}, asOf }))
      .toEqual({ kind: 'Create', episodeNumber: 2 });
  });
});

describe('the same episode', () => {
  it('updates the open case and reports an unchanged position', () => {
    expect(decideEpisodeAction({ record: sampleRecord, activeCase: openCase, policy: {}, asOf }))
      .toEqual({ kind: 'Update', caseId: openCase.id, changed: false });
  });

  it('updates the open case and reports a bucket movement', () => {
    const moved = { ...sampleRecord, dpd: 75, arrearBucket: '61-90' };
    expect(decideEpisodeAction({ record: moved, activeCase: openCase, policy: {}, asOf }))
      .toEqual({ kind: 'Update', caseId: openCase.id, changed: true });
  });

  it('keeps updating a Settled case — it is the current episode until it is Closed', () => {
    const settled = { ...openCase, status: 'Settled' as const };
    expect(decideEpisodeAction({ record: sampleRecord, activeCase: settled, policy: {}, asOf })).toMatchObject({ kind: 'Update' });
  });
});

describe('cure', () => {
  it('marks the open case as curing when MIS reports zero DPD', () => {
    expect(decideEpisodeAction({ record: { ...sampleRecord, dpd: 0, totalArrears: 0 }, activeCase: openCase, policy: {}, asOf }))
      .toEqual({ kind: 'Cure', caseId: openCase.id });
  });

  it('ignores a non-delinquent facility with nothing open', () => {
    expect(decideEpisodeAction({ record: { ...sampleRecord, dpd: 0 }, policy: {}, asOf })).toEqual({ kind: 'Ignore' });
  });
});

describe('reopen policy — configuration, not a constant', () => {
  it('reopens the closed episode inside a configured window', () => {
    expect(decideEpisodeAction({ record: sampleRecord, latestClosedCase: closedCase, policy: { reopenWindowDays: 30 }, asOf }))
      .toEqual({ kind: 'Reopen', caseId: closedCase.id, episodeNumber: 1 });
  });

  it('starts a new episode outside the window', () => {
    expect(decideEpisodeAction({ record: sampleRecord, latestClosedCase: closedCase, policy: { reopenWindowDays: 10 }, asOf }))
      .toEqual({ kind: 'Create', episodeNumber: 2 });
  });

  it('never reopens a case with no recorded closure date', () => {
    const undated = { ...closedCase, closedDate: undefined };
    expect(decideEpisodeAction({ record: sampleRecord, latestClosedCase: undated, policy: { reopenWindowDays: 365 }, asOf }))
      .toEqual({ kind: 'Create', episodeNumber: 2 });
  });
});

describe('guarding the invariant', () => {
  it('refuses a terminal case passed as the active one — one active case per facility means statecode 0', () => {
    expect(() => decideEpisodeAction({ record: sampleRecord, activeCase: closedCase, policy: {}, asOf })).toThrow(/terminal/);
  });
});
