import { describe, expect, it } from 'vitest';
import {
  SynchronizationError,
  advanceCheckpoint,
  assertResumable,
  describeSyncMode,
  requireSupportedMode,
  startCheckpoint,
  type ProcessingCheckpoint,
} from './synchronization.js';

const NOW = '2026-09-18T15:00:00.000Z';
const fresh = (): ProcessingCheckpoint => startCheckpoint('run-1', 'HL', 'FullScan', NOW);

describe('a new checkpoint', () => {
  it('starts with nothing processed', () => {
    expect(fresh()).toMatchObject({ pagesCompleted: 0, recordsProcessed: 0, recordsFailed: 0, completed: false });
  });

  it('carries no source continuation until the source issues one', () => {
    expect(fresh().sourceContinuation).toBeUndefined();
  });

  it('carries no source change token, because no MIS change mechanism is in evidence', () => {
    expect(fresh().sourceChangeToken).toBeUndefined();
  });
});

describe('advancing after a page is persisted', () => {
  it('counts the page, its records and its isolated failures', () => {
    const next = advanceCheckpoint(fresh(), { recordsProcessed: 50, recordsFailed: 2, sourceContinuation: 'tok' }, NOW);
    expect(next).toMatchObject({ pagesCompleted: 1, recordsProcessed: 50, recordsFailed: 2 });
  });

  it('accumulates across pages rather than replacing', () => {
    const one = advanceCheckpoint(fresh(), { recordsProcessed: 50, recordsFailed: 1, sourceContinuation: 'a' }, NOW);
    const two = advanceCheckpoint(one, { recordsProcessed: 30, recordsFailed: 0, sourceContinuation: 'b' }, NOW);
    expect(two).toMatchObject({ pagesCompleted: 2, recordsProcessed: 80, recordsFailed: 1 });
  });

  it('records the source continuation so a restart resumes rather than starts over', () => {
    expect(advanceCheckpoint(fresh(), { recordsProcessed: 10, recordsFailed: 0, sourceContinuation: 'tok' }, NOW)
      .sourceContinuation).toBe('tok');
  });

  it('marks the run complete when the source offers no continuation — the only end signal', () => {
    const done = advanceCheckpoint(fresh(), { recordsProcessed: 7, recordsFailed: 0 }, NOW);
    expect(done.completed).toBe(true);
    expect(done.sourceContinuation).toBeUndefined();
  });

  it('clears a stale continuation when the final page arrives', () => {
    const mid = advanceCheckpoint(fresh(), { recordsProcessed: 10, recordsFailed: 0, sourceContinuation: 'tok' }, NOW);
    const end = advanceCheckpoint(mid, { recordsProcessed: 3, recordsFailed: 0 }, NOW);
    expect(end.sourceContinuation).toBeUndefined();
    expect(end.completed).toBe(true);
  });

  it('refuses a negative record count rather than corrupting the tally', () => {
    expect(() => advanceCheckpoint(fresh(), { recordsProcessed: -1, recordsFailed: 0 }, NOW))
      .toThrow(SynchronizationError);
  });

  it('refuses more failures than records, which cannot be true of any real page', () => {
    expect(() => advanceCheckpoint(fresh(), { recordsProcessed: 3, recordsFailed: 5 }, NOW))
      .toThrow(/failures out of/);
  });

  it('records an empty page without pretending it ended the run, when a continuation came with it', () => {
    const next = advanceCheckpoint(fresh(), { recordsProcessed: 0, recordsFailed: 0, sourceContinuation: 'tok' }, NOW);
    expect(next.completed).toBe(false);
    expect(next.pagesCompleted).toBe(1);
  });
});

describe('resuming', () => {
  it('accepts the same run of the same organisation', () => {
    expect(() => assertResumable(fresh(), 'run-1', 'HL')).not.toThrow();
  });

  it('refuses a checkpoint from a different run', () => {
    expect(() => assertResumable(fresh(), 'run-2', 'HL')).toThrow(/belongs to run/);
  });

  it('refuses a checkpoint from a different organisation — it would process the wrong population', () => {
    expect(() => assertResumable(fresh(), 'run-1', 'BFD')).toThrow(/wrong population/);
  });

  it('refuses to resume a finished run', () => {
    const done = advanceCheckpoint(fresh(), { recordsProcessed: 5, recordsFailed: 0 }, NOW);
    expect(() => assertResumable(done, 'run-1', 'HL')).toThrow(/already completed/);
  });
});

describe('what a run may and may not claim', () => {
  it('a full scan says plainly that it is not source-level change synchronisation', () => {
    expect(describeSyncMode(fresh())).toMatch(/NOT.*source-level change synchronisation/);
  });

  it('a full scan still says it is restartable, because it is', () => {
    expect(describeSyncMode(fresh())).toMatch(/restartable/);
  });

  it('a delta run with no source token refuses to claim delta synchronisation', () => {
    const claimed: ProcessingCheckpoint = { ...fresh(), mode: 'SourceDelta' };
    expect(describeSyncMode(claimed)).toMatch(/cannot claim source-level delta/);
    expect(describeSyncMode(claimed)).toMatch(/TBD — Actual MIS Contract Required/);
  });

  it('a delta run WITH a source token may claim it', () => {
    const real: ProcessingCheckpoint = { ...fresh(), mode: 'SourceDelta', sourceChangeToken: 'token-from-mis' };
    expect(describeSyncMode(real)).toMatch(/Incremental: the source issued a change token/);
  });
});

describe('a mode the source cannot honour is refused', () => {
  it('allows a full scan against any source', () => {
    expect(() => requireSupportedMode('FullScan', false)).not.toThrow();
  });

  it('refuses SourceDelta against a source with no change feed', () => {
    expect(() => requireSupportedMode('SourceDelta', false)).toThrow(SynchronizationError);
  });

  it('explains that running it anyway would reload everything under the wrong name', () => {
    expect(() => requireSupportedMode('SourceDelta', false)).toThrow(/reload the whole population/);
  });

  it('allows SourceDelta where the source genuinely offers one', () => {
    expect(() => requireSupportedMode('SourceDelta', true)).not.toThrow();
  });
});
