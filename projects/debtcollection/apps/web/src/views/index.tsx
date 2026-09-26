import { useEffect, useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createAuditQuery, createCaseQuery, LABELS, type AuditQuery, type AuditRow, type CaseQuery, type CaseRow,
} from '../data/collectionQueries.js';
import { createFollowUpQuery, type FollowUpQuery, type FollowUpWindow } from '../data/followUpQueries.js';
import type { ActivityRow } from '../data/caseQueries.js';
import { formatCountResult, useCounts, type CountRequest } from '../data/counts.js';
import { loadOpenArrears, myDayCountRequests } from '../data/myDayOversight.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { ReportingScope } from '@dcp/domain';
import { encodeScope, hasScope } from '../data/caseListScopeUrl.js';
import { ORG_CODES } from '../data/schema.js';
import { MyWorkView } from './MyWorkView.js';
import {
  BucketBar, BucketPill, Card, EmptyState, InfoBanner, KpiRow, OrgBadge, PendingPhaseNotice, StatusPill,
  formatCount, formatDate, formatMoney,
} from '../components/primitives.js';
import { useCrmSession, useOrg } from '../shell/context.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * The workspace's views.
 *
 * Every list here is the same `DataGrid`, which is the point: paging, virtualization, duplicate
 * suppression and stale-response handling are solved once. A view decides what its columns are and
 * what its filters mean, and nothing else.
 */

// ── Collection Cases — the flagship list ─────────────────────────────────────

const CASE_COLUMNS: readonly DataGridColumn<CaseRow>[] = [
  { key: 'case', header: 'Case', width: '160px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{r.caseNumber}</span> },
  { key: 'org', header: 'CRM', width: '70px', render: r => <OrgBadge org={r.organization} /> },
  { key: 'customer', header: 'Customer', width: '150px', render: r => r.customerBusinessId },
  { key: 'facility', header: 'Facility', width: '140px', render: r => r.facilityNumber },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'arrears', header: 'Overdue', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'status', header: 'Status', width: '150px', render: r => <StatusPill status={r.status} /> },
];

/**
 * A reporting scope that arrived in the URL — from a dashboard card — becomes the list's own
 * filters: the CRM scope, the bucket and the status land in the pickers the officer can see and
 * change; strategy and owner have no picker and are shown as the scope they are.
 */
export function CasesView({ onOpenCase, scope = {} }: { onOpenCase?: (id: string) => void; scope?: ReportingScope }) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [bucket, setBucket] = useState(scope.bucket ?? '');
  const [status, setStatus] = useState(scope.caseStatus ?? '');
  const [search, setSearch] = useState('');
  const scopeId = encodeScope(scope);

  useEffect(() => {
    setBucket(scope.bucket ?? '');
    setStatus(scope.caseStatus ?? '');
    // The scope's identity is its encoding; the object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  const fetchPage = useMemo(() => createCaseQuery(adapter), [adapter]);

  // The query object is the question. A change to any part of it restarts paging, which is exactly
  // what should happen — the engine discards the continuation rather than paging into a population
  // the user stopped asking about.
  const effectiveScopeFilter = scopeFilterFor(scope.sourceSystem, scopeFilter);
  const query = useMemo<CaseQuery>(() => ({
    ...(effectiveScopeFilter !== undefined ? { scopeFilter: effectiveScopeFilter } : {}),
    ...(bucket ? { bucket } : {}),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    ...(scope.strategy ? { strategy: scope.strategy } : {}),
    ...(scope.owner ? { ownerId: scope.owner } : {}),
    openOnly: true,
    sort: [{ field: 'qdb_currentdpd', descending: true }],
  }), [effectiveScopeFilter, bucket, status, search, scope.strategy, scope.owner]);

  return (
    <>
      <InfoBanner>
        Cases from both <b>Housing Loan CRM</b> and <b>BFD CRM</b> appear together — the badge on each
        row names the system of record.
      </InfoBanner>
      {hasScope(scope) && (
        <div className="scope-chips" data-testid="cases-scope">
          <span className="scope-chips-label">Filtered by</span>
          {scope.sourceSystem && <span className="chip sel" data-testid="scope-chip-sourceSystem">CRM: {scope.sourceSystem}</span>}
          {scope.bucket && <span className="chip sel" data-testid="scope-chip-bucket">DPD: {scope.bucket}</span>}
          {scope.caseStatus && <span className="chip sel" data-testid="scope-chip-caseStatus">Status: {scope.caseStatus}</span>}
          {scope.strategy && <span className="chip sel" data-testid="scope-chip-strategy">Strategy: {scope.strategy === 'none' ? 'Strategy Not Assigned' : scope.strategy}</span>}
          {scope.owner && <span className="chip sel" data-testid="scope-chip-owner">Owner: {scope.owner}</span>}
        </div>
      )}

      <div className="action-row" data-testid="case-filters">
        <label>
          Bucket
          <select className="fluent-select" value={bucket} onChange={e => setBucket(e.target.value)} data-testid="filter-bucket">
            <option value="">All</option>
            {Object.values(LABELS.BUCKET_LABELS).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Status
          <select className="fluent-select" value={status} onChange={e => setStatus(e.target.value)} data-testid="filter-status">
            <option value="">All</option>
            {Object.values(LABELS.CASE_STATUS_LABELS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Search
          <input
            className="fluent-input" type="search" value={search} placeholder="Case number or customer id"
            data-testid="filter-search" onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>

      <DataGrid<CaseRow, CaseQuery>
        columns={CASE_COLUMNS}
        fetchPage={fetchPage}
        query={query}
        rowKey={row => row.id}
        pageSize={50}
        emptyMessage="No open cases match these filters."
        {...(onOpenCase ? { onRowClick: (row: CaseRow) => onOpenCase(row.id) } : {})}
        data-testid="cases-grid"
      />
    </>
  );
}

/** A source system named by the scope narrows the list even when the header picker says both. */
function scopeFilterFor(sourceSystem: ReportingScope['sourceSystem'], pickerFilter: string | undefined): string | undefined {
  if (!sourceSystem) return pickerFilter;
  return `qdb_organizationcode eq ${ORG_CODES[sourceSystem]}`;
}

// ── Audit Trail ──────────────────────────────────────────────────────────────

const AUDIT_COLUMNS: readonly DataGridColumn<AuditRow>[] = [
  { key: 'when', header: 'When', width: '170px', render: r => formatDate(r.createdOn) },
  { key: 'source', header: 'Source', width: '220px', render: r => r.source ?? '—' },
  { key: 'subject', header: 'Entry', render: r => r.subject ?? '—' },
  { key: 'exception', header: '', width: '40px', render: r => (r.isException ? '!' : '') },
];

export function AuditView() {
  const { adapter } = useCrmSession();
  const [search, setSearch] = useState('');
  const fetchPage = useMemo(() => createAuditQuery(adapter), [adapter]);
  const query = useMemo<AuditQuery>(() => (search ? { search } : {}), [search]);

  return (
    <Card
      title="Audit trail"
      subtitle="Append-only technical and integration evidence. The largest table in the organisation, and never loaded whole."
    >
      <div className="action-row">
        <label>
          Source
          <input
            className="fluent-input" type="search" value={search} placeholder="Filter by source"
            data-testid="audit-search" onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>
      <DataGrid<AuditRow, AuditQuery>
        columns={AUDIT_COLUMNS}
        fetchPage={fetchPage}
        query={query}
        rowKey={row => row.id}
        pageSize={100}
        emptyMessage="No log entries match."
        data-testid="audit-grid"
      />
    </Card>
  );
}

// ── My Day ───────────────────────────────────────────────────────────────────

const PROMISE_HORIZON_DAYS = 7;

export function MyDayView({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  const { adapter, context } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [now] = useState(() => new Date());
  const requests = useMemo<readonly CountRequest[]>(
    () => myDayCountRequests({ scopeFilter, userId: context.userId, now, promiseHorizonDays: PROMISE_HORIZON_DAYS }),
    [scopeFilter, context.userId, now]);
  const counts = useCounts(adapter, requests);
  const arrears = useOpenArrears(adapter, scopeFilter);

  return (
    <>
      <InfoBanner>
        Cases from both <b>Housing Loan CRM</b> and <b>BFD CRM</b> appear together — the badge on each
        row names the system of record.
      </InfoBanner>
      {/*
        Every tile is a count the platform answered, or one server-side sum, or an em dash. The
        semantics are on the tile: what "overdue", "due" and "my" mean here is stated, not assumed.
      */}
      <KpiRow items={[
        { label: 'Open cases', value: formatCountResult(counts['open']), hint: 'In the selected CRM scope' },
        { label: 'Current arrears', value: arrears.status === 'ready' ? formatMoney(arrears.value) : '—', hint: arrears.status === 'unknown' ? 'The platform could not sum the portfolio' : 'Stored MIS position over open cases' },
        { label: 'My open work', value: formatCountResult(counts['myOpenWork']), hint: 'Open activities owned by you' },
        { label: 'Follow-ups overdue', value: formatCountResult(counts['followUpsOverdue']), tone: 'warn', hint: 'Follow-up date before now' },
        { label: 'Follow-ups upcoming', value: formatCountResult(counts['followUpsUpcoming']), hint: 'Follow-up date from now on' },
        { label: `Promises due, ${PROMISE_HORIZON_DAYS} days`, value: formatCountResult(counts['promisesDue']), hint: 'Recorded status Active; not a verified payment' },
        { label: 'Awaiting assignment', value: formatCountResult(counts['awaitingAssignment']), hint: 'Open activities with no owner' },
        { label: 'Identity exceptions', value: formatCountResult(counts['identityExceptions']), tone: 'warn', hint: 'Open, both CRMs' },
      ]} />
      <FollowUpsPanel {...(onOpenCase ? { onOpenCase } : {})} />
      <Card
        title="Open cases"
        subtitle="Open cases, worst days-past-due first. Opening one routes the read to the CRM that owns it."
      >
        <CasesView {...(onOpenCase ? { onOpenCase } : {})} />
      </Card>
    </>
  );
}

// ── Follow-ups ───────────────────────────────────────────────────────────────

const FOLLOW_UP_COLUMNS: readonly DataGridColumn<ActivityRow>[] = [
  { key: 'due', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
  { key: 'case', header: 'Case', width: '160px', render: r => r.caseNumber ?? '—' },
  { key: 'type', header: 'Type', width: '140px', render: r => r.activityType ?? '—' },
  { key: 'subject', header: 'Subject', render: r => r.subject },
  { key: 'owner', header: 'Owner', width: '150px', render: r => r.ownerName ?? '—' },
  { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
];

/** The windows an officer works in. `all` is offered so nothing is hidden by a default. */
const FOLLOW_UP_WINDOWS: readonly { id: FollowUpWindow; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'all', label: 'All' },
];

/**
 * The follow-up queue — what an officer has undertaken to do next.
 *
 * The window is a **server-side filter**, not a tab that hides rows the browser already holds: the
 * comparison against "now" is composed into `$filter` and sent, so switching window asks a new
 * question. `usePagedQuery` fingerprints the query object, so that also resets the continuation and
 * discards any in-flight answer to the previous window — the stale-response case that would
 * otherwise repaint Overdue rows under an Upcoming heading.
 *
 * `now` is pinned for the life of the panel rather than re-read on each render, so scrolling the
 * list does not silently move the boundary underneath it and drop a row between two pages.
 *
 * Opening a row goes to its case, where the Actions tab completes or updates the activity. There is
 * no separate follow-up entity: a follow-up is a date on the activity that created it, which is what
 * makes "complete the activity" and "clear the follow-up" the same act.
 */
function FollowUpsPanel({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const fetchPage = useMemo(() => createFollowUpQuery(adapter), [adapter]);
  const [window, setWindow] = useState<FollowUpWindow>('overdue');
  const [now] = useState(() => new Date());

  const query = useMemo<FollowUpQuery>(() => ({
    window, now, ...(scopeFilter ? { scopeFilter } : {}),
  }), [window, now, scopeFilter]);

  return (
    <Card
      title="Follow-ups"
      subtitle="Activities an officer has committed to return to. Completing the activity clears its follow-up."
      actions={
        <div className="chips" data-testid="followup-windows">
          {FOLLOW_UP_WINDOWS.map(option => (
            <button
              key={option.id}
              type="button"
              className={option.id === window ? 'chip sel' : 'chip'}
              data-testid={`followup-window-${option.id}`}
              onClick={() => setWindow(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <DataGrid<ActivityRow, FollowUpQuery>
        columns={FOLLOW_UP_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={50} height={320}
        {...(onOpenCase
          ? { onRowClick: (row: ActivityRow) => { if (row.caseId) onOpenCase(row.caseId); } }
          : {})}
        emptyMessage={
          window === 'overdue'
            ? 'Nothing is overdue. Follow-ups appear here once their date has passed.'
            : 'No follow-up is scheduled in this window.'
        }
        data-testid="myday-followups"
      />
    </Card>
  );
}

type ArrearsState = { status: 'loading' } | { status: 'ready'; value: number } | { status: 'unknown' };

/** One server-side sum, re-read when the scope changes; a refusal is unknown, never zero. */
function useOpenArrears(adapter: XrmCrmAdapter, scopeFilter: string | undefined): ArrearsState {
  const [state, setState] = useState<ArrearsState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadOpenArrears(adapter, scopeFilter)
      .then(value => { if (!cancelled) setState(value === null ? { status: 'unknown' } : { status: 'ready', value }); })
      .catch(() => { if (!cancelled) setState({ status: 'unknown' }); });
    return () => { cancelled = true; };
  }, [adapter, scopeFilter]);
  return state;
}

// ── Work Queues ──────────────────────────────────────────────────────────────

export function QueuesView({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  return (
    <>
      <InfoBanner icon="route">
        Queues are defined once and mirrored into both organisations. A case never leaves the CRM that
        owns it — only its <b>queue</b> and <b>owner</b> change.
      </InfoBanner>
      {/*
        * The operational read model lives here rather than in a navigation entry of its own.
        *
        * Work Queues is already the workspace's operational area, and the approved navigation is
        * twenty-one views — a twenty-second would change a contract the shell test holds. Hosting
        * it here is what "do not invent a second dashboard if the workspace can host it cleanly"
        * asks for, and the shell guard was right to insist.
        */}
      <MyWorkView {...(onOpenCase ? { onOpenCase } : {})} />
      <Card title="Queue contents" subtitle="All open cases across both organisations.">
        <CasesView {...(onOpenCase ? { onOpenCase } : {})} />
      </Card>
    </>
  );
}

// ── Views owned by a later phase ─────────────────────────────────────────────

/**
 * A view owned by a later phase.
 *
 * It keeps its navigation entry and its place in the workspace, and says which phase will implement
 * it. **No data is shown, because none would be real.**
 */
export function PendingView({ view }: { view: ViewDefinition }) {
  return (
    <div data-testid={`view-${view.id}`}>
      <PendingPhaseNotice view={view} />
      <Card title={view.label}>
        <EmptyState
          icon={view.icon}
          message={view.isParked
            ? `${view.label} is parked by QDB. The screen is preserved here so the approved workspace is complete; nothing further arrives until QDB resumes it.`
            : `${view.label} is part of Phase ${view.phase}. The screen is preserved here so the approved workspace is complete; its behaviour arrives with that phase.`}
        />
      </Card>
    </div>
  );
}
