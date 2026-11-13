/**
 * A3 / NFR-CSE-006 performance test on the cloud test org (phase-5-qa.md section 6). Two measurements:
 *   A  Trigger latency: 20 disbursements move to Payment Processed one second apart. For each, the time from
 *      the status change (the record's modifiedon) to its invitation's createdon, both server clocks (1 s
 *      resolution). Pass: p95 <= 10 s and every invitation within 60 s.
 *   B  Daily run: 450 customers with a disbursement dated in an empty old quarter, then qdb_srv_RunDueSurveys.
 *      Pass: one call completes the run, creates 450 invitations, in under 90 s.
 * Invitation dispatch is off for the whole run. Every switch is put back and every PERF-TEST-A3 record is
 * deleted in `finally`, then the deletion is verified. --apply refuses to start unless the guards pass.
 *
 *   node --env-file=<dfe>/scripts/.env e2e/a3-performance.mjs             plan only, read-only
 *   node --env-file=<dfe>/scripts/.env e2e/a3-performance.mjs --apply     live writes (CEO go-ahead 2026-11-13)
 *   node --env-file=<dfe>/scripts/.env e2e/a3-performance.mjs --cleanup   delete leftovers of an interrupted run
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openSession, findDisbursementSource, moveDisbursement, failedPluginJobsSince, sleep, anyOf, DISBURSEMENT_TABLE, PAYMENT_PROCESSED } from './e2e-helpers.mjs';
import { ensureSurveyForm, ensureCompletionSetup, COMPLETION_FORM_CODE, COMPLETION_SETUP_NAME } from './e2e-fixtures.mjs';
import { stepName } from '../provisioning/lib/plugin-payloads.mjs';
import { PREFIX, DAILY_SETUP_NAME, createCustomers, createDailySetup, deleteTestData, countLeftovers } from './a3-perf-data.mjs';

const TARGET = { triggerP95Ms: 10000, triggerMaxMs: 60000, dailyRunMs: 90000 };
const SIZE = { trigger: 20, dailyRun: 450 };
const POLL_MS = 3000;
const POLL_LIMIT_MS = 150000;
// The switch states to put back, kept on disk until every one is restored, so --cleanup can finish the job.
const RESTORE_FILE = join(tmpdir(), 'survey-a3-performance-restore.json');

// ── Org state and guards ──

/** Q1 of the year before the oldest disbursement: a quarter no real or earlier test record falls in. */
async function chooseReviewPeriod(session) {
  const [oldest] = await session.rows('qdb_payment_authorization_tickets?$select=createdon&$orderby=createdon asc&$top=1');
  const year = (oldest ? new Date(oldest.createdon).getUTCFullYear() : new Date().getUTCFullYear()) - 1;
  return { runDate: `${year}-04-01`, key: `${year}-Q1`, inPeriod: `${year}-02-15T10:00:00Z`, start: `${year}-01-01T00:00:00Z`, end: `${year}-04-01T00:00:00Z` };
}

async function readSteps(session) {
  const dispatch = await session.rows("sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode&$filter=contains(name,'InvitationDispatchPlugin')");
  const [trigger] = await session.rows(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode&$filter=name eq '${stepName('Update', DISBURSEMENT_TABLE)}'`);
  return { dispatch, trigger };
}

async function readOrgState(session) {
  const period = await chooseReviewPeriod(session);
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_retention_days,qdb_retention_mode');
  return {
    period, settings, steps: await readSteps(session), source: await findDisbursementSource(session),
    activeSetups: await session.rows('qdb_survey_setups?$select=qdb_name&$filter=qdb_is_active eq true'),
    postponed: await session.rows('qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=qdb_status eq 100000001'),
    inPeriod: await session.rows(`qdb_payment_authorization_tickets?$select=qdb_payment_authorization_ticketid&$filter=createdon ge ${period.start} and createdon lt ${period.end}`),
    leftovers: await countLeftovers(session),
  };
}

/** What must hold before any write: the daily run then touches only this test's records. */
function guardsFor(state) {
  return [
    { label: 'no survey setup is active (only this test\'s setups will run)', ok: state.activeSetups.length === 0, detail: state.activeSetups.map((s) => s.qdb_name).join(', ') },
    { label: 'retention is off (the daily run deletes or anonymises nothing)', ok: !state.settings.qdb_retention_days || state.settings.qdb_retention_mode == null },
    { label: 'no Postponed invitation exists (the daily run releases nothing)', ok: state.postponed.length === 0, detail: `${state.postponed.length}` },
    { label: `no disbursement dated in ${state.period.key} (only test customers are in the population)`, ok: state.inPeriod.length === 0, detail: `${state.inPeriod.length}` },
    { label: `no ${PREFIX} leftovers from an earlier run`, ok: state.leftovers === 0, detail: `${state.leftovers}` },
    { label: 'the disbursement Update step and both dispatch steps are found', ok: Boolean(state.steps.trigger) && state.steps.dispatch.length === 2 },
    { label: 'no switch left unrestored by an earlier run (else run --cleanup)', ok: !existsSync(RESTORE_FILE), detail: existsSync(RESTORE_FILE) ? RESTORE_FILE : '' },
  ];
}

function printPlan(state, guards) {
  guards.forEach((guard) => console.log(`  ${guard.ok ? 'OK  ' : 'STOP'} ${guard.label}${guard.detail ? `  (${guard.detail})` : ''}`));
  console.log(`\nWould write: ${SIZE.trigger + SIZE.dailyRun} accounts and disbursements (${PREFIX}-A/B-nnn, B dated ${state.period.inPeriod}),`);
  console.log(`  setup "${PREFIX} daily run" with a quarterly trigger, run qdb_srv_RunDueSurveys for ${state.period.runDate},`);
  console.log(`  switch off ${state.steps.dispatch.length} dispatch step(s), switch on the disbursement Update step, the source and the E2E completion setup;`);
  console.log('  then put every switch back, delete every record and verify nothing is left.');
}

// ── Switches: saved before the run, always put back ──

const setStep = (session, stepId, isEnabled) =>
  session.write('PATCH', `sdkmessageprocessingsteps(${stepId})`, isEnabled ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 });

function saveSwitches(state) {
  const saved = {
    steps: [...state.steps.dispatch, state.steps.trigger].map((step) => ({ id: step.sdkmessageprocessingstepid, name: step.name, isEnabled: step.statecode === 0 })),
    source: { id: state.source.qdb_survey_sourceid, isActive: state.source.qdb_is_active },
  };
  writeFileSync(RESTORE_FILE, JSON.stringify(saved, null, 2));
  return saved;
}

/** Runs one restore action; a failure is logged and counted so the remaining actions still run. */
async function attempt(label, action, failures) {
  try {
    await action();
  } catch (error) {
    failures.push(label);
    console.error(`  RESTORE FAILED: ${label}: ${error.message}`);
  }
}

/** Deactivates this test's setups only; any other active setup belongs to someone else and is left alone. */
async function deactivateTestSetups(session) {
  const active = await session.rows('qdb_survey_setups?$select=qdb_survey_setupid,qdb_name&$filter=qdb_is_active eq true');
  const isOurs = (setup) => setup.qdb_name === DAILY_SETUP_NAME || setup.qdb_name === COMPLETION_SETUP_NAME;
  for (const setup of active.filter(isOurs)) await session.write('PATCH', `qdb_survey_setups(${setup.qdb_survey_setupid})`, { qdb_is_active: false });
  active.filter((setup) => !isOurs(setup)).forEach((setup) => console.warn(`  WARN left active, not this test's: ${setup.qdb_name}`));
}

async function restoreSwitches(session, saved) {
  const failures = [];
  for (const step of saved.steps) await attempt(`step ${step.name}`, () => setStep(session, step.id, step.isEnabled), failures);
  await attempt('Disbursements source', () => session.write('PATCH', `qdb_survey_sources(${saved.source.id})`, { qdb_is_active: saved.source.isActive }), failures);
  await attempt('test setups', () => deactivateTestSetups(session), failures);
  if (failures.length === 0) rmSync(RESTORE_FILE, { force: true });
  console.log(failures.length === 0 ? '  restored: plugin steps, source and test setups as they were' : `  ${failures.length} restore action(s) FAILED: run --cleanup (states kept in ${RESTORE_FILE})`);
  return failures;
}

// ── A: trigger latency ──

/** Nearest-rank 95th percentile; a missing value counts as infinitely slow. */
function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

/** Moves the record to Payment Processed and answers the server time of that change (its modifiedon, read at once). */
async function changeStatus(session, recordId) {
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  const [record] = await session.rows(`qdb_payment_authorization_tickets?$select=modifiedon&$filter=qdb_payment_authorization_ticketid eq ${recordId}`);
  return [recordId, Date.parse(record.modifiedon)];
}

async function latenciesOf(session, changedAt) {
  const recordIds = [...changedAt.keys()];
  const invitations = await session.rows(`qdb_survey_invitations?$select=qdb_source_record_id,createdon&$filter=${anyOf('qdb_source_record_id', recordIds.map((id) => `'${id}'`))}`);
  const createdAt = new Map(invitations.map((invitation) => [invitation.qdb_source_record_id, Date.parse(invitation.createdon)]));
  return recordIds.map((id) => (createdAt.has(id) ? createdAt.get(id) - changedAt.get(id) : Infinity));
}

async function measureTriggerLatency(session, customers) {
  console.log(`A — trigger latency over ${customers.length} status changes, one second apart`);
  const changedAt = new Map();
  for (const { recordId } of customers) { changedAt.set(...(await changeStatus(session, recordId))); await sleep(1000); }
  const deadline = Date.now() + POLL_LIMIT_MS;
  let latencies = await latenciesOf(session, changedAt);
  while (latencies.includes(Infinity) && Date.now() < deadline) { await sleep(POLL_MS); latencies = await latenciesOf(session, changedAt); }
  const p95 = percentile95(latencies);
  const isPass = p95 <= TARGET.triggerP95Ms && latencies.every((latency) => latency <= TARGET.triggerMaxMs);
  return { name: 'A trigger latency', isPass, p95Ms: p95, maxMs: Math.max(...latencies), latenciesMs: latencies, missing: latencies.filter((latency) => latency === Infinity).length };
}

async function runPartA(session, state) {
  const customers = await createCustomers(session, { label: 'A', count: SIZE.trigger });
  await ensureCompletionSetup(session, state.source.qdb_survey_sourceid);
  await session.write('PATCH', `qdb_survey_sources(${state.source.qdb_survey_sourceid})`, { qdb_is_active: true });
  await setStep(session, state.steps.trigger.sdkmessageprocessingstepid, true);
  return measureTriggerLatency(session, customers);
}

// ── B: daily run ──

const runDue = async (session, runDate) => (await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: runDate })).json;

async function measureDailyRun(session, { setupId, period }) {
  console.log(`B — daily run for ${period.runDate} over ${SIZE.dailyRun} customers`);
  const startedAt = Date.now();
  const first = await runDue(session, period.runDate);
  const firstCallMs = Date.now() - startedAt;
  let calls = 1;
  for (let last = first; !last.IsComplete && calls < 10; calls += 1) last = await runDue(session, period.runDate);
  const invitations = await session.rows(`qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=_qdb_survey_setup_id_value eq ${setupId} and qdb_schedule_period_key eq '${period.key}'`);
  const isPass = first.IsComplete === true && invitations.length === SIZE.dailyRun && firstCallMs < TARGET.dailyRunMs;
  return { name: 'B daily run', isPass, firstCallMs, completedInOneCall: first.IsComplete === true, calls, invitations: invitations.length, summary: first.Summary };
}

async function runPartB(session, state) {
  await createCustomers(session, { label: 'B', count: SIZE.dailyRun, createdOn: state.period.inPeriod });
  const setupId = await createDailySetup(session, { sourceId: state.source.qdb_survey_sourceid, formCode: COMPLETION_FORM_CODE });
  return measureDailyRun(session, { setupId, period: state.period });
}

// ── Run ──

async function cleanUp(session) {
  const deleted = await deleteTestData(session);
  const leftovers = await countLeftovers(session);
  console.log(`  deleted ${JSON.stringify(deleted)}; ${leftovers === 0 ? 'nothing left' : `${leftovers} row(s) STILL PRESENT`}`);
  return { deleted, leftovers };
}

async function apply(session, state) {
  const startedOn = new Date().toISOString();
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  const saved = saveSwitches(state);
  const results = [];
  try {
    for (const step of state.steps.dispatch) await setStep(session, step.sdkmessageprocessingstepid, false);
    results.push(await runPartA(session, state));
    results.push(await runPartB(session, state));
  } finally {
    const restoreFailures = await restoreSwitches(session, saved);
    results.push({ name: 'clean-up', restoreFailures, ...(await cleanUp(session)) });
  }
  const failedJobs = await failedPluginJobsSince(session, startedOn);
  return { org: session.client.orgUrl, startedOn, period: state.period.key, results, failedPluginJobs: failedJobs.length };
}

/** After an interrupted run: put back any switch still saved on disk, then delete the test data. */
async function recoverInterruptedRun(session) {
  const hasSaved = existsSync(RESTORE_FILE);
  if (!hasSaved) console.log('  no saved switch states: the last run restored its switches');
  const failures = hasSaved ? await restoreSwitches(session, JSON.parse(readFileSync(RESTORE_FILE, 'utf8'))) : [];
  const { leftovers } = await cleanUp(session);
  return failures.length === 0 && leftovers === 0;
}

const isCleanRun = (report) => {
  const cleanUpResult = report.results.at(-1);
  return report.results.every((result) => result.isPass !== false) && cleanUpResult.leftovers === 0 && cleanUpResult.restoreFailures.length === 0;
};

async function run() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean' }, cleanup: { type: 'boolean' } } });
  const session = await openSession();
  console.log(`A3 performance — ${session.client.orgUrl}`);
  if (values.cleanup) process.exit((await recoverInterruptedRun(session)) ? 0 : 1);
  const state = await readOrgState(session);
  const guards = guardsFor(state);
  printPlan(state, guards);
  if (!values.apply) return;
  if (!guards.every((guard) => guard.ok)) { console.error('\n✗ a guard failed: nothing was written'); process.exit(1); }
  const report = await apply(session, state);
  console.log(`\n${JSON.stringify(report, (key, value) => (value === Infinity ? 'missing' : value), 2)}`);
  process.exit(isCleanRun(report) ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message} — if the run had started, run --cleanup`); process.exit(1); });
