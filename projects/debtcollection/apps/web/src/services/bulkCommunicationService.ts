import {
  deriveProgress, freezePopulation, isConcurrencyConflict, nativeActivityIdFor, parseNonSuccesses,
  planBatch, reconcile, serialiseNonSuccesses, thawPopulation, validateManifestCapacity,
  type CommunicationChannel, type CommunicationRequest, type EligibilityContext,
  type RecipientResult, type RecordedNonSuccess, type RowVersion, type RunProgress,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, COMMUNICATION_RUN_COLUMNS } from '../data/schema.js';
import { CommunicationService, RECIPIENT_PARTY_MASK } from './communicationService.js';
import { describeFailure } from '../platform/errors.js';

/**
 * Executing a bulk communication durably.
 *
 * The shape the authorisation asks for, in one loop:
 *
 * ```
 * frozen population → bounded batch → current eligibility → deterministic id
 *                   → idempotent create → progress → checkpoint → resume/complete
 * ```
 *
 * Three properties carry it, and none of them is a procedure the executor has to remember:
 *
 * **Duplicate safety is in the id.** Every recipient's native record is created at
 * `uuidv5(runId | recipientId | channel)` with `If-None-Match: *`. The dangerous window — a record
 * created, then the process dies before the checkpoint is persisted — resolves on resume to the
 * platform refusing the create and the executor recording `alreadySent`. Not a new record, not an
 * overwrite, not a failure, and not a second success.
 *
 * **Counters are derived, never incremented**, so re-processing cannot inflate them.
 *
 * **Two workers cannot both advance one run.** The checkpoint is written with the run's row version
 * through `updateVersioned`, so the second writer is refused by the platform (ADR-DCP-18) rather
 * than by an in-memory lock that does not exist across browser tabs or machines.
 *
 * React drives this a batch at a time and may stop at any moment. It never holds the population, and
 * closing the browser loses nothing but momentum.
 */

/** The run as the executor works with it. */
export interface CommunicationRun {
  id: string;
  version: RowVersion;
  channel: CommunicationChannel;
  status: RunStatus;
  name: string;
  body: string;
  subject: string;
  total: number;
  cursor: number;
  population: readonly string[];
  nonSuccesses: readonly RecordedNonSuccess[];
}

export type RunStatus = 'Draft' | 'Running' | 'Paused' | 'Completed' | 'Cancelled' | 'Failed';

/** Option values as provisioned. Explicit so the same number means the same thing on both platforms. */
const STATUS_CODES: Readonly<Record<RunStatus, number>> = {
  Draft: 100000710, Running: 100000711, Paused: 100000712,
  Completed: 100000713, Cancelled: 100000714, Failed: 100000715,
};
const CHANNEL_CODES: Readonly<Record<'SMS' | 'Email', number>> = { SMS: 100000700, Email: 100000701 };
const SELECTION_CODES = { SelectedRecords: 100000720, FilterDefinition: 100000721 } as const;

const statusFromCode = (code: number): RunStatus =>
  (Object.keys(STATUS_CODES) as RunStatus[]).find(s => STATUS_CODES[s] === code) ?? 'Draft';

/** How many recipients one batch attempts. Bounded so a batch is always short and interruptible. */
export const DEFAULT_BATCH_SIZE = 25;

export type BatchOutcome =
  | { status: 'progressed'; progress: RunProgress; results: readonly RecipientResult[] }
  | { status: 'complete'; progress: RunProgress }
  | { status: 'takenOver'; message: string }
  | { status: 'notRunnable'; message: string };

export interface CreateRunRequest {
  name: string;
  channel: 'SMS' | 'Email';
  selectionMode: 'SelectedRecords' | 'FilterDefinition';
  /** Kept for audit only — never used to reconstruct the population. */
  filterDefinition?: string;
  body: string;
  subject?: string;
  templateId?: string;
  recipientIds: readonly string[];
}

export type CreateRunOutcome =
  | { status: 'created'; runId: string; total: number }
  | { status: 'refused'; message: string };

export class BulkCommunicationService {
  constructor(
    private readonly adapter: XrmCrmAdapter,
    private readonly communications: CommunicationService,
    /**
     * The real `qdb_frozenpopulation` capacity, read from platform metadata by the caller.
     *
     * Passed in rather than hard-coded: the refusal must be sized against the column that actually
     * exists, not against what was requested when it was provisioned.
     */
    private readonly frozenPopulationCapacity: number,
  ) {}

  /**
   * Freezes a population and creates the run.
   *
   * The filter is resolved by the caller, server-side and page by page; what arrives here is the
   * resolved list, which is written down **once**. Everything afterwards reads the frozen list, and
   * nothing re-runs the filter — that is what stops a resume becoming a different campaign.
   */
  async createRun(request: CreateRunRequest): Promise<CreateRunOutcome> {
    const { manifest, total } = freezePopulation(request.recipientIds);

    if (total === 0) {
      return { status: 'refused', message: 'No eligible recipients were selected.' };
    }

    // Against the string that will actually be persisted, and the real column capacity. A run that
    // does not fit is refused here — never truncated, never split, never downgraded to re-running
    // the filter, because each of those sends to a population nobody confirmed.
    const capacity = validateManifestCapacity(manifest, this.frozenPopulationCapacity);
    if (!capacity.fits) {
      return { status: 'refused', message: capacity.message ?? 'This selection is too large for one run.' };
    }

    const runId = crypto.randomUUID();
    await this.adapter.createIdempotent(ENTITY_SETS.communicationRun, runId, {
      qdb_name: request.name,
      qdb_channel: CHANNEL_CODES[request.channel],
      qdb_status: STATUS_CODES.Draft,
      qdb_selectionmode: SELECTION_CODES[request.selectionMode],
      qdb_messagebody: request.body,
      ...(request.subject ? { qdb_subject: request.subject } : {}),
      ...(request.filterDefinition ? { qdb_filterdefinition: request.filterDefinition } : {}),
      qdb_frozenpopulation: manifest,
      qdb_totalrecipients: total,
      qdb_cursor: 0,
    });

    return { status: 'created', runId, total };
  }

  /** Reads a run and its row version. The version is what makes the checkpoint safe. */
  async loadRun(runId: string): Promise<CommunicationRun | null> {
    const record = await this.adapter.retrieveVersioned(
      { entity: ENTITY_SETS.communicationRun, id: runId }, [...COMMUNICATION_RUN_COLUMNS]);
    if (!record) return null;

    const row = record.record;
    const channelCode = Number(row['qdb_channel']);
    return {
      id: runId,
      version: record.version,
      channel: channelCode === CHANNEL_CODES.Email ? 'Email' : 'SMS',
      status: statusFromCode(Number(row['qdb_status'])),
      name: String(row['qdb_name'] ?? ''),
      body: String(row['qdb_messagebody'] ?? ''),
      subject: String(row['qdb_subject'] ?? ''),
      total: Number(row['qdb_totalrecipients'] ?? 0),
      cursor: Number(row['qdb_cursor'] ?? 0),
      population: thawPopulation(String(row['qdb_frozenpopulation'] ?? '')),
      nonSuccesses: parseNonSuccesses(String(row['qdb_failedrecipients'] ?? '')),
    };
  }

  /**
   * Runs one bounded batch and persists the checkpoint.
   *
   * Returns `takenOver` when the checkpoint is refused, which means another worker or tab advanced
   * the same run first. That is a normal outcome, not an error: the run is progressing, just not
   * here, and this caller stops rather than racing.
   */
  async runBatch(
    runId: string,
    buildRequest: (recipientId: string, run: CommunicationRun) => Promise<CommunicationRequest | null>,
    eligibility: (recipientId: string) => Promise<EligibilityContext>,
    batchSize: number = DEFAULT_BATCH_SIZE,
  ): Promise<BatchOutcome> {
    const run = await this.loadRun(runId);
    if (!run) return { status: 'notRunnable', message: 'This run could no longer be read.' };
    if (run.status === 'Cancelled' || run.status === 'Completed') {
      return { status: 'notRunnable', message: `This run is ${run.status.toLowerCase()}.` };
    }

    const plan = planBatch(run.population, run.cursor, batchSize);
    if (plan.recipientIds.length === 0) {
      return { status: 'complete', progress: deriveProgress(run.total, run.total, run.nonSuccesses) };
    }

    /**
     * Claim the run **before creating anything**.
     *
     * Without this, two workers that read the same version would each go on to create records and
     * only collide at the checkpoint — so both would have "independently processed" the run, which
     * is precisely what must not happen. Writing the status with `If-Match` first turns the row
     * version into a mutual-exclusion point: exactly one worker proceeds, and the loser stops
     * having created nothing at all.
     *
     * It is also what makes the derived counters trustworthy. `successful` is derived from
     * `processed`, and `processed` is the persisted cursor — so the cursor's source state has to be
     * concurrency-safe or the derivation inherits the race.
     */
    const claim = await this.claim(run);
    if (!claim.claimed) return { status: 'takenOver', message: TAKEN_OVER };

    const results: RecipientResult[] = [];
    const newNonSuccesses: RecordedNonSuccess[] = [];

    for (const recipientId of plan.recipientIds) {
      const result = await this.attemptOne(recipientId, run, buildRequest, eligibility);
      results.push(result);
      if (result.outcome === 'refused' || result.outcome === 'failed') {
        newNonSuccesses.push({
          recipientId, outcome: result.outcome, detail: result.detail ?? '',
        });
      }
    }

    // Non-successes are merged by recipient, not appended: a resume that re-attempts a recipient
    // must replace its previous entry rather than record it twice, or the derived success count
    // would fall by one for work that was actually done.
    const merged = mergeNonSuccesses(run.nonSuccesses, newNonSuccesses, plan.recipientIds);

    try {
      await this.adapter.updateVersioned(
        { entity: ENTITY_SETS.communicationRun, id: runId },
        {
          qdb_cursor: plan.nextCursor,
          qdb_failedrecipients: serialiseNonSuccesses(merged),
          ...terminalState(plan.lastBatch, merged),
        },
        // The version the claim returned, not the one first read. Anything else would mean writing
        // over the claim this worker itself made.
        claim.version,
      );
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      // Another worker advanced this run. The records this batch created are still correct and
      // still unique — the deterministic id guarantees that — so nothing is undone. This caller
      // simply stops.
      return { status: 'takenOver', message: TAKEN_OVER };
    }

    const progress = deriveProgress(run.total, plan.nextCursor, merged);
    const settled = plan.lastBatch && !merged.some(entry => entry.outcome === 'failed');
    return settled ? { status: 'complete', progress } : { status: 'progressed', progress, results };
  }

  /**
   * One recipient: check eligibility **now**, then create at the deterministic id.
   *
   * Eligibility is re-evaluated at send time rather than trusted from confirmation, because the
   * population was frozen and the world was not. A customer who has since been marked "do not fax"
   * is refused here even though they were in scope when the officer confirmed.
   */
  private async attemptOne(
    recipientId: string,
    run: CommunicationRun,
    buildRequest: (recipientId: string, run: CommunicationRun) => Promise<CommunicationRequest | null>,
    eligibility: (recipientId: string) => Promise<EligibilityContext>,
  ): Promise<RecipientResult> {
    try {
      const request = await buildRequest(recipientId, run);
      if (!request) {
        return { recipientId, outcome: 'refused', detail: 'The customer could not be resolved.' };
      }

      const context = await eligibility(recipientId);
      const activityId = nativeActivityIdFor(run.id, recipientId, run.channel);
      const sent = await this.communications.send(activityId, request, context);

      if (sent.status === 'refused') {
        return { recipientId, outcome: 'refused', detail: sent.refusals.map(r => r.message).join('; ') };
      }
      if (sent.status === 'incomplete') {
        // The row exists but its recipient does not, so it is not a communication. Retryable, never
        // counted as sent — a message nobody can receive must not be reported as delivered work.
        return { recipientId, outcome: 'failed', detail: `incomplete communication: ${sent.reason}` };
      }
      // `created: false` alone would not be enough to call this sent — the structure was checked.
      // `repaired` means a previous attempt died half-made and this one finished it: a success once.
      if (sent.repaired) return { recipientId, outcome: 'repaired' };
      return { recipientId, outcome: sent.created ? 'sent' : 'alreadySent' };
    } catch (error) {
      // Retryable: the platform or the network failed, and this recipient may succeed later.
      return {
        recipientId, outcome: 'failed',
        detail: describeFailure(error),
      };
    }
  }

  /**
   * Re-attempts the recipients this run recorded as retryable failures.
   *
   * Needed because `failed` is only an honest label if something can act on it. The commonest
   * retryable failure is now the half-made communication — the activity row created, its recipient
   * party refused — and leaving those unretried would quietly mean a customer never contacted.
   *
   * It is the same send path with the same deterministic ids, which is what makes it safe: a repair
   * completes the existing activity, and **never creates a second one**. Refusals are not touched;
   * the eligibility gate said no, and asking it again would be asking it to change its mind.
   *
   * The cursor does not move — it is already at the end of the population. Progress improves
   * because the counters are derived: one fewer recorded failure is one more success, with nothing
   * incremented anywhere.
   */
  async retryFailures(
    runId: string,
    buildRequest: (recipientId: string, run: CommunicationRun) => Promise<CommunicationRequest | null>,
    eligibility: (recipientId: string) => Promise<EligibilityContext>,
    batchSize: number = DEFAULT_BATCH_SIZE,
  ): Promise<BatchOutcome> {
    const run = await this.loadRun(runId);
    if (!run) return { status: 'notRunnable', message: 'This run could no longer be read.' };
    if (run.status === 'Cancelled') return { status: 'notRunnable', message: 'This run is cancelled.' };

    const retryable = run.nonSuccesses.filter(entry => entry.outcome === 'failed').slice(0, batchSize);
    if (retryable.length === 0) {
      return { status: 'complete', progress: deriveProgress(run.total, run.cursor, run.nonSuccesses) };
    }

    const claim = await this.claim(run);
    if (!claim.claimed) return { status: 'takenOver', message: TAKEN_OVER };

    const attempted = retryable.map(entry => entry.recipientId);
    const results: RecipientResult[] = [];
    const stillFailing: RecordedNonSuccess[] = [];

    for (const recipientId of attempted) {
      const result = await this.attemptOne(recipientId, run, buildRequest, eligibility);
      results.push(result);
      if (result.outcome === 'refused' || result.outcome === 'failed') {
        stillFailing.push({ recipientId, outcome: result.outcome, detail: result.detail ?? '' });
      }
    }

    const merged = mergeNonSuccesses(run.nonSuccesses, stillFailing, attempted);
    try {
      await this.adapter.updateVersioned(
        { entity: ENTITY_SETS.communicationRun, id: runId },
        { qdb_failedrecipients: serialiseNonSuccesses(merged), ...terminalState(true, merged) },
        claim.version,
      );
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      return { status: 'takenOver', message: TAKEN_OVER };
    }

    const progress = deriveProgress(run.total, run.cursor, merged);
    return merged.some(entry => entry.outcome === 'failed')
      ? { status: 'progressed', progress, results }
      : { status: 'complete', progress };
  }

  /**
   * Takes the run's row version as a mutual-exclusion point, before any work is done.
   *
   * Shared by the forward pass and the retry pass so both are excluded by the same mechanism —
   * a retry that skipped the claim could repair the same recipients a forward batch was working on.
   */
  private async claim(run: CommunicationRun): Promise<{ claimed: true; version: RowVersion } | { claimed: false }> {
    try {
      const version = await this.adapter.updateVersioned(
        { entity: ENTITY_SETS.communicationRun, id: run.id },
        {
          qdb_status: STATUS_CODES.Running,
          ...(run.status === 'Draft' ? { qdb_startedon: new Date().toISOString() } : {}),
        },
        run.version,
      );
      return { claimed: true, version };
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      return { claimed: false };
    }
  }

  /**
   * The completion check, against the platform rather than against the executor's own tally.
   *
   * `platformCount` is how many native records actually exist for the run. The executor's view of
   * what it sent is not evidence; this is the same discipline as reading a record back after
   * writing it.
   */
  async reconcileRun(runId: string): Promise<ReturnType<typeof reconcile> | null> {
    const run = await this.loadRun(runId);
    if (!run) return null;

    const expectedIds = run.population.map(r => nativeActivityIdFor(run.id, r, run.channel));
    const platformCount = await this.countComplete(expectedIds);

    return reconcile(run.total, run.cursor, run.nonSuccesses, platformCount);
  }

  /**
   * Counts how many of the run's communications are **complete**, in bounded chunks.
   *
   * Deliberately not a count of activity rows. A Fax or Email can exist with no recipient party —
   * the live platform produced exactly that when the party POST failed (KI-85) — and such a row is
   * not a communication. Counting rows would have reported six sent messages that nobody could
   * receive.
   *
   * So the count is over `activityparty`: a recipient party for one of the run's activities is the
   * evidence that the structure was completed. Chunked because an `IN`-style filter over thousands
   * of ids is a URL no platform will accept.
   */
  private async countComplete(ids: readonly string[]): Promise<number> {
    const CHUNK = 20;
    const complete = new Set<string>();
    for (let index = 0; index < ids.length; index += CHUNK) {
      const chunk = ids.slice(index, index + CHUNK);
      const filter = `(${chunk.map(id => `_activityid_value eq ${id}`).join(' or ')})`
        + ` and participationtypemask eq ${RECIPIENT_PARTY_MASK}`;
      const page = await this.adapter.retrievePage(ENTITY_SETS.activityParty, {
        select: ['activitypartyid', '_activityid_value'], pageSize: CHUNK * 2, filter,
      });
      for (const row of page.items) {
        const activityId = String(row['_activityid_value'] ?? '').toLowerCase();
        if (activityId) complete.add(activityId);
      }
    }
    return complete.size;
  }

  /** Marks a run cancelled. In-flight batches finish; no further batch starts. */
  async cancelRun(runId: string): Promise<'cancelled' | 'takenOver' | 'notFound'> {
    const run = await this.loadRun(runId);
    if (!run) return 'notFound';
    try {
      await this.adapter.updateVersioned(
        { entity: ENTITY_SETS.communicationRun, id: runId },
        { qdb_status: STATUS_CODES.Cancelled, qdb_completedon: new Date().toISOString() },
        run.version,
      );
      return 'cancelled';
    } catch (error) {
      if (!isConcurrencyConflict(error)) throw error;
      return 'takenOver';
    }
  }
}

const TAKEN_OVER =
  'This run is already being processed somewhere else, so it was left to continue there.';

/**
 * The status to persist, and the rule that a run holding retryable work is **not** completed.
 *
 * Reaching the end of the population is not the same as finishing the campaign. A recipient whose
 * activity row exists without its recipient party is recorded as a retryable failure, and marking
 * the run Completed over it would close the only door through which it could be repaired — leaving
 * a customer uncontacted behind a green "done".
 *
 * Refusals do not hold a run open: the eligibility gate is terminal and asking it again changes
 * nothing. So the run completes when every recipient is either a complete communication or a
 * refusal, and otherwise waits, Paused, for `retryFailures`.
 */
function terminalState(
  lastPass: boolean,
  nonSuccesses: readonly RecordedNonSuccess[],
): Record<string, unknown> {
  if (!lastPass) return { qdb_status: STATUS_CODES.Running };
  if (nonSuccesses.some(entry => entry.outcome === 'failed')) {
    return { qdb_status: STATUS_CODES.Paused };
  }
  return { qdb_status: STATUS_CODES.Completed, qdb_completedon: new Date().toISOString() };
}

/**
 * Merges this batch's non-successes into the recorded set.
 *
 * Every recipient this batch touched has its previous entry dropped first, so a recipient that
 * failed and then succeeded on resume stops being counted as a failure. Appending instead would
 * leave stale entries that permanently depress the derived success count.
 */
function mergeNonSuccesses(
  existing: readonly RecordedNonSuccess[],
  fresh: readonly RecordedNonSuccess[],
  attempted: readonly string[],
): readonly RecordedNonSuccess[] {
  const attemptedKeys = new Set(attempted.map(id => id.toLowerCase()));
  const kept = existing.filter(entry => !attemptedKeys.has(entry.recipientId.toLowerCase()));
  return [...kept, ...fresh];
}
