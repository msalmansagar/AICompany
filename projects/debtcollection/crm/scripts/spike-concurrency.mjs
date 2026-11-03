/**
 * spike-concurrency.mjs
 * Does Dataverse give us stale-write detection, and on what terms?
 *
 * Phase 6 §12 requires optimistic concurrency: two collection officers on one case must not silently
 * overwrite each other. `Xrm.WebApi.updateRecord` takes an entity name, an id and a data object —
 * there is no parameter for a header, so `If-Match` is not reachable through the client API at all.
 * That is a documented shape rather than a bug, and it forces an architectural choice.
 *
 * Before making that choice this asks the platform directly:
 *
 *   1. does a retrieve return an `@odata.etag` to hold on to?
 *   2. does a PATCH carrying the current ETag succeed?
 *   3. does a PATCH carrying a STALE ETag fail — and fail *without writing*?
 *   4. what does `If-Match: *` mean, and is it a safe default?
 *   5. does the same hold when the row was changed by someone else in between?
 *
 * Read the answers, then decide. Guessing here would put last-write-wins into a collections system.
 *
 * It creates one marked row, exercises it and deletes it. Read-only against everything else.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/spike-concurrency.mjs
 */

import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const SET = 'qdb_activityoutcomes';
const ID_FIELD = 'qdb_activityoutcomeid';
const MARKER = 'SPIKE-CONCURRENCY';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  console.log('=== Phase 6 spike — optimistic concurrency against the real platform ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);

  const token = await acquireToken(cfg);
  const headers = () => ({ ...buildHeaders(token, SOLUTION_NAME) });

  const request = async (method, path, { body, ifMatch } = {}) => {
    const h = headers();
    if (ifMatch !== undefined) h['If-Match'] = ifMatch;
    const res = await fetch(`${cfg.apiBase}${path}`, {
      method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = res.status === 204 ? '' : await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, etag: res.headers.get('ETag'), json, text };
  };

  let id = null;
  try {
    // ── A row to experiment on ────────────────────────────────────────────────
    console.log('\n─── Setup ───');
    const created = await fetch(`${cfg.apiBase}/${SET}`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ qdb_code: MARKER, qdb_name: 'Concurrency spike row', qdb_sequence: 1 }),
    });
    if (!created.ok) throw new Error(`could not create the spike row: ${(await created.text()).slice(0, 200)}`);
    id = (created.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1];
    check('A row exists to experiment on', Boolean(id), id ?? 'MISSING');

    // ── 1. Does a retrieve carry an ETag? ─────────────────────────────────────
    console.log('\n─── 1. Does a read give us a concurrency token? ───');
    const first = await request('GET', `/${SET}(${id})?$select=${ID_FIELD},qdb_sequence`);
    const bodyEtag = first.json?.['@odata.etag'];
    check('A retrieve returns an ETag header', Boolean(first.etag), first.etag ?? 'none');
    check('It also carries @odata.etag in the body, which is what a client keeps',
      Boolean(bodyEtag), bodyEtag ?? 'none');
    check('Both forms agree', first.etag === bodyEtag, `${first.etag} / ${bodyEtag}`);

    // ── 2. A PATCH with the current ETag ──────────────────────────────────────
    console.log('\n─── 2. A write carrying the current token ───');
    const fresh = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 2 }, ifMatch: bodyEtag });
    check('A PATCH with the current ETag succeeds', fresh.status === 204, `HTTP ${fresh.status}`);

    const second = await request('GET', `/${SET}(${id})?$select=qdb_sequence`);
    check('The write landed', second.json?.qdb_sequence === 2, `sequence=${second.json?.qdb_sequence}`);
    check('The ETag changed, so it is a real version token',
      second.json?.['@odata.etag'] !== bodyEtag,
      `${String(bodyEtag).slice(-12)} -> ${String(second.json?.['@odata.etag']).slice(-12)}`);

    // ── 3. A PATCH with a STALE ETag — the case that matters ──────────────────
    console.log('\n─── 3. A write carrying a stale token — the whole point ───');
    const stale = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 99 }, ifMatch: bodyEtag });
    check('A PATCH with a stale ETag is refused with 412 Precondition Failed',
      stale.status === 412, `HTTP ${stale.status}`);
    // The platform's wording is "The version of the existing record doesn't match the RowVersion
    // property provided." — it names the row version rather than saying "concurrency", which is
    // what the first run of this spike expected. Matching the real words, not the hoped-for ones.
    check('The refusal names the version mismatch rather than failing obscurely',
      /version|rowversion/i.test(stale.json?.error?.message ?? stale.text ?? ''),
      (stale.json?.error?.message ?? stale.text ?? '').slice(0, 110));

    const afterStale = await request('GET', `/${SET}(${id})?$select=qdb_sequence`);
    check('The refused write did NOT land — no partial update',
      afterStale.json?.qdb_sequence === 2, `sequence=${afterStale.json?.qdb_sequence}`);

    // ── 4. If-Match: * ────────────────────────────────────────────────────────
    console.log('\n─── 4. If-Match: * ───');
    const wildcard = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 3 }, ifMatch: '*' });
    check('If-Match: * updates an existing row', wildcard.status === 204, `HTTP ${wildcard.status}`);
    console.log('     (so `*` means "it must exist", NOT "it must be unchanged" — it is an upsert');
    console.log('      guard, not a concurrency guard, and must not be used as one)');

    // ── 5. No If-Match at all ─────────────────────────────────────────────────
    console.log('\n─── 5. No If-Match at all — today\'s behaviour ───');
    const unguarded = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 4 } });
    check('A PATCH with no If-Match succeeds regardless of intervening changes',
      unguarded.status === 204, `HTTP ${unguarded.status}`);
    console.log('     (this is last-write-wins, and it is what every Phase 6 write would do');
    console.log('      through Xrm.WebApi, which cannot send the header)');

    // ── 6. Simulating the real race ───────────────────────────────────────────
    console.log('\n─── 6. Two officers, one record ───');
    const officerA = (await request('GET', `/${SET}(${id})?$select=qdb_sequence`)).json?.['@odata.etag'];
    const officerB = officerA; // both read the same version
    const aWrote = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 10 }, ifMatch: officerA });
    const bWrote = await request('PATCH', `/${SET}(${id})`, { body: { qdb_sequence: 20 }, ifMatch: officerB });
    check('The first officer\'s write succeeds', aWrote.status === 204, `HTTP ${aWrote.status}`);
    check('The second officer\'s write is refused rather than silently overwriting',
      bWrote.status === 412, `HTTP ${bWrote.status}`);
    const final = await request('GET', `/${SET}(${id})?$select=qdb_sequence`);
    check('The first officer\'s value survived', final.json?.qdb_sequence === 10,
      `sequence=${final.json?.qdb_sequence}`);
  } finally {
    if (id) {
      console.log('\n─── Cleanup ───');
      const deleted = await fetch(`${cfg.apiBase}/${SET}(${id})`, { method: 'DELETE', headers: headers() });
      check('The spike row is removed', deleted.ok || deleted.status === 404, `HTTP ${deleted.status}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  console.log('\nWhat this proves: Dataverse gives real optimistic concurrency — an ETag per version,');
  console.log('412 on a stale write, and no partial update when it refuses. What it does NOT prove is');
  console.log('that the BROWSER can use it: this ran from node with a bearer token and full control of');
  console.log('the headers. Xrm.WebApi has no parameter for one, which is the finding that decides the');
  console.log('write architecture.');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
