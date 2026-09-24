import { useMemo } from 'react';
import {
  createActivityQuery, createPtpQuery, createSnapshotQuery,
  type ActivityQuery, type ActivityRow, type PtpRow, type SnapshotQuery, type SnapshotRow, type CaseDetail,
} from '../../../data/caseQueries.js';
import { createAuditQuery, type AuditQuery, type AuditRow } from '../../../data/collectionQueries.js';
import {
  PromiseOutcome, StatusPill, formatCount, formatDate, formatMoney,
} from '../../../components/primitives.js';
import { useCrmSession } from '../../../shell/context.js';
import { BucketBadge, Card, EmptyState } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';

/**
 * The case's lists. Each is a server-paged, virtualised read through the shared query modules — the
 * same reads V1 makes — and `reloadKey` is part of the query, so a save re-reads from the first page.
 * Statuses are drawn by V1's own status components, so both workspaces name a status the same way.
 */

const ACTIVITY_COLUMNS: readonly V2Column<ActivityRow>[] = [
  { key: 'date', header: 'When', width: '110px', render: r => formatDate(r.activityDate ?? r.createdOn) },
  { key: 'type', header: 'Type', width: '170px', render: r => r.activityType ?? '—' },
  { key: 'subject', header: 'Subject', render: r => r.subject },
  { key: 'owner', header: 'Owner', width: '170px', render: r => r.ownerName ?? '—' },
  { key: 'followup', header: 'Follow-up', width: '110px', render: r => formatDate(r.followUpDate) },
  { key: 'status', header: 'Status', width: '130px', render: r => <StatusPill status={r.status} /> },
];

export function ActivitiesTab({ caseId, reloadKey, onOpen, onLog }: {
  caseId: string; reloadKey: number; onOpen: (activityId: string) => void; onLog?: (() => void) | undefined;
}) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createActivityQuery(adapter), [adapter]);
  const query = useMemo(() => ({ caseId, reloadKey } as ActivityQuery), [caseId, reloadKey]);
  return (
    <Card
      title="Activities"
      subtitle="Every action recorded against this case, newest first. Open one to work it."
      actions={onLog && <button type="button" className="v2-btn v2-btn-primary" onClick={onLog}>Log action</button>}
      flush
    >
      <V2DataGrid<ActivityRow, ActivityQuery>
        columns={ACTIVITY_COLUMNS} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        onRowOpen={r => onOpen(r.id)} rowLabel={r => `Open activity ${r.subject}`}
        emptyTitle="No action has been recorded on this case yet." testId="v2-case-activities"
      />
    </Card>
  );
}

const PTP_COLUMNS: readonly V2Column<PtpRow>[] = [
  { key: 'promised', header: 'Promised for', width: '120px', render: r => formatDate(r.ptpDate) },
  { key: 'amount', header: 'Amount', width: '130px', numeric: true, render: r => formatMoney(r.promisedAmount) },
  { key: 'type', header: 'Type', width: '100px', render: r => r.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '170px', render: r => <PromiseOutcome status={r.ptpStatus} /> },
  { key: 'received', header: 'Reported paid', width: '130px', numeric: true, render: r => formatMoney(r.amountReceived) },
  { key: 'paid', header: 'Reported on', width: '110px', render: r => formatDate(r.paymentReceivedDate) },
];

export function PromisesTab({ caseId, reloadKey, onOpen, onCapture }: {
  caseId: string; reloadKey: number; onOpen: (promiseId: string) => void; onCapture?: (() => void) | undefined;
}) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createPtpQuery(adapter), [adapter]);
  const query = useMemo(() => ({ caseId, reloadKey } as ActivityQuery), [caseId, reloadKey]);
  return (
    <Card
      title="Promises to pay"
      subtitle="Each outcome is what an officer recorded — not a verified payment."
      actions={onCapture && <button type="button" className="v2-btn v2-btn-primary" onClick={onCapture}>Capture PTP</button>}
      flush
    >
      <V2DataGrid<PtpRow, ActivityQuery>
        columns={PTP_COLUMNS} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        onRowOpen={r => onOpen(r.id)} rowLabel={r => `Open promise for ${formatDate(r.ptpDate)}`}
        emptyTitle="No promise to pay has been recorded on this case." testId="v2-case-promises"
      />
    </Card>
  );
}

const SNAPSHOT_COLUMNS: readonly V2Column<SnapshotRow>[] = [
  { key: 'date', header: 'As of', width: '110px', render: r => formatDate(r.snapshotDate) },
  { key: 'received', header: 'Received', width: '110px', render: r => formatDate(r.receivedOn) },
  { key: 'dpd', header: 'DPD', width: '80px', numeric: true, render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '120px', render: r => <BucketBadge bucket={r.bucket} /> },
  { key: 'arrears', header: 'Arrears', width: '140px', numeric: true, render: r => formatMoney(r.totalArrears) },
  { key: 'balance', header: 'Balance', width: '140px', numeric: true, render: r => formatMoney(r.loanBalance) },
  { key: 'outcome', header: 'Eligibility', render: r => r.eligibilityOutcome ?? '—' },
];

/** Historical positions as stored snapshots — MIS's past reports, never the current live figure. */
export function HistoryTab({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const query = useMemo<SnapshotQuery>(() => ({ caseId }), [caseId]);
  return (
    <Card title="Delinquency history" subtitle="Each row is a stored MIS snapshot — a past report, not a live read." flush>
      <V2DataGrid<SnapshotRow, SnapshotQuery>
        columns={SNAPSHOT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        emptyTitle="No MIS snapshot has been recorded against this case." testId="v2-case-history"
      />
    </Card>
  );
}

const AUDIT_COLUMNS: readonly V2Column<AuditRow>[] = [
  { key: 'when', header: 'When', width: '130px', render: r => formatDate(r.createdOn) },
  { key: 'source', header: 'Source', width: '240px', render: r => r.source ?? '—' },
  { key: 'subject', header: 'Entry', render: r => r.subject ?? '—' },
];

/** The technical trail, found by correlation id — the log carries no case lookup. */
export function AuditTab({ detail }: { detail: CaseDetail }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createAuditQuery(adapter), [adapter]);
  const query = useMemo<AuditQuery>(() => (detail.correlationId ? { correlationId: detail.correlationId } : {}), [detail.correlationId]);
  if (!detail.correlationId) {
    return (
      <Card title="Audit">
        <EmptyState
          title="No technical trail can be attributed to this case."
          message="It carries no correlation id. The full trail is on the Audit Trail screen."
        />
      </Card>
    );
  }
  return (
    <Card title="Audit" subtitle={`Technical entries correlated to ${detail.correlationId}.`} flush>
      <V2DataGrid<AuditRow, AuditQuery>
        columns={AUDIT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={r => r.id}
        emptyTitle="No log entry carries this case's correlation id." testId="v2-case-audit"
      />
    </Card>
  );
}
