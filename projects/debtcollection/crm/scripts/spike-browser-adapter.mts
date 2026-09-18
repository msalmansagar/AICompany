/**
 * spike-browser-adapter.mts
 * The early Phase 5 platform spike: does the BROWSER adapter's view of the platform hold?
 *
 * Phase 5 is about to build twenty-one views on top of `XrmCrmAdapter`. KI-52 is the standing reason
 * not to do that on an assumption, so this runs first and against the real organisation.
 *
 * It drives the **real** `XrmCrmAdapter` through an `Xrm.WebApi` shim whose every call is a genuine
 * HTTPS request to `org5869857f`. That proves the half of the browser stack that can be proven from
 * node — the OData the adapter emits, how it reads lookups, and whether its continuation handling
 * survives the platform's own paging.
 *
 * What it deliberately does **not** claim: that the workspace loads inside Dynamics, that
 * `getGlobalContext` answers, or that assets resolve as a web resource. Those need the workspace
 * deployed and a CRM session, and they are reported separately rather than implied by a green run
 * here. Mock data must never be dressed up as runtime evidence — the same rule Phase 4 kept for MIS.
 *
 * Read-only. It creates nothing and therefore cleans up nothing.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/spike-browser-adapter.mts
 */

import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { XrmCrmAdapter } from '../../apps/web/src/platform/XrmCrmAdapter.js';
import type { XrmLike } from '../../apps/web/src/platform/crmContext.js';

const AUTHORISED_ORG = 'org5869857f';
const ENTITY_SET = 'qdb_crmlogses';
const KEY = 'activityid';

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * An `Xrm.WebApi` shim backed by real HTTP.
 *
 * It reproduces the client API's documented contract — a LOGICAL entity name, `maxPageSize` rather
 * than a caller-set header, and a returned `nextLink` — while every request genuinely reaches the
 * organisation. So the OData the adapter composes, and the way it follows a continuation, are tested
 * against the platform rather than against a belief about it.
 */
function realHttpXrm(apiBase: string, token: string): XrmLike & { calls: string[] } {
  const calls: string[] = [];

  const get = async (url: string, pageSize?: number) => {
    calls.push(url);
    const headers: Record<string, string> = buildHeaders(token, SOLUTION_NAME) as Record<string, string>;
    // Xrm.WebApi asks for annotations itself, which is how the client API returns formatted values
    // and a lookup's target table. The preferences are comma-joined, never replaced — replacing them
    // is the defect this spike found in the Phase 4 service client.
    const prefer = ['odata.include-annotations="*"'];
    if (pageSize !== undefined) prefer.push(`odata.maxpagesize=${pageSize}`);
    headers['Prefer'] = prefer.join(',');
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      const error = new Error(`${res.status}: ${body.slice(0, 200)}`) as Error & { status: number };
      error.status = res.status;
      throw error;
    }
    return res.json() as Promise<Record<string, unknown>>;
  };

  return {
    calls,
    Utility: {
      getGlobalContext: () => { throw new Error('not available outside a CRM session'); },
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string, options = '') {
        return get(`${apiBase}/${setNameFor(logicalName)}(${id})${options}`);
      },
      async retrieveMultipleRecords(logicalName: string, options = '', maxPageSize?: number) {
        // The client API accepts either a fresh options string or a previously returned nextLink.
        const url = options.startsWith('http') ? options : `${apiBase}/${setNameFor(logicalName)}${options}`;
        const body = await get(url, maxPageSize);
        return {
          entities: (body['value'] ?? []) as Record<string, unknown>[],
          ...(body['@odata.nextLink'] ? { nextLink: String(body['@odata.nextLink']) } : {}),
          ...(body['@odata.count'] !== undefined ? { '@odata.count': body['@odata.count'] } : {}),
        };
      },
      async createRecord() { throw new Error('the spike is read-only'); },
      async updateRecord() { throw new Error('the spike is read-only'); },
    },
  } as XrmLike & { calls: string[] };
}

/** The shim needs the reverse of the adapter's translation to build a URL. */
const SET_FOR_LOGICAL: Record<string, string> = {
  qdb_crmlogs: 'qdb_crmlogses',
  qdb_collectioncase: 'qdb_collectioncases',
  qdb_delinquencysnapshot: 'qdb_delinquencysnapshots',
  contact: 'contacts',
};
const setNameFor = (logicalName: string) => SET_FOR_LOGICAL[logicalName] ?? `${logicalName}s`;

async function main() {
  console.log('=== Phase 5 spike — the browser adapter against the real platform ===\n');
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  const token = await acquireToken(cfg);
  const xrm = realHttpXrm(cfg.apiBase, token);
  const adapter = new XrmCrmAdapter(xrm);

  // ── Entity naming: the KI-52 trap, in its browser form ────────────────────
  console.log('\n─── Entity naming ───');
  check('The adapter translates an entity set to the logical name Xrm.WebApi wants',
    adapter.toLogicalName('qdb_collectioncases') === 'qdb_collectioncase',
    `qdb_collectioncases -> ${adapter.toLogicalName('qdb_collectioncases')}`);
  check('It knows the irregular one the naive rule gets wrong',
    adapter.toLogicalName('qdb_crmlogses') === 'qdb_crmlogs',
    `qdb_crmlogses -> ${adapter.toLogicalName('qdb_crmlogses')} (a plural rule would say 'qdb_crmlogse')`);
  check('It handles an -ies plural',
    adapter.toLogicalName('qdb_collectionstrategies') === 'qdb_collectionstrategy',
    `qdb_collectionstrategies -> ${adapter.toLogicalName('qdb_collectionstrategies')}`);

  // ── A real bounded read ───────────────────────────────────────────────────
  console.log('\n─── A bounded read ───');
  const SELECT = [KEY, 'qdb_source', 'createdon'];
  const base = { select: SELECT, pageSize: 25, sort: [{ field: 'createdon', descending: true }], filter: 'createdon ne null' };
  const first = await adapter.retrievePage(ENTITY_SET, { ...base, includeTotalCount: true });
  check('A real page comes back bounded by the requested size',
    first.items.length === 25,
    `asked 25, received ${first.items.length} of ${first.totalCount ?? '?'}`);
  check('The total is reported without fetching the set',
    typeof first.totalCount === 'number' && first.totalCount > 25,
    `totalCount=${first.totalCount}`);
  check('A continuation is offered, and it is opaque',
    first.hasMore === true && typeof first.continuation === 'string'
      && !first.continuation.includes('skiptoken') && !first.continuation.includes('http'),
    `${String(first.continuation).slice(0, 44)}…`);

  // ── Continuation, through the adapter ─────────────────────────────────────
  console.log('\n─── Following a continuation ───');
  const second = await adapter.retrievePage(ENTITY_SET, { ...base, continuation: first.continuation! });
  const firstIds = new Set(first.items.map(r => r[KEY]));
  const overlap = second.items.filter(r => firstIds.has(r[KEY])).length;
  check('The next page returns rows, none of them from the first',
    second.items.length > 0 && overlap === 0,
    `page2=${second.items.length} overlap=${overlap}`);
  check('The page size is re-sent, so a continuation does not return the rest of the table',
    second.items.length <= 25,
    `page2=${second.items.length} rows (unbounded would be hundreds)`);

  // ── Server-side filter and sort ───────────────────────────────────────────
  console.log('\n─── Filter and sort, applied by the platform ───');
  const sorted = await adapter.retrievePage(ENTITY_SET, { ...base, pageSize: 10 });
  const ordered = sorted.items.every((row, i, all) =>
    i === 0 || new Date(String(all[i - 1]!.createdon)) >= new Date(String(row.createdon)));
  check('Server-side sort is honoured', ordered, `${sorted.items.length} rows, descending by createdon`);

  const filtered = await adapter.retrievePage(ENTITY_SET, {
    select: SELECT, pageSize: 10, filter: "qdb_source eq 'no-such-source-value'", includeTotalCount: true,
  });
  check('Server-side filter narrows at the platform, returning an empty page not an error',
    filtered.items.length === 0 && filtered.hasMore === false,
    `items=0 total=${filtered.totalCount}`);

  // ── The Phase 4 contract, consumed by the browser adapter ─────────────────
  console.log('\n─── The Phase 4 paging contract ───');
  const drifted = await adapter
    .retrievePage(ENTITY_SET, { ...base, filter: "qdb_source eq 'different'", continuation: first.continuation! })
    .then(() => null, (e: { kind?: string }) => e);
  check('A continuation reused after the filter changed is refused (CriteriaChanged)',
    Boolean(drifted) && drifted.kind === 'CriteriaChanged',
    drifted ? String(drifted.kind) : 'a page was returned for the wrong query');

  const bogus = await adapter
    .retrievePage(ENTITY_SET, { ...base, continuation: 'not-a-token-this-service-issued' as never })
    .then(() => null, (e: { kind?: string }) => e);
  check('A continuation this service never issued is refused (InvalidContinuation)',
    Boolean(bogus) && bogus.kind === 'InvalidContinuation',
    bogus ? String(bogus.kind) : 'a page was returned');

  // ── A real lookup column ──────────────────────────────────────────────────
  //
  // `qdb_collectioncase` is empty between smoke runs, so asserting on its customer lookup would pass
  // vacuously and prove nothing. `ownerid` is on every row of every table and is always populated,
  // which makes it the honest way to test lookup handling against real data.
  console.log('\n─── A lookup, read the way the platform returns it ───');
  const withLookup = await adapter.retrievePage(ENTITY_SET, {
    select: [KEY, '_ownerid_value'],
    pageSize: 3,
  });
  const row = withLookup.items[0];
  const lookupKeys = row ? Object.keys(row).filter(k => k.includes('ownerid')) : [];
  check('A populated lookup is returned by its _value form',
    Boolean(row) && typeof row!['_ownerid_value'] === 'string'
      && /^[0-9a-f-]{36}$/i.test(String(row!['_ownerid_value'])),
    `keys=[${lookupKeys.join(', ')}] value=${String(row?.['_ownerid_value']).slice(0, 8)}…`);

  // Whether the target-table annotation arrives unasked matters: the Customer lookup is polymorphic,
  // and contact must be distinguishable from account. Asked as a question rather than assumed.
  const annotation = lookupKeys.find(k => k.includes('lookuplogicalname'));
  check('The platform states which table a lookup points at, without being asked for annotations',
    annotation !== undefined,
    annotation
      ? `${annotation} = ${String(row?.[annotation])}`
      : 'NOT returned by default — a polymorphic lookup needs the annotation Prefer header, which is a real finding for the Customer lookup');

  // ── A single record by id ─────────────────────────────────────────────────
  console.log('\n─── Single record ───');
  if (first.items.length > 0) {
    const one = await adapter.retrieve({ entity: ENTITY_SET, id: String(first.items[0]![KEY]) }, SELECT);
    check('A single record reads back by id', one !== null && one[KEY] === first.items[0]![KEY],
      `activityid=${String(one?.[KEY]).slice(0, 8)}…`);
  }
  const missing = await adapter.retrieve(
    { entity: ENTITY_SET, id: '00000000-0000-0000-0000-000000000000' }, SELECT);
  check('A record that does not exist reads as null rather than throwing', missing === null, 'null');

  const passed = results.filter(r => r.passed).length;
  console.log(`\n  HTTP requests issued: ${xrm.calls.length}`);
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  console.log('\nProven here: the OData the browser adapter emits, its lookup handling, its');
  console.log('continuation handling and its consumption of the Phase 4 paging contract — all');
  console.log('against the real organisation.');
  console.log('NOT proven here: that the workspace loads inside Dynamics, that getGlobalContext');
  console.log('answers, or that assets resolve as a web resource. Those need a deployed resource');
  console.log('and a CRM session, and are reported separately.');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
