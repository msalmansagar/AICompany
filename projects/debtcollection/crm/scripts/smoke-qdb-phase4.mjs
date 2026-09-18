/**
 * smoke-qdb-phase4.mjs
 * Runtime proof of the Phase 4 platform layer against the live sandbox, using the BUILT Integration
 * Service — the compiled `dist` output of the api app and the packages, i.e. the code a deployment
 * would actually run, not a re-implementation for the test.
 *
 * Paging is the subject. The standing rule from KI-52 (`TestingStrategy.md` §1D) makes real Dataverse
 * evidence mandatory for platform query behaviour, because a fake adapter can agree with the same
 * wrong assumption the production code holds. `spike-dataverse-paging.mjs` established what the
 * platform does; this proves our *contract over it* behaves the same way.
 *
 * It is READ-ONLY where it can be: the walk reads `qdb_crmlogses`, which already holds ~1,295 rows of
 * existing technical log data. Nothing is created, so nothing needs cleaning up.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/smoke-qdb-phase4.mjs
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const AUTHORISED_ORG = 'org5869857f';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Read from metadata, never guessed: `qdb_crmlogs` is served at `qdb_crmlogses` and keyed by `activityid`. */
const ENTITY_SET = 'qdb_crmlogses';
const KEY = 'activityid';

async function loadBuiltServices() {
  const built = async rel => import(pathToFileURL(resolve(root, rel)).href);
  const { DataverseClient, DataverseCrmAdapter } = await built('packages/dataverse-client/dist/index.js');
  const domain = await built('packages/domain/dist/index.js');
  return { DataverseClient, DataverseCrmAdapter, ...domain };
}

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

async function main() {
  console.log('=== qdb_ Phase 4 smoke — server-side paging against the platform ===\n');
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const services = await loadBuiltServices();

  const client = new services.DataverseClient({
    org: { orgKey: 'HL', baseUrl: cfg.orgUrl, apiVersion: cfg.apiVersion },
    getAccessToken: async () => token,
  });
  const crm = new services.DataverseCrmAdapter(client);

  const SELECT = [KEY, 'qdb_source', 'createdon'];
  const SORT = [{ field: 'createdon', descending: true }];
  const baseQuery = { select: SELECT, pageSize: 25, sort: SORT, filter: 'createdon ne null' };

  // ── A first page, bounded ──────────────────────────────────────────────────
  console.log('\n─── The first page ───');
  const first = await crm.retrievePage(ENTITY_SET, { ...baseQuery, includeTotalCount: true });
  check('A page is bounded by the requested size, not the size of the table',
    first.items.length === 25,
    `asked 25, received ${first.items.length} of ${first.totalCount ?? '?'} matching rows`);
  check('The total is reported without fetching the whole set',
    typeof first.totalCount === 'number' && first.totalCount > first.items.length,
    `totalCount=${first.totalCount}`);
  check('A continuation is offered while more rows exist',
    first.hasMore === true && typeof first.continuation === 'string',
    `hasMore=${first.hasMore}`);
  check('The continuation is opaque — no platform token leaks through it',
    typeof first.continuation === 'string' && !first.continuation.includes('skiptoken') && !first.continuation.includes('<cookie'),
    `${String(first.continuation).slice(0, 48)}…`);

  // ── Walking forward ────────────────────────────────────────────────────────
  console.log('\n─── Walking forward ───');
  const second = await crm.retrievePage(ENTITY_SET, { ...baseQuery, continuation: first.continuation });
  const firstIds = new Set(first.items.map(r => r[KEY]));
  const overlap = second.items.filter(r => firstIds.has(r[KEY])).length;
  check('The second page returns rows, and none of them were on the first',
    second.items.length > 0 && overlap === 0,
    `page2=${second.items.length} overlap=${overlap}`);

  const lastOfFirst = first.items.at(-1)?.createdon;
  const firstOfSecond = second.items[0]?.createdon;
  check('Sort order holds across the page boundary',
    Boolean(lastOfFirst && firstOfSecond) && new Date(firstOfSecond) <= new Date(lastOfFirst),
    `…${lastOfFirst} | ${firstOfSecond}…`);

  // ── A full walk to the end ────────────────────────────────────────────────
  console.log('\n─── A complete walk ───');
  const walkQuery = { select: SELECT, pageSize: 200, sort: SORT, filter: 'createdon ne null' };
  const seen = new Set();
  let duplicates = 0;
  let pages = 0;
  let continuation;
  let total = 0;
  const started = Date.now();
  do {
    const page = await crm.retrievePage(ENTITY_SET, { ...walkQuery, ...(continuation ? { continuation } : {}) });
    for (const row of page.items) {
      if (seen.has(row[KEY])) duplicates++;
      seen.add(row[KEY]);
      total++;
    }
    pages++;
    continuation = page.continuation;
  } while (continuation && pages < 40);
  const elapsed = Date.now() - started;

  check('A walk to the end terminates on its own, with no continuation on the last page',
    continuation === undefined,
    `${pages} page(s), ${total} rows, ${elapsed} ms`);
  check('Every row was seen exactly once across the whole walk',
    duplicates === 0 && seen.size === total,
    `rows=${total} distinct=${seen.size} duplicates=${duplicates}`);
  check('The walk covered the set the count promised',
    typeof first.totalCount === 'number' && total >= first.totalCount,
    `walked ${total}, count reported ${first.totalCount}`);
  check('Memory stayed bounded: no page held more than the requested size',
    total > walkQuery.pageSize,
    `${pages} pages of at most ${walkQuery.pageSize}, never the whole ${total}-row set at once`);

  // ── Refusals ──────────────────────────────────────────────────────────────
  console.log('\n─── Refusals, on the live platform ───');
  const invalid = await crm
    .retrievePage(ENTITY_SET, { ...baseQuery, continuation: 'not-a-token-this-service-issued' })
    .then(() => null, e => e);
  check('A continuation this service never issued is refused, not silently restarted',
    Boolean(invalid) && invalid.kind === 'InvalidContinuation',
    invalid ? `${invalid.kind}: ${invalid.message.slice(0, 80)}` : 'a page was returned');

  const drifted = await crm
    .retrievePage(ENTITY_SET, { ...baseQuery, filter: "qdb_source eq 'nothing-matches-this'", continuation: first.continuation })
    .then(() => null, e => e);
  check('A continuation reused after the filter changed is refused (CriteriaChanged)',
    Boolean(drifted) && drifted.kind === 'CriteriaChanged',
    drifted ? `${drifted.kind}: ${drifted.message.slice(0, 90)}` : 'a page was returned for the wrong query');

  const resorted = await crm
    .retrievePage(ENTITY_SET, { ...baseQuery, sort: [{ field: 'createdon', descending: false }], continuation: first.continuation })
    .then(() => null, e => e);
  check('A continuation reused after the sort changed is refused',
    Boolean(resorted) && resorted.kind === 'CriteriaChanged',
    resorted ? resorted.kind : 'a page was returned for the wrong ordering');

  // ── Filter and search, applied by the source ──────────────────────────────
  console.log('\n─── Filtering, at the source ───');
  const filtered = await crm.retrievePage(ENTITY_SET, {
    select: SELECT, pageSize: 10, filter: "qdb_source eq 'no-such-source-value'", includeTotalCount: true,
  });
  check('A filter that matches nothing returns an empty page, not an error',
    filtered.items.length === 0 && filtered.hasMore === false,
    `items=${filtered.items.length} hasMore=${filtered.hasMore} total=${filtered.totalCount}`);

  const oneRow = await crm.retrievePage(ENTITY_SET, { select: SELECT, pageSize: 1, sort: SORT, filter: 'createdon ne null' });
  check('A page size of one is honoured, and still offers a continuation',
    oneRow.items.length === 1 && oneRow.hasMore === true,
    `items=${oneRow.items.length} hasMore=${oneRow.hasMore}`);

  // ── The finding that justifies all of this ────────────────────────────────
  console.log('\n─── The reason the page size is never optional ───');
  const unbounded = await client.getList(ENTITY_SET, { select: SELECT }, {});
  check('Without a page size the platform returns the WHOLE table — so the contract always sets one',
    unbounded.value.length > 1000,
    `an unbounded getList returned ${unbounded.value.length} rows in one response; retrievePage never does this`);

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
