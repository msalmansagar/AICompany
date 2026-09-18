import type { ContinuationToken, Page, Sort } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  BUCKET_LABELS, CASE_LIST_COLUMNS, CASE_STATUS_LABELS, CRM_LOG_COLUMNS, ENTITY_SETS, ORG_LABELS,
} from './schema.js';
import {
  optional, readBoolean, readChoice, readLookupTable, readNumber, readText, type CrmRow,
} from './rowReaders.js';

/**
 * The case list and the audit trail — the two reads the whole workspace is built around.
 *
 * Column names come from `schema.ts`; views receive shaped rows and never see a `qdb_` column. Two
 * rules hold here and in every other query module:
 *
 *   • **Narrowing is sent to the source.** Filters, sorts and searches become `$filter`, `$orderby`
 *     and the source's own search; nothing is fetched and then reduced here.
 *   • **Nothing is decided.** These functions read and shape. Whether a case is eligible, which
 *     strategy treats it and whether a customer may be contacted are all server-side answers.
 */

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

export function toCaseRow(row: CrmRow): CaseRow {
  return {
    id: String(row['qdb_collectioncaseid']),
    caseNumber: readText(row, 'qdb_casenumber') ?? '—',
    customerBusinessId: readText(row, 'qdb_customerbusinessid') ?? '—',
    facilityNumber: readText(row, 'qdb_facilitynumber') ?? '—',
    sourceSystem: readText(row, 'qdb_facilitysourcesystem') ?? '—',
    organization: readChoice(row, 'qdb_organizationcode', ORG_LABELS)
      ?? readText(row, 'qdb_facilitysourcesystem') ?? '—',
    status: readChoice(row, 'statuscode', CASE_STATUS_LABELS) ?? '—',
    ...optional('bucket', readChoice(row, 'qdb_currentarrearbucket', BUCKET_LABELS)),
    ...optional('dpd', readNumber(row, 'qdb_currentdpd')),
    ...optional('totalArrears', readNumber(row, 'qdb_currenttotalarrears')),
    ...optional('loanBalance', readNumber(row, 'qdb_currentloanbalance')),
    ...optional('misAsOfDate', readText(row, 'qdb_misasofdate')),
    ...optional('episodeNumber', readNumber(row, 'qdb_episodenumber')),
    ...optional('openDate', readText(row, 'qdb_opendate')),
    // The Customer lookup is polymorphic. The annotation is what distinguishes contact from account,
    // and it only arrives because the adapter asks for annotations — the Phase 5 spike found that out
    // the hard way.
    ...optional('customerTable', readLookupTable(row, '_qdb_customerid_value')),
    ...optional('customerId', readText(row, '_qdb_customerid_value')),
  };
}

/** What a case list may be narrowed by. Every field is applied by the source. */
export interface CaseQuery {
  /** Organisation scope filter fragment, or undefined for both CRMs. */
  scopeFilter?: string;
  bucket?: string;
  status?: string;
  /** Free-text over case number and customer business id. */
  search?: string;
  /** Every case belonging to one customer, by the canonical business id. */
  customerBusinessId?: string;
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
    const value = codeFor(BUCKET_LABELS, query.bucket);
    if (value !== undefined) clauses.push(`qdb_currentarrearbucket eq ${value}`);
  }
  if (query.status) {
    const value = codeFor(CASE_STATUS_LABELS, query.status);
    if (value !== undefined) clauses.push(`statuscode eq ${value}`);
  }
  if (query.customerBusinessId) {
    clauses.push(`qdb_customerbusinessid eq '${escapeOData(query.customerBusinessId)}'`);
  }
  if (query.search) {
    const term = escapeOData(query.search);
    clauses.push(`(contains(qdb_casenumber,'${term}') or contains(qdb_customerbusinessid,'${term}'))`);
  }
  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

/** The option value behind a label, for filtering. Display reads labels; filters must send codes. */
export function codeFor(labels: Readonly<Record<number, string>>, label: string): number | undefined {
  const match = Object.entries(labels).find(([, text]) => text === label);
  return match ? Number(match[0]) : undefined;
}

/** OData string literals escape a quote by doubling it. */
export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/** One bounded page of cases. The only way case rows enter the workspace. */
export function createCaseQuery(adapter: XrmCrmAdapter) {
  return async (
    request: CaseQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<CaseRow>> => {
    const filter = buildCaseFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.collectionCase, {
      select: [...CASE_LIST_COLUMNS],
      pageSize: request.pageSize,
      ...(filter !== undefined ? { filter } : {}),
      ...(request.sort !== undefined ? { sort: request.sort } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toCaseRow);
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
  /** The JSON diagnostic block, which is where the correlation id and the counters live. */
  diagnostics?: string;
}

export interface AuditQuery {
  /** Free text over the log's source. */
  search?: string;
  /**
   * One operation's trail. `qdb_crmlogs` has no correlation column, so the id is matched inside the
   * diagnostic block written into `description`.
   */
  correlationId?: string;
}

export function buildAuditFilter(query: AuditQuery): string | undefined {
  const clauses: string[] = [];
  if (query.search) clauses.push(`contains(qdb_source,'${escapeOData(query.search)}')`);
  if (query.correlationId) clauses.push(`contains(description,'${escapeOData(query.correlationId)}')`);
  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

/**
 * The technical log, paged.
 *
 * It is the largest table in the organisation — 1,295 rows on the sandbox and unbounded in
 * production — which makes it the clearest demonstration that a list here never loads everything.
 */
export function createAuditQuery(adapter: XrmCrmAdapter) {
  return async (
    request: AuditQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<AuditRow>> => {
    const filter = buildAuditFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.crmLog, {
      select: [...CRM_LOG_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'createdon', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, row => ({
      id: String(row['activityid']),
      ...optional('source', readText(row, 'qdb_source')),
      ...optional('type', readText(row, 'qdb_type')),
      ...optional('createdOn', readText(row, 'createdon')),
      ...optional('subject', readText(row, 'subject')),
      ...optional('isException', readBoolean(row, 'qdb_isexception')),
      ...optional('diagnostics', readText(row, 'description')),
    }));
  };
}

/**
 * Re-shapes a page's rows while preserving the paging contract untouched.
 *
 * Every query module ends this way, and it matters that the continuation, `hasMore` and
 * `appliedPageSize` pass through unchanged: they belong to the source, and a shaping step that
 * rebuilt them would be inventing a paging position.
 */
export function mapPage<T>(page: Page<CrmRow>, shape: (row: CrmRow) => T): Page<T> {
  return {
    items: page.items.map(shape),
    hasMore: page.hasMore,
    appliedPageSize: page.appliedPageSize,
    ...optional('continuation', page.continuation),
    ...optional('totalCount', page.totalCount),
  };
}

export { ENTITY_SETS };
export const LABELS = { BUCKET_LABELS, ORG_LABELS, CASE_STATUS_LABELS };
