import { useEffect, useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import {
  createActivityQuery, createPtpQuery, createSnapshotQuery, retrieveCase,
  type ActivityQuery, type ActivityRow, type CaseDetail, type PtpRow, type SnapshotQuery, type SnapshotRow,
} from '../data/caseQueries.js';
import { createAuditQuery, type AuditQuery, type AuditRow } from '../data/collectionQueries.js';
import {
  BucketPill, Card, EmptyState, FieldList, OrgBadge, PendingPhasePanel, Pivot, StatusPill,
  formatCount, formatDate, formatMoney, type PivotTab,
} from '../components/primitives.js';
import { StoredPositionNotice } from '../components/Freshness.js';
import { useCrmSession } from '../shell/context.js';

/**
 * The Case Workspace — the approved seven tabs, all present.
 *
 * Summary and Audit are Phase 5's. Actions and PTP are **readable** here because the records already
 * exist and hiding them would be less honest than showing them; capturing and evaluating them is
 * Phase 6. Communications, Documents and Workout & Legal have no records to show and say so.
 *
 * Nothing on this screen decides anything. The status is the status the server set, the bucket is the
 * bucket MIS reported, and the strategy is the one the server resolved. There is no transition, no
 * eligibility check and no threshold in this file.
 */

const TAB_IDS = ['summary', 'actions', 'ptp', 'comms', 'documents', 'workout', 'audit'] as const;

export function CaseWorkspaceView({ caseId, onOpenCustomer }: {
  caseId?: string | undefined;
  onOpenCustomer?: (customerBusinessId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const [tab, setTab] = useState<string>(TAB_IDS[0]);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'missing' | 'error'; detail?: CaseDetail; error?: Error }>(
    { status: caseId ? 'loading' : 'missing' },
  );

  useEffect(() => {
    if (!caseId) { setState({ status: 'missing' }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    retrieveCase(adapter, caseId)
      .then(detail => {
        if (cancelled) return;
        setState(detail ? { status: 'ready', detail } : { status: 'missing' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => { cancelled = true; };
  }, [adapter, caseId]);

  if (!caseId) {
    return (
      <Card title="Case Detail">
        <EmptyState icon="doc" message="Open a case from Collection Cases, Work Queues or My Day to see it here." />
      </Card>
    );
  }
  if (state.status === 'loading') return <div className="empty-state" data-testid="case-loading">Loading case…</div>;
  if (state.status === 'error') {
    return (
      <Card title="Case Detail">
        <EmptyState icon="warn" message={state.error?.message ?? 'The case could not be read.'} />
      </Card>
    );
  }
  if (state.status === 'missing' || !state.detail) {
    return (
      <Card title="Case Detail">
        <EmptyState icon="warn" message={`No collection case with id ${caseId} could be read in this CRM session.`} />
      </Card>
    );
  }

  const detail = state.detail;
  return (
    <div data-testid="view-case" data-case-id={detail.id}>
      <CaseHeader detail={detail} {...(onOpenCustomer ? { onOpenCustomer } : {})} />
      <Pivot tabs={tabsFor(detail)} activeId={tab} onSelect={setTab} testId="case-pivot" />
    </div>
  );
}

function tabsFor(detail: CaseDetail): readonly PivotTab[] {
  return [
    { id: 'summary', label: 'Summary', render: () => <SummaryTab detail={detail} /> },
    { id: 'actions', label: 'Actions', render: () => <ActionsTab caseId={detail.id} /> },
    { id: 'ptp', label: 'PTP', render: () => <PtpTab caseId={detail.id} /> },
    {
      id: 'comms', label: 'Communications', pendingPhase: 7,
      render: () => (
        <PendingPhasePanel
          phase={7}
          what={'SMS, WhatsApp, email and warning letters are Phase 7. Nothing here sends anything, and no send is simulated.'}
        />
      ),
    },
    {
      id: 'documents', label: 'Documents', pendingPhase: 7,
      render: () => <PendingPhasePanel phase={7} what="Document generation and storage arrive with the Communication Centre in Phase 7." />,
    },
    {
      id: 'workout', label: 'Workout & Legal', pendingPhase: 9,
      render: () => <PendingPhasePanel phase={9} what="Restructuring, legal referral and claims are Phase 9. No entity exists for any of them yet." />,
    },
    { id: 'audit', label: 'Audit', render: () => <CaseAuditTab detail={detail} /> },
  ];
}

// ── Header ───────────────────────────────────────────────────────────────────

function CaseHeader({ detail, onOpenCustomer }: {
  detail: CaseDetail;
  onOpenCustomer?: (customerBusinessId: string) => void;
}) {
  return (
    <Card
      title={detail.caseNumber}
      subtitle={`Facility ${detail.facilityNumber} · episode ${formatCount(detail.episodeNumber)}`}
      actions={
        onOpenCustomer
          ? (
            <button
              type="button" className="btn" data-testid="open-customer-360"
              onClick={() => onOpenCustomer(detail.customerBusinessId)}
            >
              Customer 360
            </button>
          )
          : undefined
      }
    >
      <div className="action-row">
        <OrgBadge org={detail.organization} />
        <StatusPill status={detail.status} />
        <BucketPill bucket={detail.bucket} />
        <span className="chip">{formatMoney(detail.totalArrears)} overdue</span>
        <span className="chip">{formatCount(detail.dpd)} DPD</span>
      </div>
      <StoredPositionNotice asOf={detail.misAsOfDate} syncedOn={detail.lastMisSyncOn} />
    </Card>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function SummaryTab({ detail }: { detail: CaseDetail }) {
  return (
    <>
      <Card title="Case" subtitle="As the collection case records it.">
        <FieldList
          testId="case-summary-fields"
          fields={[
            { label: 'Case number', value: detail.caseNumber },
            { label: 'Status', value: <StatusPill status={detail.status} /> },
            { label: 'State', value: detail.isOpen ? 'Open' : 'Closed' },
            { label: 'Opened', value: formatDate(detail.openDate) },
            { label: 'Episode', value: formatCount(detail.episodeNumber) },
            { label: 'Owner', value: detail.ownerName ?? '—' },
            { label: 'Strategy', value: detail.strategyName ?? '—' },
            { label: 'Cured on', value: formatDate(detail.cureDate) },
            { label: 'Resolution', value: detail.resolutionType ?? '—' },
            { label: 'Closed', value: formatDate(detail.closedDate) },
          ]}
        />
      </Card>

      <Card title="Customer and facility" subtitle="Identity as MIS supplies it; the CRM record is reached from Customer 360.">
        <FieldList
          testId="case-customer-fields"
          fields={[
            { label: 'Customer id', value: detail.customerBusinessId },
            { label: 'Customer type', value: detail.customerType ?? '—' },
            { label: 'Customer table', value: detail.customerTable ?? 'not linked' },
            { label: 'Facility', value: detail.facilityNumber },
            { label: 'Source system', value: detail.sourceSystem },
            { label: 'Product', value: detail.productDescription ?? detail.productTypeCode ?? '—' },
          ]}
        />
      </Card>

      <Card
        title="Position"
        subtitle="What MIS last reported for this facility. Not a live read — the MIS transport contract is pending (KI-53)."
      >
        <FieldList
          testId="case-position-fields"
          fields={[
            { label: 'DPD', value: formatCount(detail.dpd) },
            { label: 'Bucket', value: <BucketPill bucket={detail.bucket} /> },
            { label: 'Total arrears', value: formatMoney(detail.totalArrears) },
            { label: 'Loan balance', value: formatMoney(detail.loanBalance) },
            { label: 'Instalment', value: formatMoney(detail.installmentAmount) },
            { label: 'MIS as of', value: formatDate(detail.misAsOfDate) },
            { label: 'Last synchronised', value: formatDate(detail.lastMisSyncOn) },
          ]}
        />
        <SnapshotHistory caseId={detail.id} />
      </Card>
    </>
  );
}

const SNAPSHOT_COLUMNS: readonly DataGridColumn<SnapshotRow>[] = [
  { key: 'date', header: 'As of', width: '110px', render: r => formatDate(r.snapshotDate) },
  { key: 'received', header: 'Received', width: '110px', render: r => formatDate(r.receivedOn) },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'arrears', header: 'Arrears', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'balance', header: 'Balance', width: '130px', render: r => formatMoney(r.loanBalance) },
  { key: 'outcome', header: 'Eligibility', render: r => r.eligibilityOutcome ?? '—' },
];

function SnapshotHistory({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const query = useMemo<SnapshotQuery>(() => ({ caseId }), [caseId]);
  return (
    <DataGrid<SnapshotRow, SnapshotQuery>
      columns={SNAPSHOT_COLUMNS} fetchPage={fetchPage} query={query}
      rowKey={row => row.id} pageSize={50} height={280}
      emptyMessage="No MIS snapshot has been recorded against this case."
      data-testid="case-snapshots"
    />
  );
}

// ── Actions and promises ─────────────────────────────────────────────────────

const ACTIVITY_COLUMNS: readonly DataGridColumn<ActivityRow>[] = [
  { key: 'date', header: 'When', width: '110px', render: r => formatDate(r.activityDate ?? r.createdOn) },
  { key: 'type', header: 'Type', width: '150px', render: r => r.activityType ?? '—' },
  { key: 'subject', header: 'Subject', render: r => r.subject },
  { key: 'owner', header: 'Owner', width: '160px', render: r => r.ownerName ?? '—' },
  { key: 'followup', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
  { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
];

function ActionsTab({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createActivityQuery(adapter), [adapter]);
  const query = useMemo<ActivityQuery>(() => ({ caseId }), [caseId]);
  return (
    <Card
      title="Collection actions"
      subtitle="Every action recorded against this case. Logging a new one is Phase 6."
    >
      <DataGrid<ActivityRow, ActivityQuery>
        columns={ACTIVITY_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={50}
        emptyMessage="No collection action has been recorded against this case."
        data-testid="case-actions"
      />
    </Card>
  );
}

export const PTP_COLUMNS: readonly DataGridColumn<PtpRow>[] = [
  { key: 'promised', header: 'Promised for', width: '120px', render: r => formatDate(r.ptpDate) },
  { key: 'amount', header: 'Amount', width: '130px', render: r => formatMoney(r.promisedAmount) },
  { key: 'type', header: 'Type', width: '90px', render: r => r.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '130px', render: r => <StatusPill status={r.ptpStatus} /> },
  { key: 'received', header: 'Received', width: '130px', render: r => formatMoney(r.amountReceived) },
  { key: 'paid', header: 'Paid on', width: '110px', render: r => formatDate(r.paymentReceivedDate) },
  { key: 'broken', header: 'Broken', width: '110px', render: r => formatDate(r.brokenDate) },
];

function PtpTab({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createPtpQuery(adapter), [adapter]);
  const query = useMemo<ActivityQuery>(() => ({ caseId }), [caseId]);
  return (
    <Card
      title="Promises to pay"
      subtitle="Promises recorded against this case. Capture, reminders and kept/broken evaluation are Phase 6."
    >
      <DataGrid<PtpRow, ActivityQuery>
        columns={PTP_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={50}
        emptyMessage="No promise to pay has been recorded against this case."
        data-testid="case-ptps"
      />
    </Card>
  );
}

// ── Audit ────────────────────────────────────────────────────────────────────

const AUDIT_COLUMNS: readonly DataGridColumn<AuditRow>[] = [
  { key: 'when', header: 'When', width: '170px', render: r => formatDate(r.createdOn) },
  { key: 'source', header: 'Source', width: '220px', render: r => r.source ?? '—' },
  { key: 'subject', header: 'Entry', render: r => r.subject ?? '—' },
];

/**
 * The technical trail for this case.
 *
 * `qdb_crmlogs` carries the correlation id rather than a case lookup, so the trail is found by that
 * id. A case with no correlation id has no trail to find, and the screen says so instead of showing
 * the whole log and implying it belongs here.
 */
function CaseAuditTab({ detail }: { detail: CaseDetail }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createAuditQuery(adapter), [adapter]);
  const query = useMemo<AuditQuery>(
    () => (detail.correlationId ? { correlationId: detail.correlationId } : {}),
    [detail.correlationId],
  );

  if (!detail.correlationId) {
    return (
      <Card title="Audit">
        <EmptyState
          icon="audit"
          message="This case carries no correlation id, so no technical trail can be attributed to it. The full trail is on the Audit Trail screen."
        />
      </Card>
    );
  }
  return (
    <Card title="Audit" subtitle={`Technical entries correlated to ${detail.correlationId}.`}>
      <DataGrid<AuditRow, AuditQuery>
        columns={AUDIT_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={50}
        emptyMessage="No log entry carries this case's correlation id."
        data-testid="case-audit"
      />
    </Card>
  );
}
