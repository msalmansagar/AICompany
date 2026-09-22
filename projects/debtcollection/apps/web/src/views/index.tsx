import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createAuditQuery, createCaseQuery, LABELS, type AuditQuery, type AuditRow, type CaseQuery, type CaseRow,
} from '../data/collectionQueries.js';
import { createFollowUpQuery, type FollowUpQuery, type FollowUpWindow } from '../data/followUpQueries.js';
import type { ActivityRow } from '../data/caseQueries.js';
import { formatCountResult, useCounts, type CountRequest } from '../data/counts.js';
import { ENTITY_SETS } from '../data/schema.js';
import { MyWorkView } from './MyWorkView.js';
import {
  BucketPill, Card, EmptyState, InfoBanner, KpiRow, OrgBadge, PendingPhaseNotice, StatusPill,
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
  { key: 'case', header: 'Case', width: '160px', render: r => r.caseNumber },
  { key: 'org', header: 'CRM', width: '70px', render: r => <OrgBadge org={r.organization} /> },
  { key: 'customer', header: 'Customer', width: '150px', render: r => r.customerBusinessId },
  { key: 'facility', header: 'Facility', width: '140px', render: r => r.facilityNumber },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'arrears', header: 'Overdue', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'status', header: 'Status', width: '150px', render: r => <StatusPill status={r.status} /> },
];

export function CasesView({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [bucket, setBucket] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const fetchPage = useMemo(() => createCaseQuery(adapter), [adapter]);

  // The query object is the question. A change to any part of it restarts paging, which is exactly
  // what should happen — the engine discards the continuation rather than paging into a population
  // the user stopped asking about.
  const query = useMemo<CaseQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(bucket ? { bucket } : {}),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
    openOnly: true,
    sort: [{ field: 'qdb_currentdpd', descending: true }],
  }), [scopeFilter, bucket, status, search]);

  return (
    <>
      <InfoBanner>
        Cases from both <b>Housing Loan CRM</b> and <b>BFD CRM</b> appear together — the badge on each
        row names the system of record.
      </InfoBanner>

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

export function MyDayView({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const requests = useMemo<readonly CountRequest[]>(() => myDayCounts(scopeFilter), [scopeFilter]);
  const counts = useCounts(adapter, requests);

  return (
    <>
      <InfoBanner>
        Cases from both <b>Housing Loan CRM</b> and <b>BFD CRM</b> appear together — the badge on each
        row names the system of record.
      </InfoBanner>
      {/*
        The prototype's KPI tiles were mock figures. A tile here is either a count the platform
        answered or an em dash naming the phase that will supply it. Overdue balance needs a sum over
        the portfolio, which the Web API does not compute and which must not be faked by adding up one
        page of rows.
      */}
      <KpiRow items={[
        { label: 'Open cases', value: formatCountResult(counts['open']) },
        { label: 'Overdue balance', value: '—', hint: 'Needs portfolio aggregation (Phase 10)' },
        { label: 'Active promises', value: formatCountResult(counts['ptpActive']) },
        { label: 'Broken promises', value: formatCountResult(counts['ptpBroken']), tone: 'warn' },
        { label: 'SLA breached', value: '—', hint: 'Needs the SLA model (Phase 8)' },
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

/**
 * My Day's counts.
 *
 * "My" is deliberately absent: the workspace does not filter by the signed-in user's id here, because
 * ownership on a case is a CRM owner and the correct question is one CRM already answers through its
 * own views. Counting "cases owned by me" from the browser would encode an assignment rule, and
 * assignment is Smart Assignment's (KI-09). These are portfolio counts within the active scope.
 */
function myDayCounts(scopeFilter: string | undefined): readonly CountRequest[] {
  const and = (clause: string) => (scopeFilter ? `${scopeFilter} and ${clause}` : clause);
  return [
    { key: 'open', entitySet: ENTITY_SETS.collectionCase, filter: and('statecode eq 0') },
    { key: 'ptpActive', entitySet: ENTITY_SETS.collectionCase, filter: and('statuscode eq 100000604') },
    { key: 'ptpBroken', entitySet: ENTITY_SETS.collectionCase, filter: and('statuscode eq 100000605') },
  ];
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
      <MyWorkView />
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
          message={`${view.label} is part of Phase ${view.phase}. The screen is preserved here so the approved workspace is complete; its behaviour arrives with that phase.`}
        />
      </Card>
    </div>
  );
}
