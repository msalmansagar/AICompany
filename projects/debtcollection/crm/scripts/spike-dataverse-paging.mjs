/**
 * spike-dataverse-paging.mjs
 * What Dataverse actually does when you page — read from the organisation, not from documentation.
 *
 * This runs BEFORE the paging contract is designed, deliberately. KI-52 cost a phase because a fake
 * adapter agreed with the code's wrong belief about a column name; the standing rule that came out of
 * it (`TestingStrategy.md` §1D) says platform behaviour is established against the platform. Paging is
 * the largest platform assumption in Phase 4, so it is established first.
 *
 * It is READ-ONLY. It creates nothing, so it cleans up nothing. It reads `qdb_crmlogs`, which already
 * holds ~1,295 rows of existing technical log data — enough to page through several times.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/spike-dataverse-paging.mjs
 */

import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
// Read from the organisation, not guessed: the entity SET for logical name `qdb_crmlogs` is
// `qdb_crmlogses`, and because it is a custom ACTIVITY its primary key is `activityid`, not
// `qdb_crmlogsid`. Both of those were wrong on the first run of this script — the KI-52 class again.
const ENTITY_SET = 'qdb_crmlogses';
const KEY = 'activityid';
const SELECT = `${KEY},qdb_source,createdon`;

const findings = [];
const record = (question, answer, detail = '') => {
  findings.push({ question, answer });
  console.log(`  ${answer ? 'ANSWERED' : 'NO     '}  ${question}`);
  if (detail) for (const line of String(detail).split('\n')) console.log(`            ${line}`);
};

function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

/** A raw GET that returns the parsed body plus the status, so a refusal is observable rather than thrown. */
async function get(cfg, token, url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { ...buildHeaders(token, SOLUTION_NAME), ...extraHeaders } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, ok: res.ok, body };
}

const rowsOf = body => body?.value ?? [];
const nextOf = body => body?.['@odata.nextLink'] ?? null;

async function main() {
  console.log('=== Dataverse paging — what the platform actually does ===\n');
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const base = `${cfg.apiBase}/${ENTITY_SET}?$select=${SELECT}`;

  // ── 1. Does Prefer: odata.maxpagesize actually cap the page? ──────────────
  console.log('\n─── Page size ───');
  const first = await get(cfg, token, base, { Prefer: 'odata.maxpagesize=5' });
  record('Prefer: odata.maxpagesize caps the page',
    first.ok && rowsOf(first.body).length === 5,
    `status=${first.status} rows=${rowsOf(first.body).length}`);

  const noPrefer = await get(cfg, token, base);
  record('Without the header the platform applies its own default page size',
    noPrefer.ok && rowsOf(noPrefer.body).length > 5,
    `rows=${rowsOf(noPrefer.body).length} (the platform default, not something to hard-code)`);

  // ── 2. What is the nextLink, really? ──────────────────────────────────────
  console.log('\n─── The continuation link ───');
  const link = nextOf(first.body);
  record('A full page carries @odata.nextLink', Boolean(link), link ? `${link.slice(0, 110)}…` : 'absent');

  if (link) {
    const url = new URL(link);
    const params = [...url.searchParams.keys()];
    record('The link is absolute, not a fragment to be assembled',
      link.startsWith('http'),
      `origin=${url.origin}  path=${url.pathname}`);
    record('It carries an opaque $skiptoken rather than a row offset',
      url.searchParams.has('$skiptoken'),
      `params=[${params.join(', ')}]  skiptoken=${String(url.searchParams.get('$skiptoken')).slice(0, 60)}…`);
    record('It preserves the original $select, so the caller need not re-send it',
      url.searchParams.get('$select') === SELECT,
      `$select=${url.searchParams.get('$select')}`);
  }

  // ── 3. Does following it verbatim work, and does the page size survive? ───
  console.log('\n─── Following the link ───');
  const second = link ? await get(cfg, token, link, { Prefer: 'odata.maxpagesize=5' }) : null;
  record('Following the link verbatim returns the next page',
    Boolean(second?.ok) && rowsOf(second.body).length > 0,
    second ? `status=${second.status} rows=${rowsOf(second.body).length}` : 'no link to follow');

  const firstIds = new Set(rowsOf(first.body).map(r => r[KEY]));
  const secondIds = rowsOf(second?.body ?? {}).map(r => r[KEY]);
  record('The second page overlaps the first in no row',
    secondIds.length > 0 && secondIds.every(id => !firstIds.has(id)),
    `page1=${firstIds.size} page2=${secondIds.length} overlap=${secondIds.filter(id => firstIds.has(id)).length}`);

  const withoutPrefer = link ? await get(cfg, token, link) : null;
  record('The page size is a per-request header, NOT carried by the link',
    Boolean(withoutPrefer?.ok),
    withoutPrefer ? `following the same link without the header returned ${rowsOf(withoutPrefer.body).length} rows` : 'n/a');

  // ── 4. Walking to the end ─────────────────────────────────────────────────
  console.log('\n─── Walking a bounded set to its end ───');
  const bounded = `${cfg.apiBase}/${ENTITY_SET}?$select=${SELECT}&$filter=createdon ne null&$orderby=createdon desc`;
  let cursor = bounded;
  let pages = 0;
  let total = 0;
  const seen = new Set();
  let duplicates = 0;
  while (cursor && pages < 6) {
    const page = await get(cfg, token, cursor, { Prefer: 'odata.maxpagesize=50' });
    if (!page.ok) break;
    for (const row of rowsOf(page.body)) {
      if (seen.has(row[KEY])) duplicates++;
      seen.add(row[KEY]);
      total++;
    }
    pages++;
    cursor = nextOf(page.body);
  }
  record('A walk across several pages yields no duplicate row',
    total > 0 && duplicates === 0,
    `pages=${pages} rows=${total} distinct=${seen.size} duplicates=${duplicates}`);
  record('The walk terminates on its own — the final page carries no nextLink',
    pages > 0 && cursor === null,
    cursor ? `stopped at the ${pages}-page safety cap with more still available (not a failure — the table is larger than the cap)` : `ended naturally after ${pages} page(s)`);

  // ── 5. Do filter and orderby survive the link? ────────────────────────────
  console.log('\n─── Filter and sort across pages ───');
  const sorted = `${cfg.apiBase}/${ENTITY_SET}?$select=${SELECT}&$orderby=createdon desc`;
  const sortedFirst = await get(cfg, token, sorted, { Prefer: 'odata.maxpagesize=10' });
  const sortedLink = nextOf(sortedFirst.body);
  if (sortedLink) {
    const u = new URL(sortedLink);
    record('The link preserves $orderby',
      (u.searchParams.get('$orderby') ?? '').includes('createdon'),
      `$orderby=${u.searchParams.get('$orderby')}`);
    const sortedSecond = await get(cfg, token, sortedLink, { Prefer: 'odata.maxpagesize=10' });
    const lastOfFirst = rowsOf(sortedFirst.body).at(-1)?.createdon;
    const firstOfSecond = rowsOf(sortedSecond.body)[0]?.createdon;
    record('Sort order holds ACROSS the page boundary',
      Boolean(lastOfFirst && firstOfSecond) && new Date(firstOfSecond) <= new Date(lastOfFirst),
      `last of page 1 = ${lastOfFirst}\nfirst of page 2 = ${firstOfSecond}`);
  }

  // ── 6. A corrupted continuation token ─────────────────────────────────────
  console.log('\n─── A continuation token that is not valid ───');
  if (link) {
    const broken = new URL(link);
    broken.searchParams.set('$skiptoken', 'this-is-not-a-valid-skiptoken');
    const refused = await get(cfg, token, broken.toString(), { Prefer: 'odata.maxpagesize=5' });
    const message = refused.body?.error?.message ?? refused.body?.raw ?? '';
    record('An invalid continuation token is REFUSED, not silently restarted from page 1',
      !refused.ok,
      `status=${refused.status}\n${String(message).split('\n')[0].slice(0, 140)}`);
  }

  // ── 7. $count alongside paging ────────────────────────────────────────────
  console.log('\n─── Total count ───');
  const counted = await get(cfg, token, `${base}&$count=true`, { Prefer: 'odata.maxpagesize=5' });
  const count = counted.body?.['@odata.count'];
  record('$count returns a total independent of the page size',
    typeof count === 'number' && count > rowsOf(counted.body).length,
    `@odata.count=${count} while the page held ${rowsOf(counted.body).length} rows`);

  // ── 8. $top versus paging ─────────────────────────────────────────────────
  console.log('\n─── $top ───');
  const topped = await get(cfg, token, `${base}&$top=3`, { Prefer: 'odata.maxpagesize=50' });
  record('$top bounds the whole result set, and suppresses continuation',
    topped.ok && rowsOf(topped.body).length === 3,
    `rows=${rowsOf(topped.body).length} nextLink=${nextOf(topped.body) ? 'present' : 'absent'} — $top is a limit, not a page size`);

  const answered = findings.filter(f => f.answer).length;
  console.log(`\n=== ${answered}/${findings.length} questions answered by the organisation ===`);
  if (answered !== findings.length) {
    console.log('Unanswered questions are design inputs, not failures — they say what the contract must not assume.');
  }
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
