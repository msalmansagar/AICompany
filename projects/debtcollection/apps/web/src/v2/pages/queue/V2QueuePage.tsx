import { useEffect, useMemo, useState } from 'react';
import { describeBucket, describeCount, describeWorkType, type OperationalBucket, type WorkItem } from '@dcp/domain';
import { createWorkQueue, loadTypeIds, type TypeIds, type WorkQueueRequest } from '../../../data/operationalQueue.js';
import { formatCount, formatMoney } from '../../../components/primitives.js';
import { useCrmSession } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketBadge, Card, EmptyState, FilterChips, KeyValueList, LoadingSkeleton } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { formatRecordedAt } from '../../format.js';
import { useBucketCounts } from '../home/useBucketCounts.js';
import { useCaseRecord } from '../case/useCaseRecord.js';

/**
 * Work Queues V2 — the operational lists, one bucket at a time.
 *
 * The bucket is in the shared URL (`#queues/<bucket>`), counts are the platform's own, and a bucket the
 * configuration cannot answer is shown disabled with the reason rather than as an empty list. The list
 * is the same server-paged, virtualised read V1 uses; search is sent to the source.
 *
 * Two layouts, remembered in this browser: **Split** — choose a row to preview its case, then open it —
 * and **Grid**, where a row opens the case directly.
 */

export const QUEUE_BUCKETS: readonly OperationalBucket[] = [
  'MyAssigned', 'AwaitingAssignment', 'AssignmentRequiresAttention', 'DueSoon', 'Overdue', 'Escalated',
  'Legal', 'Disputes', 'Complaints', 'DeceasedReview', 'RestructuringRecommendations',
];

/** Why a bucket cannot be served. Business wording — the same as V1's. */
const UNAVAILABLE_REASON: Readonly<Partial<Record<OperationalBucket, string>>> = {
  DueSoon: 'Due dates are not configured yet, so nothing can be listed as due soon.',
  Overdue: 'Due dates are not configured yet, so nothing can be listed as overdue.',
  AssignmentRequiresAttention: 'Assignment problems are not recorded on the work itself yet, so they cannot be listed here.',
};

type Layout = 'split' | 'grid';
const LAYOUT_KEY = 'dcp.v2.queueLayout';

export function V2QueuePage({ request, fixedBucket, intro }: {
  request: ViewRequest;
  /** Opens on one bucket and offers no others — the Workout entries. */
  fixedBucket?: OperationalBucket;
  intro?: string;
}) {
  const { go } = useV2Shell();
  const { adapter, context } = useCrmSession();
  const buckets = useBucketCounts(QUEUE_BUCKETS);
  const bucket = fixedBucket ?? pickBucket(request.recordId);
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 300);
  const [layout, setLayout] = useState<Layout>(() => readLayout());
  const [selected, setSelected] = useState<WorkItem | undefined>(undefined);
  const [typeIds, setTypeIds] = useState<TypeIds | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTypeIds(adapter)
      .then(result => { if (!cancelled) setTypeIds(result); })
      .catch(() => { if (!cancelled) setTypeIds({ legal: [], concern: [], deceased: [], restructuring: [] }); });
    return () => { cancelled = true; };
  }, [adapter]);

  useEffect(() => { setSelected(undefined); }, [bucket, query]);

  const fetchPage = useMemo(() => (typeIds ? createWorkQueue(adapter, typeIds) : null), [adapter, typeIds]);
  const listQuery = useMemo<Omit<WorkQueueRequest, 'pageSize' | 'continuation'>>(() => ({
    bucket,
    ...(context.userId ? { currentUserId: context.userId } : {}),
    ...(query ? { search: query } : {}),
  }), [bucket, context.userId, query]);

  const chooseLayout = (next: Layout) => { setLayout(next); writeLayout(next); };
  const reason = UNAVAILABLE_REASON[bucket];

  return (
    <div className="v2-queue" data-testid="v2-queue" data-bucket={bucket}>
      {intro && <p className="v2-intro" data-testid="v2-queue-intro">{intro}</p>}
      <Card flush>
        <div className="v2-toolbar">
          {!fixedBucket && (
            <FilterChips
              label="Queue"
              selected={bucket}
              onSelect={id => go('queues', id)}
              testId="v2-queue-buckets"
              options={QUEUE_BUCKETS.map(id => ({
                id,
                label: describeBucket(id),
                count: buckets.counts[id] ? describeCount(buckets.counts[id]!) : undefined,
                disabledReason: UNAVAILABLE_REASON[id],
              }))}
            />
          )}
          <div className="v2-toolbar-row">
            <input
              className="v2-input" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search this list" aria-label="Search this list" data-testid="v2-queue-search"
            />
            <div className="v2-segmented" role="group" aria-label="Layout">
              {(['split', 'grid'] as const).map(option => (
                <button key={option} type="button" className="v2-segment" aria-pressed={layout === option} onClick={() => chooseLayout(option)} data-testid={`v2-layout-${option}`}>
                  {option === 'split' ? 'Split' : 'Grid'}
                </button>
              ))}
            </div>
          </div>
          <p className="v2-toolbar-note">A piece of work can sit in more than one queue, so the counts are not meant to be added up.</p>
        </div>

        {reason && <EmptyState title="This queue cannot be listed yet." message={reason} testId="v2-queue-unavailable" />}
        {!reason && !fetchPage && <LoadingSkeleton rows={6} label="Loading the queue" />}
        {!reason && fetchPage && layout === 'grid' && (
          <V2DataGrid<WorkItem, typeof listQuery>
            columns={GRID_COLUMNS} fetchPage={fetchPage as never} query={listQuery} rowKey={item => item.id}
            onRowOpen={item => request.onOpenCase(item.caseId)} rowLabel={item => `Open case ${item.caseNumber ?? ''} for ${item.title}`}
            isFiltered={Boolean(query)} emptyTitle="Nothing in this queue right now." testId="v2-queue-grid"
          />
        )}
        {!reason && fetchPage && layout === 'split' && (
          <div className="v2-split">
            <div className="v2-split-list">
              <V2DataGrid<WorkItem, typeof listQuery>
                columns={SPLIT_COLUMNS} fetchPage={fetchPage as never} query={listQuery} rowKey={item => item.id}
                onRowOpen={setSelected} selectedKey={selected?.id ?? ''}
                rowLabel={item => `Preview ${item.title}`}
                isFiltered={Boolean(query)} emptyTitle="Nothing in this queue right now." height={560} testId="v2-queue-list"
              />
            </div>
            <QueuePreview item={selected} onOpen={id => request.onOpenCase(id)} />
          </div>
        )}
      </Card>
    </div>
  );
}

function pickBucket(requested: string | undefined): OperationalBucket {
  return QUEUE_BUCKETS.find(id => id === requested) ?? 'MyAssigned';
}

const recorded = (item: WorkItem) => formatRecordedAt(item.createdOn);

const GRID_COLUMNS: readonly V2Column<WorkItem>[] = [
  { key: 'title', header: 'Work', render: item => item.title },
  { key: 'type', header: 'Type', width: '170px', render: item => describeWorkType(item.type) },
  { key: 'case', header: 'Case', width: '150px', render: item => item.caseNumber ?? '—' },
  { key: 'customer', header: 'Customer', width: '170px', render: item => item.customerName ?? '—' },
  { key: 'recorded', header: 'Recorded', width: '140px', render: recorded },
  { key: 'owner', header: 'With', width: '150px', render: item => item.ownerName ?? 'Nobody yet' },
  { key: 'state', header: 'State', width: '170px', render: item => item.domainState ?? '—' },
];

const SPLIT_COLUMNS: readonly V2Column<WorkItem>[] = [
  {
    key: 'work', header: 'Work', render: item => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{item.title}</span>
        <span className="v2-two-line-sub">{item.caseNumber ?? '—'} · {describeWorkType(item.type)}</span>
      </span>
    ),
  },
  { key: 'recorded', header: 'Recorded', width: '130px', render: recorded },
];

/** The chosen row's case, read on demand — the preview never holds a copy of anything. */
function QueuePreview({ item, onOpen }: { item?: WorkItem | undefined; onOpen: (caseId: string) => void }) {
  const record = useCaseRecord(item?.caseId, 0);
  if (!item) {
    return <div className="v2-split-preview"><EmptyState title="Choose a row to preview its case." testId="v2-queue-preview-empty" /></div>;
  }
  return (
    <div className="v2-split-preview" data-testid="v2-queue-preview">
      <p className="v2-eyebrow">{describeWorkType(item.type)}</p>
      <h2 className="v2-preview-title">{item.title}</h2>
      {record.status === 'loading' && <LoadingSkeleton rows={4} label="Loading the case" />}
      {record.status === 'ready' && (
        <>
          <p className="v2-preview-sub">
            {record.customer?.displayName ?? record.detail.customerBusinessId} · {record.detail.caseNumber}{' '}
            <BucketBadge bucket={record.detail.bucket} />
          </p>
          <KeyValueList items={[
            { label: 'DPD', value: formatCount(record.detail.dpd) },
            { label: 'Arrears', value: formatMoney(record.detail.totalArrears) },
            { label: 'With', value: item.ownerName ?? 'Nobody yet' },
            { label: 'State', value: item.domainState ?? '—' },
          ]} />
          <p className="v2-toolbar-note">Stored MIS position — not a live MIS read.</p>
        </>
      )}
      {(record.status === 'error' || record.status === 'missing') && <p className="v2-muted">The case could not be read.</p>}
      <button type="button" className="v2-btn v2-btn-primary" onClick={() => onOpen(item.caseId)} data-testid="v2-queue-open-case">Open case</button>
    </div>
  );
}

function readLayout(): Layout {
  try { return window.localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'split'; } catch { return 'split'; }
}

function writeLayout(layout: Layout): void {
  try { window.localStorage.setItem(LAYOUT_KEY, layout); } catch { /* a per-browser convenience; the default returns */ }
}
