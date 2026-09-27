import { ARREAR_BUCKET_CODES } from '@dcp/domain';
import type { XrmCrmAdapter } from '../../platform/XrmCrmAdapter.js';
import { IDENTIFIER_SEARCH_FIELDS, codeFor, type CaseQuery, type CaseSearchField } from '../../data/collectionQueries.js';
import { BUCKET_LABELS, CASE_STATUS_LABELS, ENTITY_SETS } from '../../data/schema.js';

/**
 * How many open cases sit in each bucket, for the case list's own filters.
 *
 * The list narrows by `$filter`; its bucket chips need the same population counted per bucket, and
 * that is one FetchXML aggregate grouped by `qdb_currentarrearbucket`. Both are rendered from the
 * **same `CaseQuery`** — this module is the second rendering, clause for clause, so a chip's count
 * and the list it opens describe one population (asserted against one fake source in the tests,
 * and live by the read-only smoke).
 *
 * The aggregate runs as the signed-in user and is refused above the organisation's aggregate limit,
 * in which case every count is *unknown* — never zero — and the chips still filter.
 */

export interface BucketFacets {
  /** Cases per bucket label. A bucket with no cases is 0 here; an unknown answer is `null`. */
  counts: Readonly<Record<string, number>>;
  /** Every case the query matches, whatever its bucket — the "All" chip. */
  total: number;
  /** Matching cases that carry no MIS bucket and so sit in no row. */
  unbucketed: number;
}

/** The same narrowing as `buildCaseFilter`, as FetchXML conditions. The bucket itself is left out. */
export function caseFacetFetchXml(query: CaseQuery): string {
  const linked = (query.searchFields ?? IDENTIFIER_SEARCH_FIELDS).includes('customerName');
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currentarrearbucket" alias="bucket" groupby="true"/>'
    + (linked ? CUSTOMER_LINKS : '')
    + `<filter type="and">${conditions(query).join('')}</filter>`
    + '</entity></fetch>';
}

/**
 * The customer's name lives on the contact or the account behind the polymorphic lookup. Both are
 * joined as outer links so a case whose customer cannot be read still counts under its identifiers.
 */
const CUSTOMER_LINKS = '<link-entity name="contact" from="contactid" to="qdb_customerid" link-type="outer" alias="customercontact"/>'
  + '<link-entity name="account" from="accountid" to="qdb_customerid" link-type="outer" alias="customeraccount"/>';

function conditions(query: CaseQuery): string[] {
  const clauses: string[] = [];
  if (query.scopeFilter) clauses.push(scopeCondition(query.scopeFilter));
  if (query.openOnly) clauses.push('<condition attribute="statecode" operator="eq" value="0"/>');
  if (query.strategy === 'none') clauses.push('<condition attribute="qdb_strategyid" operator="null"/>');
  else if (query.strategy) clauses.push(`<condition attribute="qdb_strategyid" operator="eq" value="${escapeXml(query.strategy)}"/>`);
  if (query.status) {
    const value = codeFor(CASE_STATUS_LABELS, query.status);
    if (value !== undefined) clauses.push(`<condition attribute="statuscode" operator="eq" value="${value}"/>`);
  }
  if (query.customerBusinessId) clauses.push(`<condition attribute="qdb_customerbusinessid" operator="eq" value="${escapeXml(query.customerBusinessId)}"/>`);
  if (query.ownerId) clauses.push(`<condition attribute="ownerid" operator="eq" value="${escapeXml(query.ownerId)}"/>`);
  if (query.search) clauses.push(searchConditions(query.search, query.searchFields ?? IDENTIFIER_SEARCH_FIELDS));
  return clauses;
}

/** `qdb_organizationcode eq 100000140`, as the scope hands it over, becomes one condition. */
function scopeCondition(scopeFilter: string): string {
  const match = /^qdb_organizationcode eq (\d+)$/.exec(scopeFilter);
  if (!match) throw new Error(`The CRM scope filter is not one the facet can render: ${scopeFilter}`);
  return `<condition attribute="qdb_organizationcode" operator="eq" value="${match[1]}"/>`;
}

const SEARCH_CONDITIONS: Readonly<Record<CaseSearchField, (term: string) => string>> = {
  caseNumber: term => `<condition attribute="qdb_casenumber" operator="like" value="%${term}%"/>`,
  customerBusinessId: term => `<condition attribute="qdb_customerbusinessid" operator="like" value="%${term}%"/>`,
  facilityNumber: term => `<condition attribute="qdb_facilitynumber" operator="like" value="%${term}%"/>`,
  customerName: term => `<condition entityname="customercontact" attribute="fullname" operator="like" value="%${term}%"/>`
    + `<condition entityname="customeraccount" attribute="name" operator="like" value="%${term}%"/>`,
};

function searchConditions(search: string, fields: readonly CaseSearchField[]): string {
  const term = escapeXml(search);
  return `<filter type="or">${fields.map(field => SEARCH_CONDITIONS[field](term)).join('')}</filter>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Reads the facets, or `null` when the platform refuses the aggregate. */
export async function loadBucketFacets(adapter: XrmCrmAdapter, query: CaseQuery): Promise<BucketFacets | null> {
  const rows = await adapter.aggregate(ENTITY_SETS.collectionCase, caseFacetFetchXml(query));
  if (rows === null) return null;
  return shapeFacets(rows);
}

export function shapeFacets(rows: readonly Record<string, unknown>[]): BucketFacets {
  const counts: Record<string, number> = Object.fromEntries(ARREAR_BUCKET_CODES.map(code => [code, 0]));
  let total = 0;
  let unbucketed = 0;
  for (const row of rows) {
    const cases = typeof row['cases'] === 'number' ? row['cases'] : 0;
    total += cases;
    const label = typeof row['bucket'] === 'number' ? BUCKET_LABELS[row['bucket']] : undefined;
    if (label === undefined) unbucketed += cases;
    else counts[label] = (counts[label] ?? 0) + cases;
  }
  return { counts, total, unbucketed };
}

/** The bucket option value a label stands for — what a chip sends when it filters. */
export const bucketValueOf = (label: string) => codeFor(BUCKET_LABELS, label);
