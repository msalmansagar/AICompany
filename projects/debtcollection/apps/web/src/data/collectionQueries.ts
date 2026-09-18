import type { ContinuationToken, Page, Sort } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * The workspace's reads, in one place.
 *
 * Every column name the browser knows lives here, exactly as `qdbBindings.ts` does that job for the
 * service layer. Views receive shaped rows and never see a `qdb_` column, which is what lets the
 * schema move without touching twenty-one screens.
 *
 * Two rules hold throughout:
 *
 *   • **Narrowing is sent to the source.** Filters, sorts and searches become `$filter`, `$orderby`
 *     and the source's own search; nothing is fetched and then reduced here.
 *   • **Nothing is decided.** These functions read and shape. Whether a case is eligible, which
 *     strategy treats it and whether a customer may be contacted are all server-side answers.
 */

export const ENTITY_SETS = {
  collectionCase: 'qdb_collectioncases',
  delinquencySnapshot: 'qdb_delinquencysnapshots',
  collectionActivity: 'qdb_collectionactivities',
  identityException: 'qdb_identityexceptions',
  collectionStrategy: 'qdb_collectionstrategies',
  strategyAction: 'qdb_strategyactions',
  crmLog: 'qdb_crmlogses',
  platformConfiguration: 'qdb_platformconfigurations',
} as const;

/** Option-value → label, as provisioned. A translation table, not business logic. */
const BUCKET_LABELS: Readonly<Record<number, string>> = {
  100000000: '1-30', 100000001: '31-60', 100000002: '61-90', 100000003: '91-180', 100000004: '181-270',
  100000005: '271-360', 100000006: '361-500', 100000007: '501-1000', 100000008: '1001-2000', 100000009: '>2000',
};

const ORG_LABELS: Readonly<Record<number, string>> = { 100000140: 'HL', 100000141: 'BFD' };

const CASE_STATUS_LABELS: Readonly<Record<number, string>> = {
  100000600: 'New', 100000601: 'Assigned', 100000602: 'In Progress', 100000603: 'Pending Customer Response',
  100000604: 'PTP Active', 100000605: 'PTP Broken', 100000606: 'Restructure Review', 100000607: 'Restructured',
  100000608: 'Pending Legal Review', 100000609: 'Referred to Legal', 100000610: 'Under Legal Action',
  100000611: 'Escalated to Supervisor', 100000612: 'Deceased/Insurance Review', 100000613: 'Settled',
  100000614: 'Closed', 100000615: 'Written Off', 100000616: 'Reopened',
};

/** A case as a list row needs it. Shaped from the organisation, never assembled from several reads. */
export interface CaseRow {
  id: string;
  caseNumber: string;
  customerBusinessId: string;
  facilityNumber: string;
  sourceSystem: string;
  organization: string;
  status: string;
  bucket?: string;
  dpd?: number;
  totalArrears?: number;
  loanBalance?: number;
  misAsOfDate?: string;
  episodeNumber?: number;
  openDate?: string;
  /** Which customer table this case's customer lives in — contact for HL, account for BFD. */
  customerTable?: string;
  customerId?: string;
}

const CASE_COLUMNS = [
  'qdb_collectioncaseid', 'qdb_casenumber', 'qdb_customerbusinessid', 'qdb_facilitynumber',
  'qdb_facilitysourcesystem', 'qdb_organizationcode', 'statuscode', 'qdb_currentarrearbucket',
  'qdb_currentdpd', 'qdb_currenttotalarrears', 'qdb_currentloanbalance', 'qdb_misasofdate',
  'qdb_episodenumber', 'qdb_opendate', '_qdb_customerid_value',
];

const ANNOTATION = '@Microsoft.Dynamics.CRM.lookuplogicalname';

export function toCaseRow(row: Record<string, unknown>): CaseRow {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? undefined : String(row[key]));
  const num = (key: string) => (typeof row[key] === 'number' ? (row[key] as number) : undefined);
  const choice = (key: string, table: Readonly<Record<number, string>>) => {
    const value = row[key];
    return typeof value === 'number' ? table[value] : undefined;
  };

  return {
    id: String(row['qdb_collectioncaseid']),
    caseNumber: text('qdb_casenumber') ?? '—',
    customerBusinessId: text('qdb_customerbusinessid') ?? '—',
    facilityNumber: text('qdb_facilitynumber') ?? '—',
    sourceSystem: text('qdb_facilitysourcesystem') ?? '—',
    organization: choice('qdb_organizationcode', ORG_LABELS) ?? text('qdb_facilitysourcesystem') ?? '—',
    status: choice('statuscode', CASE_STATUS_LABELS) ?? '—',
    ...optional('bucket', choice('qdb_currentarrearbucket', BUCKET_LABELS)),
    ...optional('dpd', num('qdb_currentdpd')),
    ...optional('totalArrears', num('qdb_currenttotalarrears')),
    ...optional('loanBalance', num('qdb_currentloanbalance')),
    ...optional('misAsOfDate', text('qdb_misasofdate')),
    ...optional('episodeNumber', num('qdb_episodenumber')),
    ...optional('openDate', text('qdb_opendate')),
    // The Customer lookup is polymorphic. The annotation is what distinguishes contact from account,
    // and it only arrives because the adapter asks for annotations — the Phase 5 spike found that out
    // the hard way.
    ...optional('customerTable', text(`_qdb_customerid_value${ANNOTATION}`)),
    ...optional('customerId', text('_qdb_customerid_value')),
  };
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

/** What a case list may be narrowed by. Every field is applied by the source. */
export interface CaseQuery {
  /** Organisation scope filter fragment, or undefined for both CRMs. */
  scopeFilter?: string;
  bucket?: string;
  status?: string;
  /** Free-text over case number and customer business id. */
  search?: string;
  sort?: readonly Sort[];
  /** Only cases that are open. */
  openOnly?: boolean;
}

/** Builds the `$filter` the source applies. Composition only — no threshold appears here. */
export function buildCaseFilter(query: CaseQuery): string | undefined {
  const clauses: string[] = [];
  if (query.scopeFilter) clauses.push(query.scopeFilter);
  if (query.openOnly) clauses.push('statecode eq 0');
  if (query.bucket) {
    const value = Object.entries(BUCKET_LABELS).find(([, label]) => label === query.bucket)?.[0];
    if (value) clauses.push(`qdb_currentarrearbucket eq ${value}`);
  }
  if (query.status) {
    const value = Object.entries(CASE_STATUS_LABELS).find(([, label]) => label === query.status)?.[0];
    if (value) clauses.push(`statuscode eq ${value}`);
  }
  if (query.search) {
    const term = query.search.replace(/'/g, "''");
    clauses.push(`(contains(qdb_casenumber,'${term}') or contains(qdb_customerbusinessid,'${term}'))`);
  }
  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

/** One bounded page of cases. The only way case rows enter the workspace. */
export function createCaseQuery(adapter: XrmCrmAdapter) {
  return async (
    request: CaseQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<CaseRow>> => {
    const filter = buildCaseFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.collectionCase, {
      select: CASE_COLUMNS,
      pageSize: request.pageSize,
      ...(filter !== undefined ? { filter } : {}),
      ...(request.sort !== undefined ? { sort: request.sort } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return {
      items: page.items.map(toCaseRow),
      hasMore: page.hasMore,
      appliedPageSize: page.appliedPageSize,
      ...(page.continuation !== undefined ? { continuation: page.continuation } : {}),
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    };
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  source?: string;
  type?: string;
  createdOn?: string;
  subject?: string;
  isException?: boolean;
}

/**
 * The technical log, paged.
 *
 * It is the largest table in the organisation — 1,295 rows on the sandbox and unbounded in
 * production — which makes it the clearest demonstration that a list here never loads everything.
 */
export function createAuditQuery(adapter: XrmCrmAdapter) {
  return async (
    request: { search?: string; pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<AuditRow>> => {
    const filter = request.search
      ? `contains(qdb_source,'${request.search.replace(/'/g, "''")}')`
      : undefined;
    const page = await adapter.retrievePage(ENTITY_SETS.crmLog, {
      select: ['activityid', 'qdb_source', 'qdb_type', 'createdon', 'subject', 'qdb_isexception'],
      pageSize: request.pageSize,
      sort: [{ field: 'createdon', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return {
      items: page.items.map(row => ({
        id: String(row['activityid']),
        ...optional('source', row['qdb_source'] === null ? undefined : String(row['qdb_source'] ?? '')),
        ...optional('type', row['qdb_type'] === null ? undefined : String(row['qdb_type'] ?? '')),
        ...optional('createdOn', row['createdon'] === null ? undefined : String(row['createdon'] ?? '')),
        ...optional('subject', row['subject'] === null ? undefined : String(row['subject'] ?? '')),
        ...optional('isException', typeof row['qdb_isexception'] === 'boolean' ? row['qdb_isexception'] : undefined),
      })),
      hasMore: page.hasMore,
      appliedPageSize: page.appliedPageSize,
      ...(page.continuation !== undefined ? { continuation: page.continuation } : {}),
      ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
    };
  };
}

export const LABELS = { BUCKET_LABELS, ORG_LABELS, CASE_STATUS_LABELS };
