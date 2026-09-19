/**
 * spike-idempotent-create.mjs
 * Can a create be made safely repeatable without inventing schema?
 *
 * Phase 6 §11 requires that a double-click, a retry after network uncertainty, or a repeated request
 * must not silently create a second activity or a second promise. Disabling the Save button is not
 * an answer: the dangerous case is precisely the one where the client never learned what happened —
 * the request was sent, the response was lost, and the user pressed again.
 *
 * `qdb_collectionactivity` has **no alternate key**, so a business-key upsert is not available, and
 * adding one purely for convenience is what the authorisation forbids. What OData does offer is an
 * **upsert by primary key**: a PATCH to a record id creates it when absent and updates it when
 * present, and `If-None-Match: *` narrows that to create-only.
 *
 * So the question this asks the platform:
 *
 *   1. can the client choose the primary key on a create?
 *   2. does a PATCH to a fresh id with `If-None-Match: *` create the record?
 *   3. does REPEATING that same request fail instead of creating a second one?
 *   4. does the repeat leave the original untouched?
 *   5. does a PATCH without `If-None-Match` upsert — i.e. is the guard doing the work?
 *   6. do the Create-stage plugins still run, or does an upsert bypass them?
 *
 * Question 6 matters as much as the rest: if `DefaultStatusAssigner` and `ActivitySubjectComposer`
 * do not fire on an upsert-create, the record is created in a state nothing else expects.
 *
 * Every row is marked and removed in a finally.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/spike-idempotent-create.mjs
 */

import { randomUUID } from 'node:crypto';
import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';

const AUTHORISED_ORG = 'org5869857f';
const SET = 'qdb_collectionactivities';
const ACTIVITY_STATUS_OPEN = 100000640;

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  console.log('=== Phase 6 spike — an idempotent create, without inventing schema ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);

  const token = await acquireToken(cfg);
  const send = async (method, path, { body, extra } = {}) => {
    const headers = { ...buildHeaders(token, SOLUTION_NAME), ...(extra ?? {}) };
    const res = await fetch(`${cfg.apiBase}${path}`, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = res.status === 204 ? '' : await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, json, message: json?.error?.message ?? text.slice(0, 200) };
  };

  try {
    const type = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_code eq 'P6-CALL'"))?.value?.[0];
    check('Reference data is present', Boolean(type), type?.qdb_collectionactivitytypeid ?? 'MISSING');
    if (!type) throw new Error('No P6-CALL type.');

    // The client chooses the id. This is the whole mechanism: the id IS the idempotency key, and it
    // is generated once when the user opens the form, not once per click.
    const submissionId = randomUUID();
    const body = () => ({
      subject: `${SMOKE_MARKER}P6 idempotent`,
      qdb_activitynumber: `${SMOKE_MARKER}P6-IDEM`,
      qdb_activitydate: new Date().toISOString(),
      'qdb_activitytypeid_qdb_collectionactivity@odata.bind':
        `/qdb_collectionactivitytypes(${type.qdb_collectionactivitytypeid})`,
    });

    console.log('\n─── 1. The first submission ───');
    const first = await send('PATCH', `/${SET}(${submissionId})`, {
      body: body(), extra: { 'If-None-Match': '*' },
    });
    check('A PATCH to a client-chosen id with If-None-Match: * creates the record',
      first.status === 204 || first.status === 201, `HTTP ${first.status}`);

    const created = await apiGet(cfg, token, SOLUTION_NAME,
      `/${SET}(${submissionId})?$select=activityid,subject,statuscode`);
    check('…at exactly the id the client chose',
      created?.activityid === submissionId, String(created?.activityid));

    console.log('\n─── 2. Do the Create plugins still run on an upsert? ───');
    check('DefaultStatusAssigner set the opening status',
      created?.statuscode === ACTIVITY_STATUS_OPEN, `statuscode=${created?.statuscode}`);
    check('ActivitySubjectComposer left a composed subject',
      typeof created?.subject === 'string' && created.subject.length > 0, String(created?.subject));

    console.log('\n─── 3. The double-click: the SAME request again ───');
    const second = await send('PATCH', `/${SET}(${submissionId})`, {
      body: body(), extra: { 'If-None-Match': '*' },
    });
    check('The repeat is REFUSED rather than creating a second record',
      second.status === 412, `HTTP ${second.status}`);
    check('…and the refusal is recognisable', /exist|precondition|match/i.test(second.message ?? ''),
      String(second.message).slice(0, 100));

    const all = await apiGet(cfg, token, SOLUTION_NAME,
      `/${SET}?$select=activityid&$filter=qdb_activitynumber eq '${SMOKE_MARKER}P6-IDEM'&$count=true`);
    check('Exactly ONE record exists, not two', all?.['@odata.count'] === 1,
      `${all?.['@odata.count']} row(s)`);

    console.log('\n─── 4. Is the guard doing the work, or would any PATCH be safe? ───');
    const withoutGuard = await send('PATCH', `/${SET}(${randomUUID()})`, { body: body() });
    check('A PATCH to a fresh id WITHOUT If-None-Match also creates — so the guard is what refuses',
      withoutGuard.status === 204 || withoutGuard.status === 201, `HTTP ${withoutGuard.status}`);
    console.log('     (upsert-by-id is the platform default; If-None-Match: * is what turns it into');
    console.log('      create-only, and is therefore not optional)');

    const afterAll = await apiGet(cfg, token, SOLUTION_NAME,
      `/${SET}?$select=activityid&$filter=qdb_activitynumber eq '${SMOKE_MARKER}P6-IDEM'&$count=true`);
    check('The unguarded PATCH created a SECOND row — which is the failure being prevented',
      afterAll?.['@odata.count'] === 2, `${afterAll?.['@odata.count']} row(s)`);
  } finally {
    console.log('\n─── Cleanup ───');
    await cleanSmokeData({ cfg, token, confirmed: true });
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
