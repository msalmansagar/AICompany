/**
 * 001-scale-per-org (BRD Addendum E) live proof, NFR-CSE-019/020 (OQ-E1 = b), on the cloud test org:
 * a quarterly "active in period" scheduled survey over N test customers (default 2,500) runs page by page
 * across several qdb_srv_RunDueSurveys calls (Pass = Daily) and invites every customer exactly once.
 *   - Each customer is a PERF-TEST-SC account with one Letter of Credit disbursement backdated into Q1 of the year
 *     before the org's oldest disbursement, so no real record is in the population.
 *   - Delivery is Portal: no SMS or email is sent.
 *   - After every call the trigger's Scheduled run fields are read (FR-005); the client loop is stopped part-way
 *     and resumed, as a scheduler restart would (FR-004).
 *   - Pass = RecordFailure is called once after completion, for a date with nothing due: it must record nothing.
 *   - The daily-pass date is saved and put back; every test record is deleted and leftovers are counted.
 *
 *   node --env-file=<dfe>/scripts/.env e2e/scheduled-volume.mjs                       plan + guards, read-only
 *   node --env-file=<dfe>/scripts/.env e2e/scheduled-volume.mjs --apply [--size N]    live writes (CEO go-ahead)
 *   node --env-file=<dfe>/scripts/.env e2e/scheduled-volume.mjs --cleanup             delete leftovers of an interrupted run
 */
import { parseArgs } from 'node:util';
import { openSession, findDisbursementSource, sleep, anyOf, LETTER_OF_CREDIT, QDB_DIGITAL } from './e2e-helpers.mjs';
import { ensureSurveyForm, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';
import { inPool as throttledPool } from './a3-perf-data.mjs';

const PREFIX = 'PERF-TEST-SC';
const SETUP_NAME = `${PREFIX} scheduled volume`;
const DESCRIPTION = 'Customer Survey Engine 001-scale-per-org volume test record. Safe to delete.';
const DEFAULT_SIZE = 2500;
const PLUGIN_LIMIT_MS = 120000;
const HL_ACTIVE_CUSTOMERS = 10000;
const MAX_CALLS = 60;
const STOP_AFTER_CALLS = 2;
const STATUS_LABEL = { 100000000: 'Not sent', 100000001: 'Sending', 100000002: 'Sent', 100000004: 'Stuck' };

// This org drops connections under parallel load ("fetch failed", no status) and sometimes answers 5xx; retried with back-off.
const isTransient = (error) => !error.status || error.status >= 500 || /fetch failed|ECONNRESET|socket/i.test(String(error.message));

async function retried(call) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (!isTransient(error) || attempt >= 6) throw error;
      // Logged so a lost response is never mistaken for one long call.
      console.log(`      retry ${attempt} after: ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

const inPool = (items, task) => throttledPool(items, (item, index) => retried(() => task(item, index)));

// ── Org state and guards ──

/** Q1 of the year before the oldest disbursement: a quarter no real or earlier test record falls in. */
async function chooseReviewPeriod(session) {
  const [oldest] = await session.rows('qdb_payment_authorization_tickets?$select=createdon&$orderby=createdon asc&$top=1');
  const year = (oldest ? new Date(oldest.createdon).getUTCFullYear() : new Date().getUTCFullYear()) - 1;
  return { runDate: `${year}-04-01`, key: `${year}-Q1`, inPeriod: `${year}-02-15T10:00:00Z`, start: `${year}-01-01T00:00:00Z`, end: `${year}-04-01T00:00:00Z` };
}

async function readOrgState(session) {
  const period = await chooseReviewPeriod(session);
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_survey_settingsid,qdb_retention_days,qdb_retention_mode,qdb_daily_passes_completed_on,qdb_stuck_after_failed_calls');
  return {
    period, settings, source: await findDisbursementSource(session),
    activeSetups: await session.rows('qdb_survey_setups?$select=qdb_name&$filter=qdb_is_active eq true'),
    postponed: await session.rows('qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=qdb_status eq 100000001'),
    inPeriod: await session.rows(`qdb_payment_authorization_tickets?$select=qdb_payment_authorization_ticketid&$filter=createdon ge ${period.start} and createdon lt ${period.end}`),
    leftovers: await countLeftovers(session),
  };
}

/** What must hold before any write: the daily run then touches only this test's records. */
function guardsFor(state) {
  return [
    { label: 'no survey setup is active (only this test\'s survey will run)', ok: state.activeSetups.length === 0, detail: state.activeSetups.map((s) => s.qdb_name).join(', ') },
    { label: 'retention is off (the daily run deletes or anonymises nothing)', ok: !state.settings.qdb_retention_days || state.settings.qdb_retention_mode == null },
    { label: 'no Postponed invitation exists (the daily run releases nothing)', ok: state.postponed.length === 0, detail: `${state.postponed.length}` },
    { label: `no disbursement dated in ${state.period.key} (only test customers are in the population)`, ok: state.inPeriod.length === 0, detail: `${state.inPeriod.length}` },
    { label: `no ${PREFIX} leftovers from an earlier run`, ok: state.leftovers === 0, detail: `${state.leftovers}` },
    { label: 'Survey Settings "Stuck After Failed Calls" is set (kit 1.2.0.5 schema)', ok: Number.isInteger(state.settings.qdb_stuck_after_failed_calls), detail: `${state.settings.qdb_stuck_after_failed_calls}` },
    { label: 'the Disbursements survey source exists', ok: Boolean(state.source) },
  ];
}

// ── Test data ──

async function createCustomers(session, { count, createdOn }) {
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1).padStart(4, '0'));
  const startedAt = Date.now();
  await inPool(numbers, async (number) => {
    const name = `${PREFIX}-${number}`;
    const { entityId: accountId } = await session.write('POST', 'accounts', { name, description: DESCRIPTION });
    await session.write('POST', 'qdb_payment_authorization_tickets', {
      qdb_name: name, 'qdb_Customer_Name@odata.bind': `/accounts(${accountId})`, qdb_disbursement_type_1: LETTER_OF_CREDIT,
      qdb_source_location: QDB_DIGITAL, overriddencreatedon: createdOn,
    });
  });
  console.log(`  ${count} accounts and disbursements created in ${Math.round((Date.now() - startedAt) / 1000)} s`);
}

/** A quarterly "active in period" trigger over the Disbursements source; Portal delivery, so nothing is sent. */
async function createScheduledSetup(session, sourceId) {
  const { entityId: setupId } = await session.write('POST', 'qdb_survey_setups', {
    qdb_name: SETUP_NAME, qdb_form_code: COMPLETION_FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: true,
  });
  const { entityId: triggerId } = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `${SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    'qdb_schedule_population_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: 100000002, qdb_schedule_period: 100000001, qdb_schedule_population: 100000001, qdb_is_active: true,
  });
  return { setupId, triggerId };
}

// ── The run ──

const RUN_FIELDS = 'qdb_run_status,qdb_run_period_key,qdb_run_evaluated_count,qdb_invited_count,qdb_run_failed_calls,qdb_run_progress_on,qdb_run_message';

async function readRun(session, triggerId) {
  const [run] = await session.rows(`qdb_survey_triggers?$select=${RUN_FIELDS}&$filter=qdb_survey_triggerid eq ${triggerId}`);
  return run;
}

async function callDaily(session, { runDate, triggerId }, number) {
  const startedAt = Date.now();
  const { json } = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: runDate, Pass: 'Daily' });
  const ms = Date.now() - startedAt;
  const run = await readRun(session, triggerId);
  console.log(`    call ${number}: ${Math.round(ms / 1000)} s; trigger ${STATUS_LABEL[run.qdb_run_status] ?? run.qdb_run_status}, ${run.qdb_run_evaluated_count} evaluated, ${run.qdb_invited_count} invited${json.IsComplete ? '' : ' (continuing)'}`);
  return { ms, isComplete: json.IsComplete, summary: json.Summary, run };
}

/** Calls Daily until complete; stops the loop after a few calls and resumes it, as a scheduler restart would (FR-004). */
async function runToCompletion(session, target) {
  const calls = [];
  while (calls.length < MAX_CALLS && !calls.at(-1)?.isComplete) {
    if (calls.length === STOP_AFTER_CALLS) { console.log('    -- client loop stopped; resuming in 10 s as a restarted scheduler --'); await sleep(10000); }
    calls.push(await callDaily(session, target, calls.length + 1));
  }
  return calls;
}

async function invitationsOf(session, setupId, periodKey) {
  const rows = [];
  let path = `qdb_survey_invitations?$select=_qdb_customer_id_value&$filter=_qdb_survey_setup_id_value eq ${setupId} and qdb_schedule_period_key eq '${periodKey}'`;
  while (path) {
    const { json } = await session.client.send('GET', path, undefined, { Prefer: 'odata.maxpagesize=5000' });
    rows.push(...json.value);
    path = json['@odata.nextLink'] ? json['@odata.nextLink'].replace(/^.*\/api\/data\/v9\.\d\//, '') : null;
  }
  return rows;
}

/** A date with nothing due and no run in progress: RecordFailure must answer "nothing to record" and write nothing. */
async function recordFailureOnQuietDay(session, { runDate, triggerId }) {
  const quietDate = runDate.replace(/-04-01$/, '-04-02');
  const before = await readRun(session, triggerId);
  const { json } = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: quietDate, Pass: 'RecordFailure' });
  const after = await readRun(session, triggerId);
  return { summary: json.Summary, isUnchanged: before.qdb_run_failed_calls === after.qdb_run_failed_calls && before.qdb_run_status === after.qdb_run_status };
}

async function measure(session, state, size) {
  await createCustomers(session, { count: size, createdOn: state.period.inPeriod });
  const { setupId, triggerId } = await createScheduledSetup(session, state.source.qdb_survey_sourceid);
  await session.write('PATCH', `qdb_survey_settingses(${state.settings.qdb_survey_settingsid})`, { qdb_daily_passes_completed_on: null });
  console.log(`Scheduled run for ${state.period.runDate} (${state.period.key}) over ${size} customers`);
  const calls = await runToCompletion(session, { runDate: state.period.runDate, triggerId });
  const invitations = await invitationsOf(session, setupId, state.period.key);
  const recordFailure = await recordFailureOnQuietDay(session, { runDate: state.period.runDate, triggerId });
  return { size, calls, invitations: invitations.length, distinct: new Set(invitations.map((row) => row._qdb_customer_id_value)).size, recordFailure, period: state.period.key };
}

function report(session, result) {
  const last = result.calls.at(-1);
  const totalMs = result.calls.reduce((sum, call) => sum + call.ms, 0);
  const longest = Math.max(...result.calls.map((call) => call.ms));
  const perCustomerMs = totalMs / result.size;
  session.check('run completes', last.isComplete, `${result.calls.length} call(s), ${Math.round(totalMs / 1000)} s of calls`);
  session.check(`every customer invited exactly once (SC-002, SC-003)`, result.invitations === result.size && result.distinct === result.size, `${result.invitations} invitations, ${result.distinct} customers`);
  session.check('every call within the 2-minute plugin limit (NFR-CSE-006)', longest < PLUGIN_LIMIT_MS, `longest call ${Math.round(longest / 1000)} s`);
  session.check('the run spans several calls and resumes after the client stopped (FR-004)', result.calls.length > STOP_AFTER_CALLS, `${result.calls.length} call(s)`);
  session.check('trigger shows Sending while running, then Sent with every customer evaluated (FR-005)',
    result.calls.slice(0, -1).every((call) => call.run.qdb_run_status === 100000001) && last.run.qdb_run_status === 100000002 && last.run.qdb_run_evaluated_count === result.size,
    `final: ${STATUS_LABEL[last.run.qdb_run_status]}, ${last.run.qdb_run_evaluated_count} evaluated, period ${last.run.qdb_run_period_key}`);
  session.check('RecordFailure on a quiet day records nothing', result.recordFailure.isUnchanged && /nothing to record/.test(result.recordFailure.summary), result.recordFailure.summary);
  console.log(`  Extrapolated for HL (${HL_ACTIVE_CUSTOMERS} active): ${Math.round((perCustomerMs * HL_ACTIVE_CUSTOMERS) / 60000)} min of calls (${Math.round(perCustomerMs)} ms per customer); target 60 min (NFR-CSE-019).`);
}

// ── Clean-up ──

const chunksOf = (values, size = 25) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));

async function rowsForCustomers(session, { entitySet, idAttribute, accountIds }) {
  const pages = await inPool(chunksOf(accountIds), (ids) => session.rows(`${entitySet}?$select=${idAttribute}&$filter=${anyOf('_qdb_customer_id_value', ids)}`));
  return pages.flat().map((row) => row[idAttribute]);
}

async function findTestData(session) {
  const accountIds = (await session.rows(`accounts?$select=accountid&$filter=startswith(name,'${PREFIX}-')`)).map((row) => row.accountid);
  const setupIds = (await session.rows(`qdb_survey_setups?$select=qdb_survey_setupid&$filter=qdb_name eq '${SETUP_NAME}'`)).map((row) => row.qdb_survey_setupid);
  const triggers = setupIds.length ? await session.rows(`qdb_survey_triggers?$select=qdb_survey_triggerid&$filter=${anyOf('_qdb_survey_setup_id_value', setupIds)}`) : [];
  const records = await session.rows(`qdb_payment_authorization_tickets?$select=qdb_payment_authorization_ticketid&$filter=startswith(qdb_name,'${PREFIX}-')`);
  return {
    invitations: await rowsForCustomers(session, { entitySet: 'qdb_survey_invitations', idAttribute: 'qdb_survey_invitationid', accountIds }),
    suppressionLogs: await rowsForCustomers(session, { entitySet: 'qdb_survey_suppression_logs', idAttribute: 'qdb_survey_suppression_logid', accountIds }),
    records: records.map((row) => row.qdb_payment_authorization_ticketid), accountIds, triggers: triggers.map((row) => row.qdb_survey_triggerid), setupIds,
  };
}

const DELETE_ORDER = [
  ['invitations', 'qdb_survey_invitations'], ['suppressionLogs', 'qdb_survey_suppression_logs'], ['records', 'qdb_payment_authorization_tickets'],
  ['accountIds', 'accounts'], ['triggers', 'qdb_survey_triggers'], ['setupIds', 'qdb_survey_setups'],
];

async function countLeftovers(session) {
  return Object.values(await findTestData(session)).reduce((total, ids) => total + ids.length, 0);
}

async function cleanUp(session) {
  for (let round = 1; round <= 3 && (await countLeftovers(session)) > 0; round += 1) {
    const found = await findTestData(session);
    console.log(`  clean-up round ${round}: ${Object.entries(found).map(([key, ids]) => `${ids.length} ${key}`).join(', ')}`);
    for (const [key, entitySet] of DELETE_ORDER) {
      await inPool(found[key], (id) => session.write('DELETE', `${entitySet}(${id})`).catch((error) => { if (!String(error.message).includes('404')) throw error; }));
    }
  }
  return countLeftovers(session);
}

// ── Run ──

function selectSize(sizeOption) {
  if (sizeOption === undefined) return DEFAULT_SIZE;
  const count = Number(sizeOption);
  if (!Number.isInteger(count) || count < 30 || count > 5000) throw new Error(`--size must be a whole number from 30 to 5000, got "${sizeOption}"`);
  return count;
}

function retryingSession(raw) {
  return {
    ...raw,
    rows: (path) => retried(() => raw.rows(path)),
    write: (method, path, body) => retried(() => raw.write(method, path, body)),
    // Retrying a Daily call is safe: a resumed run continues from its saved position and the dedupe key stops a second invitation.
    client: { ...raw.client, send: (method, path, body, headers) => retried(() => raw.client.send(method, path, body, headers)) },
  };
}

function printPlan(state, guards, size) {
  guards.forEach((guard) => console.log(`  ${guard.ok ? 'OK  ' : 'STOP'} ${guard.label}${guard.detail ? `  (${guard.detail})` : ''}`));
  console.log(`\n  PLAN: create ${size} ${PREFIX}-nnnn accounts, each with a disbursement dated ${state.period.inPeriod}; setup "${SETUP_NAME}" with a`);
  console.log(`  quarterly "active in period" trigger; clear the daily-pass date; call RunDueSurveys Pass=Daily for ${state.period.runDate} until complete;`);
  console.log('  one RecordFailure call on a quiet day; then delete everything, put the daily-pass date back and count leftovers.');
}

async function apply(session, state, size) {
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  try {
    report(session, await measure(session, state, size));
  } finally {
    // A fresh session (new access token): the 2,500 run took ~60 minutes and the first token expired mid-clean-up (401).
    const fresh = retryingSession(await openSession());
    await fresh.write('PATCH', `qdb_survey_settingses(${state.settings.qdb_survey_settingsid})`, { qdb_daily_passes_completed_on: state.settings.qdb_daily_passes_completed_on ?? null });
    const left = await cleanUp(fresh);
    session.check('clean-up: nothing left behind and the daily-pass date put back', left === 0, `${left} row(s) left`);
  }
}

async function run() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, cleanup: { type: 'boolean', default: false }, size: { type: 'string' } } });
  const size = selectSize(values.size);
  const session = retryingSession(await openSession());
  console.log(`001-scale-per-org scheduled volume test — ${session.client.orgUrl}`);
  if (values.cleanup) { console.log(`  leftovers after clean-up: ${await cleanUp(session)}`); return; }
  const state = await readOrgState(session);
  const guards = guardsFor(state);
  printPlan(state, guards, size);
  if (!values.apply) return;
  if (guards.some((guard) => !guard.ok)) throw new Error('a guard failed; nothing was written');
  await apply(session, state, size);
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
