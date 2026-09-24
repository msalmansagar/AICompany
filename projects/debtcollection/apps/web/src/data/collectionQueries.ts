import type { ContinuationToken, Page, Sort } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  BUCKET_LABELS, CASE_LIST_COLUMNS, CASE_STATUS_LABELS, CRM_LOG_COLUMNS, CUSTOMER_TYPE_LABELS, ENTITY_SETS, ORG_LABELS,
} from './schema.js';
import {
  optional, readBoolean, readChoice, readLookupName, readLookupTable, readNumber, readText, type CrmRow,
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
  /** The customer's display name, as the platform supplies it beside the lookup. */
  customerName?: string;
  customerType?: string;
  /** MIS's loan-type description, e.g. "Building Housing". */
  productDescription?: string;
  lastMisSyncOn?: string;
  strategyId?: string;
  strategyName?: string;
  ownerName?: string;
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
    ...optional('customerName', readLookupName(row, '_qdb_customerid_value')),
    ...optional('customerType', readChoice(row, 'qdb_customertype', CUSTOMER_TYPE_LABELS)),
    ...optional('productDescription', readText(row, 'qdb_productdescription')),
    ...optional('lastMisSyncOn', readText(row, 'qdb_lastmissyncon')),
    ...optional('strategyId', readText(row, '_qdb_strategyid_value')),
    ...optional('strategyName', readLookupName(row, '_qdb_strategyid_value')),
    ...optional('ownerName', readLookupName(row, '_ownerid_value')),
  };
}

/**
 * Where a search term is looked for. The identifiers are the default and V1's behaviour; the
 * customer's name lives on the contact or account behind the polymorphic lookup and is reached
 * through its navigation property — still one `$filter`, still applied by the source.
 */
export type CaseSearchField = 'caseNumber' | 'customerBusinessId' | 'facilityNumber' | 'customerName';
export const IDENTIFIER_SEARCH_FIELDS: readonly CaseSearchField[] = ['caseNumber', 'customerBusinessId'];
export const WIDE_SEARCH_FIELDS: readonly CaseSearchField[] = ['caseNumber', 'customerBusinessId', 'facilityNumber', 'customerName'];

const SEARCH_CLAUSES: Readonly<Record<CaseSearchField, (term: string) => string>> = {
  caseNumber: term => `contains(qdb_casenumber,'${term}')`,
  customerBusinessId: term => `contains(qdb_customerbusinessid,'${term}')`,
  facilityNumber: term => `contains(qdb_facilitynumber,'${term}')`,
  customerName: term => `contains(qdb_customerid_contact/fullname,'${term}') or contains(qdb_customerid_account/name,'${term}')`,
};

/** What a case list may be narrowed by. Every field is applied by the source. */
export interface CaseQuery {
  /** Organisation scope filter fragment, or undefined for both CRMs. */
  scopeFilter?: string;
  bucket?: string;
  status?: string;
  /** Free-text over the `searchFields` — case number and customer business id unless said otherwise. */
  search?: string;
  searchFields?: readonly CaseSearchField[];
  /** Every case belonging to one customer, by the canonical business id. */
  customerBusinessId?: string;
  /** Only cases owned by this user — the signed-in officer's own list. */
  ownerId?: string;
  sort?: readonly Sort[];
  /** Only cases that are open. */
  openOnly?: boolean;
  /**
   * Cases whose resolved strategy is this one — or, with `'none'`, cases with no resolved strategy
   * at all. Absent means any. Applied by the source, so the population is the platform's answer.
   */
  strategy?: string | 'none';
  /** Only cases owned by this user. */
  ownerId?: string;
}

/** Builds the `$filter` the source applies. Composition only — no threshold appears here. */
export function buildCaseFilter(query: CaseQuery): string | undefined {
  const clauses: string[] = [];
  if (query.scopeFilter) clauses.push(query.scopeFilter);
  if (query.openOnly) clauses.push('statecode eq 0');
  if (query.strategy === 'none') clauses.push('_qdb_strategyid_value eq null');
  else if (query.strategy) clauses.push(`_qdb_strategyid_value eq ${escapeOData(query.strategy)}`);
  if (query.ownerId) clauses.push(`_ownerid_value eq ${escapeOData(query.ownerId)}`);
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
  if (query.ownerId) clauses.push(`_ownerid_value eq ${escapeOData(query.ownerId)}`);
  if (query.search) {
    const term = escapeOData(query.search);
    const fields = query.searchFields ?? IDENTIFIER_SEARCH_FIELDS;
    clauses.push(`(${fields.map(field => SEARCH_CLAUSES[field](term)).join(' or ')})`);
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
/**
 * How many records a case card reads at once. A case card shows the most recent page and says when
 * there are more, rather than paging inside a card; the Actions grid pages through all of them.
 */
export const CASE_CARD_PAGE_SIZE = 100;

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
