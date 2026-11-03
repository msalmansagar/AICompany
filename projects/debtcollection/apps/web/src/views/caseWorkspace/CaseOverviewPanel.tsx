import type { HistoryEntry } from '@dcp/domain';
import type { CaseDetail, PtpRow } from '../../data/caseQueries.js';
import { nextPlannedWork, type GroupedWork } from '../../data/caseWorkPlan.js';
import { FieldList, StatusPill, PromiseOutcome, formatDay, formatMoney } from '../../components/primitives.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';
import { formatMoment } from '../Customer360.js';

/**
 * What an officer needs before acting: what is next, when, when the customer was last contacted,
 * the promise in force, and who holds the case.
 *
 * Every line is read from a record. The strategy appears only when the case names one; there is no
 * recommendation and no score. "Last contact" is the newest message in the case's timeline — the
 * same list shown below — so the two can never disagree.
 */
export interface OverviewFacts {
  groups: GroupedWork | undefined;
  promise: { promise: PtpRow; isOpen: boolean } | undefined;
  lastActivity: PtpRow | undefined;
  /** `undefined` while the timeline has not answered. */
  lastContact: HistoryEntry | null | undefined;
}

export function CaseOverviewPanel({ detail, facts }: { detail: CaseDetail; facts: OverviewFacts }) {
  return (
    <section className="section-card cw-overview" aria-labelledby="cw-overview-title" data-testid="cw-overview">
      <h3 id="cw-overview-title">Overview</h3>
      <FieldList testId="cw-overview-fields" fields={[
        { label: 'Next planned action', value: describeNext(facts.groups) },
        { label: 'Due', value: describeDue(facts.groups) },
        { label: 'Last contact', value: describeContact(facts.lastContact) },
        { label: 'Last action recorded', value: facts.lastActivity ? `${facts.lastActivity.subject} · ${formatDay(facts.lastActivity.activityDate ?? facts.lastActivity.createdOn)}` : 'None recorded' },
        { label: 'Promise to pay', value: <PromiseLine promise={facts.promise} /> },
        ...(detail.strategyName ? [{ label: 'Strategy', value: detail.strategyName }] : []),
        { label: 'Case owner', value: <OwnerLabel ownerId={detail.ownerId} ownerName={detail.ownerName} /> },
        { label: 'Case status', value: <StatusPill status={detail.status} /> },
      ]} />
    </section>
  );
}

function describeNext(groups: GroupedWork | undefined): string {
  if (!groups) return 'Loading…';
  return nextPlannedWork(groups)?.title ?? 'Nothing planned or due';
}

/** The follow-up date that placed the next line; a planned action no work answers has none (KI-101). */
function describeDue(groups: GroupedWork | undefined): string {
  if (!groups) return 'Loading…';
  const next = nextPlannedWork(groups);
  if (!next) return '—';
  return next.dateIso ? formatDay(next.dateIso) : 'No due date set';
}

function describeContact(entry: HistoryEntry | null | undefined): string {
  if (entry === undefined) return 'Loading…';
  if (entry === null) return 'No message in the recent timeline';
  return `${entry.channel ?? 'Message'} · ${formatMoment(entry.occurredAt)}`;
}

function PromiseLine({ promise }: { promise: OverviewFacts['promise'] }) {
  if (!promise) return <>None recorded</>;
  const { promise: row } = promise;
  return <>{formatMoney(row.promisedAmount)} for {formatDay(row.ptpDate)} <PromiseOutcome status={row.ptpStatus} /></>;
}
