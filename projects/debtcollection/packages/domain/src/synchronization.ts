/**
 * Restartable background synchronisation — and the distinction that makes it honest.
 *
 * There are **two different kinds of progress marker** here, and conflating them would let this
 * platform claim something it cannot do:
 *
 *   • **DCP processing checkpoint** — how far *this platform* got through a run. It is ours, we can
 *     always produce it, and it makes a run restartable without reprocessing completed work.
 *   • **MIS source change token** — the source's own marker for "everything changed since here". It
 *     would make synchronisation genuinely *incremental*. **No such mechanism exists in evidence**
 *     (`docs/MISContractEvidence.md`): there is no change feed, no delta endpoint and no per-row
 *     source timestamp or record id anywhere in the supplied MIS evidence.
 *
 * Remembering where we got to in a full scan is **not** the same as knowing what changed at the
 * source. A checkpoint lets a failed run resume; only a source change token would let a run skip
 * unchanged records. This module keeps the two apart in the type system so that
 * `SourceDelta` cannot be claimed by a source that never supplied a token — see `describeSyncMode`.
 *
 * The other rule it enforces: **a checkpoint never advances past an observation that was not
 * processed.** A checkpoint is written after a page's outcomes are persisted, never before, because
 * the failure mode it prevents — silently skipping delinquency events nobody ever looks at again — is
 * far worse than reprocessing a page.
 */

import { z } from 'zod';

// ── Mode ─────────────────────────────────────────────────────────────────────

/**
 * How a run obtains its records.
 *
 * `FullScan` walks the source's current population page by page. `SourceDelta` asks the source for
 * what changed since a token it previously issued — **available only if the source actually offers
 * one**, which today no MIS source does.
 */
export const SyncModeSchema = z.enum(['FullScan', 'SourceDelta']);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export class SynchronizationError extends Error {
  constructor(
    message: string,
    readonly kind: 'UnsupportedMode' | 'CheckpointMismatch' | 'SourceUnavailable' | 'CheckpointRegression',
  ) {
    super(message);
    this.name = 'SynchronizationError';
  }
}

// ── The checkpoint ───────────────────────────────────────────────────────────

/**
 * DCP's own record of how far a run got.
 *
 * Every field is something this platform observed. Nothing here is a claim about the source beyond
 * the opaque markers the source itself handed over.
 */
export const ProcessingCheckpointSchema = z.object({
  /** Identifies one synchronisation run, so a restart can be told from a fresh start. */
  runId: z.string().min(1),
  organizationCode: z.string().min(1),
  mode: SyncModeSchema,

  /**
   * The source's page continuation, opaque. Present mid-run; absent when the walk finished.
   * This is a position **within one scan**, not a marker of source-side change.
   */
  sourceContinuation: z.string().optional(),

  /**
   * The source's own change token, if — and only if — the source issued one.
   *
   * **Currently always absent.** No MIS change mechanism is in evidence. Its presence is what
   * distinguishes a genuinely incremental run from a full scan that merely remembers its place.
   */
  sourceChangeToken: z.string().optional(),

  /** Pages whose outcomes have been persisted. A page in flight is not counted. */
  pagesCompleted: z.number().int().nonnegative(),
  /** Records whose outcomes have been persisted, successes and isolated failures alike. */
  recordsProcessed: z.number().int().nonnegative(),
  /** Records that failed and were isolated, so a run's health is visible without reading every log. */
  recordsFailed: z.number().int().nonnegative(),

  /** When this checkpoint was written, ISO-8601. */
  updatedAt: z.string(),
  /** True once the source reported no further records. */
  completed: z.boolean(),
});
export type ProcessingCheckpoint = z.infer<typeof ProcessingCheckpointSchema>;

/** Somewhere to keep a checkpoint between runs. Deliberately tiny; the store is a caller's choice. */
export interface ICheckpointStore {
  read(organizationCode: string, runId: string): Promise<ProcessingCheckpoint | null>;
  write(checkpoint: ProcessingCheckpoint): Promise<void>;
}

/** A fresh checkpoint for a run that has processed nothing yet. */
export function startCheckpoint(
  runId: string,
  organizationCode: string,
  mode: SyncMode,
  now: string,
): ProcessingCheckpoint {
  return {
    runId, organizationCode, mode,
    pagesCompleted: 0, recordsProcessed: 0, recordsFailed: 0,
    updatedAt: now, completed: false,
  };
}

/**
 * Advances a checkpoint after a page's outcomes have been persisted.
 *
 * It refuses to go backwards. A checkpoint that regressed would re-present work as unprocessed, and —
 * worse in the other direction — a caller that skipped ahead would lose observations silently. Both
 * are caught here rather than in a report three weeks later.
 */
export function advanceCheckpoint(
  previous: ProcessingCheckpoint,
  page: { recordsProcessed: number; recordsFailed: number; sourceContinuation?: string },
  now: string,
): ProcessingCheckpoint {
  if (page.recordsProcessed < 0 || page.recordsFailed < 0) {
    throw new SynchronizationError('A page cannot report a negative number of records', 'CheckpointRegression');
  }
  if (page.recordsFailed > page.recordsProcessed) {
    throw new SynchronizationError(
      `A page reported ${page.recordsFailed} failures out of ${page.recordsProcessed} processed records`,
      'CheckpointRegression');
  }
  // Built field by field rather than by spreading `previous`. An earlier version spread a
  // "previous without the continuation" object *after* the incremented counters, which silently
  // reverted them on the final page — the run's own tally went backwards. Listing the fields makes
  // that class of mistake impossible: a new field has to be carried deliberately.
  return {
    runId: previous.runId,
    organizationCode: previous.organizationCode,
    mode: previous.mode,
    pagesCompleted: previous.pagesCompleted + 1,
    recordsProcessed: previous.recordsProcessed + page.recordsProcessed,
    recordsFailed: previous.recordsFailed + page.recordsFailed,
    // A continuation is carried only while the source offers one. On the final page it is dropped,
    // so a completed checkpoint can never point into a walk that has already ended.
    ...(page.sourceContinuation !== undefined ? { sourceContinuation: page.sourceContinuation } : {}),
    ...(previous.sourceChangeToken !== undefined ? { sourceChangeToken: previous.sourceChangeToken } : {}),
    updatedAt: now,
    completed: page.sourceContinuation === undefined,
  };
}

/** Resuming must target the same run and organisation, or it is a different question entirely. */
export function assertResumable(
  checkpoint: ProcessingCheckpoint,
  runId: string,
  organizationCode: string,
): void {
  if (checkpoint.runId !== runId || checkpoint.organizationCode !== organizationCode) {
    throw new SynchronizationError(
      `Checkpoint belongs to run '${checkpoint.runId}' of organisation '${checkpoint.organizationCode}', ` +
      `not run '${runId}' of '${organizationCode}'. Resuming it would process the wrong population.`,
      'CheckpointMismatch');
  }
  if (checkpoint.completed) {
    throw new SynchronizationError(
      `Run '${runId}' already completed. Start a new run rather than resuming a finished one.`,
      'CheckpointMismatch');
  }
}

/**
 * Says plainly what a run's progress does and does not guarantee.
 *
 * This exists so the distinction survives contact with a status screen, a report or a gate document,
 * where "synchronised" is otherwise read as "we know what changed".
 */
export function describeSyncMode(checkpoint: ProcessingCheckpoint): string {
  if (checkpoint.mode === 'SourceDelta' && checkpoint.sourceChangeToken !== undefined) {
    return 'Incremental: the source issued a change token, so unchanged records were not re-read.';
  }
  if (checkpoint.mode === 'SourceDelta') {
    return 'Incremental was requested but the source issued no change token, so this run cannot claim ' +
      'source-level delta synchronisation. TBD — Actual MIS Contract Required.';
  }
  return 'Full scan with a DCP processing checkpoint: the run is restartable, but this is NOT ' +
    'source-level change synchronisation — no MIS change mechanism is in evidence.';
}

/**
 * Refuses a mode the source cannot honour.
 *
 * A source that cannot report changes must not be driven in `SourceDelta`: it would silently reload
 * the entire population under a name that says it did not.
 */
export function requireSupportedMode(mode: SyncMode, sourceSupportsChangeFeed: boolean): void {
  if (mode === 'SourceDelta' && !sourceSupportsChangeFeed) {
    throw new SynchronizationError(
      'SourceDelta was requested, but this MIS source exposes no changed-since mechanism. Running it as a ' +
      'delta would reload the whole population while reporting an incremental run. Request FullScan ' +
      'explicitly, or supply a source that offers a change feed. TBD — Actual MIS Contract Required.',
      'UnsupportedMode');
  }
}

