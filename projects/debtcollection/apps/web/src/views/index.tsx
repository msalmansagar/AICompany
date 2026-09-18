import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createAuditQuery, createCaseQuery, LABELS, type AuditRow, type CaseQuery, type CaseRow,
} from '../data/collectionQueries.js';
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

      <div className="filter-bar" data-testid="case-filters">
        <label>
          Bucket
          <select value={bucket} onChange={e => setBucket(e.target.value)} data-testid="filter-bucket">
            <option value="">All</option>
            {Object.values(LABELS.BUCKET_LABELS).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={e => setStatus(e.target.value)} data-testid="filter-status">
            <option value="">All</option>
            {Object.values(LABELS.CASE_STATUS_LABELS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Search
          <input
            type="search" value={search} placeholder="Case number or customer id"
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
  const query = useMemo(() => (search ? { search } : {}), [search]);

  return (
    <Card
      title="Audit trail"
      subtitle="Append-only technical and integration evidence. The largest table in the organisation, and never loaded whole."
    >
      <div className="filter-bar">
        <label>
          Source
          <input
            type="search" value={search} placeholder="Filter by source"
            data-testid="audit-search" onChange={e => setSearch(e.target.value)}
          />
        </label>
      </div>
      <DataGrid<AuditRow, { search?: string }>
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
  return (
    <>
      <InfoBanner>
        Cases from both <b>Housing Loan CRM</b> and <b>BFD CRM</b> appear together — the badge on each
        row names the system of record.
      </InfoBanner>
      {/*
        The prototype's KPI tiles were mock figures. Real bounded counts arrive with the per-KPI
        queries; until a KPI has one, it shows an em dash rather than an invented number.
      */}
      <KpiRow items={[
        { label: 'My open cases', value: '—', hint: 'Bounded count' },
        { label: 'Overdue balance', value: '—' },
        { label: 'Due today', value: '—' },
        { label: 'SLA breached', value: '—', tone: 'warn' },
        { label: 'Promised this week', value: '—' },
      ]} />
      <Card
        title="Today's follow-ups"
        subtitle="Ordered by remaining SLA. Opening a case routes the read to the owning CRM."
      >
        <CasesView {...(onOpenCase ? { onOpenCase } : {})} />
      </Card>
    </>
  );
}

// ── Work Queues ──────────────────────────────────────────────────────────────

export function QueuesView({ onOpenCase }: { onOpenCase?: (id: string) => void }) {
  return (
    <>
      <InfoBanner icon="route">
        Queues are defined once and mirrored into both organisations. A case never leaves the CRM that
        owns it — only its <b>queue</b> and <b>owner</b> change.
      </InfoBanner>
      <Card title="Queue contents" subtitle="All open cases across both organisations.">
        <CasesView {...(onOpenCase ? { onOpenCase } : {})} />
      </Card>
    </>
  );
}

// ── Views whose backing exists but whose functionality is later ──────────────

export function ReadOnlyPlaceholder({ view, children }: { view: ViewDefinition; children?: React.ReactNode }) {
  return (
    <>
      {view.pendingSummary && <PendingPhaseNotice view={view} />}
      {children}
    </>
  );
}

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

/** Simple read views that have a real backing table but whose authoring belongs to a later phase. */
export function SimpleReadView({ view, description }: { view: ViewDefinition; description: string }) {
  return (
    <div data-testid={`view-${view.id}`}>
      {view.pendingSummary && <PendingPhaseNotice view={view} />}
      <Card title={view.label} subtitle={description}>
        <EmptyState icon={view.icon} message="Connected to its configuration table; the list arrives with this view's data wiring." />
      </Card>
    </div>
  );
}
