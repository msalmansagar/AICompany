import { useEffect, useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import { loadCustomerAggregate, type CustomerAggregate, type FacilitySummary } from '../data/customerAggregate.js';
import { createSnapshotQuery, type SnapshotQuery, type SnapshotRow } from '../data/caseQueries.js';
import {
  BucketBar, BucketPill, Card, EmptyState, FieldList, InfoBanner, KpiRow, OrgBadge, StatusPill,
  formatCount, formatDate, formatMoney,
} from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';
import { CasesView } from './index.js';

/**
 * Customer & Loan 360 — everything known about one customer, gathered rather than stored.
 *
 * The screen is an aggregation over records that already exist: the CRM customer (a contact for
 * Housing Loan, an account for BFD), the collection cases that name that customer's business id, and
 * the MIS snapshots recorded against them. **It creates no customer master and no facility master**,
 * which is the standing architectural constraint and not an implementation shortcut.
 *
 * Collateral, guarantor and insurance appear in the approved design and have **no canonical field**
 * anywhere in the platform. They are shown as *not yet sourced* rather than dropped, because adding
 * columns for them would be a schema change, and inventing values would be worse than either.
 */

const NOT_SOURCED = 'not yet sourced';

export function Customer360View({ customerBusinessId, onOpenCase }: {
  customerBusinessId?: string | undefined;
  onOpenCase?: (caseId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    aggregate?: CustomerAggregate;
    error?: Error;
  }>({ status: customerBusinessId ? 'loading' : 'idle' });

  useEffect(() => {
    if (!customerBusinessId) { setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    loadCustomerAggregate(adapter, customerBusinessId)
      .then(aggregate => { if (!cancelled) setState({ status: 'ready', aggregate }); })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => { cancelled = true; };
  }, [adapter, customerBusinessId]);

  if (!customerBusinessId) return <CustomerPicker {...(onOpenCase ? { onOpenCase } : {})} />;
  if (state.status === 'loading') {
    return <div className="empty-state" data-testid="customer-loading">Loading customer…</div>;
  }
  if (state.status === 'error') {
    return (
      <Card title="Customer & Loan 360">
        <EmptyState icon="warn" message={state.error?.message ?? 'The customer could not be read.'} />
      </Card>
    );
  }
  if (!state.aggregate || state.aggregate.cases.length === 0) {
    return (
      <Card title="Customer & Loan 360">
        <EmptyState
          icon="users"
          message={`No collection case names customer ${customerBusinessId}, so there is nothing to aggregate.`}
        />
      </Card>
    );
  }

  return <CustomerAggregateView aggregate={state.aggregate} {...(onOpenCase ? { onOpenCase } : {})} />;
}

/**
 * How a customer is chosen.
 *
 * There is no customer list to browse, because there is no frontend customer master to browse. A
 * customer is reached through a case, which is also how an officer actually works.
 */
function CustomerPicker({ onOpenCase }: { onOpenCase?: (caseId: string) => void }) {
  return (
    <>
      <InfoBanner icon="users">
        A customer is reached through one of their cases. This workspace keeps <b>no customer master of
        its own</b> — the record lives in the CRM that owns it, as a contact for Housing Loan and an
        account for BFD.
      </InfoBanner>
      <Card title="Open a case to see its customer">
        <CasesView {...(onOpenCase ? { onOpenCase } : {})} />
      </Card>
    </>
  );
}

function CustomerAggregateView({ aggregate, onOpenCase }: {
  aggregate: CustomerAggregate;
  onOpenCase?: (caseId: string) => void;
}) {
  const partial = !aggregate.isComplete;
  return (
    <div data-testid="view-customer" data-customer-id={aggregate.customerBusinessId}>
      {partial && (
        <InfoBanner icon="warn">
          This customer has more cases than one page holds, so the totals below cover the cases read
          and are <b>partial</b>. They are not this customer&apos;s full exposure.
        </InfoBanner>
      )}
      <KpiRow items={[
        { label: 'Total exposure', value: formatMoney(aggregate.totalExposure), ...(partial ? { hint: 'Partial' } : {}) },
        { label: 'Total overdue', value: formatMoney(aggregate.totalOverdue), ...(partial ? { hint: 'Partial' } : {}), tone: 'warn' },
        { label: 'Facilities', value: formatCount(aggregate.facilities.length) },
        { label: 'Cases', value: formatCount(aggregate.openCaseCount) },
        { label: 'Worst DPD', value: formatCount(aggregate.worstDpd) },
        { label: 'Risk grade', value: '—', hint: NOT_SOURCED },
      ]} />

      <CustomerIdentity aggregate={aggregate} />
      <FacilitiesCard aggregate={aggregate} {...(onOpenCase ? { onOpenCase } : {})} />
      <SnapshotsCard customerBusinessId={aggregate.customerBusinessId} />
    </div>
  );
}

function CustomerIdentity({ aggregate }: { aggregate: CustomerAggregate }) {
  const profile = aggregate.profile;
  if (!profile) {
    return (
      <Card title="Customer">
        <EmptyState
          icon="users"
          message={`Customer ${aggregate.customerBusinessId} has cases but no linked CRM record. That is an identity exception, not an empty screen — Delinquency Intake lists them.`}
        />
      </Card>
    );
  }
  return (
    <Card
      title={profile.displayName}
      subtitle={`${profile.table === 'contact' ? 'Contact' : 'Account'} in the CRM that owns this customer`}
    >
      <FieldList
        testId="customer-fields"
        fields={[
          { label: 'Customer id', value: aggregate.customerBusinessId },
          { label: 'Customer table', value: profile.table },
          { label: 'State', value: profile.isActive ? 'Active' : 'Inactive' },
          { label: 'Phone', value: profile.phone ?? '—' },
          { label: 'Mobile', value: profile.mobile ?? '—' },
          { label: 'Email', value: profile.email ?? '—' },
          { label: 'City', value: profile.city ?? '—' },
        ]}
      />
    </Card>
  );
}

// ── Facilities ───────────────────────────────────────────────────────────────

const FACILITY_COLUMNS: readonly DataGridColumn<FacilitySummary>[] = [
  { key: 'facility', header: 'Facility', width: '150px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{r.facilityNumber}</span> },
  { key: 'org', header: 'CRM', width: '70px', render: r => <OrgBadge org={r.organization} /> },
  { key: 'balance', header: 'Outstanding', width: '130px', render: r => formatMoney(r.loanBalance) },
  { key: 'overdue', header: 'Overdue', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'case', header: 'Case', width: '150px', render: r => r.caseNumber },
  { key: 'status', header: 'Status', width: '140px', render: r => <StatusPill status={r.caseStatus} /> },
  // The approved design's remaining three columns. No canonical field exists for any of them, so
  // they are present and honest rather than absent or invented.
  { key: 'collateral', header: 'Collateral', width: '120px', render: () => <NotSourced /> },
  { key: 'guarantor', header: 'Guarantor', width: '120px', render: () => <NotSourced /> },
  { key: 'insurance', header: 'Insurance', width: '120px', render: () => <NotSourced /> },
];

function NotSourced() {
  return <span className="not-sourced" title="No canonical field exists for this yet (Phase 9)">{NOT_SOURCED}</span>;
}

function FacilitiesCard({ aggregate, onOpenCase }: {
  aggregate: CustomerAggregate;
  onOpenCase?: (caseId: string) => void;
}) {
  return (
    <Card
      title="Facilities"
      subtitle="One row per facility this customer has a collection case for. A facility is MIS identity carried on the case, never a CRM record."
    >
      <table className="grid" data-testid="customer-facilities">
        <thead>
          <tr>{FACILITY_COLUMNS.map(column => <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {aggregate.facilities.map(facility => (
            <tr
              key={facility.facilityNumber}
              data-facility={facility.facilityNumber}
              {...(onOpenCase ? { onClick: () => onOpenCase(facility.caseId), className: 'clickable' } : {})}
            >
              {FACILITY_COLUMNS.map(column => <td key={column.key}>{column.render(facility)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ── Snapshot history ─────────────────────────────────────────────────────────

const SNAPSHOT_COLUMNS: readonly DataGridColumn<SnapshotRow>[] = [
  { key: 'date', header: 'As of', width: '110px', render: r => <span className="row-lead"><BucketBar bucket={r.bucket} />{formatDate(r.snapshotDate)}</span> },
  { key: 'facility', header: 'Facility', width: '150px', render: r => r.facilityNumber ?? '—' },
  { key: 'dpd', header: 'DPD', width: '70px', render: r => formatCount(r.dpd) },
  { key: 'bucket', header: 'Bucket', width: '110px', render: r => <BucketPill bucket={r.bucket} /> },
  { key: 'arrears', header: 'Arrears', width: '130px', render: r => formatMoney(r.totalArrears) },
  { key: 'balance', header: 'Balance', width: '130px', render: r => formatMoney(r.loanBalance) },
  { key: 'outcome', header: 'Eligibility', render: r => r.eligibilityOutcome ?? '—' },
];

function SnapshotsCard({ customerBusinessId }: { customerBusinessId: string }) {
  const { adapter } = useCrmSession();
  const fetchPage = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const query = useMemo<SnapshotQuery>(() => ({ customerBusinessId }), [customerBusinessId]);
  return (
    <Card
      title="MIS history"
      subtitle="Positions MIS reported for this customer's facilities. Stored values, not a live MIS read."
    >
      <DataGrid<SnapshotRow, SnapshotQuery>
        columns={SNAPSHOT_COLUMNS} fetchPage={fetchPage} query={query}
        rowKey={row => row.id} pageSize={50} height={320}
        emptyMessage="No MIS snapshot has been recorded for this customer."
        data-testid="customer-snapshots"
      />
    </Card>
  );
}
