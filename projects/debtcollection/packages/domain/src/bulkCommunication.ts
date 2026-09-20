/**
 * The durable bulk communication run — freezing, accounting and reconciliation.
 *
 * Pure decisions again: this module serialises a population, decides what a batch should do, and
 * reconciles the result. It never talks to CRM, so the arithmetic that decides whether thousands of
 * customers were contacted correctly can be tested exhaustively without an organisation.
 *
 * Two ideas carry the whole design.
 *
 * **The population is frozen, not re-queried.** At confirmation the filter is resolved once and the
 * resulting ids are written down. From that moment the run's population is a fact. Re-running a
 * filter at resume would silently turn a 5,000-recipient campaign into a 4,700 or 5,300-recipient
 * one when MIS moved a customer's DPD, and nobody would ever know.
 *
 * **Counters are derived, never incremented.** `successful` is computed from the cursor and the
 * recorded non-successes rather than added to as work happens. An incremented counter can be
 * incremented twice by a retry; a derived one cannot be, however many times the same recipient is
 * processed. That is what makes the accounting survive the crash window.
 */

import { communicationId } from './communicationIdentity.js';
import type { CommunicationChannel } from './communication.js';

// ── Freezing the population ──────────────────────────────────────────────────

/**
 * The separator between ids in the frozen manifest.
 *
 * A single character, so the serialized size is exactly predictable: a GUID stripped of its dashes
 * is 32 characters, plus one separator, giving 33 per recipient. Predictability matters because the
 * capacity check must be exact — see `validateManifestCapacity`.
 */
const MANIFEST_SEPARATOR = ',';

/** Ids are stored without dashes: 32 characters instead of 36, a 12% saving over the manifest. */
function compact(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

function expand(compactId: string): string {
  return [
    compactId.slice(0, 8), compactId.slice(8, 12), compactId.slice(12, 16),
    compactId.slice(16, 20), compactId.slice(20, 32),
  ].join('-');
}

/**
 * Serialises the resolved population into the exact string that will be persisted.
 *
 * **Duplicates are removed here, once, at freeze time.** A population resolved from overlapping
 * filters or a hand-picked set can name the same case twice; collapsing it at the boundary means
 * every count downstream — total, progress, reconciliation — is over distinct recipients. The
 * deterministic id would make a duplicate harmless anyway, but a total that counted someone twice
 * would make the reconciliation arithmetic wrong for a reason that had nothing to do with sending.
 *
 * Order is preserved so a resume processes the population in the same sequence it was confirmed in.
 */
export function freezePopulation(recipientIds: readonly string[]): { manifest: string; total: number } {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of recipientIds) {
    const key = compact(id);
    if (key.length !== 32 || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return { manifest: unique.join(MANIFEST_SEPARATOR), total: unique.length };
}

/** Reads the frozen manifest back. The inverse of `freezePopulation`, and the only way to read it. */
export function thawPopulation(manifest: string): readonly string[] {
  if (!manifest) return [];
  return manifest.split(MANIFEST_SEPARATOR).filter(Boolean).map(expand);
}

export interface CapacityVerdict {
  fits: boolean;
  /** The length of the string that would actually be persisted, not an estimate of it. */
  serializedLength: number;
  /** The column's real capacity, read from platform metadata by the caller. */
  capacity: number;
  /** Characters held back, so a run is refused before it reaches an exact limit. */
  safetyMargin: number;
  message?: string;
}

/**
 * How much of the column is deliberately left unused.
 *
 * 1% of a 1,048,576-character column is ~10,000 characters, about 300 recipients. It exists because
 * a value that exactly fills a column is a value one platform difference away from being rejected,
 * and the failure would arrive halfway through persisting a run rather than before starting one.
 */
const SAFETY_MARGIN_RATIO = 0.01;

/**
 * Decides whether the frozen manifest can be stored, from the **actual serialized string** and the
 * column's **actual capacity**.
 *
 * Both halves of that matter. Estimating as "ids × 33" ignores the encoding that is really applied,
 * and hard-coding the capacity ignores what the platform really created — so the check takes the
 * string that will be sent and the `MaxLength` that was read back from metadata.
 *
 * A run that does not fit is **refused before it starts**. It is never truncated, never split
 * implicitly, and never quietly downgraded to re-running the filter: each of those would send to a
 * population nobody confirmed.
 */
export function validateManifestCapacity(manifest: string, capacity: number): CapacityVerdict {
  const safetyMargin = Math.floor(capacity * SAFETY_MARGIN_RATIO);
  const usable = capacity - safetyMargin;
  const serializedLength = manifest.length;

  if (serializedLength <= usable) {
    return { fits: true, serializedLength, capacity, safetyMargin };
  }
  const recipients = manifest ? manifest.split(MANIFEST_SEPARATOR).length : 0;
  return {
    fits: false,
    serializedLength,
    capacity,
    safetyMargin,
    message:
      `This selection has ${recipients.toLocaleString()} recipients, which is more than one bulk run `
      + 'can hold. Narrow the filter and run it in smaller groups.',
  };
}

// ── What happened to each recipient ──────────────────────────────────────────

/**
 * The outcome of attempting one recipient.
 *
 * `sent` and `alreadySent` are **both successes**. The second is what an idempotent create returns
 * when the record exists — which is the normal, expected answer after a crash between creating a
 * record and persisting the checkpoint. Treating it as a failure would turn correct recovery into a
 * reported error; treating it as a fresh success would double-count.
 *
 * `refused` is terminal: the eligibility gate said no, and retrying changes nothing.
 * `failed` is retryable: the platform or the network failed, and the same recipient may succeed later.
 */
export type RecipientOutcome = 'sent' | 'alreadySent' | 'refused' | 'failed';

export interface RecipientResult {
  recipientId: string;
  outcome: RecipientOutcome;
  /** Why it was refused or how it failed. Never the message body. */
  detail?: string;
}

/** A recorded non-success, as persisted in `qdb_failedrecipients`. */
export interface RecordedNonSuccess {
  recipientId: string;
  outcome: 'refused' | 'failed';
  detail: string;
}

const NON_SUCCESS_SEPARATOR = '\n';
const FIELD_SEPARATOR = '|';

/**
 * Serialises the non-successes.
 *
 * Refusals and failures share one column because the approved schema has one, and they are told
 * apart by a recorded discriminator rather than by two columns — which keeps `refused` (terminal,
 * excluded) distinguishable from `failed` (retryable) without a schema change.
 */
export function serialiseNonSuccesses(entries: readonly RecordedNonSuccess[]): string {
  return entries
    .map(e => [compact(e.recipientId), e.outcome, e.detail.replace(/[\n|]/g, ' ')].join(FIELD_SEPARATOR))
    .join(NON_SUCCESS_SEPARATOR);
}

export function parseNonSuccesses(raw: string): readonly RecordedNonSuccess[] {
  if (!raw) return [];
  return raw.split(NON_SUCCESS_SEPARATOR).filter(Boolean).flatMap(line => {
    const [id = '', outcome = '', ...rest] = line.split(FIELD_SEPARATOR);
    if (outcome !== 'refused' && outcome !== 'failed') return [];
    return [{ recipientId: expand(id), outcome, detail: rest.join(FIELD_SEPARATOR) }];
  });
}

// ── Progress and reconciliation ──────────────────────────────────────────────

export interface RunProgress {
  total: number;
  processed: number;
  successful: number;
  refused: number;
  failed: number;
  remaining: number;
  complete: boolean;
}

/**
 * Derives progress from the checkpoint and the recorded non-successes.
 *
 * **Nothing is incremented.** `successful` is `processed − refused − failed`, so processing the same
 * recipient twice — which a resume across the crash window necessarily does — cannot inflate it.
 * That is the property the authorisation asks for, expressed as arithmetic rather than as a rule
 * the executor has to remember to follow.
 */
export function deriveProgress(
  total: number,
  cursor: number,
  nonSuccesses: readonly RecordedNonSuccess[],
): RunProgress {
  const processed = Math.min(Math.max(cursor, 0), total);
  const refused = nonSuccesses.filter(e => e.outcome === 'refused').length;
  const failed = nonSuccesses.filter(e => e.outcome === 'failed').length;
  return {
    total,
    processed,
    successful: Math.max(processed - refused - failed, 0),
    refused,
    failed,
    remaining: total - processed,
    complete: processed >= total,
  };
}

export interface ReconciliationVerdict {
  reconciles: boolean;
  progress: RunProgress;
  /** Successes counted by the platform, when the caller supplied them. */
  platformCount?: number;
  message?: string;
}

/**
 * The completion invariant: **total = successful + refused + failed**.
 *
 * Checked at terminal completion, and unaffected by how many retries or resumes it took to get
 * there. A run whose arithmetic does not close has either lost track of a recipient or counted one
 * twice, and both are worth failing loudly for — silently reporting "done" over a population that
 * does not add up is how a customer is missed.
 *
 * When the caller supplies `platformCount` — the number of native records the platform actually
 * holds for this run — that is reconciled too. The executor's own view of what it sent is not
 * evidence; the platform's is.
 */
export function reconcile(
  total: number,
  cursor: number,
  nonSuccesses: readonly RecordedNonSuccess[],
  platformCount?: number,
): ReconciliationVerdict {
  const progress = deriveProgress(total, cursor, nonSuccesses);

  if (!progress.complete) {
    return {
      reconciles: false,
      progress,
      ...(platformCount !== undefined ? { platformCount } : {}),
      message: `The run is not complete: ${progress.processed} of ${total} processed.`,
    };
  }

  const sum = progress.successful + progress.refused + progress.failed;
  if (sum !== total) {
    return {
      reconciles: false, progress,
      ...(platformCount !== undefined ? { platformCount } : {}),
      message: `The run does not reconcile: ${progress.successful} sent + ${progress.refused} refused `
        + `+ ${progress.failed} failed = ${sum}, but the frozen population held ${total}.`,
    };
  }

  if (platformCount !== undefined && platformCount !== progress.successful) {
    return {
      reconciles: false, progress, platformCount,
      message: `The run counted ${progress.successful} sent, but the platform holds ${platformCount} `
        + 'records for it.',
    };
  }

  return { reconciles: true, progress, ...(platformCount !== undefined ? { platformCount } : {}) };
}

// ── Planning a batch ─────────────────────────────────────────────────────────

export interface BatchPlan {
  /** The slice of the frozen population this batch covers. */
  recipientIds: readonly string[];
  fromIndex: number;
  /** The cursor value to persist **after** the batch — a position, never an increment. */
  nextCursor: number;
  lastBatch: boolean;
}

/**
 * Takes the next bounded slice of the frozen population.
 *
 * `nextCursor` is an absolute position rather than a delta. Persisting a position is idempotent:
 * writing it twice leaves the same value, so a retried checkpoint cannot advance the run past work
 * it has not done. Persisting a delta would.
 */
export function planBatch(
  population: readonly string[],
  cursor: number,
  batchSize: number,
): BatchPlan {
  const fromIndex = Math.min(Math.max(cursor, 0), population.length);
  const toIndex = Math.min(fromIndex + Math.max(batchSize, 1), population.length);
  return {
    recipientIds: population.slice(fromIndex, toIndex),
    fromIndex,
    nextCursor: toIndex,
    lastBatch: toIndex >= population.length,
  };
}

/** The native activity id for one recipient of a run — the whole duplicate-safety mechanism. */
export function nativeActivityIdFor(
  runId: string,
  recipientId: string,
  channel: CommunicationChannel,
): string {
  return communicationId({ runId, recipientId, channel });
}
