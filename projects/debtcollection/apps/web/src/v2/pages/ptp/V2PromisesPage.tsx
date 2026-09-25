import { useEffect, useMemo, useState } from 'react';
import { createPtpQuery, type ActivityQuery, type PtpRow } from '../../../data/caseQueries.js';
import { useCounts, formatCountResult, type CountRequest } from '../../../data/counts.js';
import { codeFor } from '../../../data/collectionQueries.js';
import { ENTITY_SETS, PTP_STATUS_LABELS } from '../../../data/schema.js';
import { PromiseOutcome, formatDate, formatMoney } from '../../../components/primitives.js';
import { useCrmSession } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketBadge, BucketBar, Card, FilterChips } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';
import { readLayout, writeLayout, type ListLayout } from '../../data/layoutPreference.js';
import { rememberCaseListReturn } from '../../data/caseListFilterUrl.js';
import { CasePreview } from '../cases/CasePreview.js';
import { CaseCommandDialogs, type CaseCommandDialog } from '../cases/CaseCommandDialogs.js';

/**
 * Promise to Pay V2 — every promise, narrowed by its recorded status, in the same two layouts as
 * Collection Cases.
 *
 * A promise is a collection activity carrying a PTP date — there is no separate promise entity. The
 * status chip is a filter the source applies; its count is the platform's own. Each row carries its
 * case's bucket, customer and CRM from the same read (the case is expanded, not fetched per row).
 * **Split** previews the promise's case beside the list; **Grid** opens it on its Promises tab. Each
 * outcome is what an officer recorded, never a verified payment, and no kept-rate is computed: a
 * rate over two capped counts would read as a fact it is not (that belongs to Phase 10 reporting).
 */

const ALL = 'all';
const STATUSES = Object.values(PTP_STATUS_LABELS);
const LAYOUT_KEY = 'dcp.v2.promisesLayout';

export function V2PromisesPage(_props: { request: ViewRequest }) {
  const { adapter } = useCrmSession();
  const { go } = useV2Shell();
  const [status, setStatus] = useState(ALL);
  const [layout, setLayout] = useState<ListLayout>(() => readLayout(LAYOUT_KEY));
  const [selected, setSelected] = useState<PtpRow | undefined>(undefined);
  const [dialog, setDialog] = useState<CaseCommandDialog>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const requests = useMemo<readonly CountRequest[]>(() => [
    { key: ALL, entitySet: ENTITY_SETS.collectionActivity, filter: 'qdb_ptpdate ne null' },
    ...STATUSES.map(label => ({
      key: label, entitySet: ENTITY_SETS.collectionActivity,
      filter: `qdb_ptpdate ne null and qdb_ptpstatus eq ${codeFor(PTP_STATUS_LABELS, label)}`,
    })),
  ], []);
  const counts = useCounts(adapter, requests);

  const fetchPage = useMemo(() => createPtpQuery(adapter), [adapter]);
  const query = useMemo<ActivityQuery>(() => {
    const code = status === ALL ? undefined : codeFor(PTP_STATUS_LABELS, status);
    return code === undefined ? {} : { ptpStatus: code };
  }, [status]);

  const chooseLayout = (next: ListLayout) => { setLayout(next); writeLayout(LAYOUT_KEY, next); };
  const openCase = (caseId: string) => { rememberCaseListReturn(undefined); go('case', caseId, 'ptp'); };
  const saved = (message: string) => { setDialog(null); setReloadKey(key => key + 1); setToast(message); };
  const selectedCaseId = selected?.caseId;

  return (
    <div className="v2-cases" data-testid="v2-promises" data-layout={layout}>
      <Card flush>
        <div className="v2-toolbar">
          <div className="v2-toolbar-row">
            <FilterChips
              label="Status"
              selected={status}
              onSelect={next => { setStatus(next); setSelected(undefined); }}
              testId="v2-promise-status"
              options={[
                { id: ALL, label: 'All', count: formatCountResult(counts[ALL]) },
                ...STATUSES.map(label => ({ id: label, label, count: formatCountResult(counts[label]) })),
              ]}
            />
            <div className="v2-segmented v2-toolbar-end" role="group" aria-label="Layout">
              {(['split', 'grid'] as const).map(option => (
                <button key={option} type="button" className="v2-segment" aria-pressed={layout === option} onClick={() => chooseLayout(option)} data-testid={`v2-promises-layout-${option}`}>
                  {option === 'split' ? 'Split' : 'Grid'}
                </button>
              ))}
            </div>
          </div>
          <p className="v2-toolbar-note">Each outcome is what an officer recorded — not a verified payment.</p>
        </div>

        {layout === 'grid' && (
          <V2DataGrid<PtpRow, ActivityQuery>
            columns={GRID_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
            onRowOpen={row => { if (row.caseId) openCase(row.caseId); }}
            rowLabel={row => `Open the promise on case ${row.caseNumber ?? ''} due ${formatDate(row.ptpDate)}`}
            isFiltered={status !== ALL} emptyTitle="No promise to pay has been recorded." height={560} testId="v2-promises-grid" fitsWidth
          />
        )}
        {layout === 'split' && (
          <div className="v2-split">
            <div className="v2-split-list">
              <V2DataGrid<PtpRow, ActivityQuery>
                columns={SPLIT_COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
                onRowOpen={setSelected} selectedKey={selected?.id ?? ''}
                rowLabel={row => `Preview the promise on case ${row.caseNumber ?? ''} due ${formatDate(row.ptpDate)}`}
                isFiltered={status !== ALL} emptyTitle="No promise to pay has been recorded." rowHeight={58} height={640} testId="v2-promises-list" fitsWidth
              />
            </div>
            <CasePreview
              caseId={selectedCaseId} reloadKey={reloadKey}
              onOpen={() => selectedCaseId && openCase(selectedCaseId)}
              onLogAction={() => setDialog('activity')}
              onCapturePromise={() => setDialog('promise')}
              onMessage={() => selectedCaseId && go('case', selectedCaseId, 'comms')}
            />
          </div>
        )}
      </Card>

      <CaseCommandDialogs caseId={selectedCaseId} dialog={dialog} onClose={() => setDialog(null)} onSaved={saved} />
      {toast && <div className="v2-toast-region" aria-live="polite"><div className="v2-toast" data-testid="v2-promises-toast">{toast}</div></div>}
    </div>
  );
}

const customerName = (row: PtpRow) => row.caseCustomerName ?? row.caseNumber ?? '—';

const GRID_COLUMNS: readonly V2Column<PtpRow>[] = [
  {
    key: 'case', header: 'Case', width: '150px', render: row => (
      <span className="v2-case-row">
        <BucketBar bucket={row.caseBucket} />
        <span className="v2-two-line">
          <span className="v2-two-line-main">{row.caseNumber ?? '—'}</span>
          <span className="v2-two-line-sub">{row.caseOrganization ?? '—'} CRM · {row.caseCustomerType ?? '—'}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'customer', header: 'Customer', render: row => (
      <span className="v2-two-line">
        <span className="v2-two-line-main">{customerName(row)}</span>
        <span className="v2-two-line-sub"><BucketBadge bucket={row.caseBucket} /></span>
      </span>
    ),
  },
  { key: 'promised', header: 'Promised for', width: '112px', render: row => formatDate(row.ptpDate) },
  { key: 'amount', header: 'Amount', width: '110px', numeric: true, render: row => formatMoney(row.promisedAmount) },
  { key: 'type', header: 'Type', width: '76px', render: row => row.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '150px', render: row => <PromiseOutcome status={row.ptpStatus} /> },
  { key: 'owner', header: 'Recorded by', width: '130px', render: row => row.ownerName ?? '—' },
];

const SPLIT_COLUMNS: readonly V2Column<PtpRow>[] = [
  {
    key: 'promise', header: 'Promise', render: row => (
      <span className="v2-case-row">
        <BucketBar bucket={row.caseBucket} />
        <span className="v2-two-line">
          <span className="v2-two-line-main">{customerName(row)}</span>
          <span className="v2-two-line-sub">{row.caseNumber ?? '—'} · promised for {formatDate(row.ptpDate)} · <PromiseOutcome status={row.ptpStatus} /></span>
        </span>
      </span>
    ),
  },
  { key: 'amount', header: 'Amount', width: '110px', numeric: true, render: row => formatMoney(row.promisedAmount) },
];
