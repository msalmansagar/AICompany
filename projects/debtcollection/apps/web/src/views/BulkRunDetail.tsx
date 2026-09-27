import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deriveProgress, type RunProgress } from '@dcp/domain';
import { Card, EmptyState, InfoBanner, KpiRow, StatusPill, formatCount } from '../components/primitives.js';
import {
  loadRecipientLabels, toOutcomeRows, type RecipientOutcomeRow,
} from '../data/communicationRunQueries.js';
import {
  createBulkService, RecipientResolver, type BulkServiceOutcome,
} from '../services/bulkRunDriver.js';
import type { BatchOutcome, CommunicationRun } from '../services/bulkCommunicationService.js';
import { useCrmSession } from '../shell/context.js';

/**
 * One bulk run, as the officer who started it works with it.
 *
 * The screen owns no execution logic. Every guarantee below belongs to the engine that Phase 7
 * already proved against the organisation, and this view's whole job is to make those guarantees
 * operable — to show where a run got to, and to offer the two acts that move it on.
 *
 * **The browser does not iterate recipients.** It asks for the *next bounded batch* and the executor
 * does the work, ending each batch with a checkpoint written under the run's own row version. A
 * batch is the unit; a recipient is never a step this component takes.
 *
 * **Closing the browser loses momentum, not work.** The cursor, the population and the recorded
 * failures are all on the run. Reopening it reads them back, which is why Resume is a button rather
 * than a recovery procedure.
 */

/** How many outcome rows are shown at once. Bounded: a results list is not a report. */
const OUTCOME_PAGE = 25;

const TAKEN_OVER_HINT =
  'Someone else is working this run right now, so this screen stopped rather than racing them. '
  + 'Reopen it in a moment to see where it has reached.';

export function BulkRunDetailView({ runId, onBack }: { runId: string; onBack: () => void }) {
  const run = useBulkRun(runId);

  if (run.state === 'loading') {
    return <Card title="Bulk run"><EmptyState icon="send" message="Loading this run…" /></Card>;
  }
  if (run.state === 'unavailable') {
    return (
      <Card title="Bulk run" actions={<BackButton onBack={onBack} />}>
        <p className="field-error" data-testid="bulk-run-error">{run.message}</p>
      </Card>
    );
  }

  return (
    <div data-testid="bulk-run-detail">
      <InfoBanner>
        DCP records each message and <b>QDB&rsquo;s own mechanism sends it</b>. Nothing on this
        screen reports whether a message reached anyone — that service does.
      </InfoBanner>

      <Card
        title={run.run.name}
        subtitle={describeRun(run.run)}
        actions={<BackButton onBack={onBack} />}
      >
        <ProgressTiles progress={run.progress} status={run.run.status} />
        <RunControls run={run} />
        {run.message && <p className="hint" data-testid="bulk-run-message">{run.message}</p>}
      </Card>

      <OutcomesPanel runId={runId} run={run.run} />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="btn" data-testid="bulk-run-back" onClick={onBack}>
      All runs
    </button>
  );
}

/** The run in one sentence, with no identifier and no table name in it. */
function describeRun(run: CommunicationRun): string {
  const channel = run.channel === 'Email' ? 'Email' : 'SMS';
  const when = run.status === 'Draft' ? 'not started yet' : `${run.status.toLowerCase()}`;
  return `${channel} to ${formatCount(run.total)} recipients — ${when}.`;
}

function ProgressTiles({ progress, status }: { progress: RunProgress; status: string }) {
  return (
    <div data-testid="bulk-progress">
      <KpiRow items={[
        { label: 'Target', value: formatCount(progress.total) },
        { label: 'Processed', value: formatCount(progress.processed) },
        { label: 'Recorded', value: formatCount(progress.successful) },
        { label: 'Refused', value: formatCount(progress.refused) },
        {
          label: 'Needs retry',
          value: formatCount(progress.failed),
          ...(progress.failed > 0 ? { tone: 'warn' as const } : {}),
        },
      ]} />
      <p className="hint">
        Status <StatusPill status={status} /> — {formatCount(progress.remaining)} still to process.
        “Recorded” means the message and its recipient were created for QDB&rsquo;s service to send.
      </p>
    </div>
  );
}

// ── The two acts that move a run on, and the one that stops it ───────────────

function RunControls({ run }: { run: LoadedRun }) {
  const canStart = run.run.status !== 'Completed' && run.run.status !== 'Cancelled'
    && run.progress.remaining > 0;
  const canRetry = run.progress.failed > 0 && run.run.status !== 'Cancelled';
  const canCancel = run.run.status === 'Draft' || run.run.status === 'Running'
    || run.run.status === 'Paused';

  return (
    <div className="action-row" data-testid="bulk-run-controls">
      <button
        type="button" className="btn primary" data-testid="bulk-run-start"
        disabled={!canStart || run.busy} onClick={() => { void run.start(); }}
      >
        {run.busy ? 'Working…' : run.run.status === 'Draft' ? 'Start sending' : 'Resume'}
      </button>
      <button
        type="button" className="btn" data-testid="bulk-run-retry"
        disabled={!canRetry || run.busy} onClick={() => { void run.retry(); }}
      >
        Retry the ones that need it
      </button>
      <button
        type="button" className="btn" data-testid="bulk-run-cancel"
        disabled={!canCancel || run.busy} onClick={() => { void run.cancel(); }}
      >
        Stop this run
      </button>
      <button
        type="button" className="btn" data-testid="bulk-run-refresh"
        disabled={run.busy} onClick={() => { void run.reload(); }}
      >
        Refresh
      </button>
    </div>
  );
}

// ── What happened, per recipient ─────────────────────────────────────────────

/**
 * The refusals and retryable failures, by case number.
 *
 * Recipients are cases and a case id is a GUID, which an officer must never be shown. So the page
 * being displayed has its case numbers resolved — bounded by the page, never by the population.
 */
function OutcomesPanel({ runId, run }: { runId: string; run: CommunicationRun }) {
  const { adapter } = useCrmSession();
  const [rows, setRows] = useState<readonly RecipientOutcomeRow[]>([]);
  const [shown, setShown] = useState(OUTCOME_PAGE);
  const [failedToLoad, setFailedToLoad] = useState(false);

  const page = useMemo(() => run.nonSuccesses.slice(0, shown), [run.nonSuccesses, shown]);

  useEffect(() => {
    let live = true;
    void (async () => {
      if (page.length === 0) { setRows([]); return; }
      try {
        const labels = await loadRecipientLabels(adapter, page.map(entry => entry.recipientId));
        if (live) { setRows(toOutcomeRows(page, labels)); setFailedToLoad(false); }
      } catch {
        // A label that cannot be read must not hide the outcome it belongs to. The row still
        // appears, identified by position rather than by an id nobody should see.
        if (live) { setRows(toOutcomeRows(page, new Map())); setFailedToLoad(true); }
      }
    })();
    return () => { live = false; };
  }, [adapter, page, runId]);

  if (run.nonSuccesses.length === 0) {
    return (
      <Card title="Recipients needing attention">
        <EmptyState icon="check" message="Every recipient processed so far was either recorded or refused cleanly." />
      </Card>
    );
  }

  return (
    <Card
      title="Recipients needing attention"
      subtitle="Refused means the customer may not be contacted. Needs retry means nothing was sent and it can be tried again."
    >
      {failedToLoad && (
        <p className="hint" data-testid="bulk-labels-failed">
          Case numbers could not be read just now. The outcomes below are still accurate.
        </p>
      )}
      <table className="comms-table" data-testid="bulk-outcomes">
        <thead><tr><th>Case</th><th>Outcome</th><th>Why</th></tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.recipientId} data-testid="bulk-outcome-row" data-outcome={row.outcome}>
              <td>{row.caseNumber}</td>
              <td>{row.outcome === 'refused' ? 'Refused' : 'Needs retry'}</td>
              <td>{row.detail || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown < run.nonSuccesses.length && (
        <div className="action-row">
          <button
            type="button" className="btn" data-testid="bulk-outcomes-more"
            onClick={() => setShown(current => current + OUTCOME_PAGE)}
          >
            Show more
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Driving the run ──────────────────────────────────────────────────────────

interface LoadedRun {
  state: 'loaded';
  run: CommunicationRun;
  progress: RunProgress;
  busy: boolean;
  message: string | null;
  start: () => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => Promise<void>;
  reload: () => Promise<void>;
}

type BulkRunState =
  | { state: 'loading' }
  | { state: 'unavailable'; message: string }
  | LoadedRun;

const RUN_UNREADABLE = 'This run could not be read. Nothing was started or changed.';

/** How many batches one press of Start will drive before handing control back to the officer. */
const MAX_BATCHES_PER_PRESS = 40;

/**
 * Loads a run and drives it a bounded batch at a time.
 *
 * `MAX_BATCHES_PER_PRESS` exists so that one press cannot become an unbounded loop holding the
 * screen: the run stops, its state is durable, and Resume continues from the checkpoint. That is
 * the same property a browser close exercises, which is why it is not a special case.
 */
function useBulkRun(runId: string): BulkRunState {
  const { adapter } = useCrmSession();
  const [run, setRun] = useState<CommunicationRun | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const service = useRef<BulkServiceOutcome | null>(null);

  const bulkService = useCallback(async () => {
    service.current ??= await createBulkService(adapter);
    return service.current;
  }, [adapter]);

  const reload = useCallback(async () => {
    try {
      const built = await bulkService();
      if (built.status !== 'ready') { setFailure(built.message); return; }
      const loaded = await built.service.loadRun(runId);
      if (!loaded) { setFailure(RUN_UNREADABLE); return; }
      setRun(loaded);
      setFailure(null);
    } catch {
      // The platform's own words never reach an officer, and a read that rejects must leave this
      // screen saying something rather than nothing.
      setFailure(RUN_UNREADABLE);
    }
  }, [bulkService, runId]);

  useEffect(() => { void reload(); }, [reload]);

  /** Runs batches until the engine says to stop, reporting the reason it gave. */
  const drive = useCallback(async (
    pass: (resolver: RecipientResolver) => Promise<BatchOutcome>,
    once: boolean,
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_PRESS; batch += 1) {
        const outcome = await pass(new RecipientResolver(adapter));
        await reload();
        if (outcome.status === 'takenOver') { setMessage(TAKEN_OVER_HINT); return; }
        if (outcome.status === 'notRunnable') { setMessage(outcome.message); return; }
        if (outcome.status === 'complete' || once) return;
      }
      setMessage('This run has more recipients to process. Press Resume to continue.');
    } catch {
      setMessage('This run could not be continued just now. Nothing was duplicated — press Resume to try again.');
    } finally {
      setBusy(false);
    }
  }, [adapter, reload]);

  const start = useCallback(async () => {
    const built = await bulkService();
    if (built.status !== 'ready') { setFailure(built.message); return; }
    await drive(resolver => built.service.runBatch(
      runId, (id, loaded) => resolver.buildRequest(id, loaded), id => resolver.eligibility(id)), false);
  }, [bulkService, drive, runId]);

  const retry = useCallback(async () => {
    const built = await bulkService();
    if (built.status !== 'ready') { setFailure(built.message); return; }
    await drive(resolver => built.service.retryFailures(
      runId, (id, loaded) => resolver.buildRequest(id, loaded), id => resolver.eligibility(id)), true);
  }, [bulkService, drive, runId]);

  const cancel = useCallback(async () => {
    const built = await bulkService();
    if (built.status !== 'ready') { setFailure(built.message); return; }
    setBusy(true);
    const outcome = await built.service.cancelRun(runId);
    setMessage(outcome === 'cancelled'
      ? 'This run has been stopped. A batch already in progress finishes; no further batch starts.'
      : TAKEN_OVER_HINT);
    await reload();
    setBusy(false);
  }, [bulkService, reload, runId]);

  if (failure) return { state: 'unavailable', message: failure };
  if (!run) return { state: 'loading' };

  return {
    state: 'loaded',
    run,
    progress: deriveProgress(run.total, run.cursor, run.nonSuccesses),
    busy,
    message,
    start,
    retry,
    cancel,
    reload,
  };
}
