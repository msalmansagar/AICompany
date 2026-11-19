/**
 * Addendum D QA-D2 / NFR-CSE-015 on a live (test) org: one-time sends at volume.
 *   A  450 customers (the BRD volume): Send now completes, ideally in one 60-second call.
 *   B  2,000 customers: the send spans several calls, resumes from its cursor, and invites every
 *      customer exactly once.
 * Every record carries the PERF-TEST-AD prefix; fresh accounts, so nobody is postponed by fatigue.
 * Invitations are Portal (no SMS or email). Everything is deleted afterwards and leftovers are counted.
 *
 *   node --env-file=<dfe>/scripts/.env one-time-volume.mjs            # plan, writes nothing
 *   node --env-file=<dfe>/scripts/.env one-time-volume.mjs --apply    # run (live writes, go-ahead needed)
 *   node --env-file=<dfe>/scripts/.env one-time-volume.mjs --cleanup  # delete leftovers of an interrupted run
 */
import { parseArgs } from 'node:util';
import { openSession, anyOf } from './e2e-helpers.mjs';
import { ensureSurveyForm, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';
import { inPool as throttledPool } from './a3-perf-data.mjs';
import { sleep } from './e2e-helpers.mjs';

// This org drops connections under parallel load ("fetch failed", no HTTP status) and sometimes answers 5xx;
// the shared pool retries only 429, so each request here is also retried on those, with back-off.
const isTransient = (error) => !error.status || error.status >= 500 || /fetch failed|ECONNRESET|socket/i.test(String(error.message));

async function retried(call) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (!isTransient(error) || attempt >= 6) throw error;
      // Logged so a lost response is never mistaken for one long call (a retried Send hid a 300 s fetch timeout).
      console.log(`      retry ${attempt} after: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

const inPool = (items, task) => throttledPool(items, (item, index) => retried(() => task(item, index)));

const PREFIX = 'PERF-TEST-AD';
const SIZES = [{ label: 'A', count: 450 }, { label: 'B', count: 2000 }];
const DESCRIPTION = 'Customer Survey Engine Addendum D volume test record. Safe to delete.';
const ONE_TIME = 100000004;
const FILTER = 100000001;
const MAX_CALLS = 20;

const audienceFetchXml = (label) =>
  `<fetch><entity name="account"><attribute name="accountid" /><filter type="and"><condition attribute="name" operator="like" value="${PREFIX}-${label}-%" /></filter></entity></fetch>`;

async function createAccounts(session, { label, count }) {
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1).padStart(4, '0'));
  const startedAt = Date.now();
  const ids = await inPool(numbers, async (number) => (await session.write('POST', 'accounts', { name: `${PREFIX}-${label}-${number}`, description: DESCRIPTION })).entityId);
  console.log(`  ${label}: ${ids.length} accounts created in ${Math.round((Date.now() - startedAt) / 1000)} s`);
  return ids;
}

async function createSetupAndTrigger(session, label) {
  const { entityId: setupId } = await session.write('POST', 'qdb_survey_setups', {
    qdb_name: `${PREFIX} ${label} setup`, qdb_form_code: COMPLETION_FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000000, qdb_expiry_days: 14, qdb_is_active: true,
  });
  const { entityId: triggerId } = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `${PREFIX} ${label} trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_trigger_kind: ONE_TIME, qdb_audience: FILTER, qdb_audience_fetchxml: audienceFetchXml(label), qdb_is_active: true,
  });
  return { setupId, triggerId };
}

/** Calls Send now until it completes, as the form does, timing each call. */
async function sendTimed(session, triggerId) {
  const calls = [];
  for (let call = 1; call <= MAX_CALLS; call += 1) {
    const startedAt = Date.now();
    const { json } = await session.client.send('POST', 'qdb_srv_SendOneTimeTrigger', { TriggerId: triggerId });
    calls.push({ ms: Date.now() - startedAt, invited: json.Invited, isComplete: json.IsComplete, status: json.Status });
    console.log(`    call ${call}: ${Math.round(calls[calls.length - 1].ms / 1000)} s, ${json.Invited} invited so far, ${json.Status}${json.IsComplete ? '' : ' (continuing)'}`);
    if (json.IsComplete) return calls;
  }
  return calls;
}

async function invitationsOf(session, triggerId) {
  const rows = [];
  let path = `qdb_survey_invitations?$select=_qdb_customer_id_value&$filter=_qdb_survey_trigger_id_value eq ${triggerId}`;
  while (path) {
    const { json } = await session.client.send('GET', path, undefined, { Prefer: 'odata.maxpagesize=5000' });
    rows.push(...json.value);
    path = json['@odata.nextLink'] ? json['@odata.nextLink'].replace(/^.*\/api\/data\/v9\.\d\//, '') : null;
  }
  return rows;
}

async function runSize(session, size) {
  console.log(`${size.label} — ${size.count} customers`);
  await createAccounts(session, size);
  const { triggerId } = await createSetupAndTrigger(session, size.label);
  const previewStartedAt = Date.now();
  const { json: preview } = await session.client.send('POST', 'qdb_srv_PreviewAudience', { TriggerId: triggerId });
  console.log(`    preview: ${preview.Count} in ${Math.round((Date.now() - previewStartedAt) / 1000)} s`);
  const calls = await sendTimed(session, triggerId);
  const invitations = await invitationsOf(session, triggerId);
  const distinct = new Set(invitations.map((row) => row._qdb_customer_id_value)).size;
  const totalMs = calls.reduce((sum, call) => sum + call.ms, 0);
  return { ...size, preview: preview.Count, calls, totalMs, invitations: invitations.length, distinct, isComplete: calls[calls.length - 1].isComplete };
}

function report(session, result) {
  const longest = Math.max(...result.calls.map((call) => call.ms));
  session.check(`${result.label}: preview counts all ${result.count}`, result.preview === result.count, `${result.preview}`);
  session.check(`${result.label}: send completes`, result.isComplete, `${result.calls.length} call(s), ${Math.round(result.totalMs / 1000)} s in total`);
  session.check(`${result.label}: every customer invited exactly once`, result.invitations === result.count && result.distinct === result.count, `${result.invitations} invitations, ${result.distinct} customers`);
  session.check(`${result.label}: every call within the 2-minute plugin limit`, longest < 120000, `longest call ${Math.round(longest / 1000)} s`);
  if (result.count === 450) session.check('A: the BRD volume (450) completes in one call', result.calls.length === 1, `${result.calls.length} call(s)`);
  if (result.count > 450) session.check(`${result.label}: the send spans several calls and resumes`, result.calls.length > 1, `${result.calls.length} call(s)`);
}

async function findTestData(session) {
  const setups = await session.rows(`qdb_survey_setups?$select=qdb_survey_setupid&$filter=startswith(qdb_name,'${PREFIX}')`);
  const setupIds = setups.map((row) => row.qdb_survey_setupid);
  const triggers = setupIds.length ? await session.rows(`qdb_survey_triggers?$select=qdb_survey_triggerid&$filter=${anyOf('_qdb_survey_setup_id_value', setupIds)}`) : [];
  const triggerIds = triggers.map((row) => row.qdb_survey_triggerid);
  const invitationIds = [];
  for (const triggerId of triggerIds) {
    const rows = await session.rows(`qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=_qdb_survey_trigger_id_value eq ${triggerId}`);
    invitationIds.push(...rows.map((row) => row.qdb_survey_invitationid));
  }
  const accounts = await session.rows(`accounts?$select=accountid&$filter=startswith(name,'${PREFIX}-')`);
  return { invitationIds, accountIds: accounts.map((row) => row.accountid), triggerIds, setupIds };
}

async function cleanUp(session) {
  for (let round = 1; round <= 3; round += 1) {
    const found = await findTestData(session);
    const total = Object.values(found).reduce((sum, ids) => sum + ids.length, 0);
    if (total === 0) return 0;
    console.log(`  clean-up round ${round}: ${found.invitationIds.length} invitations, ${found.accountIds.length} accounts, ${found.triggerIds.length} triggers, ${found.setupIds.length} setups`);
    for (const [ids, set] of [[found.invitationIds, 'qdb_survey_invitations'], [found.accountIds, 'accounts'], [found.triggerIds, 'qdb_survey_triggers'], [found.setupIds, 'qdb_survey_setups']]) {
      await inPool(ids, (id) => session.write('DELETE', `${set}(${id})`).catch((error) => { if (!String(error.message).includes('404')) throw error; }));
    }
  }
  const left = await findTestData(session);
  return Object.values(left).reduce((sum, ids) => sum + ids.length, 0);
}

/** --size N runs one audience of N customers (label B) instead of both default sizes; the machine cannot always hold 2,000. */
function selectSizes(sizeOption) {
  if (sizeOption === undefined) return SIZES;
  const count = Number(sizeOption);
  if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error(`--size must be a whole number from 1 to 5000, got "${sizeOption}"`);
  return [{ label: 'B', count }];
}

async function run() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, cleanup: { type: 'boolean', default: false }, size: { type: 'string' } } });
  const sizes = selectSizes(values.size);
  const raw = await openSession();
  // Every read, write and API call retries a dropped connection. Retrying a Send call is safe: a resumed send
  // continues from its committed cursor and the dedupe key stops a second invitation.
  const session = {
    ...raw,
    rows: (path) => retried(() => raw.rows(path)),
    write: (method, path, body) => retried(() => raw.write(method, path, body)),
    client: { ...raw.client, send: (method, path, body) => retried(() => raw.client.send(method, path, body)) },
  };
  console.log(`Addendum D volume test — ${session.client.orgUrl}`);
  if (values.cleanup) { console.log(`  leftovers after clean-up: ${await cleanUp(session)}`); return; }
  if (!values.apply) {
    console.log(`  PLAN: create ${sizes.map((s) => `${s.count} ${PREFIX}-${s.label}-* accounts`).join(' and ')}, one setup + one-time trigger each,`);
    console.log('  Send now via qdb_srv_SendOneTimeTrigger until complete (timed), check every customer invited once, then delete everything.');
    return;
  }
  if ((await cleanUp(session)) > 0) throw new Error('leftovers of an earlier run could not be removed');
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  try {
    for (const size of sizes) report(session, await runSize(session, size));
  } finally {
    const left = await cleanUp(session);
    session.check('clean-up: nothing left behind', left === 0, `${left} row(s) left`);
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
