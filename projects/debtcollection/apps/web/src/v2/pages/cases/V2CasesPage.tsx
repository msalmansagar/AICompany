import { useEffect, useMemo, useState } from 'react';
import { ActivityDialog } from '../../../views/ActivityDialog.js';
import { PromiseDialog } from '../../../views/PromiseDialog.js';
import { WIDE_SEARCH_FIELDS, createCaseQuery, type CaseQuery, type CaseRow } from '../../../data/collectionQueries.js';
import { BUCKET_LABELS, CASE_STATUS_LABELS } from '../../../data/schema.js';
import { formatCount } from '../../../components/primitives.js';
import { useCrmSession, useOrg } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketDot, Card, FilterChips, type ChipOption } from '../../components/primitives.js';
import { V2DataGrid, type GridSort } from '../../components/V2DataGrid.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import {
  FILTER_SEGMENT, decodeCaseListFilters, encodeCaseListFilters, hasCaseListFilters, recallSelectedCase,
  rememberCaseListReturn, rememberSelectedCase, type CaseListFilters,
} from '../../data/caseListFilterUrl.js';
import { readLayout, writeLayout, type ListLayout } from '../../data/layoutPreference.js';
import { STRATEGY_NOT_ASSIGNED, STRATEGY_NOT_ASSIGNED_LABEL } from '../../data/portfolioMatrix.js';
import { CASE_SORTS, GRID_COLUMNS, SPLIT_COLUMNS, describeSort, sortKeyOf, toSourceSort, type CaseSortKey } from './casesColumns.js';
import { CasePreview } from './CasePreview.js';
import { useBucketFacets } from './useBucketFacets.js';

/**
 * Collection Cases V2 — choose a case to work.
 *
 * One question, two ways of looking at the answer. Every filter, the search, the scope and the sort
 * become one `CaseQuery` the source answers a page at a time; **Split** lists the rows beside a
 * preview of the chosen case, **Grid** lays every approved data point out in columns, and switching
 * between them changes the renderer and nothing else. The bucket chips carry counts read by one
 * aggregate from the same query, so a chip's number is the list it opens.
 */

type OwnerScope = 'all' | 'mine';
const LAYOUT_KEY = 'dcp.v2.casesLayout';

export function V2CasesPage({ request }: { request: ViewRequest }) {
  const { adapter, context } = useCrmSession();
  const { scope, scopeFilter, setScope } = useOrg();
  const shell = useV2Shell();
  // Filters that arrived in the URL — from Portfolio & Strategy, a bookmark or a refresh.
  const urlFilters = useMemo<CaseListFilters>(
    () => (request.recordId === FILTER_SEGMENT ? decodeCaseListFilters(request.tab) : {}),
    [request.recordId, request.tab]);
  const [search, setSearch] = useState(shell.search);
  const [bucket, setBucket] = useState(urlFilters.bucket ?? '');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState<OwnerScope>('all');
  const [sort, setSort] = useState<GridSort>(CASE_SORTS.dpd.sort);
  const [layout, setLayout] = useState<ListLayout>(() => readLayout(LAYOUT_KEY));
  const [selectedId, setSelectedId] = useState<string | undefined>(() => recallSelectedCase());
  const [dialog, setDialog] = useState<'activity' | 'promise' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState('');
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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const writeUrlFilters = (next: CaseListFilters) => {
    const kept: CaseListFilters = { ...next, ...(urlFilters.from ? { from: urlFilters.from } : {}) };
    if (hasCaseListFilters(kept)) shell.go('cases', FILTER_SEGMENT, encodeCaseListFilters(kept));
    else shell.go('cases');
  };
  const chooseBucket = (next: string) => {
    if (request.recordId === FILTER_SEGMENT) writeUrlFilters({ ...urlFilters, bucket: next || undefined });
    else setBucket(next);
  };
  const chooseLayout = (next: ListLayout) => { setLayout(next); writeLayout(LAYOUT_KEY, next); };
  const selectCase = (row: CaseRow) => { setSelectedId(row.id); rememberSelectedCase(row.id); };
  const openCase = (id: string) => {
    rememberCaseListReturn(request.recordId === FILTER_SEGMENT ? request.tab : undefined);
    request.onOpenCase(id);
  };
  const saved = (message: string) => { setDialog(null); setReloadKey(key => key + 1); setToast(message); };

  const fetchPage = useMemo(() => createCaseQuery(adapter), [adapter]);
  const query = useMemo<CaseQuery>(() => ({
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
    ...(bucket ? { bucket } : {}),
    ...(status ? { status } : {}),
    ...(settledSearch ? { search: settledSearch, searchFields: WIDE_SEARCH_FIELDS } : {}),
    ...(urlFilters.strategy ? { strategy: urlFilters.strategy } : {}),
    ...(owner === 'mine' ? { ownerId: context.userId } : {}),
    openOnly: true,
    sort: toSourceSort(sort),
  }), [scopeFilter, bucket, status, settledSearch, sort, urlFilters.strategy, owner, context.userId]);
  const facets = useBucketFacets(adapter, query, reloadKey);

  const activeFilters = [bucket, status, settledSearch, urlFilters.strategy, owner === 'mine' ? 'mine' : ''].filter(Boolean).length;
  const clearAll = () => {
    setStatus(''); setSearch(''); setOwner('all');
    if (request.recordId === FILTER_SEGMENT) writeUrlFilters({}); else setBucket('');
  };
  const strategyChip = urlFilters.strategy === STRATEGY_NOT_ASSIGNED
    ? STRATEGY_NOT_ASSIGNED_LABEL
    : urlFilters.strategyLabel ?? urlFilters.strategy;
  const chipCount = (label: string | undefined) => {
    if (facets.status === 'loading') return undefined;
    if (facets.status === 'unknown') return '—';
    return formatCount(label === undefined ? facets.facets.total : facets.facets.counts[label] ?? 0);
  };
  const unbucketed = facets.status === 'ready' ? facets.facets.unbucketed : 0;
  const bucketOptions: readonly ChipOption[] = [
    {
      id: 'all',
      label: unbucketed > 0
        ? <>All <span className="v2-muted" data-testid="v2-cases-unbucketed" title={`${formatCount(unbucketed)} matching ${unbucketed === 1 ? 'case carries' : 'cases carry'} no MIS bucket and ${unbucketed === 1 ? 'sits' : 'sit'} under no bucket chip`}>· {formatCount(unbucketed)} unbucketed</span></>
        : 'All',
      count: chipCount(undefined),
    },
    ...Object.values(BUCKET_LABELS).map(label => ({ id: label, label: <><BucketDot bucket={label} />{label}</>, count: chipCount(label) })),
  ];
  const sortKey = sortKeyOf(sort);
  const summary = (
    <>
      {facets.status === 'ready' ? `${formatCount(facets.facets.total)} ${facets.facets.total === 1 ? 'case' : 'cases'}` : 'Cases'}
      {' · sorted by '}{describeSort(sort)}
    </>
  );

  return (
    <div className="v2-cases" data-testid="v2-cases" data-layout={layout}>
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
          <div className="v2-toolbar-row">
            <input
              className="v2-input" type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Case, facility, customer name or id" aria-label="Search cases by case number, facility number, customer name or customer id" data-testid="v2-cases-search"
            />
            <FilterChips
              label="Show" selected={owner === 'mine' ? 'owner-mine' : 'owner-all'} onSelect={id => setOwner(id === 'owner-mine' ? 'mine' : 'all')} testId="v2-cases-owner"
              options={[{ id: 'owner-all', label: 'All cases' }, { id: 'owner-mine', label: 'My cases' }]}
            />
            <label className="v2-picker">
              <span className="v2-picker-label">Status</span>
              <select className="v2-select" value={status} onChange={e => setStatus(e.target.value)} data-testid="v2-cases-status">
                <option value="">Any</option>
                {Object.values(CASE_STATUS_LABELS).map(label => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
            {layout === 'split' && (
              <label className="v2-picker">
                <span className="v2-picker-label">Sort</span>
                <select className="v2-select" value={sortKey ?? ''} onChange={e => setSort(CASE_SORTS[e.target.value as CaseSortKey].sort)} data-testid="v2-cases-sort">
                  {sortKey === undefined && <option value="">By column</option>}
                  {(Object.keys(CASE_SORTS) as CaseSortKey[]).map(key => <option key={key} value={key}>{CASE_SORTS[key].label}</option>)}
                </select>
              </label>
            )}
            {activeFilters > 0 && (
              <span className="v2-filter-summary" data-testid="v2-cases-active-filters">
                {activeFilters} {activeFilters === 1 ? 'filter' : 'filters'} active
                <button type="button" className="v2-btn v2-btn-subtle" onClick={clearAll} data-testid="v2-cases-clear">Clear all</button>
              </span>
            )}
            <div className="v2-segmented v2-toolbar-end" role="group" aria-label="Layout">
              {(['split', 'grid'] as const).map(option => (
                <button key={option} type="button" className="v2-segment" aria-pressed={layout === option} onClick={() => chooseLayout(option)} data-testid={`v2-cases-layout-${option}`}>
                  {option === 'split' ? 'Split' : 'Grid'}
                </button>
              ))}
            </div>
          </div>
          <FilterChips label="Bucket" selected={bucket || 'all'} onSelect={id => chooseBucket(id === 'all' ? '' : id)} testId="v2-cases-buckets" options={bucketOptions} />
          {facets.status === 'unknown' && <p className="v2-toolbar-note" data-testid="v2-cases-counts-unknown">Bucket counts are not available for this list right now — the buckets still filter.</p>}
        </div>

        {layout === 'grid' && (
          <V2DataGrid<CaseRow, CaseQuery>
            columns={GRID_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
            onRowOpen={row => openCase(row.id)} rowLabel={row => `Open case ${row.caseNumber}`}
            sort={sort} onSortChange={setSort} summary={summary} fitsWidth
            isFiltered={activeFilters > 0} emptyTitle="There are no open cases in this CRM scope."
            height={560} testId="v2-cases-grid"
          />
        )}
        {layout === 'split' && (
          <div className="v2-split">
            <div className="v2-split-list">
              <V2DataGrid<CaseRow, CaseQuery>
                columns={SPLIT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
                onRowOpen={selectCase} selectedKey={selectedId ?? ''} rowLabel={row => `Preview case ${row.caseNumber}`} summary={summary}
                isFiltered={activeFilters > 0} emptyTitle="There are no open cases in this CRM scope."
                rowHeight={58} height={640} testId="v2-cases-list"
              />
            </div>
            <CasePreview
              caseId={selectedId} reloadKey={reloadKey}
              onOpen={() => selectedId && openCase(selectedId)}
              onLogAction={() => setDialog('activity')}
              onCapturePromise={() => setDialog('promise')}
              onMessage={() => selectedId && shell.go('case', selectedId, 'comms')}
            />
          </div>
        )}
      </Card>

      {dialog === 'activity' && selectedId && (
        <ActivityDialog mode="create" caseId={selectedId} onClose={() => setDialog(null)} onSaved={() => saved('Action recorded.')} />
      )}
      {dialog === 'promise' && selectedId && (
        <PromiseDialog mode="create" caseId={selectedId} onClose={() => setDialog(null)} onSaved={() => saved('Promise recorded.')} />
      )}
      {toast && <div className="v2-toast-region" aria-live="polite"><div className="v2-toast" data-testid="v2-cases-toast">{toast}</div></div>}
    </div>
  );
}
