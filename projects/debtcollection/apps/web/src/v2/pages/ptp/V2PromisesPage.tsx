import { useMemo, useState } from 'react';
import { createPtpQuery, type ActivityQuery, type PtpRow } from '../../../data/caseQueries.js';
import { useCounts, formatCountResult, type CountRequest } from '../../../data/counts.js';
import { codeFor } from '../../../data/collectionQueries.js';
import { ENTITY_SETS, PTP_STATUS_LABELS } from '../../../data/schema.js';
import { PromiseOutcome, formatDate, formatMoney } from '../../../components/primitives.js';
import { useCrmSession } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { Card, FilterChips } from '../../components/primitives.js';
import { V2DataGrid, type V2Column } from '../../components/V2DataGrid.js';

/**
 * Promise to Pay V2 — every promise, narrowed by its recorded status.
 *
 * A promise is a collection activity carrying a PTP date — there is no separate promise entity. The
 * status chip is a filter the source applies; its count is the platform's own. Each outcome is what an
 * officer recorded, never a verified payment, and no kept-rate is computed: a rate over two capped
 * counts would read as a fact it is not (that belongs to Phase 10 reporting).
 */

const ALL = 'all';
const STATUSES = Object.values(PTP_STATUS_LABELS);

export function V2PromisesPage(_props: { request: ViewRequest }) {
  const { adapter } = useCrmSession();
  const { go } = useV2Shell();
  const [status, setStatus] = useState(ALL);

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

  return (
    <div className="v2-cases" data-testid="v2-promises">
      <Card flush>
        <div className="v2-toolbar">
          <FilterChips
            label="Status"
            selected={status}
            onSelect={setStatus}
            testId="v2-promise-status"
            options={[
              { id: ALL, label: 'All', count: formatCountResult(counts[ALL]) },
              ...STATUSES.map(label => ({ id: label, label, count: formatCountResult(counts[label]) })),
            ]}
          />
          <p className="v2-toolbar-note">Each outcome is what an officer recorded — not a verified payment.</p>
        </div>
        <V2DataGrid<PtpRow, ActivityQuery>
          columns={COLUMNS} fetchPage={fetchPage} query={query} rowKey={row => row.id}
          onRowOpen={row => { if (row.caseId) go('case', row.caseId, 'ptp'); }}
          rowLabel={row => `Open the promise on case ${row.caseNumber ?? ''} due ${formatDate(row.ptpDate)}`}
          isFiltered={status !== ALL} emptyTitle="No promise to pay has been recorded." height={560} testId="v2-promises-grid"
        />
      </Card>
    </div>
  );
}

const COLUMNS: readonly V2Column<PtpRow>[] = [
  { key: 'promised', header: 'Promised for', width: '120px', render: row => formatDate(row.ptpDate) },
  { key: 'case', header: 'Case', width: '160px', render: row => row.caseNumber ?? '—' },
  { key: 'amount', header: 'Amount', width: '130px', numeric: true, render: row => formatMoney(row.promisedAmount) },
  { key: 'type', header: 'Type', width: '100px', render: row => row.promiseType ?? '—' },
  { key: 'status', header: 'Status', width: '160px', render: row => <PromiseOutcome status={row.ptpStatus} /> },
  { key: 'owner', header: 'Recorded by', render: row => row.ownerName ?? '—' },
];
