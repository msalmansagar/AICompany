import { useEffect, useMemo, useState } from 'react';
import type { Sort } from '@dcp/domain';
import { createCaseQuery, type CaseQuery, type CaseRow } from '../../../data/collectionQueries.js';
import { BUCKET_LABELS, CASE_STATUS_LABELS } from '../../../data/schema.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../../components/primitives.js';
import { useCrmSession, useOrg } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketBadge, Card, FilterChips } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import {
  FILTER_SEGMENT, decodeCaseListFilters, encodeCaseListFilters, hasCaseListFilters, type CaseListFilters,
} from '../../data/caseListFilterUrl.js';
import { STRATEGY_NOT_ASSIGNED, STRATEGY_NOT_ASSIGNED_LABEL } from '../../data/portfolioMatrix.js';

/**
 * Collection Cases V2 — choose a case to work.
 *
 * Every filter, the search and the sort are sent to the source as part of the query; changing any of
 * them asks a new question, resets paging and discards an older in-flight answer. Each sort carries a
 * unique tie-breaker, so pages stay in a stable order even when many cases share a DPD. A search typed
 * into the header arrives here once and is shown like any other filter.
 */

type SortKey = 'dpd' | 'arrears' | 'newest';

const SORTS: Readonly<Record<SortKey, { label: string; sort: readonly Sort[] }>> = {
  dpd: { label: 'Worst DPD first', sort: [{ field: 'qdb_currentdpd', descending: true }] },
  arrears: { label: 'Highest arrears first', sort: [{ field: 'qdb_currenttotalarrears', descending: true }] },
  newest: { label: 'Newest first', sort: [{ field: 'createdon', descending: true }] },
};

/** Makes the order total: two cases can share a DPD, but never an id. */
const TIE_BREAKER: Sort = { field: 'qdb_collectioncaseid', descending: false };

export function V2CasesPage({ request }: { request: ViewRequest }) {
  const { adapter } = useCrmSession();
  const { scope, scopeFilter, setScope } = useOrg();
  const shell = useV2Shell();
  // Filters that arrived in the URL — from Portfolio & Strategy, a bookmark or a refresh.
  const urlFilters = useMemo<CaseListFilters>(
    () => (request.recordId === FILTER_SEGMENT ? decodeCaseListFilters(request.tab) : {}),
    [request.recordId, request.tab]);
  const [search, setSearch] = useState(shell.search);
  const [bucket, setBucket] = useState(urlFilters.bucket ?? '');
  const [status, setStatus] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('dpd');
  const settledSearch = useDebounced(search.trim(), 300);

  // The header's search is handed over once, then released so it does not come back later.
  useEffect(() => {
    if (!shell.search) return;
    setSearch(shell.search);
    shell.setSearch('');
  }, [shell]);

  // The URL is the record of what narrows the list: when it changes, the list follows it, including
  // the CRM scope it names, so a cell opened for HL shows HL whatever the picker said before.
  useEffect(() => {
    setBucket(urlFilters.bucket ?? '');
    if (urlFilters.scope && urlFilters.scope !== scope) setScope(urlFilters.scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFilters]);

  const writeUrlFilters = (next: CaseListFilters) => {
    const kept: CaseListFilters = { ...next, ...(urlFilters.from ? { from: urlFilters.from } : {}) };
    if (hasCaseListFilters(kept)) shell.go('cases', FILTER_SEGMENT, encodeCaseListFilters(kept));
    else shell.go('cases');
  };
  const chooseBucket = (next: string) => {
    if (request.recordId === FILTER_SEGMENT) writeUrlFilters({ ...urlFilters, bucket: next || undefined });
    else setBucket(next);
  };

  const fetchPage = useMemo(() => createCaseQuery(adapter), [adapter]);
  const query = useMemo<CaseQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(bucket ? { bucket } : {}),
    ...(status ? { status } : {}),
    ...(settledSearch ? { search: settledSearch } : {}),
    ...(urlFilters.strategy ? { strategy: urlFilters.strategy } : {}),
    openOnly: true,
    sort: [...SORTS[sortKey].sort, TIE_BREAKER],
  }), [scopeFilter, bucket, status, settledSearch, sortKey, urlFilters.strategy]);

  const activeFilters = [bucket, status, settledSearch, urlFilters.strategy].filter(Boolean).length;
  const clearAll = () => {
    setStatus(''); setSearch('');
    if (request.recordId === FILTER_SEGMENT) writeUrlFilters({}); else setBucket('');
  };
  const strategyChip = urlFilters.strategy === STRATEGY_NOT_ASSIGNED
    ? STRATEGY_NOT_ASSIGNED_LABEL
    : urlFilters.strategyLabel ?? urlFilters.strategy;

  return (
    <div className="v2-cases" data-testid="v2-cases">
      <Card flush>
        <div className="v2-toolbar">
          {request.recordId === FILTER_SEGMENT && hasCaseListFilters(urlFilters) && (
            <div className="v2-filtered-by" data-testid="v2-cases-filtered-by">
              <span className="v2-chips-label">Filtered by</span>
              {urlFilters.bucket && (
                <span className="v2-filter-chip" data-testid="v2-filter-chip-bucket">
                  DPD: {urlFilters.bucket}
                  <button type="button" className="v2-filter-chip-remove" aria-label={`Remove the DPD ${urlFilters.bucket} filter`} onClick={() => writeUrlFilters({ ...urlFilters, bucket: undefined })}>×</button>
                </span>
              )}
              {urlFilters.strategy && (
                <span className="v2-filter-chip" data-testid="v2-filter-chip-strategy">
                  Strategy: {strategyChip}
                  <button type="button" className="v2-filter-chip-remove" aria-label={`Remove the strategy filter ${strategyChip}`} onClick={() => writeUrlFilters({ ...urlFilters, strategy: undefined, strategyLabel: undefined })}>×</button>
                </span>
              )}
              {urlFilters.scope && urlFilters.scope !== 'all' && (
                <span className="v2-filter-chip" data-testid="v2-filter-chip-scope">
                  CRM: {urlFilters.scope === 'HL' ? 'Housing Loan' : 'BFD'}
                  <button type="button" className="v2-filter-chip-remove" aria-label="Remove the CRM filter" onClick={() => { setScope('all'); writeUrlFilters({ ...urlFilters, scope: undefined }); }}>×</button>
                </span>
              )}
              <button type="button" className="v2-btn v2-btn-subtle" onClick={clearAll} data-testid="v2-cases-clear-url">Clear all</button>
              {urlFilters.from === 'portfolio' && (
                <button type="button" className="v2-btn v2-btn-subtle" onClick={() => shell.go('buckets')} data-testid="v2-cases-back-portfolio">← Back to Portfolio &amp; Strategy</button>
              )}
            </div>
          )}
          <FilterChips
            label="Bucket"
            selected={bucket || 'all'}
            onSelect={id => chooseBucket(id === 'all' ? '' : id)}
            testId="v2-cases-buckets"
            options={[{ id: 'all', label: 'All' }, ...Object.values(BUCKET_LABELS).map(label => ({ id: label, label: `${label} DPD` }))]}
          />
          <div className="v2-toolbar-row">
            <input
              className="v2-input" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Case number or customer id" aria-label="Search cases by case number or customer id" data-testid="v2-cases-search"
            />
            <label className="v2-picker">
              <span className="v2-picker-label">Status</span>
              <select className="v2-select" value={status} onChange={e => setStatus(e.target.value)} data-testid="v2-cases-status">
                <option value="">Any</option>
                {Object.values(CASE_STATUS_LABELS).map(label => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            <label className="v2-picker">
              <span className="v2-picker-label">Sort</span>
              <select className="v2-select" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} data-testid="v2-cases-sort">
                {(Object.keys(SORTS) as SortKey[]).map(key => <option key={key} value={key}>{SORTS[key].label}</option>)}
              </select>
            </label>
            {activeFilters > 0 && (
              <span className="v2-filter-summary" data-testid="v2-cases-active-filters">
                {activeFilters} {activeFilters === 1 ? 'filter' : 'filters'} active
                <button type="button" className="v2-btn v2-btn-subtle" onClick={clearAll} data-testid="v2-cases-clear">Clear all</button>
              </span>
            )}
          </div>
        </div>
        <V2DataGrid<CaseRow, CaseQuery>
          columns={COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
          onRowOpen={row => request.onOpenCase(row.id)} rowLabel={row => `Open case ${row.caseNumber}`}
          isFiltered={activeFilters > 0} emptyTitle="There are no open cases in this CRM scope."
          height={560} testId="v2-cases-grid"
        />
      </Card>
    </div>
  );
}

const COLUMNS: readonly V2Column<CaseRow>[] = [
  {
    key: 'case', header: 'Case', width: '200px', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{row.caseNumber}</span>
        <span className="v2-two-line-sub">Facility {row.facilityNumber}</span>
      </span>
    ),
  },
  { key: 'customer', header: 'Customer id', width: '150px', render: row => row.customerBusinessId },
  { key: 'crm', header: 'CRM', width: '80px', render: row => <OrgBadge org={row.organization} /> },
  { key: 'bucket', header: 'Bucket', width: '130px', render: row => <BucketBadge bucket={row.bucket} /> },
  { key: 'dpd', header: 'DPD', width: '80px', numeric: true, render: row => formatCount(row.dpd) },
  { key: 'arrears', header: 'Arrears', width: '140px', numeric: true, render: row => formatMoney(row.totalArrears) },
  { key: 'status', header: 'Status', render: row => <StatusPill status={row.status} /> },
];
