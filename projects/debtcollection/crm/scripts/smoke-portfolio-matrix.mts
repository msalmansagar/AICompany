/**
 * smoke-portfolio-matrix.mts
 * Portfolio & Strategy against real Dataverse — READ-ONLY. Creates, changes and deletes nothing.
 *
 * Proves the one thing the matrix promises: **a cell's figures and the list it opens describe the
 * same population.** For every populated bucket × strategy cell of the live aggregate, the same
 * `$filter` the Collection Cases list sends is counted (`$count`) and paged to its end, and:
 *
 *   count(filter)            == aggregate cases
 *   Σ arrears over the pages == aggregate arrears   (to the cent)
 *
 * All three reads run under the same identity, so security scopes them alike. The identity here is
 * the service principal; the browser QA repeats representative cells as the signed-in administrator.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-portfolio-matrix.mts
 */

import { loadConfig, acquireToken } from './lib/crm-client.mjs';
import { ARREAR_BUCKET_CODES } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
/** The case list's own registry, kept identical here so the smoke reads what the workspace reads. */
const BUCKET_VALUES: Record<string, number> = {
  '1-30': 100000000, '31-60': 100000001, '61-90': 100000002, '91-180': 100000003, '181-270': 100000004,
  '271-360': 100000005, '361-500': 100000006, '501-1000': 100000007, '1001-2000': 100000008, '>2000': 100000009,
};
const BUCKET_BY_VALUE = new Map(Object.entries(BUCKET_VALUES).map(([code, value]) => [value, code]));
const ANNOTATIONS = { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' };

interface Config { apiBase: string; orgUrl: string }
type Row = Record<string, unknown>;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (!passed) { console.error('\n[ABORT] A fact this run depends on is unavailable.'); process.exit(1); }
};

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra };
}

async function aggregate(cfg: Config, token: string, scopeClause: string): Promise<Row[]> {
  const fetchXml = '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/>'
    + '<attribute name="qdb_currentarrearbucket" alias="bucket" groupby="true"/>'
    + '<attribute name="qdb_strategyid" alias="strategy" groupby="true"/>'
    + `<filter><condition attribute="statecode" operator="eq" value="0"/>${scopeClause}</filter></entity></fetch>`;
  const response = await fetch(`${cfg.apiBase}/qdb_collectioncases?fetchXml=${encodeURIComponent(fetchXml)}`, { headers: headers(token, ANNOTATIONS) });
  if (!response.ok) throw new Error(`aggregate ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { value: Row[] }).value;
}

async function countMatching(cfg: Config, token: string, filter: string): Promise<number | null> {
  const response = await fetch(`${cfg.apiBase}/qdb_collectioncases?$top=1&$count=true&$filter=${encodeURIComponent(filter)}`, { headers: headers(token) });
  if (!response.ok) return null;
  return ((await response.json()) as { '@odata.count'?: number })['@odata.count'] ?? null;
}

/** Pages the filter to its end, the way the list would, summing arrears and counting rows. */
async function pageAll(cfg: Config, token: string, filter: string): Promise<{ rows: number; arrears: number }> {
  let next: string | undefined = `${cfg.apiBase}/qdb_collectioncases?$select=qdb_currenttotalarrears&$filter=${encodeURIComponent(filter)}`;
  let rows = 0; let arrears = 0;
  while (next) {
    const response = await fetch(next, { headers: headers(token, { Prefer: 'odata.maxpagesize=500' }) });
    if (!response.ok) throw new Error(`page ${response.status}`);
    const body = (await response.json()) as { value: Row[]; '@odata.nextLink'?: string };
    rows += body.value.length;
    arrears += body.value.reduce((sum, row) => sum + (typeof row['qdb_currenttotalarrears'] === 'number' ? (row['qdb_currenttotalarrears'] as number) : 0), 0);
    next = body['@odata.nextLink'];
  }
  return { rows, arrears };
}

/** The cell's filter, composed exactly as `toCaseFilter` composes it in the workspace. */
function cellFilter(bucket: string, strategy: string | null, scopeClause: string): string {
  const clauses = [
    ...(scopeClause ? [scopeClause] : []),
    'statecode eq 0',
    strategy ? `_qdb_strategyid_value eq ${strategy}` : '_qdb_strategyid_value eq null',
    `qdb_currentarrearbucket eq ${BUCKET_VALUES[bucket]}`,
  ];
  return clauses.join(' and ');
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  require_('Running against the authorised organisation only', cfg.orgUrl.includes(AUTHORISED_ORG), cfg.orgUrl);
  const token = await acquireToken(cfg as never);

  for (const [scopeName, scopeClause, fetchScope] of [
    ['both CRMs', '', ''],
    ['Housing Loan', 'qdb_organizationcode eq 100000140', '<condition attribute="qdb_organizationcode" operator="eq" value="100000140"/>'],
  ] as const) {
    console.log(`\n─── Scope: ${scopeName} ───`);
    const rows = await aggregate(cfg, token, fetchScope);
    const populated = rows.filter(row => typeof row['bucket'] === 'number');
    require_(`the platform aggregated the ${scopeName} portfolio`, rows.length > 0, `${rows.length} groups`);
    const bucketsSeen = new Set(populated.map(row => BUCKET_BY_VALUE.get(Number(row['bucket'])) ?? `unknown:${String(row['bucket'])}`));
    check('every grouped bucket is one of the ten MIS codes', [...bucketsSeen].every(code => (ARREAR_BUCKET_CODES as readonly string[]).includes(code)), [...bucketsSeen].join(', '));

    let total = 0;
    for (const row of populated) {
      const bucket = BUCKET_BY_VALUE.get(Number(row['bucket'])) ?? `unknown:${String(row['bucket'])}`;
      const strategy = typeof row['strategy'] === 'string' ? row['strategy'] : null;
      const label = strategy ? String(row[`strategy${FORMATTED}`] ?? strategy) : 'Strategy Not Assigned';
      const cases = Number(row['cases']); const arrears = Number(row['arrears'] ?? 0);
      const filter = cellFilter(bucket, strategy, scopeClause);
      const counted = await countMatching(cfg, token, filter);
      const paged = await pageAll(cfg, token, filter);
      total += cases;
      const countOk = counted !== null && counted === cases && paged.rows === cases;
      const sumOk = Math.abs(paged.arrears - arrears) < 0.005;
      check(`${bucket} × ${label}: count reconciles`, countOk, `matrix ${cases} · $count ${counted} · paged ${paged.rows}`);
      check(`${bucket} × ${label}: arrears reconcile`, sumOk, `matrix ${arrears.toFixed(2)} · paged ${paged.arrears.toFixed(2)}`);
    }
    const unbucketed = rows.filter(row => typeof row['bucket'] !== 'number').reduce((sum, row) => sum + Number(row['cases']), 0);
    console.log(`      ${populated.length} populated cells · ${total} cases in rows · ${unbucketed} open case(s) with no bucket`);
  }

  const failed = results.filter(result => !result.passed).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed — nothing was written ===`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(1); });
