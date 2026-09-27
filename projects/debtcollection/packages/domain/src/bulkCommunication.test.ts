import { describe, expect, it } from 'vitest';
import {
  deriveProgress, freezePopulation, nativeActivityIdFor, parseNonSuccesses, planBatch, reconcile,
  serialiseNonSuccesses, thawPopulation, validateManifestCapacity,
  type RecordedNonSuccess,
} from './bulkCommunication.js';

/**
 * The arithmetic that decides whether thousands of customers were contacted correctly.
 *
 * Tested exhaustively here, with no platform, because these are the cases that are expensive to
 * reproduce against an organisation and catastrophic to get wrong — a run that double-counts reports
 * success over customers who were never contacted, and one that under-counts contacts them twice.
 */

/** The real `qdb_frozenpopulation` capacity, read from live metadata during provisioning. */
const REAL_CAPACITY = 1_048_576;

const guid = (n: number) => {
  const hex = n.toString(16).padStart(12, '0');
  return `aaaaaaaa-bbbb-cccc-dddd-${hex}`;
};
const population = (count: number) => Array.from({ length: count }, (_, i) => guid(i));

describe('freezing the population', () => {
  it('round-trips the ids it was given', () => {
    const ids = population(5);
    const { manifest, total } = freezePopulation(ids);
    expect(total).toBe(5);
    expect(thawPopulation(manifest)).toEqual(ids);
  });

  /**
   * A duplicate in the source would make the total wrong for a reason unrelated to sending, so the
   * reconciliation arithmetic would fail even when every message went out correctly.
   */
  it('collapses a duplicated recipient at freeze time', () => {
    const { manifest, total } = freezePopulation([guid(1), guid(2), guid(1), guid(2), guid(1)]);
    expect(total).toBe(2);
    expect(thawPopulation(manifest)).toEqual([guid(1), guid(2)]);
  });

  it('treats the same id in different casing as one recipient', () => {
    const { total } = freezePopulation([guid(3), guid(3).toUpperCase()]);
    expect(total).toBe(1);
  });

  it('preserves order, so a resume continues where the confirmation left off', () => {
    const ids = [guid(9), guid(2), guid(7)];
    expect(thawPopulation(freezePopulation(ids).manifest)).toEqual(ids);
  });

  it('handles an empty population without producing a phantom recipient', () => {
    const { manifest, total } = freezePopulation([]);
    expect(total).toBe(0);
    expect(manifest).toBe('');
    expect(thawPopulation(manifest)).toEqual([]);
  });

  it('discards anything that is not a recipient id rather than storing it', () => {
    const { total } = freezePopulation([guid(1), '', 'not-a-guid', guid(2)]);
    expect(total).toBe(2);
  });
});

describe('capacity, measured against the real column', () => {
  const lengthOf = (count: number) => freezePopulation(population(count)).manifest.length;

  it('serialises to exactly 33 characters per recipient, so the check can be exact', () => {
    // 32 hex characters plus one separator. The last id carries no trailing separator.
    expect(lengthOf(1)).toBe(32);
    expect(lengthOf(2)).toBe(65);
    expect(lengthOf(100)).toBe(100 * 33 - 1);
  });

  it('accepts a population comfortably below the limit', () => {
    const verdict = validateManifestCapacity(freezePopulation(population(4_363)).manifest, REAL_CAPACITY);
    expect(verdict.fits).toBe(true);
    // The whole collection book, against the column that actually exists.
    expect(verdict.serializedLength).toBeLessThan(REAL_CAPACITY / 7);
  });

  it('accepts a population immediately below the usable limit', () => {
    const usable = REAL_CAPACITY - Math.floor(REAL_CAPACITY * 0.01);
    const count = Math.floor((usable + 1) / 33);
    const verdict = validateManifestCapacity(freezePopulation(population(count)).manifest, REAL_CAPACITY);
    expect(verdict.fits).toBe(true);
    expect(verdict.serializedLength).toBeLessThanOrEqual(usable);
  });

  /** The margin is the point: a value that exactly fills a column is one difference from rejection. */
  it('refuses a population that fits the column but not the safety margin', () => {
    const justUnderCapacity = 'a'.repeat(REAL_CAPACITY - 10);
    const verdict = validateManifestCapacity(justUnderCapacity, REAL_CAPACITY);
    expect(verdict.serializedLength).toBeLessThan(REAL_CAPACITY);
    expect(verdict.fits, 'inside the column but inside the margin').toBe(false);
  });

  it('refuses a population immediately above the usable limit', () => {
    const usable = REAL_CAPACITY - Math.floor(REAL_CAPACITY * 0.01);
    const verdict = validateManifestCapacity('a'.repeat(usable + 1), REAL_CAPACITY);
    expect(verdict.fits).toBe(false);
  });

  it('refuses a very large population and says what to do about it', () => {
    const verdict = validateManifestCapacity(freezePopulation(population(50_000)).manifest, REAL_CAPACITY);
    expect(verdict.fits).toBe(false);
    expect(verdict.message).toMatch(/narrow the filter/i);
    expect(verdict.message, 'the officer is told the size, not the byte count').toMatch(/50,000 recipients/);
  });

  it('accepts an empty population as trivially storable', () => {
    expect(validateManifestCapacity('', REAL_CAPACITY).fits).toBe(true);
  });

  /**
   * The capacity is the platform's, not a constant. A column created smaller than requested must
   * shrink the limit rather than be ignored, which is why the caller passes metadata in.
   */
  it('sizes the refusal against whatever capacity it is given', () => {
    const manifest = freezePopulation(population(100)).manifest;
    expect(validateManifestCapacity(manifest, 10_000).fits).toBe(true);
    expect(validateManifestCapacity(manifest, 1_000).fits).toBe(false);
  });
});

describe('recording non-successes', () => {
  const entries: RecordedNonSuccess[] = [
    { recipientId: guid(1), outcome: 'refused', detail: 'marked do not fax' },
    { recipientId: guid(2), outcome: 'failed', detail: 'HTTP 503' },
  ];

  it('round-trips, keeping terminal refusals distinguishable from retryable failures', () => {
    expect(parseNonSuccesses(serialiseNonSuccesses(entries))).toEqual(entries);
  });

  it('strips separators from a detail so one entry cannot forge another', () => {
    const hostile = [{ recipientId: guid(3), outcome: 'failed' as const, detail: 'a\nb|c' }];
    expect(parseNonSuccesses(serialiseNonSuccesses(hostile))).toHaveLength(1);
  });

  it('reads an empty record as no non-successes', () => {
    expect(parseNonSuccesses('')).toEqual([]);
  });
});

describe('progress, derived rather than incremented', () => {
  it('derives successes from the cursor and the recorded non-successes', () => {
    const progress = deriveProgress(100, 40, [
      { recipientId: guid(1), outcome: 'refused', detail: 'x' },
      { recipientId: guid(2), outcome: 'failed', detail: 'y' },
    ]);
    expect(progress).toMatchObject({
      total: 100, processed: 40, successful: 38, refused: 1, failed: 1, remaining: 60, complete: false,
    });
  });

  /**
   * The property that makes the crash window safe. Deriving the count means re-processing a
   * recipient cannot inflate it, however many times a resume covers the same ground.
   */
  it('cannot double-count when the same cursor is applied twice', () => {
    const nonSuccesses: RecordedNonSuccess[] = [];
    const first = deriveProgress(10, 5, nonSuccesses);
    const afterRetry = deriveProgress(10, 5, nonSuccesses);
    expect(afterRetry.successful).toBe(first.successful);
    expect(afterRetry.successful).toBe(5);
  });

  it('never reports more processed than the population holds', () => {
    expect(deriveProgress(10, 999, []).processed).toBe(10);
  });

  it('treats an empty population as complete', () => {
    expect(deriveProgress(0, 0, []).complete).toBe(true);
  });
});

describe('the completion invariant', () => {
  it('reconciles when successes, refusals and failures account for the population', () => {
    const nonSuccesses: RecordedNonSuccess[] = [
      { recipientId: guid(1), outcome: 'refused', detail: 'no mobile' },
      { recipientId: guid(2), outcome: 'failed', detail: 'timeout' },
    ];
    const verdict = reconcile(10, 10, nonSuccesses);
    expect(verdict.reconciles).toBe(true);
    expect(verdict.progress.successful + verdict.progress.refused + verdict.progress.failed).toBe(10);
  });

  it('refuses to call an unfinished run reconciled', () => {
    const verdict = reconcile(10, 7, []);
    expect(verdict.reconciles).toBe(false);
    expect(verdict.message).toMatch(/not complete/);
  });

  /** The platform's count is the evidence; the executor's own view of what it sent is not. */
  it('fails when the platform holds a different number of records than the run claims', () => {
    const verdict = reconcile(10, 10, [], 9);
    expect(verdict.reconciles).toBe(false);
    expect(verdict.message).toMatch(/platform holds 9/);
  });

  it('reconciles against the platform when the two agree', () => {
    expect(reconcile(10, 10, [], 10).reconciles).toBe(true);
  });

  it('is unchanged by how many retries it took to get there', () => {
    const nonSuccesses: RecordedNonSuccess[] = [{ recipientId: guid(1), outcome: 'refused', detail: 'x' }];
    const once = reconcile(5, 5, nonSuccesses);
    const afterResumes = reconcile(5, 5, nonSuccesses);
    expect(afterResumes).toEqual(once);
    expect(once.reconciles).toBe(true);
  });
});

describe('planning a bounded batch', () => {
  const ids = population(10);

  it('takes the next slice and reports an absolute next cursor', () => {
    const plan = planBatch(ids, 0, 4);
    expect(plan.recipientIds).toHaveLength(4);
    expect(plan.nextCursor).toBe(4);
    expect(plan.lastBatch).toBe(false);
  });

  it('stops at the end of the population rather than running past it', () => {
    const plan = planBatch(ids, 8, 5);
    expect(plan.recipientIds).toHaveLength(2);
    expect(plan.nextCursor).toBe(10);
    expect(plan.lastBatch).toBe(true);
  });

  /**
   * A position, not a delta. Persisting it twice leaves the same value, so a retried checkpoint
   * cannot advance the run past work it has not done — which a `cursor += n` would.
   */
  it('produces the same next cursor when the same batch is planned twice', () => {
    expect(planBatch(ids, 4, 3).nextCursor).toBe(planBatch(ids, 4, 3).nextCursor);
  });

  it('yields nothing once the population is exhausted', () => {
    const plan = planBatch(ids, 10, 5);
    expect(plan.recipientIds).toEqual([]);
    expect(plan.lastBatch).toBe(true);
  });

  it('handles an empty population', () => {
    expect(planBatch([], 0, 10)).toMatchObject({ recipientIds: [], nextCursor: 0, lastBatch: true });
  });
});

describe('the native activity id for a run', () => {
  const run = '11111111-1111-1111-1111-111111111111';

  it('is stable across resumes, which is what makes the crash window safe', () => {
    expect(nativeActivityIdFor(run, guid(1), 'SMS')).toBe(nativeActivityIdFor(run, guid(1), 'SMS'));
  });

  it('differs per channel, so a bulk SMS and a bulk Email are different records', () => {
    expect(nativeActivityIdFor(run, guid(1), 'SMS')).not.toBe(nativeActivityIdFor(run, guid(1), 'Email'));
  });
});
