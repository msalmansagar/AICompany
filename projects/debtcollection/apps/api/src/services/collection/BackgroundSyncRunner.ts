import {
  MisUnavailableError,
  SynchronizationError,
  advanceCheckpoint,
  assertResumable,
  buildLogSource,
  describeSyncMode,
  requireSupportedMode,
  startCheckpoint,
  type ArrearDetailQuery,
  type ContinuationToken,
  type ICheckpointStore,
  type ICollectionLogger,
  type IMisDelinquencyService,
  type MisDelinquencyRecord,
  type ProcessingCheckpoint,
  type SyncMode,
} from '@dcp/domain';
import type { DelinquencySyncService, RecordAction, RecordOutcome } from './DelinquencySyncService.js';
import type { CaseStrategyOrchestrator } from './CaseStrategyOrchestrator.js';

const SOURCE = buildLogSource('BackgroundSync');

export interface BackgroundSyncOptions {
  organizationCode: string;
  runId: string;
  mode: SyncMode;
  /** Rows per page. Bounded by the source; never unbounded, because an unbounded read is the whole book. */
  pageSize: number;
  /** Narrowing applied **at the source**, never after the rows arrive. */
  query?: Omit<ArrearDetailQuery, 'pageSize' | 'continuation'>;
  /** Stop after this many pages. A safety rail for an unexpected continuation loop, not a business limit. */
  maxPages?: number;
  /** Retries for one page before the run stops. The page is retried; processed pages are not. */
  pageRetries?: number;
}

export interface SyncRunReport {
  runId: string;
  organizationCode: string;
  checkpoint: ProcessingCheckpoint;
  /** What this run's progress does and does not guarantee, in words. */
  guarantee: string;
  counts: Partial<Record<RecordAction, number>>;
  pagesRead: number;
  recordsProcessed: number;
  recordsFailed: number;
  /** Isolated per-record failures, so a run's problems are enumerable without trawling logs. */
  failures: readonly { facilityNumber: string; detail: string }[];
  /** Cases that got a treatment, and cases that did not with the reason why. */
  strategy: {
    assigned: number;
    unresolved: readonly { facilityNumber: string; reason: string }[];
  };
  /** Set when the run stopped early. The checkpoint is still valid and resumable. */
  stoppedBecause?: string;
}

/**
 * Drives synchronisation one page at a time, and never holds the population in memory.
 *
 * The loop is deliberately boring:
 *
 * ```
 *   page → normalize (the provider's boundary) → process each record → persist → checkpoint → next
 * ```
 *
 * Three properties matter more than anything clever:
 *
 *   • **Bounded memory.** Only the current page exists at once. A page's outcomes are summarised into
 *     counts and discarded; only isolated failures are retained, because those are what someone has
 *     to act on.
 *   • **The checkpoint follows the work.** It advances *after* a page's outcomes are persisted, never
 *     before. Advancing first would silently skip delinquency events that nobody looks at again.
 *   • **A bad record is not a bad run.** `DelinquencySyncService` already returns a `Failed` outcome
 *     rather than throwing, and anything it does throw is caught per record. One malformed row cannot
 *     end the processing of thousands of valid ones.
 *
 * What this class does **not** do is decide anything. Eligibility, strategy, episode rules and
 * snapshot policy all live where they already lived; this is transport and bookkeeping.
 */
export class BackgroundSyncRunner {
  constructor(
    private readonly mis: IMisDelinquencyService,
    private readonly pipeline: DelinquencySyncService,
    private readonly checkpoints: ICheckpointStore,
    private readonly logger: ICollectionLogger,
    private readonly now: () => string = () => new Date().toISOString(),
    /**
     * Optional. When supplied, a case-bearing outcome is followed by a strategy decision through the
     * Phase 3 Rule Engine facade. Absent, synchronisation still runs — a deployment with no strategy
     * ruleset yet is a real and supported state, not a broken one.
     */
    private readonly strategyOrchestrator?: CaseStrategyOrchestrator,
  ) {}

  /**
   * Runs, or resumes, one synchronisation.
   *
   * Resuming reads the stored checkpoint and continues from its continuation. Completed work is not
   * reprocessed: the source's continuation already points past it.
   */
  async run(options: BackgroundSyncOptions): Promise<SyncRunReport> {
    const { organizationCode, runId, mode, pageSize } = options;
    requireSupportedMode(mode, await this.sourceSupportsChangeFeed());

    let checkpoint = await this.resumeOrStart(options);
    const counts: Partial<Record<RecordAction, number>> = {};
    const failures: { facilityNumber: string; detail: string }[] = [];
    const strategyUnresolved: { facilityNumber: string; reason: string }[] = [];
    let strategyAssigned = 0;
    const seenFacilities = new Set<string>();
    const maxPages = options.maxPages ?? 10_000;
    let pagesRead = 0;
    let stoppedBecause: string | undefined;

    await this.logRunEvent('runStarted', checkpoint, 'Info', true);

    while (!checkpoint.completed && pagesRead < maxPages) {
      let page;
      try {
        page = await this.readPageWithRetry(options, checkpoint, options.pageRetries ?? 1);
      } catch (error) {
        // The page could not be read. The checkpoint still points at the last PERSISTED page, so the
        // run resumes from there rather than from the beginning or, worse, from beyond the gap.
        stoppedBecause = error instanceof Error ? error.message : String(error);
        await this.logRunEvent('pageReadFailed', checkpoint, 'Error', false, stoppedBecause);
        break;
      }
      pagesRead++;

      // Process the page. Every outcome is persisted by the pipeline before the checkpoint moves.
      let processed = 0;
      let failed = 0;
      for (const record of page.records) {
        const key = `${record.sourceSystem}:${record.facilityNumber}`;
        if (seenFacilities.has(key)) {
          // A source that repeats a row across pages must not produce a second episode. The pipeline
          // is idempotent anyway, but counting it here makes the source's behaviour visible.
          counts.Ignored = (counts.Ignored ?? 0) + 1;
          processed++;
          continue;
        }
        seenFacilities.add(key);

        const outcome = await this.processOne(record);
        counts[outcome.action] = (counts[outcome.action] ?? 0) + 1;
        processed++;
        if (outcome.action === 'Failed') {
          failed++;
          failures.push({ facilityNumber: record.facilityNumber, detail: outcome.detail ?? 'unspecified failure' });
        }

        // Eligibility decided whether a case exists; strategy decides how it is treated. A strategy
        // that cannot be resolved leaves the case untreated with a stated reason — it never undoes a
        // case that MIS says is delinquent.
        if (this.strategyOrchestrator && outcome.action !== 'Failed') {
          const assignment = await this.strategyOrchestrator.apply(outcome, record,
            record.correlationId ? { correlationId: record.correlationId } : {});
          if (assignment.applied) strategyAssigned++;
          else if (outcome.caseId) {
            strategyUnresolved.push({ facilityNumber: record.facilityNumber, reason: assignment.reason ?? 'unstated' });
          }
        }
      }

      checkpoint = advanceCheckpoint(checkpoint, {
        recordsProcessed: processed,
        recordsFailed: failed,
        ...(page.continuation !== undefined ? { sourceContinuation: page.continuation } : {}),
      }, this.now());
      await this.checkpoints.write(checkpoint);
    }

    if (!checkpoint.completed && pagesRead >= maxPages && stoppedBecause === undefined) {
      stoppedBecause = `Stopped at the ${maxPages}-page safety rail without the source reporting an end. ` +
        'This is a continuation-loop guard, not a business limit; the checkpoint is valid and resumable.';
      await this.logRunEvent('pageLimitReached', checkpoint, 'Warn', false, stoppedBecause);
    }

    await this.logRunEvent('runFinished', checkpoint, failures.length > 0 ? 'Warn' : 'Info', true);

    return {
      runId, organizationCode, checkpoint,
      guarantee: describeSyncMode(checkpoint),
      counts, pagesRead,
      recordsProcessed: checkpoint.recordsProcessed,
      recordsFailed: checkpoint.recordsFailed,
      failures,
      strategy: { assigned: strategyAssigned, unresolved: strategyUnresolved },
      ...(stoppedBecause !== undefined ? { stoppedBecause } : {}),
    };
  }

  /** One record, with its failure contained. */
  private async processOne(record: MisDelinquencyRecord): Promise<RecordOutcome> {
    try {
      return await this.pipeline.processRecord(record);
    } catch (error) {
      // The pipeline already isolates most failures into a `Failed` outcome. This catches the rest —
      // a repository throwing, the Rule Engine refusing — so one record cannot end the run.
      const detail = error instanceof Error ? error.message : String(error);
      await this.logger.log({
        source: SOURCE, operation: 'processRecord', operationKind: 'MisBackgroundSync',
        severity: 'Error', succeeded: false, errorCode: 'record_isolated',
        errorMessage: `Facility ${record.facilityNumber}: ${detail}`,
        ...(record.correlationId ? { correlationId: record.correlationId } : {}),
      });
      return { facilityNumber: record.facilityNumber, sourceSystem: record.sourceSystem, action: 'Failed', detail };
    }
  }

  /** Reads one page, retrying a transient source failure without reprocessing anything. */
  private async readPageWithRetry(
    options: BackgroundSyncOptions,
    checkpoint: ProcessingCheckpoint,
    retries: number,
  ): Promise<{ records: readonly MisDelinquencyRecord[]; continuation?: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.mis.getArrearDetails({
          ...options.query,
          pageSize: options.pageSize,
          ...(checkpoint.sourceContinuation !== undefined
            ? { continuation: checkpoint.sourceContinuation as ContinuationToken }
            : {}),
        }, { integrationBatchId: options.runId });
        return {
          records: response.data.items,
          ...(response.data.continuation !== undefined ? { continuation: response.data.continuation } : {}),
        };
      } catch (error) {
        lastError = error;
        // Only an availability failure is worth retrying. A refused continuation or a contract
        // failure will fail identically on every attempt.
        if (!(error instanceof MisUnavailableError)) break;
        if (error.kind === 'NotConfigured' || error.kind === 'Unauthorised') break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async resumeOrStart(options: BackgroundSyncOptions): Promise<ProcessingCheckpoint> {
    const existing = await this.checkpoints.read(options.organizationCode, options.runId);
    if (!existing) return startCheckpoint(options.runId, options.organizationCode, options.mode, this.now());
    assertResumable(existing, options.runId, options.organizationCode);
    return existing;
  }

  /** Whether the source can report changes at all — asked, never assumed. */
  private async sourceSupportsChangeFeed(): Promise<boolean> {
    try {
      await this.mis.getArrearChanges(undefined, 1);
      return true;
    } catch (error) {
      if (error instanceof MisUnavailableError || error instanceof SynchronizationError) return false;
      return false;
    }
  }

  private async logRunEvent(
    operation: string,
    checkpoint: ProcessingCheckpoint,
    severity: 'Info' | 'Warn' | 'Error',
    succeeded: boolean,
    detail?: string,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE,
      operation,
      operationKind: 'MisBackgroundSync',
      severity,
      succeeded,
      batchId: checkpoint.runId,
      recordsRead: checkpoint.recordsProcessed,
      ...(detail !== undefined ? { errorMessage: detail } : {}),
      ...(severity === 'Error' ? { errorCode: 'sync_page_failed' } : {}),
    });
  }
}
