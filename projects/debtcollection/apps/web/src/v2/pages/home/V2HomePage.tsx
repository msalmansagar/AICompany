import { useMemo, useState } from 'react';
import { describeBucket, describeCount, type OperationalBucket, type WorkCount } from '@dcp/domain';
import { useCounts, formatCountResult, type CountRequest } from '../../../data/counts.js';
import {
  buildFollowUpFilter, createFollowUpQuery, type FollowUpQuery, type FollowUpWindow,
} from '../../../data/followUpQueries.js';
import type { ActivityRow } from '../../../data/caseQueries.js';
import { CASE_STATUS_LABELS, ENTITY_SETS } from '../../../data/schema.js';
import { codeFor } from '../../../data/collectionQueries.js';
import { StatusPill, formatDate } from '../../../components/primitives.js';
import { useCrmSession, useOrg } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { Card, EmptyState, FilterChips, LoadingSkeleton, MetricTile } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { HOME_BUCKETS, useBucketCounts } from './useBucketCounts.js';

/**
 * My Day — "what needs my attention?"
 *
 * Every figure is a count the platform answered, and an unanswered one says *unknown*, never zero. No
 * rate, trend, SLA or management KPI appears here: those are reporting (Phase 10) or undefined
 * policy (KI-101). Each item leads to the list that holds the work.
 */

/** The case statuses V1's My Day counts, found by their registered labels rather than written down. */
const PTP_ACTIVE_STATUS = codeFor(CASE_STATUS_LABELS, 'PTP Active');
const PTP_BROKEN_STATUS = codeFor(CASE_STATUS_LABELS, 'PTP Broken');

export function V2HomePage({ request }: { request: ViewRequest }) {
  const { go } = useV2Shell();
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [now] = useState(() => new Date());
  const buckets = useBucketCounts();

  const requests = useMemo<readonly CountRequest[]>(() => {
    const and = (clause: string) => (scopeFilter ? `${scopeFilter} and ${clause}` : clause);
    return [
      { key: 'open', entitySet: ENTITY_SETS.collectionCase, filter: and('statecode eq 0') },
      { key: 'ptpActive', entitySet: ENTITY_SETS.collectionCase, filter: and(`statuscode eq ${PTP_ACTIVE_STATUS}`) },
      { key: 'ptpBroken', entitySet: ENTITY_SETS.collectionCase, filter: and(`statuscode eq ${PTP_BROKEN_STATUS}`) },
      {
        key: 'followUpsOverdue',
        entitySet: ENTITY_SETS.collectionActivity,
        filter: buildFollowUpFilter({ window: 'overdue', now, ...(scopeFilter ? { scopeFilter } : {}) }),
      },
    ];
  }, [scopeFilter, now]);
  const counts = useCounts(adapter, requests);

  const myWork = buckets.counts.MyAssigned;
  return (
    <div className="v2-home" data-testid="v2-home">
      <div className="v2-metrics">
        <MetricTile label="My open work" value={myWork ? describeCount(myWork) : '—'} sub="Assigned to you" onOpen={() => go('queues', 'MyAssigned')} testId="v2-metric-mywork" />
        <MetricTile label="Overdue follow-ups" value={formatCountResult(counts['followUpsOverdue'])} sub="Past their follow-up date" tone={isPositive(counts['followUpsOverdue']?.value) ? 'danger' : undefined} testId="v2-metric-followups" />
        <MetricTile label="Open cases" value={formatCountResult(counts['open'])} sub="In the selected CRM scope" onOpen={() => go('cases')} testId="v2-metric-open" />
        <MetricTile label="Active promises" value={formatCountResult(counts['ptpActive'])} sub="Cases with a promise in force" onOpen={() => go('ptp')} testId="v2-metric-ptp-active" />
        <MetricTile label="Broken promises" value={formatCountResult(counts['ptpBroken'])} sub="Cases whose promise was broken" tone={isPositive(counts['ptpBroken']?.value) ? 'warning' : undefined} onOpen={() => go('ptp')} testId="v2-metric-ptp-broken" />
      </div>

      <div className="v2-two-col">
        <NeedsYou buckets={buckets} onOpen={bucket => go('queues', bucket)} />
        <QueueLoad buckets={buckets} onOpen={bucket => go('queues', bucket)} />
      </div>

      <FollowUps now={now} onOpenCase={request.onOpenCase} />
    </div>
  );
}

function isPositive(value: number | undefined): boolean {
  return value !== undefined && value > 0;
}

/** Buckets holding work (or whose count is unknown) — never a bucket known to be empty. */
function NeedsYou({ buckets, onOpen }: { buckets: ReturnType<typeof useBucketCounts>; onOpen: (bucket: OperationalBucket) => void }) {
  const items = HOME_BUCKETS
    .filter(bucket => bucket !== 'MyAssigned' && buckets.isAvailable(bucket))
    .map(bucket => ({ bucket, count: buckets.counts[bucket] }))
    .filter((item): item is { bucket: OperationalBucket; count: WorkCount } => item.count !== undefined)
    .filter(item => !item.count.known || item.count.value > 0);

  return (
    <Card title="What needs you today" subtitle="Work waiting in the operational queues." flush testId="v2-needs-you">
      {!buckets.isReady && <LoadingSkeleton rows={3} label="Counting open work" />}
      {buckets.isReady && items.length === 0 && <EmptyState title="Nothing is waiting in these queues right now." />}
      {buckets.isReady && items.length > 0 && (
        <ul className="v2-list">
          {items.map(({ bucket, count }) => (
            <li key={bucket} className="v2-list-row">
              <span className="v2-list-main">
                <span className="v2-list-title">{describeBucket(bucket)}</span>
                <span className="v2-list-meta">{count.known ? `${count.value} waiting` : 'Count could not be read'}</span>
              </span>
              <button type="button" className="v2-btn" onClick={() => onOpen(bucket)} data-testid={`v2-needs-${bucket}`}>Open</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QueueLoad({ buckets, onOpen }: { buckets: ReturnType<typeof useBucketCounts>; onOpen: (bucket: OperationalBucket) => void }) {
  return (
    <Card title="Queue load" subtitle="A piece of work can sit in more than one queue, so these are not meant to be added up." flush testId="v2-queue-load">
      {!buckets.isReady && <LoadingSkeleton rows={4} label="Counting queues" />}
      {buckets.isReady && (
        <ul className="v2-list">
          {HOME_BUCKETS.filter(bucket => buckets.isAvailable(bucket)).map(bucket => {
            const count = buckets.counts[bucket];
            return (
              <li key={bucket} className="v2-list-row">
                <button type="button" className="v2-list-link" onClick={() => onOpen(bucket)} data-testid={`v2-load-${bucket}`}>
                  <span className="v2-list-title">{describeBucket(bucket)}</span>
                  <span className="v2-list-count">{count ? describeCount(count) : '—'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const FOLLOW_UP_COLUMNS: readonly V2Column<ActivityRow>[] = [
  { key: 'due', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
  { key: 'case', header: 'Case', width: '160px', render: r => r.caseNumber ?? '—' },
  { key: 'type', header: 'Type', width: '160px', render: r => r.activityType ?? '—' },
  { key: 'subject', header: 'Subject', render: r => r.subject },
  { key: 'owner', header: 'Owner', width: '160px', render: r => r.ownerName ?? '—' },
  { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
];

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

  return (
    <Card
      title="Follow-ups"
      subtitle="Activities an officer committed to return to. Completing the activity clears its follow-up."
      actions={<FilterChips label="Window" options={WINDOWS} selected={window} onSelect={id => setWindow(id as FollowUpWindow)} testId="v2-followup-window" />}
      flush
    >
      <V2DataGrid<ActivityRow, FollowUpQuery>
        columns={FOLLOW_UP_COLUMNS} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        onRowOpen={r => { if (r.caseId) onOpenCase(r.caseId); }}
        rowLabel={r => `Open case ${r.caseNumber ?? ''} for ${r.subject}`}
        emptyTitle={window === 'overdue' ? 'Nothing is overdue.' : 'No follow-up in this window.'}
        height={320} testId="v2-followups"
      />
    </Card>
  );
}
