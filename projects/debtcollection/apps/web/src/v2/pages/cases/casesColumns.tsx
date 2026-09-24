import type { Sort } from '@dcp/domain';
import type { CaseRow } from '../../../data/collectionQueries.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../../components/primitives.js';
import { BucketBadge, BucketDot } from '../../components/primitives.js';
import type { GridSort, V2Column } from '../../components/V2DataGrid.js';
import { STRATEGY_NOT_ASSIGNED_LABEL } from '../../data/portfolioMatrix.js';

/**
 * What a case row looks like in each layout, and the orders the list may ask for.
 *
 * Both layouts render the same `CaseRow` from the same query: the Grid shows every approved data
 * point in a column, the Split list shows the four an officer scans by — who, which case, how late,
 * how much — and leaves the rest to the preview.
 */

export type CaseSortKey = 'dpd' | 'arrears' | 'balance' | 'newest' | 'caseNumber' | 'product';

/** Every order offered is a source column the organisation was seen to sort by. */
export const CASE_SORTS: Readonly<Record<CaseSortKey, { label: string; sort: GridSort }>> = {
  dpd: { label: 'Worst DPD first', sort: { field: 'qdb_currentdpd', descending: true } },
  arrears: { label: 'Highest arrears first', sort: { field: 'qdb_currenttotalarrears', descending: true } },
  balance: { label: 'Highest loan balance first', sort: { field: 'qdb_currentloanbalance', descending: true } },
  newest: { label: 'Newest first', sort: { field: 'createdon', descending: true } },
  caseNumber: { label: 'Case number', sort: { field: 'qdb_casenumber', descending: false } },
  product: { label: 'Product', sort: { field: 'qdb_productdescription', descending: false } },
};

/** Makes the order total: two cases can share a DPD, but never an id. */
export const TIE_BREAKER: Sort = { field: 'qdb_collectioncaseid', descending: false };

export function toSourceSort(sort: GridSort): readonly Sort[] {
  return [{ field: sort.field, descending: sort.descending }, TIE_BREAKER];
}

/** The select option that names this order, if one does — a header can sort by a column no option names. */
export function sortKeyOf(sort: GridSort): CaseSortKey | undefined {
  return (Object.keys(CASE_SORTS) as CaseSortKey[]).find(key => CASE_SORTS[key].sort.field === sort.field);
}

const customerName = (row: CaseRow) => row.customerName ?? row.customerBusinessId;

export const GRID_COLUMNS: readonly V2Column<CaseRow>[] = [
  {
    key: 'customer', header: 'Customer', width: '200px', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{customerName(row)}</span>
        <span className="v2-two-line-sub">{row.customerBusinessId}</span>
      </span>
    ),
  },
  {
    key: 'case', header: 'Case', width: '170px', sortField: 'qdb_casenumber', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{row.caseNumber}</span>
        <span className="v2-two-line-sub">Facility {row.facilityNumber}</span>
      </span>
    ),
  },
  { key: 'crm', header: 'CRM', width: '70px', render: row => <OrgBadge org={row.organization} /> },
  { key: 'product', header: 'Product', width: '150px', sortField: 'qdb_productdescription', render: row => row.productDescription ?? '—' },
  { key: 'bucket', header: 'Bucket', width: '120px', render: row => <BucketBadge bucket={row.bucket} /> },
  { key: 'dpd', header: 'DPD', width: '72px', numeric: true, sortField: 'qdb_currentdpd', render: row => formatCount(row.dpd) },
  { key: 'arrears', header: 'Current arrears', width: '130px', numeric: true, sortField: 'qdb_currenttotalarrears', render: row => formatMoney(row.totalArrears) },
  { key: 'balance', header: 'Loan balance', width: '130px', numeric: true, sortField: 'qdb_currentloanbalance', render: row => formatMoney(row.loanBalance) },
  { key: 'strategy', header: 'Strategy', width: '160px', render: row => <StrategyName name={row.strategyName} /> },
  { key: 'status', header: 'Status', width: '150px', render: row => <StatusPill status={row.status} /> },
  { key: 'owner', header: 'Owner', render: row => row.ownerName ?? '—' },
];

export const SPLIT_COLUMNS: readonly V2Column<CaseRow>[] = [
  {
    key: 'case', header: 'Case', render: row => (
      <span className="v2-case-row">
        <BucketDot bucket={row.bucket} />
        <span className="v2-two-line">
          <span className="v2-two-line-main">{customerName(row)}</span>
          <span className="v2-two-line-sub">{row.caseNumber} · {row.sourceSystem} · <BucketBadge bucket={row.bucket} /></span>
        </span>
      </span>
    ),
  },
  { key: 'arrears', header: 'Arrears', width: '120px', numeric: true, render: row => formatMoney(row.totalArrears) },
];

export function StrategyName({ name }: { name?: string | undefined }) {
  return name ? <>{name}</> : <span className="v2-muted">{STRATEGY_NOT_ASSIGNED_LABEL}</span>;
}
