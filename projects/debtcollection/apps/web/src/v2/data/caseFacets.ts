import { ARREAR_BUCKET_CODES } from '@dcp/domain';
import type { XrmCrmAdapter } from '../../platform/XrmCrmAdapter.js';
import { codeFor, type CaseQuery } from '../../data/collectionQueries.js';
import { CUSTOMER_LINKS, caseConditions, searchesCustomerName } from '../../data/caseFetchXml.js';
import { BUCKET_LABELS, ENTITY_SETS } from '../../data/schema.js';

/**
 * How many open cases sit in each bucket, for the case list's own filters.
 *
 * The list narrows by `$filter`; its bucket chips need the same population counted per bucket, and
 * that is one FetchXML aggregate grouped by `qdb_currentarrearbucket`. Both are rendered from the
 * **same `CaseQuery`** — `caseFetchXml` is the second rendering, clause for clause, so a chip's
 * count and the list it opens describe one population (asserted against one fake source in the
 * tests, and live by the read-only smoke).
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
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currentarrearbucket" alias="bucket" groupby="true"/>'
    + (searchesCustomerName(query) ? CUSTOMER_LINKS : '')
    + `<filter type="and">${caseConditions(query).join('')}</filter>`
    + '</entity></fetch>';
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
