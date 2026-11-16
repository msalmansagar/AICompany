/**
 * Addendum D end-to-end test on a live (test) org (FR-CSE-083..091, NFR-CSE-015..017):
 *   A  Saving a One-time trigger with a filter on another table is refused; a user who is neither
 *      System Administrator nor Survey Admin cannot create one, preview or send.
 *   B  Preview counts exactly the run's own test customers (the filter matches only their run stamp).
 *   C  Send now invites them: the fresh customers Pending, the recently surveyed one Postponed (the
 *      default for general surveys), each invitation keyed per trigger with the setup's expiry; the
 *      trigger shows Sent with its totals; a second Send is refused.
 *   D  A dated trigger is not sent before its time and is sent by the first RunDueSurveys call after it.
 * Every customer is a new test account named with the run stamp, so the audience can reach nobody
 * else. The setup and triggers are switched off in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env one-time-e2e.mjs
 */
import { openSession, runStamp, ensureRow, findUserWithoutRoles } from './e2e-helpers.mjs';
import { ensureSurveyForm, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';

const SETUP_NAME = 'E2E - One-time general survey';
const ONE_TIME = 100000004;
const AUDIENCE = { all: 100000000, filter: 100000001 };
const RUN = { notSent: 100000000, sent: 100000002 };
const INVITATION = { pending: 100000000, postponed: 100000001 };

const audienceFetchXml = (marker) =>
  `<fetch version="1.0" mapping="logical"><entity name="account"><attribute name="name" /><order attribute="name" />`
  + `<filter type="and"><condition attribute="name" operator="like" value="Survey E2E OT %${marker}" /></filter></entity></fetch>`;

const triggerRow = (session, id) => session.rows(`qdb_survey_triggers?$select=qdb_run_status,qdb_invited_count,qdb_postponed_count,qdb_suppressed_count,qdb_sent_on&$filter=qdb_survey_triggerid eq ${id}`).then((rows) => rows[0]);
const invitationsOf = (session, triggerId) =>
  session.rows(`qdb_survey_invitations?$select=_qdb_customer_id_value,qdb_status,qdb_dedupe_key,qdb_schedule_period_key,qdb_expires_on,qdb_generated_on&$filter=_qdb_survey_trigger_id_value eq ${triggerId}`);
const call = (session, api, triggerId) => session.client.send('POST', api, { TriggerId: triggerId }).then(({ json }) => json);
const refusal = (promise) => promise.then(() => 'allowed', (error) => error.message);

async function ensureSetup(session) {
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: COMPLETION_FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000000, qdb_expiry_days: 14, qdb_is_active: true,
  });
  await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: true });
  return setupId;
}

async function createTrigger(session, { setupId, label, marker, sendOn = null }) {
  return (await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `${SETUP_NAME} - ${label}`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, qdb_trigger_kind: ONE_TIME,
    qdb_audience: AUDIENCE.filter, qdb_audience_fetchxml: audienceFetchXml(marker), qdb_is_active: true, ...(sendOn ? { qdb_send_on: sendOn } : {}),
  })).entityId;
}

async function createCustomers(session, marker, labels) {
  const ids = {};
  for (const label of labels) {
    ids[label] = (await session.write('POST', 'accounts', { name: `Survey E2E OT ${label} ${marker}`, description: 'Customer Survey Engine Addendum D test customer. Safe to delete.' })).entityId;
  }
  return ids;
}

async function surveyRecently(session, { setupId, accountId, marker }) {
  await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: 'E2E OT earlier survey', 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: COMPLETION_FORM_CODE, qdb_pinned_version: 1, qdb_language_code: 'en', qdb_status: INVITATION.pending, qdb_channel: 100000000,
    qdb_generated_on: new Date().toISOString(), qdb_dedupe_key: `E2E-OT-earlier-${marker}`,
  });
}

async function scenarioRefusals(session, { setupId, marker, sentTriggerId }) {
  console.log('A — refusals');
  const wrongTable = refusal(session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `${SETUP_NAME} - wrong table`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, qdb_trigger_kind: ONE_TIME,
    qdb_audience: AUDIENCE.filter, qdb_audience_fetchxml: '<fetch><entity name="incident" /></fetch>', qdb_is_active: true,
  }));
  const wrongTableOutcome = await wrongTable;
  session.check('a filter on another table is refused at save', wrongTableOutcome.includes("'incident'"), wrongTableOutcome.slice(0, 140));
  const user = await findUserWithoutRoles(session, ['Survey Admin']);
  if (!user) { session.check('a user without System Administrator or Survey Admin exists to test with', false); return; }
  const asUser = (method, path, body) => refusal(session.client.sendAsUser(method, path, body, user.systemuserid));
  const created = await asUser('POST', 'qdb_survey_triggers', { qdb_name: `${SETUP_NAME} - by ${marker}`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, qdb_trigger_kind: ONE_TIME });
  session.check(`${user.fullname} cannot create a One-time trigger`, created !== 'allowed', created.slice(0, 140));
  const previewed = await asUser('POST', 'qdb_srv_PreviewAudience', { TriggerId: sentTriggerId });
  session.check(`${user.fullname} cannot preview`, previewed.includes('Survey Admin'), previewed.slice(0, 140));
  const sent = await asUser('POST', 'qdb_srv_SendOneTimeTrigger', { TriggerId: sentTriggerId });
  session.check(`${user.fullname} cannot send`, sent.includes('Survey Admin'), sent.slice(0, 140));
}

async function scenarioSendNow(session, { triggerId, customers }) {
  console.log('B/C — preview and send now');
  const preview = await call(session, 'qdb_srv_PreviewAudience', triggerId);
  session.check('preview counts exactly the three test customers', preview.Count === 3, preview.Message);
  let result = await call(session, 'qdb_srv_SendOneTimeTrigger', triggerId);
  for (let calls = 1; !result.IsComplete && calls < 10; calls += 1) result = await call(session, 'qdb_srv_SendOneTimeTrigger', triggerId);
  session.check('send reports 2 invited and 1 postponed', result.Status === 'Sent' && result.Invited === 2 && result.Postponed === 1, result.Message);
  const invitations = await invitationsOf(session, triggerId);
  const byCustomer = Object.fromEntries(invitations.map((i) => [i._qdb_customer_id_value, i]));
  session.check('fresh customers Pending, recently surveyed customer Postponed',
    byCustomer[customers.Fresh1]?.qdb_status === INVITATION.pending && byCustomer[customers.Fresh2]?.qdb_status === INVITATION.pending && byCustomer[customers.Recent]?.qdb_status === INVITATION.postponed);
  const compactId = triggerId.replace(/-/g, '');
  session.check('every invitation is keyed to this trigger', invitations.length === 3 && invitations.every((i) => i.qdb_dedupe_key.endsWith(`|T${compactId}`) && i.qdb_schedule_period_key === `ONCE-${compactId}`));
  const pending = byCustomer[customers.Fresh1];
  const expiryDays = pending ? Math.round((Date.parse(pending.qdb_expires_on) - Date.parse(pending.qdb_generated_on)) / 86400000) : null;
  session.check('expiry is the setup\'s 14 days from creation', expiryDays === 14, `${expiryDays} day(s)`);
  const row = await triggerRow(session, triggerId);
  session.check('the trigger shows Sent with its totals', row.qdb_run_status === RUN.sent && row.qdb_invited_count === 2 && row.qdb_postponed_count === 1 && Boolean(row.qdb_sent_on));
  const again = await refusal(call(session, 'qdb_srv_SendOneTimeTrigger', triggerId));
  session.check('a second send is refused', again.includes('already sent'), again.slice(0, 140));
}

async function runDueOnce(session) {
  const today = new Date().toISOString().slice(0, 10);
  let result = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: today }).then(({ json }) => json);
  for (let calls = 1; !result.IsComplete && calls < 10; calls += 1) result = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: today }).then(({ json }) => json);
  console.log(`  RunDueSurveys: ${result.Summary}`);
  return result;
}

async function scenarioDated(session, { setupId, marker }) {
  console.log('D — dated send');
  await createCustomers(session, marker, ['Dated1', 'Dated2']);
  const triggerId = await createTrigger(session, { setupId, label: `dated ${marker}`, marker, sendOn: new Date(Date.now() + 86400000).toISOString() });
  await runDueOnce(session);
  session.check('not sent before its time', (await triggerRow(session, triggerId)).qdb_run_status === RUN.notSent);
  await session.write('PATCH', `qdb_survey_triggers(${triggerId})`, { qdb_send_on: new Date(Date.now() - 60000).toISOString() });
  await runDueOnce(session);
  const row = await triggerRow(session, triggerId);
  session.check('sent by the first run after its time, to both customers', row.qdb_run_status === RUN.sent && row.qdb_invited_count === 2, `status ${row.qdb_run_status}, invited ${row.qdb_invited_count}`);
  return triggerId;
}

async function run() {
  const session = await openSession();
  console.log(`Addendum D E2E — ${session.client.orgUrl}`);
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  const setupId = await ensureSetup(session);
  const stamp = runStamp();
  const triggers = [];
  try {
    const customers = await createCustomers(session, stamp, ['Fresh1', 'Fresh2', 'Recent']);
    await surveyRecently(session, { setupId, accountId: customers.Recent, marker: stamp });
    triggers.push(await createTrigger(session, { setupId, label: `now ${stamp}`, marker: stamp }));
    await scenarioSendNow(session, { triggerId: triggers[0], customers });
    await scenarioRefusals(session, { setupId, marker: stamp, sentTriggerId: triggers[0] });
    triggers.push(await scenarioDated(session, { setupId, marker: `${stamp}D` }));
  } finally {
    for (const id of triggers) await session.write('PATCH', `qdb_survey_triggers(${id})`, { qdb_is_active: false }).catch((error) => console.log(`  restore trigger: ${error.message}`));
    await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: false });
    console.log('  restored: test setup and triggers switched off');
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
