import { useEffect, useMemo, useState } from 'react';
import {
  describeBucket, describeCount, describeWorkType, unknownCount,
  type OperationalBucket, type WorkCount, type WorkItem,
} from '@dcp/domain';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  bucketIsAvailable, countBucket, createWorkQueue, loadTypeIds,
  type TypeIds, type WorkQueueRequest,
} from '../data/operationalQueue.js';
import { Card, EmptyState, Icon, InfoBanner } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * My Work — one place to answer "what needs my attention now?".
 *
 * **It aggregates; it owns nothing.** Every row is a view of a record whose lifecycle lives in its
 * own domain, and selecting one takes the officer to that case rather than to a technical record.
 * No work item is stored, so nothing here can drift from the work it describes.
 *
 * **The buckets overlap, and the screen says so.** One activity can be *mine*, *due soon* and *a
 * Legal recommendation* at once — three classifications of one job. The counts are therefore never
 * added together, and the banner tells an officer that rather than leaving them to assume.
 *
 * **A bucket that cannot be answered honestly is not offered.** Overdue and Due Soon need a
 * deadline, and no turn-around-time start point is configured (KI-101), so every deadline is
 * undetermined and those buckets say so instead of showing an empty list that reads as "nothing is
 * late". Assignment-needs-attention is the same: it is a decision, not a stored column.
 */

/** The buckets offered, in the order an officer works through them. */
const BUCKETS: readonly OperationalBucket[] = [
  'MyAssigned', 'AwaitingAssignment', 'AssignmentRequiresAttention',
  'DueSoon', 'Overdue', 'Escalated',
  'Legal', 'Disputes', 'Complaints', 'DeceasedReview', 'RestructuringRecommendations',
];

/** Why a bucket cannot be served. Business wording — no KI numbers, no column names. */
const UNAVAILABLE_REASON: Readonly<Partial<Record<OperationalBucket, string>>> = {
  DueSoon: 'Due dates are not configured yet, so nothing can be listed as due soon.',
  Overdue: 'Due dates are not configured yet, so nothing can be listed as overdue.',
  AssignmentRequiresAttention:
    'Assignment problems are not recorded on the work itself yet, so they cannot be listed here.',
};

/**
 * The columns, including one that exists purely so rows can be told apart.
 *
 * Browser QA on real data produced four rows reading *"Promise to pay · Collection action ·
 * DEMO-HL-1001 · Mohammad Salman · Open"* — four genuinely distinct records that an officer could
 * not distinguish. They were never duplicates, but a list whose rows look identical is barely
 * better than one that has them. The recorded date separates them.
 */
const COLUMNS: readonly DataGridColumn<WorkItem>[] = [
  { key: 'title', header: 'Work', render: item => item.title },
  { key: 'type', header: 'Type', width: '170px', render: item => describeWorkType(item.type) },
  { key: 'case', header: 'Case', width: '140px', render: item => item.caseNumber ?? '—' },
  {
    key: 'recorded',
    header: 'Recorded',
    width: '150px',
    /*
     * The time, not just the date.
     *
     * Browser QA showed four "Promise to pay" rows on one case that a date alone still could not
     * separate — they were all recorded the same day, and `qdb_activitynumber` is null so there is
     * no reference to fall back on. The minute is what actually tells an officer which one they
     * are looking at, and it is operationally useful in its own right.
     */
    render: item => (item.createdOn ? item.createdOn.slice(0, 16).replace('T', ' ') : '—'),
  },
  { key: 'owner', header: 'With', width: '160px', render: item => item.ownerName ?? 'Nobody yet' },
  { key: 'state', header: 'State', width: '180px', render: item => item.domainState ?? '—' },
];

export function MyWorkView() {
  const { adapter, context } = useCrmSession();
  // Read from the platform's own context, never assumed or passed in.
  const userId = context.userId;
  const [bucket, setBucket] = useState<OperationalBucket>('MyAssigned');
  const [search, setSearch] = useState('');
  const [typeIds, setTypeIds] = useState<TypeIds | null>(null);
  const [counts, setCounts] = useState<Partial<Record<OperationalBucket, WorkCount>>>({});

  useEffect(() => {
    let cancelled = false;
    loadTypeIds(adapter)
      .then(result => { if (!cancelled) setTypeIds(result); })
      .catch(() => { if (!cancelled) setTypeIds({ legal: [], concern: [], deceased: [], restructuring: [] }); });
    return () => { cancelled = true; };
  }, [adapter]);

  // Counts are asked for as counts, one per available bucket, and never by measuring a page.
  useEffect(() => {
    if (!typeIds) return;
    let cancelled = false;
    const context = { ...(userId ? { currentUserId: userId } : {}), typeIds };

    void Promise.all(BUCKETS.map(async candidate =>
      [candidate, await countBucket(adapter, candidate, context)] as const))
      .then(entries => {
        if (cancelled) return;
        setCounts(Object.fromEntries(entries) as Partial<Record<OperationalBucket, WorkCount>>);
      });
    return () => { cancelled = true; };
  }, [adapter, typeIds, userId]);

  const fetchPage = useMemo(
    () => (typeIds ? createWorkQueue(adapter, typeIds) : null), [adapter, typeIds]);

  const query = useMemo<Omit<WorkQueueRequest, 'pageSize' | 'continuation'>>(() => ({
    bucket,
    ...(userId ? { currentUserId: userId } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [bucket, userId, search]);

  const available = typeIds
    ? bucketIsAvailable(bucket, { ...(userId ? { currentUserId: userId } : {}), typeIds })
    : false;

  return (
    <div data-testid="view-mywork">
      <Card
        title="My work"
        subtitle="Work that needs attention, gathered from across this workspace. Each row is the record itself — nothing here is a copy."
      >
        <div className="row-actions" data-testid="mywork-buckets">
          {BUCKETS.map(candidate => (
            <button
              key={candidate}
              type="button"
              className={candidate === bucket ? 'btn primary' : 'btn'}
              data-testid={`bucket-${candidate}`}
              data-count={describeCount(counts[candidate] ?? unknownCount('NotRequested'))}
              onClick={() => { setSearch(''); setBucket(candidate); }}
            >
              {describeBucket(candidate)}
              <span className="cell-sub">
                {describeCount(counts[candidate] ?? unknownCount('NotRequested'))}
              </span>
            </button>
          ))}
        </div>
        <InfoBanner>
          A piece of work can appear under more than one heading — work of yours that is also a
          legal recommendation is one job, counted in both. The numbers are not meant to be added up.
        </InfoBanner>
        <input
          className="fluent-input"
          placeholder="Search this list"
          value={search}
          data-testid="mywork-search"
          onChange={event => setSearch(event.target.value)}
        />
      </Card>

      <Card title={describeBucket(bucket)}>
        {!available
          ? (
            <EmptyState
              icon="info"
              message={UNAVAILABLE_REASON[bucket]
                ?? 'This list cannot be shown until the signed-in user is known.'}
            />
          )
          : fetchPage && (
            <DataGrid<WorkItem, Omit<WorkQueueRequest, 'pageSize' | 'continuation'>>
              columns={COLUMNS}
              fetchPage={fetchPage as never}
              query={query}
              rowKey={item => item.id}
              pageSize={50}
              emptyMessage="Nothing in this list right now."
              data-testid="mywork-grid"
            />
          )}
      </Card>
    </div>
  );
}

/** The icon the rail uses. Kept beside the view so the two cannot drift. */
export function MyWorkIcon() {
  return <Icon name="queue" />;
}
