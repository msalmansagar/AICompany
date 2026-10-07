import { IDENTIFIER_SEARCH_FIELDS, codeFor, type CaseQuery, type CaseSearchField } from './collectionQueries.js';
import { CASE_STATUS_LABELS } from './schema.js';

/**
 * A `CaseQuery` as FetchXML conditions — the second rendering of the one case question.
 *
 * `buildCaseFilter` renders the query as OData for the list; an aggregate over the same population
 * (bucket counts, customers with arrears) needs FetchXML. Both render **the same `CaseQuery`**,
 * clause for clause, so a count and the list it opens can never describe different populations.
 * The bucket is left out here on purpose: the facet groups by it.
 */

/**
 * The customer's name lives on the contact or the account behind the polymorphic lookup. Both are
 * joined as outer links so a case whose customer cannot be read still counts under its identifiers.
 */
export const CUSTOMER_LINKS = '<link-entity name="contact" from="contactid" to="qdb_customerid" link-type="outer" alias="customercontact"/>'
  + '<link-entity name="account" from="accountid" to="qdb_customerid" link-type="outer" alias="customeraccount"/>';

/** True when the query searches the customer's name, which needs `CUSTOMER_LINKS` joined. */
export function searchesCustomerName(query: CaseQuery): boolean {
  return (query.searchFields ?? IDENTIFIER_SEARCH_FIELDS).includes('customerName');
}

export function caseConditions(query: CaseQuery): string[] {
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

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
