import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import { createSnapshotQuery, createPtpQuery, type ActivityQuery, type PtpRow, type SnapshotQuery, type SnapshotRow } from '../data/caseQueries.js';
import { createIdentityExceptionQuery, type IdentityExceptionRow } from '../data/configurationQueries.js';
import { countMatching, formatCountResult, useCounts, type CountRequest } from '../data/counts.js';
import { ENTITY_SETS } from '../data/schema.js';
import {
  BucketBar, BucketPill, Card, InfoBanner, KpiRow, OrgBadge, PartialCapabilityNotice, PromiseOutcome, StatusPill,
  formatCount, formatDate, formatMoney,
} from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * Delinquency Intake, Promise to Pay and Dashboards.
 *
 * What these three have in common is that their numbers are **counted by the platform** rather than
 * computed here. Every KPI is a `$count` against a filter; a tile with no count shows an em dash and
 * a hint saying which phase will supply it. The prototype's figures were mock data, and a plausible
 * invented number is harder to catch than a blank one.
 */

// ── Delinquency Intake ───────────────────────────────────────────────────────

const SNAPSHOT_COLUMNS: readonly DataGridColumn<SnapshotRow>[] = [
  { key: 'received', header: 'Received', width: '110px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{formatDate(r.receivedOn)}</span> },
  { key: 'asof', header: 'As of', width: '110px', render: r => formatDate(r.snapshotDate) },
  { key: 'customer', header: 'Customer', width: '140px', render: r => r.customerBusinessId ?? '—' },
  { key: 'facility', header: 'Facility', width: '150px', render: r => r.facilityNumber ?? '—' },
  { key: 'source', header: 'Source', width: '90px', render: r => <OrgBadge org={r.sourceSystem} /> },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'arrears', header: 'Arrears', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'outcome', header: 'Eligibility', render: r => r.eligibilityOutcome ?? '—' },
  { key: 'batch', header: 'Batch', width: '160px', render: r => r.batchId ?? '—' },
];

const EXCEPTION_COLUMNS: readonly DataGridColumn<IdentityExceptionRow>[] = [
  { key: 'received', header: 'Received', width: '110px', render: r => formatDate(r.receivedDate) },
  { key: 'customer', header: 'Customer id', width: '150px', render: r => r.customerBusinessId ?? '—' },
  { key: 'facility', header: 'Facility', width: '150px', render: r => r.facilityNumber ?? '—' },
  { key: 'source', header: 'Source', width: '110px', render: r => r.source ?? '—' },
  { key: 'reason', header: 'Issue', render: r => r.reason ?? '—' },
  { key: 'status', header: 'Status', width: '120px', render: r => <StatusPill status={r.status} /> },
  { key: 'resolution', header: 'Resolution', width: '200px', render: r => r.resolution ?? '—' },
];

export function DelinquencyIntakeView() {
  const { adapter } = useCrmSession();
  const fetchSnapshots = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const fetchExceptions = useMemo(() => createIdentityExceptionQuery(adapter), [adapter]);
  const [openOnly, setOpenOnly] = useState(true);

  const counts = useCounts(adapter, INTAKE_COUNTS);
  const snapshotQuery = useMemo<SnapshotQuery>(() => ({}), []);
  const exceptionQuery = useMemo(() => ({ openOnly }), [openOnly]);

  return (
    <div data-testid="view-intake">
      <InfoBanner icon="refresh">
        Intake records what MIS reported and what could not be matched. <b>These are stored positions,
        not a live MIS read</b> — direct MIS access is not available yet, so no screen
        in this phase can show live portfolio figures.
      </InfoBanner>
      <KpiRow items={[
        { label: 'Snapshots recorded', value: formatCountResult(counts['snapshots']) },
        { label: 'Open cases', value: formatCountResult(counts['openCases']) },
        { label: 'Identity exceptions', value: formatCountResult(counts['openExceptions']), tone: 'warn' },
        { label: 'Read today', value: '—', hint: 'A synchronisation run report (Phase 4 service, not yet surfaced)' },
        { label: 'Failed', value: '—', hint: 'A synchronisation run report' },
      ]} />

      <Card title="Snapshots" subtitle="Every delinquency position recorded, newest first.">
        <DataGrid<SnapshotRow, SnapshotQuery>
          columns={SNAPSHOT_COLUMNS} fetchPage={fetchSnapshots} query={snapshotQuery}
          rowKey={row => row.id} pageSize={50} height={380}
          emptyMessage="No delinquency snapshot has been recorded in this organisation."
          data-testid="intake-snapshots"
        />
      </Card>

      <Card
        title="Identity exceptions"
        subtitle="Facilities and customers intake could not match. Each one is a case that was not created."
        actions={
          <label className="chip">
            <input
              type="checkbox" checked={openOnly} data-testid="exceptions-open-only"
              onChange={event => setOpenOnly(event.target.checked)}
            />
            Open only
          </label>
        }
      >
        <DataGrid<IdentityExceptionRow, { openOnly?: boolean }>
          columns={EXCEPTION_COLUMNS} fetchPage={fetchExceptions} query={exceptionQuery}
          rowKey={row => row.id} pageSize={50} height={320}
          emptyMessage="No identity exception is recorded."
          data-testid="intake-exceptions"
        />
      </Card>
    </div>
  );
}

const INTAKE_COUNTS: readonly CountRequest[] = [
  { key: 'snapshots', entitySet: ENTITY_SETS.delinquencySnapshot },
  { key: 'openCases', entitySet: ENTITY_SETS.collectionCase, filter: 'statecode eq 0' },
  { key: 'openExceptions', entitySet: ENTITY_SETS.identityException, filter: 'statecode eq 0' },
];

// ── Promise to Pay ───────────────────────────────────────────────────────────

const PTP_LIST_COLUMNS: readonly DataGridColumn<PtpRow>[] = [
  { key: 'promised', header: 'Promised for', width: '130px', render: r => <span className="row-lead"><BucketBar bucket={r.caseBucket} />{formatDate(r.ptpDate)}</span> },
  { key: 'case', header: 'Case', width: '160px', render: r => r.caseNumber ?? '—' },
  { key: 'amount', header: 'Amount', width: '130px', render: r => formatMoney(r.promisedAmount) },
  { key: 'type', header: 'Type', width: '90px', render: r => r.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '170px', render: r => <PromiseOutcome status={r.ptpStatus} /> },
  { key: 'received', header: 'Reported paid', width: '130px', render: r => formatMoney(r.amountReceived) },
  { key: 'owner', header: 'Captured by', width: '160px', render: r => r.ownerName ?? '—' },
];

export function PromiseToPayView({ view, onOpenCase }: {
  view: ViewDefinition;
  onOpenCase?: (id: string) => void;
}) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createPtpQuery(adapter), [adapter]);
  const counts = useCounts(adapter, PTP_COUNTS);
  const query = useMemo<ActivityQuery>(() => ({}), []);

  return (
    <div data-testid="view-ptp">
      <InfoBanner icon="promise">
        Every outcome here is <b>what a collection officer recorded</b>. Nothing on this screen has been
        verified against a payment: payment data is not available to this application yet, so a promise
        marked Kept means the customer said they paid, not that the money arrived.
      </InfoBanner>
      <PartialCapabilityNotice view={view} />
      <KpiRow items={[
        { label: 'Promises recorded', value: formatCountResult(counts['allPtps']) },
        { label: 'Active', value: formatCountResult(counts['activePtps']) },
        { label: 'Kept', value: formatCountResult(counts['keptPtps']), tone: 'ok' },
        { label: 'Broken', value: formatCountResult(counts['brokenPtps']), tone: 'bad' },
        // A rate is a calculation over two counts either of which may be capped, so it is left to the
        // phase that owns PTP evaluation rather than derived from figures that may be floors.
        // A rate over two counts either of which may be capped, and a number that would read as a
        // verified collection statistic. Automatic evaluation needs the MIS payment contract.
        { label: 'Kept rate', value: '—', hint: 'Needs verified payment data' },
      ]} />
      <Card
        title="Promises"
        subtitle="Every promise recorded across both organisations. Open one to work it on its case."
      >
        <DataGrid<PtpRow, ActivityQuery>
          columns={PTP_LIST_COLUMNS} fetchPage={fetchPage} query={query}
          rowKey={row => row.id} pageSize={50}
          {...(onOpenCase ? { onRowClick: (row: PtpRow) => { if (row.caseId) onOpenCase(row.caseId); } } : {})}
          emptyMessage="No promise to pay has been recorded."
          data-testid="ptp-grid"
        />
      </Card>
    </div>
  );
}

/** PTP status option values, as provisioned and proven by the Phase 2 live smoke. */
const PTP_COUNTS: readonly CountRequest[] = [
  { key: 'allPtps', entitySet: ENTITY_SETS.collectionActivity, filter: 'qdb_ptpdate ne null' },
  { key: 'activePtps', entitySet: ENTITY_SETS.collectionActivity, filter: 'qdb_ptpstatus eq 100000080' },
  { key: 'keptPtps', entitySet: ENTITY_SETS.collectionActivity, filter: 'qdb_ptpstatus eq 100000081' },
  { key: 'brokenPtps', entitySet: ENTITY_SETS.collectionActivity, filter: 'qdb_ptpstatus eq 100000083' },
];

// Dashboards moved to `ReportingDashboardsView` in Phase 10: Report Engine compositions, not bounded counts.

export { countMatching };
