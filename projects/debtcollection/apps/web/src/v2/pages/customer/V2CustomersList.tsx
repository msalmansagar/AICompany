import { useEffect, useMemo, useState } from 'react';
import { createCustomerListQuery, type CustomerListQuery, type CustomerListRow, type CustomerSortKey } from '../../../data/customerListQuery.js';
import { loadCustomerAggregate, type CustomerAggregate } from '../../../data/customerAggregate.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../../components/primitives.js';
import { describeFailure } from '../../../platform/errors.js';
import { useCrmSession, useOrg } from '../../../shell/context.js';
import { readLayout, writeLayout, type ListLayout } from '../../../data/layoutPreference.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { Card, EmptyState, ErrorState, KeyValueList, LoadingSkeleton } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { initialsOf } from '../case/CaseHeader.js';

/**
 * Customers with arrears, V2 — the Customer 360 landing list, in the same two layouts as Collection
 * Cases. The rows are the one customer aggregate V1 lists (`customerListQuery`): this is a second
 * presentation of it, never a second read. **Split** previews the customer's position beside the
 * list; **Grid** opens their Customer 360.
 */

const LAYOUT_KEY = 'dcp.v2.customersLayout';

const SORTS: readonly { key: CustomerSortKey; label: string }[] = [
  { key: 'arrears', label: 'Most overdue first' },
  { key: 'dpd', label: 'Worst DPD first' },
  { key: 'cases', label: 'Most cases first' },
  { key: 'name', label: 'Name' },
];

export function V2CustomersList({ onOpenCustomer, onOpenCase }: {
  onOpenCustomer: (customerBusinessId: string) => void;
  onOpenCase: (caseId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('arrears');
  const [layout, setLayout] = useState<ListLayout>(() => readLayout(LAYOUT_KEY));
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const settledSearch = useDebounced(search.trim(), 300);

  const fetchPage = useMemo(() => createCustomerListQuery(adapter), [adapter]);
  const query = useMemo<CustomerListQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(settledSearch ? { search: settledSearch } : {}),
    sortKey,
  }), [scopeFilter, settledSearch, sortKey]);

  useEffect(() => { setSelectedId(undefined); }, [query]);

  const chooseLayout = (next: ListLayout) => { setLayout(next); writeLayout(LAYOUT_KEY, next); };
  const summary = `Customers with an open case · ${SORTS.find(sort => sort.key === sortKey)?.label.toLowerCase() ?? ''}`;

  return (
    <div className="v2-cases" data-testid="v2-customers" data-layout={layout}>
      <Card flush>
        <div className="v2-toolbar">
          <div className="v2-toolbar-row">
            <input
              className="v2-input" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Customer name, id, case or facility" aria-label="Search customers by name, business id, case number or facility number" data-testid="v2-customers-search"
            />
            <label className="v2-picker">
              <span className="v2-picker-label">Sort</span>
              <select className="v2-select" value={sortKey} onChange={e => setSortKey(e.target.value as CustomerSortKey)} data-testid="v2-customers-sort">
                {SORTS.map(sort => <option key={sort.key} value={sort.key}>{sort.label}</option>)}
              </select>
            </label>
            <div className="v2-segmented v2-toolbar-end" role="group" aria-label="Layout">
              {(['split', 'grid'] as const).map(option => (
                <button key={option} type="button" className="v2-segment" aria-pressed={layout === option} onClick={() => chooseLayout(option)} data-testid={`v2-customers-layout-${option}`}>
                  {option === 'split' ? 'Split' : 'Grid'}
                </button>
              ))}
            </div>
          </div>
          <p className="v2-toolbar-note">Every customer named by an open collection case. The figures are the platform&apos;s count and sum over those cases — there is no customer master.</p>
        </div>

        {layout === 'grid' && (
          <V2DataGrid<CustomerListRow, CustomerListQuery>
            columns={GRID_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.customerBusinessId}
            onRowOpen={row => onOpenCustomer(row.customerBusinessId)} rowLabel={row => `Open customer ${row.customerName ?? row.customerBusinessId}`}
            summary={summary} isFiltered={Boolean(settledSearch)} emptyTitle="No customer has an open collection case in this CRM scope."
            height={560} testId="v2-customers-grid" fitsWidth
          />
        )}
        {layout === 'split' && (
          <div className="v2-split">
            <div className="v2-split-list">
              <V2DataGrid<CustomerListRow, CustomerListQuery>
                columns={SPLIT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.customerBusinessId}
                onRowOpen={row => setSelectedId(row.customerBusinessId)} selectedKey={selectedId ?? ''} onSelectFirst={row => setSelectedId(row.customerBusinessId)}
                rowLabel={row => `Preview customer ${row.customerName ?? row.customerBusinessId}`} summary={summary}
                isFiltered={Boolean(settledSearch)} emptyTitle="No customer has an open collection case in this CRM scope."
                rowHeight={58} height={640} testId="v2-customers-list" fitsWidth
              />
            </div>
            <V2CustomerPreview customerBusinessId={selectedId} onOpen={onOpenCustomer} onOpenCase={onOpenCase} />
          </div>
        )}
      </Card>
    </div>
  );
}

const GRID_COLUMNS: readonly V2Column<CustomerListRow>[] = [
  {
    key: 'customer', header: 'Customer', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{row.customerName ?? row.customerBusinessId}</span>
        <span className="v2-two-line-sub">{row.customerBusinessId}</span>
      </span>
    ),
  },
  { key: 'org', header: 'CRM', width: '100px', render: row => <span className="v2-badges">{row.organizations.map(org => <OrgBadge key={org} org={org} />)}</span> },
  { key: 'cases', header: 'Open cases', width: '100px', numeric: true, render: row => formatCount(row.caseCount) },
  { key: 'dpd', header: 'Worst DPD', width: '100px', numeric: true, render: row => formatCount(row.worstDpd) },
  { key: 'arrears', header: 'Total overdue', width: '130px', numeric: true, render: row => formatMoney(row.totalArrears) },
  { key: 'exposure', header: 'Total exposure', width: '130px', numeric: true, render: row => formatMoney(row.totalExposure) },
];

const SPLIT_COLUMNS: readonly V2Column<CustomerListRow>[] = [
  {
    key: 'customer', header: 'Customer', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{row.customerName ?? row.customerBusinessId}</span>
        <span className="v2-two-line-sub">{row.customerBusinessId} · {formatCount(row.caseCount)} {row.caseCount === 1 ? 'case' : 'cases'} · {formatCount(row.worstDpd)} DPD</span>
      </span>
    ),
  },
  { key: 'arrears', header: 'Overdue', width: '110px', numeric: true, render: row => formatMoney(row.totalArrears) },
];

type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; aggregate: CustomerAggregate };

/** The Customer 360 aggregate in brief, read on demand — never from the row. */
function V2CustomerPreview({ customerBusinessId, onOpen, onOpenCase }: {
  customerBusinessId: string | undefined;
  onOpen: (customerBusinessId: string) => void;
  onOpenCase: (caseId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    if (!customerBusinessId) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    loadCustomerAggregate(adapter, customerBusinessId)
      .then(aggregate => { if (!cancelled) setState({ status: 'ready', aggregate }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'error', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, customerBusinessId]);

  if (!customerBusinessId) {
    return <div className="v2-split-preview"><EmptyState title="Choose a customer to preview their position." message="Open Customer 360 shows everything known about them." testId="v2-customer-preview-empty" /></div>;
  }
  if (state.status === 'loading') return <div className="v2-split-preview"><LoadingSkeleton rows={6} label="Loading the customer" testId="v2-customer-preview-loading" /></div>;
  if (state.status === 'error') return <div className="v2-split-preview"><ErrorState title="This customer could not be read." message={state.message} testId="v2-customer-preview-error" /></div>;

  const { aggregate } = state;
  const name = aggregate.profile?.displayName ?? customerBusinessId;
  const partial = aggregate.position.source === 'rows' && !aggregate.isComplete ? ' (partial)' : '';
  return (
    <div className="v2-split-preview" data-testid="v2-customer-preview" data-customer-id={customerBusinessId}>
      <div className="v2-preview-head">
        <span className="v2-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="v2-preview-names">
          <h2 className="v2-preview-name" data-testid="v2-customer-preview-name">{name}</h2>
          <p className="v2-preview-sub">{customerBusinessId}{aggregate.profile ? ` · ${aggregate.profile.table === 'contact' ? 'Housing Loan contact' : 'BFD account'}` : ' · no linked CRM record'}</p>
        </div>
        <button type="button" className="v2-btn v2-btn-primary" onClick={() => onOpen(customerBusinessId)} data-testid="v2-customer-preview-open">Open Customer 360</button>
      </div>
      <KeyValueList testId="v2-customer-preview-fields" items={[
        { label: `Total overdue${partial}`, value: formatMoney(aggregate.position.totalOverdue) },
        { label: `Total exposure${partial}`, value: formatMoney(aggregate.position.totalExposure) },
        { label: 'Worst DPD', value: formatCount(aggregate.position.worstDpd) },
        { label: 'Open cases', value: formatCount(aggregate.position.openCases) },
        { label: 'Loan accounts / facilities', value: formatCount(aggregate.financialUnits.length) },
        { label: 'Mobile', value: aggregate.profile?.mobile ?? '—' },
      ]} />
      <ul className="v2-list" data-testid="v2-customer-preview-cases">
        {aggregate.cases.map(c => (
          <li key={c.id} className="v2-list-row">
            <span className="v2-list-main">
              <span className="v2-list-title"><OrgBadge org={c.organization} /> {c.caseNumber}</span>
              <span className="v2-list-meta">{formatCount(c.dpd)} DPD · {formatMoney(c.totalArrears)}</span>
            </span>
            <StatusPill status={c.status} />
            <button type="button" className="v2-btn v2-btn-subtle" onClick={() => onOpenCase(c.id)} aria-label={`Open case ${c.caseNumber}`}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
