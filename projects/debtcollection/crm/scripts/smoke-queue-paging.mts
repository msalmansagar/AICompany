/**
 * smoke-queue-paging.mts
 * WP17 §21 — does the paging architecture actually hold at volume?
 *
 * **Read-only.** It walks real ARR data and writes nothing, because the question is whether
 * continuation, ordering and de-duplication survive a multi-page walk — and that question is best
 * answered against the largest population available rather than a five-row demonstration.
 *
 * What it proves, and what each failure would look like in a queue:
 *
 *   **Every page is bounded.** A page that came back larger than asked would mean the bound is
 *   advisory, and one day a queue returns the book.
 *   **No row appears twice across the walk.** Duplicates are the classic continuation defect, and
 *   in an infinite-scrolling list they are invisible until someone counts.
 *   **No row goes missing.** Walked rows reconcile against the platform's own count.
 *   **Ordering is deterministic across page boundaries**, or rows shuffle between pages and both
 *   of the above break quietly.
 *   **A filter change starts a new walk**, rather than continuing the old one under new terms.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-queue-paging.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const PAGE_SIZE = 100;

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

/** One page, and the platform's own link to the next. */
interface PageResult {
  rows: Record<string, unknown>[];
  nextLink?: string;
  total?: number;
}

async function readPage(
  cfg: Config, token: string, url: string, withCount: boolean,
): Promise<PageResult> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      // The bound is a Prefer header, exactly as the adapter sends it.
      Prefer: `odata.maxpagesize=${PAGE_SIZE}${withCount ? ',odata.include-annotations="*"' : ''}`,
    },
  });
  const body = await response.json() as {
    value?: Record<string, unknown>[];
    '@odata.nextLink'?: string;
    '@odata.count'?: number;
  };
  return {
    rows: body.value ?? [],
    ...(body['@odata.nextLink'] !== undefined ? { nextLink: body['@odata.nextLink'] } : {}),
    ...(body['@odata.count'] !== undefined ? { total: body['@odata.count'] } : {}),
  };
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}  (read-only)\n`);

  await walkEverySnapshot(cfg, token);
  await walkFilteredPopulation(cfg, token);
  await orderingIsDeterministic(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

/** The full walk: 4,373 rows, a hundred at a time. */
async function walkEverySnapshot(cfg: Config, token: string): Promise<void> {
  console.log('─── 1. Walking the whole snapshot population, one bounded page at a time ───');

  const base = `${cfg.apiBase}/qdb_delinquencysnapshots`
    + '?$select=qdb_delinquencysnapshotid,qdb_facilitynumber,qdb_snapshotdate'
    + '&$orderby=qdb_snapshotdate desc,qdb_delinquencysnapshotid asc&$count=true';

  const seen = new Set<string>();
  const order: string[] = [];
  let url: string | undefined = base;
  let pages = 0;
  let total: number | undefined;
  let oversized = 0;

  while (url && pages < 100) {
    const page: PageResult = await readPage(cfg, token, url, pages === 0);
    pages += 1;
    if (page.total !== undefined) total = page.total;
    if (page.rows.length > PAGE_SIZE) oversized += 1;

    for (const row of page.rows) {
      const id = String(row['qdb_delinquencysnapshotid']);
      seen.add(id);
      order.push(id);
    }
    url = page.nextLink;
  }

  console.log(`  walked ${pages} pages, ${order.length} rows, platform total ${total}`);
  check('the walk took multiple pages, so continuation was genuinely exercised', pages > 5,
    `${pages} pages`);
  check('no page exceeded the requested size', oversized === 0, `${oversized} oversized`);
  check('no row appeared twice across the whole walk', seen.size === order.length,
    `${order.length} rows, ${seen.size} distinct`);
  check('every row the platform counted was walked', total !== undefined && seen.size === total,
    `${seen.size} of ${total}`);
  check('the walk terminated on its own rather than hitting the safety stop', pages < 100);
}

/** The same walk, narrowed — the shape an operational queue actually issues. */
async function walkFilteredPopulation(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 2. The same walk, narrowed by the platform ───');

  const base = `${cfg.apiBase}/qdb_delinquencysnapshots`
    + '?$select=qdb_delinquencysnapshotid,qdb_facilitynumber'
    + '&$filter=qdb_isdeceasedperqcb eq true'
    + '&$orderby=qdb_snapshotdate desc,qdb_delinquencysnapshotid asc&$count=true';

  const seen = new Set<string>();
  let url: string | undefined = base;
  let pages = 0;
  let total: number | undefined;
  let rows = 0;

  while (url && pages < 50) {
    const page: PageResult = await readPage(cfg, token, url, pages === 0);
    pages += 1;
    if (page.total !== undefined) total = page.total;
    rows += page.rows.length;
    for (const row of page.rows) seen.add(String(row['qdb_delinquencysnapshotid']));
    url = page.nextLink;
  }

  console.log(`  walked ${pages} pages, ${rows} rows, platform total ${total}`);
  check('the narrowed walk returns exactly the indicated population', total === 724,
    `${total} indicated`);
  check('and walks all of it with no duplicates', seen.size === rows && rows === total,
    `${rows} rows, ${seen.size} distinct`);
  check('the filter narrowed the work rather than the browser doing it',
    (total ?? 0) < 4373, `${total} of 4,373`);
}

/**
 * Ordering across a page boundary.
 *
 * The sort is deliberately two-part — date **and** id. A single non-unique sort key lets the
 * platform return tied rows in any order, which is how a row appears on two pages or on none: the
 * defect the duplicate check above would catch, arriving through the front door.
 */
async function orderingIsDeterministic(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 3. Ordering is stable across a page boundary ───');

  const url = `${cfg.apiBase}/qdb_delinquencysnapshots`
    + '?$select=qdb_delinquencysnapshotid,qdb_snapshotdate'
    + '&$orderby=qdb_snapshotdate desc,qdb_delinquencysnapshotid asc';

  const first = await readPage(cfg, token, url, false);
  const second = await readPage(cfg, token, url, false);
  const firstIds = first.rows.map(row => String(row['qdb_delinquencysnapshotid']));
  const secondIds = second.rows.map(row => String(row['qdb_delinquencysnapshotid']));

  check('the same query returns the same page twice',
    JSON.stringify(firstIds) === JSON.stringify(secondIds), `${firstIds.length} rows compared`);

  const next = first.nextLink ? await readPage(cfg, token, first.nextLink, false) : { rows: [] };
  const nextIds = new Set(next.rows.map(row => String(row['qdb_delinquencysnapshotid'])));
  const overlap = firstIds.filter(id => nextIds.has(id));
  check('page two shares no row with page one', overlap.length === 0,
    `${overlap.length} overlapping`);

  // A different filter must start a new walk — continuing the old one under new terms is the
  // stale-continuation defect.
  const narrowed = await readPage(cfg, token, `${url}&$filter=qdb_isdeceasedperqcb eq true`, false);
  const narrowedIds = new Set(narrowed.rows.map(row => String(row['qdb_delinquencysnapshotid'])));
  check('a filter change produces a different first page, not a continuation of the old one',
    firstIds.some(id => !narrowedIds.has(id)),
    `${narrowed.rows.length} rows under the new filter`);
}

await main();
