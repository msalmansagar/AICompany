import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '../data/DataGrid.js';
import { createCustomerListQuery, type CustomerListQuery, type CustomerListRow, type CustomerSortKey } from '../data/customerListQuery.js';
import { Card, InfoBanner, OrgBadge, formatCount, formatMoney } from '../components/primitives.js';
import { ListToolbar, SplitLayout, useListLayout } from '../components/listLayout.js';
import { useCrmSession, useOrg } from '../shell/context.js';
import { CustomerPreview } from './previews.js';

/**
 * Customers with arrears — the Customer & Loan 360 landing list.
 *
 * Every customer named by an open collection case, one row each, with the platform's own count of
 * their cases and sum of their positions (`customerListQuery`). There is still no customer master:
 * the row is an aggregate over cases, and opening it opens the same Customer 360 a case leads to.
 * **Split** previews the customer's position beside the list; **Grid** opens the Customer 360.
 */

const SORTS: readonly { key: CustomerSortKey; label: string }[] = [
  { key: 'arrears', label: 'Most overdue first' },
  { key: 'dpd', label: 'Worst DPD first' },
  { key: 'cases', label: 'Most cases first' },
  { key: 'name', label: 'Name' },
];

const GRID_COLUMNS: readonly DataGridColumn<CustomerListRow>[] = [
  { key: 'name', header: 'Customer', render: r => r.customerName ?? r.customerBusinessId },
  { key: 'id', header: 'Customer id', width: '150px', render: r => r.customerBusinessId },
  { key: 'org', header: 'CRM', width: '110px', render: r => <span className="row-actions">{r.organizations.map(org => <OrgBadge key={org} org={org} />)}</span> },
  { key: 'cases', header: 'Open cases', width: '100px', numeric: true, render: r => formatCount(r.caseCount) },
  { key: 'dpd', header: 'Worst DPD', width: '100px', numeric: true, render: r => formatCount(r.worstDpd) },
  { key: 'arrears', header: 'Total overdue', width: '140px', numeric: true, render: r => formatMoney(r.totalArrears) },
  { key: 'exposure', header: 'Total exposure', width: '140px', numeric: true, render: r => formatMoney(r.totalExposure) },
];

const SPLIT_COLUMNS: readonly DataGridColumn<CustomerListRow>[] = [
  {
    key: 'customer', header: 'Customer', render: r => (
      <span className="two-line">
        <span className="two-line-main">{r.customerName ?? r.customerBusinessId}</span>
        <span className="two-line-sub">{r.customerBusinessId} · {formatCount(r.caseCount)} {r.caseCount === 1 ? 'case' : 'cases'} · {formatCount(r.worstDpd)} DPD</span>
      </span>
    ),
  },
  { key: 'arrears', header: 'Overdue', width: '120px', numeric: true, render: r => formatMoney(r.totalArrears) },
];

const LAYOUT_KEY = 'dcp.v1.customersLayout';

export function CustomersView({ onOpenCustomer, onOpenCase }: {
  onOpenCustomer: (customerBusinessId: string) => void;
  onOpenCase: (caseId: string) => void;
}) {
  const { adapter } = useCrmSession();
  const { scopeFilter } = useOrg();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<CustomerSortKey>('arrears');
  const [layout, chooseLayout] = useListLayout(LAYOUT_KEY);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const fetchPage = useMemo(() => createCustomerListQuery(adapter), [adapter]);
  const query = useMemo<CustomerListQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    sortKey,
  }), [scopeFilter, search, sortKey]);

  return (
    <div data-testid="view-customers">
      <InfoBanner icon="users">
        Every customer with an open collection case, across both CRMs. The figures are the platform&apos;s own
        count and sum over those cases — this workspace keeps <b>no customer master of its own</b>.
      </InfoBanner>
      <Card title="Customers with arrears" subtitle="Open a customer to see everything known about them, gathered from their cases.">
        <ListToolbar layout={layout} onChangeLayout={chooseLayout} testId="customers-toolbar">
          <label>
            Search
            <input
              className="fluent-input" type="search" value={search} placeholder="Customer name, id, case or facility"
              data-testid="customers-search" onChange={e => setSearch(e.target.value)}
            />
          </label>
          <label>
            Sort
            <select className="fluent-select" value={sortKey} onChange={e => setSortKey(e.target.value as CustomerSortKey)} data-testid="customers-sort">
              {SORTS.map(sort => <option key={sort.key} value={sort.key}>{sort.label}</option>)}
            </select>
          </label>
        </ListToolbar>
        {layout === 'grid' && (
          <DataGrid<CustomerListRow, CustomerListQuery>
            columns={GRID_COLUMNS} fetchPage={fetchPage} query={query}
            rowKey={row => row.customerBusinessId} pageSize={50}
            onRowClick={row => onOpenCustomer(row.customerBusinessId)}
            emptyMessage="No customer has an open collection case in this CRM scope."
            data-testid="customers-grid"
          />
        )}
        {layout === 'split' && (
          <SplitLayout
            testId="customers-split"
            list={(
              <DataGrid<CustomerListRow, CustomerListQuery>
                columns={SPLIT_COLUMNS} fetchPage={fetchPage} query={query}
                rowKey={row => row.customerBusinessId} pageSize={50} rowHeight={58} height={600}
                selectedKey={selectedId} onRowClick={row => setSelectedId(row.customerBusinessId)}
                emptyMessage="No customer has an open collection case in this CRM scope."
                data-testid="customers-list"
              />
            )}
            preview={<CustomerPreview customerBusinessId={selectedId} onOpen={onOpenCustomer} onOpenCase={onOpenCase} />}
          />
        )}
      </Card>
    </div>
  );
}
