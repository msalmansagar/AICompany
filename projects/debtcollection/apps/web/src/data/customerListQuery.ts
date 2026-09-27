import { buildPage, finalPage, fingerprintQuery, makeContinuation, readContinuation, type ContinuationToken, type Page } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CUSTOMER_LINKS, caseConditions, searchesCustomerName } from './caseFetchXml.js';
import { WIDE_SEARCH_FIELDS, type CaseQuery } from './collectionQueries.js';
import { ENTITY_SETS, ORG_LABELS } from './schema.js';

/**
 * Customers with arrears — every customer named by an open collection case, one row each.
 *
 * There is **no customer master** in this platform: Housing Loan customers are CRM contacts, BFD
 * customers are accounts, and a customer is whoever the open cases say has money overdue. So the
 * list is one FetchXML aggregate over the cases, grouped by the customer's business id, with the
 * platform counting the cases and summing the positions. It runs as the signed-in user and CRM
 * security scopes it exactly as it scopes the case list.
 *
 * A customer who has cases in both CRMs comes back as two grouped rows — one per organisation, with
 * a different customer record behind each — and is shown once: the counts and sums are added and the
 * maximum kept, the same arithmetic the Customer 360 does over the cases it reads. Nothing here
 * decides a bucket, an eligibility or a threshold.
 *
 * The aggregate is bounded by the organisation's aggregate limit, so its answer is one bounded set,
 * which is paged in memory for the grid. A refusal — above the limit, or a malformed query — throws,
 * and the list says it could not be loaded rather than listing nobody.
 */

export type CustomerSortKey = 'arrears' | 'dpd' | 'cases' | 'name';

export interface CustomerListQuery {
  /** Organisation scope filter fragment, or undefined for both CRMs. */
  scopeFilter?: string;
  /** Free text over business id, case number, facility number and customer name. */
  search?: string;
  sortKey?: CustomerSortKey;
}

export interface CustomerListRow {
  customerBusinessId: string;
  customerName?: string;
  customerTable?: string;
  customerId?: string;
  /** The CRMs holding this customer's open cases — HL, BFD, or both. */
  organizations: readonly string[];
  caseCount: number;
  totalArrears?: number;
  totalExposure?: number;
  worstDpd?: number;
}

export class CustomerListRefusedError extends Error {
  constructor() {
    super('The platform refused the customer aggregate, so the customer list cannot be built right now.');
    this.name = 'CustomerListRefusedError';
  }
}

/** The one question, as the case query the aggregate is rendered from. */
function toCaseQuery(query: CustomerListQuery): CaseQuery {
  return {
    openOnly: true,
    ...(query.scopeFilter ? { scopeFilter: query.scopeFilter } : {}),
    ...(query.search ? { search: query.search, searchFields: WIDE_SEARCH_FIELDS } : {}),
  };
}

export function customerListFetchXml(query: CustomerListQuery): string {
  const caseQuery = toCaseQuery(query);
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/>'
    + '<attribute name="qdb_currentloanbalance" alias="exposure" aggregate="sum"/>'
    + '<attribute name="qdb_currentdpd" alias="dpd" aggregate="max"/>'
    + '<attribute name="qdb_customerbusinessid" alias="customer" groupby="true"/>'
    + '<attribute name="qdb_customerid" alias="customerref" groupby="true"/>'
    + '<attribute name="qdb_organizationcode" alias="org" groupby="true"/>'
    + (searchesCustomerName(caseQuery) ? CUSTOMER_LINKS : '')
    + `<filter type="and">${caseConditions(caseQuery).join('')}</filter>`
    + '<order alias="arrears" descending="true"/>'
    + '</entity></fetch>';
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';

/** One row per customer business id, merged across the organisations that hold their cases. */
export function shapeCustomerRows(rows: readonly Record<string, unknown>[]): CustomerListRow[] {
  const byCustomer = new Map<string, CustomerListRow>();
  for (const row of rows) {
    const businessId = row['customer'];
    if (typeof businessId !== 'string' || businessId.length === 0) continue;
    const grouped = toGroupedRow(businessId, row);
    const existing = byCustomer.get(businessId);
    byCustomer.set(businessId, existing ? mergeRows(existing, grouped) : grouped);
  }
  return [...byCustomer.values()];
}

function toGroupedRow(businessId: string, row: Record<string, unknown>): CustomerListRow {
  const orgCode = row['org'];
  const organization = typeof orgCode === 'number' ? ORG_LABELS[orgCode] : undefined;
  return {
    customerBusinessId: businessId,
    ...optionalText('customerName', row[`customerref${FORMATTED}`]),
    ...optionalText('customerTable', row[`customerref${LOOKUP_TABLE}`]),
    ...optionalText('customerId', row['customerref']),
    organizations: organization ? [organization] : [],
    caseCount: typeof row['cases'] === 'number' ? row['cases'] : 0,
    ...optionalNumber('totalArrears', row['arrears']),
    ...optionalNumber('totalExposure', row['exposure']),
    ...optionalNumber('worstDpd', row['dpd']),
  };
}

function mergeRows(first: CustomerListRow, second: CustomerListRow): CustomerListRow {
  return {
    customerBusinessId: first.customerBusinessId,
    ...optionalText('customerName', first.customerName ?? second.customerName),
    ...optionalText('customerTable', first.customerTable ?? second.customerTable),
    ...optionalText('customerId', first.customerId ?? second.customerId),
    organizations: [...new Set([...first.organizations, ...second.organizations])],
    caseCount: first.caseCount + second.caseCount,
    ...optionalNumber('totalArrears', addOptional(first.totalArrears, second.totalArrears)),
    ...optionalNumber('totalExposure', addOptional(first.totalExposure, second.totalExposure)),
    ...optionalNumber('worstDpd', maxOptional(first.worstDpd, second.worstDpd)),
  };
}

const SORTERS: Readonly<Record<CustomerSortKey, (a: CustomerListRow, b: CustomerListRow) => number>> = {
  arrears: (a, b) => (b.totalArrears ?? -1) - (a.totalArrears ?? -1),
  dpd: (a, b) => (b.worstDpd ?? -1) - (a.worstDpd ?? -1),
  cases: (a, b) => b.caseCount - a.caseCount,
  name: (a, b) => (a.customerName ?? a.customerBusinessId).localeCompare(b.customerName ?? b.customerBusinessId),
};

export function sortCustomerRows(rows: readonly CustomerListRow[], sortKey: CustomerSortKey = 'arrears'): CustomerListRow[] {
  return [...rows].sort(SORTERS[sortKey]);
}

/**
 * The list as a paged source. The aggregate is read once per question and remembered, so scrolling
 * for the next page slices the answer already held rather than asking the platform again; a new
 * question — a search, a scope — is a new aggregate.
 */
export function createCustomerListQuery(adapter: XrmCrmAdapter) {
  let remembered: { fingerprint: string; rows: readonly CustomerListRow[] } | undefined;

  const readRows = async (query: CustomerListQuery, fingerprint: string): Promise<readonly CustomerListRow[]> => {
    if (remembered?.fingerprint === fingerprint) return remembered.rows;
    const answer = await adapter.aggregate(ENTITY_SETS.collectionCase, customerListFetchXml(query));
    if (answer === null) throw new CustomerListRefusedError();
    const rows = sortCustomerRows(shapeCustomerRows(answer), query.sortKey);
    remembered = { fingerprint, rows };
    return rows;
  };

  return async (
    request: CustomerListQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<CustomerListRow>> => {
    const fingerprint = fingerprintQuery(request);
    const rows = await readRows(request, fingerprint);
    const offset = request.continuation === undefined ? 0 : Number(readContinuation(request.continuation, fingerprint));
    const items = rows.slice(offset, offset + request.pageSize);
    const next = offset + request.pageSize;
    if (next >= rows.length) return finalPage(items, request.pageSize, rows.length);
    return buildPage(items, request.pageSize, makeContinuation(String(next), fingerprint), rows.length);
  };
}

function optionalText(key: string, value: unknown): Record<string, string> {
  return typeof value === 'string' && value.length > 0 ? { [key]: value } : {};
}

function optionalNumber(key: string, value: unknown): Record<string, number> {
  return typeof value === 'number' ? { [key]: value } : {};
}

function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

function maxOptional(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}
