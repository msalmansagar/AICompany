import { useEffect, useMemo, useState } from 'react';
import type { ActionPlanItem } from '@dcp/domain';
import {
  createActivityQuery, type ActivityRow, type CaseDetail, type CustomerProfile,
} from '../../../data/caseQueries.js';
import { loadActionPlan } from '../../../data/followUpQueries.js';
import { toPlanItem, type CaseContext } from '../../../data/actionPlanRows.js';
import { StatusPill, formatCount, formatDate, formatMoney } from '../../../components/primitives.js';
import { describeFailure } from '../../../platform/errors.js';
import { formatRecordedAt } from '../../format.js';
import { useCrmSession } from '../../../shell/context.js';
import { BucketBadge, Card, EmptyState, ErrorState, KeyValueList, LoadingSkeleton } from '../../components/primitives.js';

/**
 * The case at a glance: who, which facility, what the strategy asks for next, and what has happened.
 *
 * "Next" is the first **current** item of the case's real Action Plan — the domain's own judgement of
 * outstanding work in the current arrears episode — described in the domain's own words. Nothing here
 * ranks, recommends or invents a due date.
 */
export function CaseOverview({ detail, customer, reloadKey, onOpenTab }: {
  detail: CaseDetail;
  customer?: CustomerProfile | undefined;
  reloadKey: number;
  onOpenTab: (tab: string) => void;
}) {
  return (
    <div className="v2-case-overview" data-testid="v2-case-overview">
      <div className="v2-two-col">
        <Card title="Customer" subtitle={customerSubtitle(detail)} flush>
          <KeyValueList testId="v2-case-customer-fields" items={customerFields(detail, customer)} />
        </Card>
        <Card title="Facility and position" subtitle="MIS's last reported position, stored on the case." flush>
          <KeyValueList testId="v2-case-facility-fields" items={facilityFields(detail)} />
        </Card>
      </div>
      <NextPlannedAction detail={detail} reloadKey={reloadKey} onOpenPlan={() => onOpenTab('plan')} />
      <RecentActivity caseId={detail.id} reloadKey={reloadKey} onOpenAll={() => onOpenTab('actions')} />
    </div>
  );
}

function customerSubtitle(detail: CaseDetail): string {
  if (detail.customerTable === 'contact') return 'Housing Loan customer (CRM contact).';
  if (detail.customerTable === 'account') return 'BFD customer (CRM account).';
  return 'The case is not linked to a CRM customer record.';
}

function customerFields(detail: CaseDetail, customer?: CustomerProfile) {
  return [
    { label: 'Name', value: customer?.displayName ?? '—' },
    { label: 'Customer id', value: detail.customerBusinessId },
    { label: 'Customer type', value: detail.customerType ?? '—' },
    { label: 'Mobile', value: customer?.mobile ?? '—' },
    { label: 'Phone', value: customer?.phone ?? '—' },
    { label: 'Email', value: customer?.email ?? '—' },
  ];
}

function facilityFields(detail: CaseDetail) {
  return [
    { label: 'Facility', value: detail.facilityNumber },
    { label: 'Product', value: detail.productDescription ?? detail.productTypeCode ?? '—' },
    { label: 'Source system', value: detail.sourceSystem },
    { label: 'DPD', value: formatCount(detail.dpd) },
    { label: 'Bucket', value: <BucketBadge bucket={detail.bucket} /> },
    { label: 'Arrears', value: formatMoney(detail.totalArrears) },
    { label: 'Loan balance', value: formatMoney(detail.loanBalance) },
    { label: 'MIS as of', value: formatDate(detail.misAsOfDate) },
  ];
}

type PlanState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; outstanding: readonly ActionPlanItem[] };

function NextPlannedAction({ detail, reloadKey, onOpenPlan }: { detail: CaseDetail; reloadKey: number; onOpenPlan: () => void }) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<PlanState>({ status: 'loading' });
  const context = useMemo<CaseContext>(() => ({
    caseId: detail.id,
    ...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {}),
    now: new Date(),
    formatDate,
  }), [detail.id, detail.episodeNumber]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadActionPlan(adapter, { caseId: detail.id, ...(detail.strategyId ? { strategyId: detail.strategyId } : {}) })
      .then(plan => {
        if (cancelled) return;
        const outstanding = plan.rows.map(row => toPlanItem(row, context)).filter(item => item.isCurrent);
        setState({ status: 'ready', outstanding });
      })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'error', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, detail.id, detail.strategyId, context, reloadKey]);

  if (state.status === 'loading') return <LoadingSkeleton rows={2} label="Loading the action plan" />;
  if (state.status === 'error') return <ErrorState title="The action plan could not be read." message={state.message} />;

  const next = state.outstanding[0];
  return (
    <section className="v2-next" aria-label="Next planned action" data-testid="v2-next-action">
      <p className="v2-next-eyebrow">
        {detail.strategyName ? `Next planned action · ${detail.strategyName}` : 'Next planned action'}
      </p>
      {next ? (
        <>
          <p className="v2-next-title">{next.action}</p>
          <p className="v2-next-meta">
            {next.state} · due: {next.due} · {next.origin}
            {state.outstanding.length > 1 ? ` · ${state.outstanding.length - 1} more outstanding` : ''}
          </p>
        </>
      ) : (
        <p className="v2-next-title">
          {detail.strategyId ? 'No planned action is outstanding for this case.' : 'No strategy has been resolved for this case.'}
        </p>
      )}
      <button type="button" className="v2-btn v2-btn-on-dark" onClick={onOpenPlan}>Open the action plan</button>
    </section>
  );
}

const RECENT_COUNT = 5;

function RecentActivity({ caseId, reloadKey, onOpenAll }: { caseId: string; reloadKey: number; onOpenAll: () => void }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createActivityQuery(adapter), [adapter]);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: readonly ActivityRow[] }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchPage({ caseId, pageSize: RECENT_COUNT })
      .then(page => { if (!cancelled) setState({ status: 'ready', rows: page.items.slice(0, RECENT_COUNT) }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [fetchPage, caseId, reloadKey]);

  return (
    <Card
      title="Recent activity"
      subtitle="The latest actions recorded on this case."
      actions={<button type="button" className="v2-btn v2-btn-subtle" onClick={onOpenAll}>All activities</button>}
      flush
    >
      {state.status === 'loading' && <LoadingSkeleton rows={3} label="Loading recent activity" />}
      {state.status === 'error' && <ErrorState title="Recent activity could not be read." />}
      {state.status === 'ready' && state.rows.length === 0 && (
        <EmptyState title="No action has been recorded on this case yet." />
      )}
      {state.status === 'ready' && state.rows.length > 0 && (
        <ol className="v2-timeline" data-testid="v2-case-timeline">
          {state.rows.map(row => (
            <li key={row.id} className="v2-timeline-item">
              <span className="v2-timeline-dot" aria-hidden="true" />
              <div className="v2-timeline-body">
                <div className="v2-timeline-head">
                  <span className="v2-timeline-title">{row.activityType ?? 'Action'}</span>
                  <StatusPill status={row.status} />
                  <span className="v2-timeline-when">Recorded {formatRecordedAt(row.createdOn)} · {row.ownerName ?? '—'}</span>
                </div>
                <p className="v2-timeline-note">{row.subject}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
