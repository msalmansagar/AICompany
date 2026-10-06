import { useMemo, useState } from 'react';
import { describeBucket, describeCount, type OperationalBucket, type WorkCount } from '@dcp/domain';
import { useCounts, formatCountResult, type CountRequest, type CountResult } from '../../../data/counts.js';
import { createFollowUpQuery, type FollowUpQuery, type FollowUpWindow } from '../../../data/followUpQueries.js';
import type { ActivityRow } from '../../../data/caseQueries.js';
import { casesTileFor, myDayCountRequests, seesIdentityExceptions } from '../../../data/myDayOversight.js';
import { describeRecorder, useApplicationUsers } from '../../../data/applicationUsers.js';
import { StatusPill, formatDate } from '../../../components/primitives.js';
import { useCrmSession, useOrg, useRole } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { Card, FilterChips, LoadingSkeleton, MetricTile } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { HOME_BUCKETS, useBucketCounts } from './useBucketCounts.js';

/**
 * My Day — "what needs my attention?"
 *
 * Every figure is a count the platform answered, and an unanswered one says *unknown*, never zero. No
 * rate, trend, SLA or management KPI appears here: those are reporting or undefined policy (KI-101).
 * Each item leads to the list that holds the work. An officer sees their own cases; a supervisor the
 * portfolio (`casesTileFor`).
 */

/** How far ahead "promises due" looks. Stated on the tile; a window, not a policy. */
const PROMISE_HORIZON_DAYS = 7;

export function V2HomePage({ request }: { request: ViewRequest }) {
  const { go } = useV2Shell();
  const { adapter, context } = useCrmSession();
  const { scopeFilter } = useOrg();
  const { role } = useRole();
  const [now] = useState(() => new Date());
  const buckets = useBucketCounts();

  // The same factual requests V1's My Day makes: activities scoped through their case, promises as
  // PTP activities in a stated window, never a case status standing in for a promise.
  const requests = useMemo<readonly CountRequest[]>(
    () => myDayCountRequests({ now, userId: context.userId, promiseHorizonDays: PROMISE_HORIZON_DAYS, ...(scopeFilter ? { scopeFilter } : {}) }),
    [scopeFilter, context.userId, now]);
  const counts = useCounts(adapter, requests);
  const casesTile = casesTileFor(role);

  const myWork = buckets.counts.MyAssigned;
  return (
    <div className="v2-home" data-testid="v2-home">
      <div className="v2-metrics">
        <MetricTile label="My open work" value={myWork ? describeCount(myWork) : '—'} sub="Assigned to you" onOpen={() => go('queues', 'MyAssigned')} testId="v2-metric-mywork" />
        <MetricTile label="Overdue follow-ups" value={formatCountResult(counts['followUpsOverdue'])} sub="Follow-up date before now" tone={isPositive(counts['followUpsOverdue']?.value) ? 'danger' : undefined} testId="v2-metric-followups" />
        <MetricTile label="Upcoming follow-ups" value={formatCountResult(counts['followUpsUpcoming'])} sub="Follow-up date from now on" testId="v2-metric-followups-upcoming" />
        <MetricTile label={casesTile.label} value={formatCountResult(counts[casesTile.key])} sub={casesTile.hint} onOpen={() => go('cases')} testId="v2-metric-open" />
        <MetricTile label={`Promises due, ${PROMISE_HORIZON_DAYS} days`} value={formatCountResult(counts['promisesDue'])} sub="Promised for today onward" onOpen={() => go('ptp')} testId="v2-metric-ptp-due" />
        {seesIdentityExceptions(role) && (
          <MetricTile label="Identity exceptions" value={formatCountResult(counts['identityExceptions'])} sub="Open, both CRMs" onOpen={() => go('intake')} testId="v2-metric-identity" />
        )}
      </div>

      <MyQueues
        buckets={buckets}
        promises={{ due: counts['promisesDue'], broken: counts['brokenPromises'] }}
        onOpenBucket={bucket => go('queues', bucket)}
        onOpenPromises={() => go('ptp')}
      />

      <FollowUps now={now} onOpenCase={request.onOpenCase} />
    </div>
  );
}

function isPositive(value: number | undefined): boolean {
  return value !== undefined && value > 0;
}

/** One row of the queue panel: a name, a count the platform answered (or "unknown"), and where it leads. */
interface QueueRow { id: string; title: string; count: string; hasWork: boolean; onOpen: () => void }

/**
 * Every queue in one place — the operational buckets and the promise lists — with the ones holding
 * work standing out. Replaces two panels that showed the same queues twice ("What needs you today"
 * and "Queue load"). A piece of work can sit in more than one queue, so the rows are not added up.
 */
function MyQueues({ buckets, promises, onOpenBucket, onOpenPromises }: {
  buckets: ReturnType<typeof useBucketCounts>;
  promises: { due: CountResult | undefined; broken: CountResult | undefined };
  onOpenBucket: (bucket: OperationalBucket) => void;
  onOpenPromises: () => void;
}) {
  const rows: QueueRow[] = [
    ...HOME_BUCKETS.filter(bucket => buckets.isAvailable(bucket)).map(bucket => bucketRow(bucket, buckets.counts[bucket], onOpenBucket)),
    promiseRow({ id: 'promises-due', title: `Promises due, ${PROMISE_HORIZON_DAYS} days`, count: promises.due, onOpen: onOpenPromises }),
    promiseRow({ id: 'promises-broken', title: 'Broken promises', count: promises.broken, onOpen: onOpenPromises }),
  ];
  return (
    <Card title="My queues" subtitle="Work can sit in more than one queue, so these are not added up." flush testId="v2-my-queues">
      {buckets.isReady ? <QueueList rows={rows} /> : <LoadingSkeleton rows={4} label="Counting queues" />}
    </Card>
  );
}

function QueueList({ rows }: { rows: readonly QueueRow[] }) {
  return (
    <ul className="v2-list">
      {rows.map(row => (
        <li key={row.id} className={row.hasWork ? 'v2-list-row' : 'v2-list-row v2-list-row-quiet'} data-testid={`v2-queue-${row.id}`}>
          <span className="v2-list-main"><span className="v2-list-title">{row.title}</span></span>
          <span className="v2-list-count">{row.count}</span>
          <button type="button" className="v2-btn" onClick={row.onOpen} data-testid={`v2-queue-open-${row.id}`}>Open</button>
        </li>
      ))}
    </ul>
  );
}

function bucketRow(bucket: OperationalBucket, count: WorkCount | undefined, onOpen: (bucket: OperationalBucket) => void): QueueRow {
  return {
    id: bucket, title: describeBucket(bucket), count: count ? describeCount(count) : '—',
    // An unknown count is shown as such and kept prominent: "could not be read" is not "empty".
    hasWork: !count || !count.known || count.value > 0,
    onOpen: () => onOpen(bucket),
  };
}

interface PromiseRowSource { id: string; title: string; count: CountResult | undefined; onOpen: () => void }

function promiseRow({ id, title, count, onOpen }: PromiseRowSource): QueueRow {
  return { id, title, count: formatCountResult(count), hasWork: count?.value === undefined || count.value > 0, onOpen };
}

/** The follow-up columns; an integration-owned activity is shown as "System", never by its technical name. */
function followUpColumns(applicationUsers: ReadonlySet<string>): readonly V2Column<ActivityRow>[] {
  return [
    { key: 'due', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
    { key: 'case', header: 'Case', width: '160px', render: r => r.caseNumber ?? '—' },
    { key: 'type', header: 'Type', width: '160px', render: r => r.activityType ?? '—' },
    { key: 'subject', header: 'Subject', render: r => r.subject },
    { key: 'owner', header: 'Owner', width: '160px', render: r => describeRecorder(r, applicationUsers) },
    { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
  ];
}

const WINDOWS: readonly { id: FollowUpWindow; label: string }[] = [
  { id: 'overdue', label: 'Overdue' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'all', label: 'All' },
];

/** Follow-ups by window. The window is a server-side filter, so changing it asks a new question. */
function FollowUps({ now, onOpenCase }: { now: Date; onOpenCase: (id: string) => void }) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [window, setWindow] = useState<FollowUpWindow>('overdue');
  const fetchPage = useMemo(() => createFollowUpQuery(adapter), [adapter]);
  const query = useMemo<FollowUpQuery>(() => ({ window, now, ...(scopeFilter ? { scopeFilter } : {}) }), [window, now, scopeFilter]);
  const applicationUsers = useApplicationUsers(adapter);
  const columns = useMemo(() => followUpColumns(applicationUsers), [applicationUsers]);

  return (
    <Card
      title="Follow-ups"
      subtitle="Activities an officer committed to return to. Completing the activity clears its follow-up."
      actions={<FilterChips label="Window" options={WINDOWS} selected={window} onSelect={id => setWindow(id as FollowUpWindow)} testId="v2-followup-window" />}
      flush
    >
      <V2DataGrid<ActivityRow, FollowUpQuery>
        columns={columns} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        onRowOpen={r => { if (r.caseId) onOpenCase(r.caseId); }}
        rowLabel={r => `Open case ${r.caseNumber ?? ''} for ${r.subject}`}
        emptyTitle={window === 'overdue' ? 'Nothing is overdue.' : 'No follow-up in this window.'}
        height={320} testId="v2-followups"
      />
    </Card>
  );
}
