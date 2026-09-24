import { useEffect, useMemo, useState } from 'react';
import type { ActionPlanItem } from '@dcp/domain';
import { createActivityQuery, createPtpQuery, type ActivityRow, type CaseDetail, type PtpRow } from '../../../data/caseQueries.js';
import { loadActionPlan } from '../../../data/followUpQueries.js';
import { toPlanItem, type CaseContext } from '../../../data/actionPlanRows.js';
import { OrgBadge, StatusPill, formatCount, formatDate, formatMoney } from '../../../components/primitives.js';
import { StoredPositionNotice } from '../../../components/Freshness.js';
import { useCrmSession } from '../../../shell/context.js';
import { formatRecordedAt } from '../../format.js';
import { BucketBadge, CommandBar, CommandButton, EmptyState, ErrorState, KeyValueList, LoadingSkeleton } from '../../components/primitives.js';
import { initialsOf } from '../case/CaseHeader.js';
import { useCaseRecord } from '../case/useCaseRecord.js';
import { StrategyName } from './casesColumns.js';

/**
 * The Split view's right-hand panel: one case, fast.
 *
 * Answers who, which facility, how late, how much, what state, who owns it and — only where the
 * platform holds one — what comes next. It is read on demand from the organisation, never from the
 * list's row, so what it says is what the server holds; after a save it re-reads. It is not the Case
 * Workspace: *Open full record* is.
 */
export function CasePreview({ caseId, reloadKey, onOpen, onLogAction, onCapturePromise, onMessage }: {
  caseId: string | undefined;
  reloadKey: number;
  onOpen: () => void;
  onLogAction: () => void;
  onCapturePromise: () => void;
  onMessage: () => void;
}) {
  const record = useCaseRecord(caseId, reloadKey);
  if (!caseId) {
    return <div className="v2-case-preview" data-testid="v2-case-preview-empty"><EmptyState title="Choose a case to preview it." message="Open full record takes you to its workspace." /></div>;
  }
  if (record.status === 'loading') return <div className="v2-case-preview"><LoadingSkeleton rows={6} label="Loading the case" testId="v2-case-preview-loading" /></div>;
  if (record.status === 'error') return <div className="v2-case-preview"><ErrorState title="This case could not be read." testId="v2-case-preview-error" /></div>;
  if (record.status === 'missing') return <div className="v2-case-preview"><EmptyState title="This case can no longer be read in this session." testId="v2-case-preview-missing" /></div>;

  const { detail, customer } = record;
  const name = customer?.displayName ?? detail.customerName ?? detail.customerBusinessId;
  return (
    <div className="v2-case-preview" data-testid="v2-case-preview" data-case-id={detail.id}>
      <div className="v2-preview-head">
        <span className="v2-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="v2-preview-names">
          <h2 className="v2-preview-name" data-testid="v2-preview-customer">
            {name} <BucketBadge bucket={detail.bucket} /> <StatusPill status={detail.status} /> <OrgBadge org={detail.organization} />
          </h2>
          <p className="v2-preview-sub" data-testid="v2-preview-sub">
            {detail.caseNumber} · facility {detail.facilityNumber}{detail.productDescription ? ` · ${detail.productDescription}` : ''}
          </p>
        </div>
        <button type="button" className="v2-btn v2-btn-primary" onClick={onOpen} data-testid="v2-preview-open">Open full record</button>
      </div>

      <dl className="v2-stats v2-preview-stats" data-testid="v2-preview-stats">
        <Stat label="Current arrears" value={formatMoney(detail.totalArrears)} isStrong />
        <Stat label="DPD" value={formatCount(detail.dpd)} />
        <Stat label="Loan balance" value={formatMoney(detail.loanBalance)} />
        <Stat label="Strategy" value={<StrategyName name={detail.strategyName} />} />
      </dl>

      <KeyValueList testId="v2-preview-details" items={[
        { label: 'Customer type', value: detail.customerType ?? '—' },
        { label: 'Status', value: detail.status },
        { label: 'Owner', value: detail.ownerName ?? '—' },
        { label: 'Source system', value: detail.sourceSystem },
        { label: 'Episode', value: formatCount(detail.episodeNumber) },
        { label: 'Opened', value: detail.openDate ? formatDate(detail.openDate) : '—' },
      ]} />

      <NextAction detail={detail} reloadKey={reloadKey} />
      <RecentFacts detail={detail} reloadKey={reloadKey} />
      <StoredPositionNotice asOf={detail.misAsOfDate} syncedOn={detail.lastMisSyncOn} />

      <CommandBar label="Case commands">
        <CommandButton label="Log action" isPrimary onClick={onLogAction} testId="v2-preview-log-action" {...closedReason(detail)} />
        <CommandButton label="Capture PTP" onClick={onCapturePromise} testId="v2-preview-capture-ptp" {...closedReason(detail)} />
        <CommandButton label="Send message" onClick={onMessage} testId="v2-preview-message" />
      </CommandBar>
    </div>
  );
}

function closedReason(detail: CaseDetail) {
  return detail.isOpen ? {} : { disabledReason: 'This case is closed.' };
}

function Stat({ label, value, isStrong = false }: { label: string; value: React.ReactNode; isStrong?: boolean }) {
  return (
    <div className="v2-stat">
      <dt className="v2-stat-label">{label}</dt>
      <dd className={isStrong ? 'v2-stat-value v2-stat-strong' : 'v2-stat-value'}>{value}</dd>
    </div>
  );
}

type NextState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; next?: ActionPlanItem; outstanding: number };

/**
 * The first current item of the case's action plan, in the strategy's own sequence — the same
 * answer the Case Workspace gives. No strategy, or nothing outstanding, is said plainly; nothing is
 * worded from assumptions.
 */
function NextAction({ detail, reloadKey }: { detail: CaseDetail; reloadKey: number }) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<NextState>({ status: 'loading' });
  const context = useMemo<CaseContext>(() => ({
    caseId: detail.id,
    ...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {}),
    now: new Date(),
    formatDate,
  }), [detail.id, detail.episodeNumber]);

  useEffect(() => {
    if (!detail.strategyId) { setState({ status: 'ready', outstanding: 0 }); return undefined; }
    let cancelled = false;
    setState({ status: 'loading' });
    loadActionPlan(adapter, { caseId: detail.id, strategyId: detail.strategyId })
      .then(plan => {
        if (cancelled) return;
        const outstanding = plan.rows.map(row => toPlanItem(row, context)).filter(item => item.isCurrent);
        setState({ status: 'ready', outstanding: outstanding.length, ...(outstanding[0] ? { next: outstanding[0] } : {}) });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [adapter, detail.id, detail.strategyId, context, reloadKey]);

  return (
    <section className="v2-next" aria-label="Next action" data-testid="v2-preview-next">
      <p className="v2-next-eyebrow">Next action</p>
      {state.status === 'loading' && <p className="v2-next-meta">Reading the action plan…</p>}
      {state.status === 'error' && <p className="v2-next-title">The action plan could not be read.</p>}
      {state.status === 'ready' && state.next && (
        <>
          <p className="v2-next-title">{state.next.action}</p>
          <p className="v2-next-meta">{state.next.state} · due: {state.next.due}{state.outstanding > 1 ? ` · ${state.outstanding - 1} more outstanding` : ''}</p>
        </>
      )}
      {state.status === 'ready' && !state.next && (
        <>
          <p className="v2-next-title">No next action determined</p>
          <p className="v2-next-meta">{detail.strategyId ? 'No planned action is outstanding for this case.' : 'No strategy has been resolved for this case.'}</p>
        </>
      )}
    </section>
  );
}

type FactsState = { status: 'loading' } | { status: 'ready'; lastActivity?: ActivityRow; promise?: PtpRow };

/** The latest recorded activity and the latest promise — what was last done and last promised. */
function RecentFacts({ detail, reloadKey }: { detail: CaseDetail; reloadKey: number }) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<FactsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.all([
      createActivityQuery(adapter)({ caseId: detail.id, pageSize: 1 }),
      createPtpQuery(adapter)({ caseId: detail.id, pageSize: 1 }),
    ]).then(([activities, promises]) => {
      if (cancelled) return;
      setState({
        status: 'ready',
        ...(activities.items[0] ? { lastActivity: activities.items[0] } : {}),
        ...(promises.items[0] ? { promise: promises.items[0] } : {}),
      });
    }).catch(() => { if (!cancelled) setState({ status: 'ready' }); });
    return () => { cancelled = true; };
  }, [adapter, detail.id, reloadKey]);

  if (state.status === 'loading') return <LoadingSkeleton rows={2} label="Loading recent activity" />;
  return (
    <KeyValueList testId="v2-preview-recent" items={[
      {
        label: 'Last activity',
        value: state.lastActivity ? `${state.lastActivity.subject} · ${formatRecordedAt(state.lastActivity.createdOn)}` : 'None recorded',
      },
      {
        label: 'Promise',
        value: state.promise
          ? `${formatMoney(state.promise.promisedAmount)} promised for ${state.promise.ptpDate ? formatDate(state.promise.ptpDate) : '—'} · ${state.promise.ptpStatus ?? '—'}`
          : 'None recorded',
      },
    ]} />
  );
}
