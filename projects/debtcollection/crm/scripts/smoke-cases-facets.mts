/**
 * smoke-cases-facets.mts
 * Collection Cases V2 against real Dataverse — READ-ONLY. Creates, changes and deletes nothing.
 *
 * Proves what the bucket chips promise: **a chip's count and the list it opens describe the same
 * population.** For each narrowing an officer can apply, the FetchXML facet the page sends and the
 * OData `$filter` the list sends are both rendered by the workspace's own code from one `CaseQuery`,
 * run against the organisation, and compared: the facet's total must equal the `$count`, and each
 * bucket's facet count must equal the `$count` of the same filter narrowed to that bucket.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-cases-facets.mts
 */

import { loadConfig, acquireToken } from './lib/crm-client.mjs';
import { buildCaseFilter, WIDE_SEARCH_FIELDS, type CaseQuery } from '../../apps/web/src/data/collectionQueries.js';
import { caseFacetFetchXml, shapeFacets } from '../../apps/web/src/v2/data/caseFacets.js';

const AUTHORISED_ORG = 'org5869857f';
const HL_SCOPE = 'qdb_organizationcode eq 100000140';

interface Config { apiBase: string; orgUrl: string }
const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };
}

async function facet(cfg: Config, token: string, query: CaseQuery) {
  const response = await fetch(`${cfg.apiBase}/qdb_collectioncases?fetchXml=${encodeURIComponent(caseFacetFetchXml(query))}`, { headers: headers(token) });
  if (!response.ok) return null;
  return shapeFacets(((await response.json()) as { value: Record<string, unknown>[] }).value);
}

async function count(cfg: Config, token: string, filter: string | undefined): Promise<number | null> {
  const response = await fetch(`${cfg.apiBase}/qdb_collectioncases?$top=1&$count=true${filter ? `&$filter=${encodeURIComponent(filter)}` : ''}`, { headers: headers(token) });
  if (!response.ok) return null;
  return ((await response.json()) as { '@odata.count'?: number })['@odata.count'] ?? null;
}

const NARROWINGS: { name: string; query: CaseQuery }[] = [
  { name: 'every open case, both CRMs', query: { openOnly: true } },
  { name: 'Housing Loan scope', query: { openOnly: true, scopeFilter: HL_SCOPE } },
  { name: 'status New', query: { openOnly: true, status: 'New' } },
  { name: 'Strategy Not Assigned', query: { openOnly: true, strategy: 'none' } },
  { name: 'search "DEMO" across identifiers, facility and names', query: { openOnly: true, search: 'DEMO', searchFields: WIDE_SEARCH_FIELDS } },
  { name: 'search "1614" (a synthetic customer name)', query: { openOnly: true, search: '1614', searchFields: WIDE_SEARCH_FIELDS } },
  { name: 'search "Al" with an apostrophe-free name fragment, BFD scope', query: { openOnly: true, search: 'Al', searchFields: WIDE_SEARCH_FIELDS, scopeFilter: 'qdb_organizationcode eq 100000141' } },
  { name: 'my cases (service principal owns none)', query: { openOnly: true, ownerId: '00000000-0000-0000-0000-000000000000' } },
];

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  check('Running against the authorised organisation only', cfg.orgUrl.includes(AUTHORISED_ORG), cfg.orgUrl);
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) process.exit(1);
  const token = await acquireToken(cfg as never);

  for (const { name, query } of NARROWINGS) {
    console.log(`\n─── ${name} ───`);
    const facets = await facet(cfg, token, query);
    const total = await count(cfg, token, buildCaseFilter(query));
    check('the platform answered the facet aggregate', facets !== null);
    if (!facets || total === null) continue;
    check('facet total = $count of the list filter', facets.total === total, `facet ${facets.total} · $count ${total}`);
    for (const [bucket, cases] of Object.entries(facets.counts)) {
      if (cases === 0) continue;
      const narrowed = await count(cfg, token, buildCaseFilter({ ...query, bucket }));
      check(`${bucket}: chip ${cases} = list ${narrowed}`, narrowed === cases);
    }
  }

  const failed = results.filter(result => !result.passed).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed — nothing was written ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
