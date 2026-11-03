import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../../data/DataGrid.js';
import {
  createActivityQuery, createPtpQuery, createSnapshotQuery,
  type ActivityQuery, type ActivityRow, type CaseDetail, type PtpRow, type SnapshotQuery, type SnapshotRow,
} from '../../data/caseQueries.js';
import { createAuditQuery, type AuditQuery, type AuditRow } from '../../data/collectionQueries.js';
import {
  BucketBar, BucketPill, Card, EmptyState, FieldList, Pivot, StatusPill, PromiseOutcome,
  formatCount, formatDate, formatMoney, type PivotTab,
} from '../../components/primitives.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';
import { ActivityDialog } from '../ActivityDialog.js';
import { PromiseDialog } from '../PromiseDialog.js';
import { CaseActionPlan } from '../strategyViews.js';
import { WorkoutLegalTab } from '../workoutLegalTab.js';
import { CommunicationCenterView } from '../CommunicationCenter.js';
import { useCrmSession } from '../../shell/context.js';

/**
 * The case's full records, one tab at a time, under the working surface.
 *
 * These are the Case Workspace's existing tabs, kept whole so nothing an officer could do before is
 * lost: every activity and promise with its own pane, the message composer and history, the full
 * Action Plan with provenance, Workout & Legal, the snapshot list, the case's stored details and its
 * audit trail. Only the active tab renders, so a tab's reads happen when it is opened.
 */
export const RECORD_TABS = ['actions', 'ptp', 'comms', 'plan', 'workout', 'history', 'details', 'audit'] as const;
export type RecordTab = (typeof RECORD_TABS)[number];

/** Old links name tabs that are now the working surface (`summary`, `overview`) or gone (`documents`). */
export function recordTabFor(requested: string | undefined): RecordTab | undefined {
  return RECORD_TABS.find(tab => tab === requested);
}

export interface RecordTabsProps {
  detail: CaseDetail;
  active: RecordTab;
  onSelect: (tab: RecordTab) => void;
  /** Re-reads the working surface after a save made inside a tab. */
  onSaved: () => void;
  comms: { onOpenComms: (caseId: string) => void; onNavigateComms: (recordId?: string, tab?: string) => void };
}

export function CaseRecordTabs(props: RecordTabsProps) {
  return (
    <div className="cw-records" id="cw-records" data-testid="cw-records">
      <Pivot tabs={tabsFor(props)} activeId={props.active} onSelect={id => props.onSelect(recordTabFor(id) ?? 'actions')} testId="case-pivot" />
    </div>
  );
}

function tabsFor({ detail, onSaved, comms }: RecordTabsProps): readonly PivotTab[] {
  return [
    { id: 'actions', label: 'Activities', render: () => <ActivitiesTab caseId={detail.id} onSaved={onSaved} /> },
    { id: 'ptp', label: 'Promises', render: () => <PromisesTab caseId={detail.id} onSaved={onSaved} /> },
    {
      id: 'comms', label: 'Communications',
      render: () => <CommunicationCenterView mode="single" caseId={detail.id} onSelectCase={comms.onOpenComms} onNavigate={comms.onNavigateComms} />,
    },
    { id: 'plan', label: 'Action Plan', render: () => <FullActionPlan detail={detail} /> },
    { id: 'workout', label: 'Resolution', render: () => <WorkoutLegalTab detail={detail} /> },
    { id: 'history', label: 'Delinquency history', render: () => <SnapshotHistory caseId={detail.id} /> },
    { id: 'details', label: 'Case details', render: () => <CaseDetailsTab detail={detail} /> },
    { id: 'audit', label: 'Audit', render: () => <CaseAuditTab detail={detail} /> },
  ];
}

function FullActionPlan({ detail }: { detail: CaseDetail }) {
  return (
    <CaseActionPlan
      caseId={detail.id}
      {...(detail.strategyId !== undefined ? { strategyId: detail.strategyId } : {})}
      {...(detail.strategyName !== undefined ? { strategyName: detail.strategyName } : {})}
      {...(detail.episodeNumber !== undefined ? { episodeNumber: detail.episodeNumber } : {})}
    />
  );
}

// ── Activities and promises ──────────────────────────────────────────────────

const ACTIVITY_COLUMNS: readonly DataGridColumn<ActivityRow>[] = [
  { key: 'date', header: 'When', width: '110px', render: r => formatDate(r.activityDate ?? r.createdOn) },
  { key: 'type', header: 'Type', width: '150px', render: r => r.activityType ?? '—' },
  { key: 'subject', header: 'Subject', isLink: true, render: r => r.subject },
  { key: 'owner', header: 'Owner', width: '160px', render: r => <OwnerLabel ownerId={r.ownerId} ownerName={r.ownerName} /> },
  { key: 'followup', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
  { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
];

/**
 * Every activity on the case, newest first, each opening in its own pane. A save closes the pane and
 * re-reads both the list (a new query, so paging restarts) and the working surface above it.
 */
function ActivitiesTab({ caseId, onSaved }: { caseId: string; onSaved: () => void }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createActivityQuery(adapter), [adapter]);
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const query = useMemo<ActivityQuery>(() => ({ caseId, reloadKey } as ActivityQuery), [caseId, reloadKey]);
  const saved = () => { setOpenId(undefined); setReloadKey(key => key + 1); onSaved(); };
  return (
    <Card title="Collection actions" subtitle="Every action recorded against this case, newest first. Log a new one from the action bar.">
      <DataGrid<ActivityRow, ActivityQuery>
        columns={ACTIVITY_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id} pageSize={50}
        onRowClick={row => setOpenId(row.id)} emptyMessage="No collection action has been recorded against this case." data-testid="case-actions"
      />
      {openId && <ActivityDialog mode="edit" caseId={caseId} activityId={openId} onClose={() => setOpenId(undefined)} onSaved={saved} />}
    </Card>
  );
}

export const PROMISE_COLUMNS: readonly DataGridColumn<PtpRow>[] = [
  { key: 'promised', header: 'Promised for', width: '120px', render: r => formatDate(r.ptpDate) },
  { key: 'amount', header: 'Amount', width: '130px', render: r => formatMoney(r.promisedAmount) },
  { key: 'type', header: 'Type', width: '90px', render: r => r.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '170px', render: r => <PromiseOutcome status={r.ptpStatus} /> },
  { key: 'received', header: 'Reported paid', width: '130px', render: r => formatMoney(r.amountReceived) },
  { key: 'paid', header: 'Reported on', width: '110px', render: r => formatDate(r.paymentReceivedDate) },
  { key: 'broken', header: 'Broken', width: '110px', render: r => formatDate(r.brokenDate) },
];

function PromisesTab({ caseId, onSaved }: { caseId: string; onSaved: () => void }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createPtpQuery(adapter), [adapter]);
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const query = useMemo<ActivityQuery>(() => ({ caseId, reloadKey } as ActivityQuery), [caseId, reloadKey]);
  const saved = () => { setOpenId(undefined); setReloadKey(key => key + 1); onSaved(); };
  return (
    <Card title="Promises to pay" subtitle="Every outcome is what a collection officer recorded, not a verified payment. Capture a new one from the action bar.">
      <DataGrid<PtpRow, ActivityQuery>
        columns={PROMISE_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id} pageSize={50}
        onRowClick={row => setOpenId(row.id)} emptyMessage="No promise to pay has been recorded against this case." data-testid="case-ptps"
      />
      {openId && <PromiseDialog mode="edit" caseId={caseId} promiseId={openId} onClose={() => setOpenId(undefined)} onSaved={saved} />}
    </Card>
  );
}

// ── Stored details and snapshots ─────────────────────────────────────────────

function CaseDetailsTab({ detail }: { detail: CaseDetail }) {
  return (
    <>
      <Card title="Case" subtitle="As the collection case records it.">
        <FieldList testId="case-summary-fields" fields={[
          { label: 'Case number', value: detail.caseNumber },
          { label: 'Status', value: <StatusPill status={detail.status} /> },
          { label: 'State', value: detail.isOpen ? 'Open' : 'Closed' },
          { label: 'Opened', value: formatDate(detail.openDate) },
          { label: 'Episode', value: formatCount(detail.episodeNumber) },
          { label: 'Owner', value: <OwnerLabel ownerId={detail.ownerId} ownerName={detail.ownerName} /> },
          { label: 'Strategy', value: detail.strategyName ?? '—' },
          { label: 'Cured on', value: formatDate(detail.cureDate) },
          { label: 'Resolution', value: detail.resolutionType ?? '—' },
          { label: 'Closed', value: formatDate(detail.closedDate) },
        ]} />
      </Card>
      <Card title="Customer and unit" subtitle="Identity as MIS supplies it; the CRM record is reached from Customer 360.">
        <FieldList testId="case-customer-fields" fields={[
          { label: 'Customer id', value: detail.customerBusinessId },
          { label: 'Customer type', value: detail.customerType ?? '—' },
          { label: 'Customer table', value: detail.customerTable ?? 'not linked' },
          { label: 'Loan Account / Facility', value: detail.facilityNumber },
          { label: 'Source system', value: detail.sourceSystem },
          { label: 'Product', value: detail.productDescription ?? detail.productTypeCode ?? '—' },
        ]} />
      </Card>
      <Card title="Position" subtitle="What MIS last reported. Not a live read — direct MIS access is not available yet.">
        <FieldList testId="case-position-fields" fields={[
          { label: 'Instalment', value: formatMoney(detail.installmentAmount) },
          { label: 'MIS as of', value: formatDate(detail.misAsOfDate) },
          { label: 'Last synchronised', value: formatDate(detail.lastMisSyncOn) },
        ]} />
      </Card>
    </>
  );
}

const SNAPSHOT_COLUMNS: readonly DataGridColumn<SnapshotRow>[] = [
  { key: 'date', header: 'As of', width: '110px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{formatDate(r.snapshotDate)}</span> },
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
    <Card title="Delinquency history" subtitle="Every MIS position stored for this case, newest first.">
      <DataGrid<SnapshotRow, SnapshotQuery>
        columns={SNAPSHOT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id} pageSize={50} height={280}
        emptyMessage="No MIS snapshot has been recorded against this case." data-testid="case-snapshots"
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
 * The technical trail for this case, found by its correlation id (`qdb_crmlogs` carries no case
 * lookup). A case without one has no trail to find, and the tab says so.
 */
function CaseAuditTab({ detail }: { detail: CaseDetail }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createAuditQuery(adapter), [adapter]);
  const query = useMemo<AuditQuery>(() => (detail.correlationId ? { correlationId: detail.correlationId } : {}), [detail.correlationId]);
  if (!detail.correlationId) {
    return (
      <Card title="Audit">
        <EmptyState icon="audit" message="This case carries no correlation id, so no technical trail can be attributed to it. The full trail is on the Audit Trail screen." />
      </Card>
    );
  }
  return (
    <Card title="Audit" subtitle={`Technical entries correlated to ${detail.correlationId}.`}>
      <DataGrid<AuditRow, AuditQuery>
        columns={AUDIT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id} pageSize={50}
        emptyMessage="No log entry carries this case's correlation id." data-testid="case-audit"
      />
    </Card>
  );
}
