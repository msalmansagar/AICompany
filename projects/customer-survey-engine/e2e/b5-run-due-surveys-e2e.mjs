/**
 * B5 end-to-end test on a live (test) org (FR-CSE-031..033, 016, 042, 058, NFR-CSE-001):
 *   A  A quarterly "active in period" trigger run for RunDate <Y>-04-01 invites exactly the
 *      customers with a disbursement created in <Y>-Q1, where <Y> is the year before the org's oldest
 *      disbursement (backdated test records, so each re-run moves one year earlier and never meets its
 *      own leftovers), with period key <Y>-Q1 and expiry <Y>-05-01; a customer surveyed recently gets a
 *      Postponed invitation; a second run creates nothing.
 *   B  Postponed release: once that customer's earlier invitation is outside the fatigue window,
 *      the next run releases the Postponed one; an expired Postponed invitation is discarded and logged.
 *   C  Retention: Delete removes an old response with its answers; Anonymise clears customer,
 *      answers JSON and answer text but keeps the numeric answer.
 *   D  A user with neither System Administrator nor the Survey Scheduler role is refused.
 * The run also processes every other Postponed invitation on the org (B3 test data). Settings and
 * the test setup are restored in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b5-run-due-surveys-e2e.mjs
 */
import { openSession, findDisbursementSource, runStamp, findUnprivilegedUser, ensureRow, LETTER_OF_CREDIT, QDB_DIGITAL } from './e2e-helpers.mjs';
import { ensureSurveyForm, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';

const SETUP_NAME = 'E2E - Quarterly active in period';
// Two different option sets that happen to share 100000004: invitation status and suppression reason.
const STATUS = { pending: 100000000, postponed: 100000001, discarded: 100000004 };
const POSTPONED_EXPIRED = 100000004;
const RETENTION = { delete: 100000000, anonymise: 100000001 };

const runDue = (session, runDate) => session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: runDate }).then(({ json }) => json);
const invitationsOf = (session, setupId) =>
  session.rows(`qdb_survey_invitations?$select=_qdb_customer_id_value,qdb_status,qdb_schedule_period_key,qdb_expires_on,qdb_source_record_id&$filter=_qdb_survey_setup_id_value eq ${setupId}`);

async function runUntilComplete(session, runDate) {
  for (let call = 1; call <= 5; call += 1) {
    const result = await runDue(session, runDate);
    console.log(`  ${runDate} call ${call}: ${result.Summary}`);
    if (result.IsComplete) return result;
  }
  throw new Error('RunDueSurveys did not complete in 5 calls');
}

async function ensureQuarterlySetup(session, sourceId) {
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: COMPLETION_FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: true,
  });
  await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: true });
  await ensureRow(session, { entitySet: 'qdb_survey_triggers', idAttribute: 'qdb_survey_triggerid', filter: `_qdb_survey_setup_id_value eq ${setupId}` }, {
    qdb_name: `${SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    'qdb_schedule_population_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: 100000002, qdb_schedule_period: 100000001, qdb_schedule_population: 100000001, qdb_is_active: true,
  });
  return setupId;
}

async function createAccount(session, label, stamp) {
  return (await session.write('POST', 'accounts', { name: `Survey E2E B5 ${label} ${stamp}`, description: 'Test customer for the Customer Survey Engine B5 end-to-end test. Safe to delete.' })).entityId;
}

async function createBackdatedDisbursement(session, { accountId, stamp, label, createdOn }) {
  await session.write('POST', 'qdb_payment_authorization_tickets', {
    qdb_name: `SURVEY-E2E-B5-${label}-${stamp}`, 'qdb_Customer_Name@odata.bind': `/accounts(${accountId})`,
    qdb_disbursement_type_1: LETTER_OF_CREDIT, qdb_source_location: QDB_DIGITAL, ...(createdOn ? { overriddencreatedon: createdOn } : {}),
  });
}

async function createInvitation(session, { accountId, setupId, stamp, label, status, generatedOn, expiresOn }) {
  return (await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: `E2E B5 ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: COMPLETION_FORM_CODE, qdb_pinned_version: 1, qdb_language_code: 'en', qdb_status: status, qdb_channel: 100000000,
    qdb_generated_on: generatedOn, qdb_expires_on: expiresOn, qdb_dedupe_key: `E2E-B5-${label}-${stamp}`,
  })).entityId;
}

/** Q1 of the year before the oldest disbursement, so no real or leftover record falls inside it. */
async function chooseReviewPeriod(session) {
  const [oldest] = await session.rows('qdb_payment_authorization_tickets?$select=createdon&$orderby=createdon asc&$top=1');
  const year = (oldest ? new Date(oldest.createdon).getUTCFullYear() : new Date().getUTCFullYear()) - 1;
  return { runDate: `${year}-04-01`, quietDate: `${year}-04-02`, key: `${year}-Q1`, inPeriod: `${year}-02-15T10:00:00Z`, expiry: `${year}-05-01` };
}

async function scenarioScheduled(session, { setupId, customers, stamp, period }) {
  console.log(`A — quarterly active-in-period run for ${period.runDate}`);
  const recentId = await createInvitation(session, { accountId: customers.fatigued, setupId, stamp, label: 'recent', status: STATUS.pending, generatedOn: new Date().toISOString(), expiresOn: null });
  await runUntilComplete(session, period.runDate);
  const scheduled = (await invitationsOf(session, setupId)).filter((i) => i.qdb_schedule_period_key === period.key);
  const byCustomer = Object.fromEntries(scheduled.map((i) => [i._qdb_customer_id_value, i]));
  session.check('invites exactly the two customers with Q1 activity, not the Q4 one', scheduled.length === 2 && !byCustomer[customers.outside], `${scheduled.length} invitation(s)`);
  session.check('fresh customer is Pending, fatigued customer is Postponed', byCustomer[customers.fresh]?.qdb_status === STATUS.pending && byCustomer[customers.fatigued]?.qdb_status === STATUS.postponed);
  session.check(`quarterly expiry is ${period.expiry} and there is no source record`, scheduled.every((i) => i.qdb_expires_on?.startsWith(period.expiry) && !i.qdb_source_record_id));
  const second = await runUntilComplete(session, period.runDate);
  const afterSecond = (await invitationsOf(session, setupId)).filter((i) => i.qdb_schedule_period_key === period.key).length;
  session.check('a second run creates nothing', afterSecond === 2, `${afterSecond} invitation(s); summary: ${second.Summary}`);
  return recentId;
}

async function scenarioPostponed(session, { setupId, customers, stamp, recentId, period }) {
  console.log('B — postponed release and expiry');
  const longAgo = new Date(Date.now() - 40 * 86400000).toISOString();
  await session.write('PATCH', `qdb_survey_invitations(${recentId})`, { qdb_generated_on: longAgo });
  const expiredId = await createInvitation(session, {
    accountId: customers.expired, setupId, stamp, label: 'expired', status: STATUS.postponed, generatedOn: longAgo, expiresOn: new Date(Date.now() - 86400000).toISOString(),
  });
  // The scheduled Postponed invitation from A expired on <Y>-05-01, so this run discards it too.
  await runUntilComplete(session, period.quietDate);
  const [scheduledPostponed] = (await invitationsOf(session, setupId)).filter((i) => i.qdb_schedule_period_key === period.key && i._qdb_customer_id_value === customers.fatigued);
  session.check('the scheduled Postponed invitation past its quarterly expiry is Discarded', scheduledPostponed.qdb_status === STATUS.discarded);
  const [expired] = await session.rows(`qdb_survey_invitations?$select=qdb_status&$filter=qdb_survey_invitationid eq ${expiredId}`);
  session.check('expired Postponed invitation is Discarded', expired.qdb_status === STATUS.discarded);
  const logs = await session.rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail&$filter=_qdb_customer_id_value eq ${customers.expired}`);
  session.check('and a Postponed expired log row names it', logs.some((l) => l.qdb_reason === POSTPONED_EXPIRED && l.qdb_detail.includes(expiredId)));
  const releasableId = await createInvitation(session, {
    accountId: customers.fatigued, setupId, stamp, label: 'releasable', status: STATUS.postponed, generatedOn: longAgo, expiresOn: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  await runUntilComplete(session, period.quietDate);
  const [released] = await session.rows(`qdb_survey_invitations?$select=qdb_status,qdb_generated_on&$filter=qdb_survey_invitationid eq ${releasableId}`);
  session.check('Postponed invitation outside the fatigue window is released as Pending, generated now', released.qdb_status === STATUS.pending && Date.now() - Date.parse(released.qdb_generated_on) < 600000);
}

async function createOldResponse(session, { accountId, setupId, label }) {
  const { entityId: responseId } = await session.write('POST', 'qdb_survey_responses', {
    qdb_name: `E2E B5 response ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: COMPLETION_FORM_CODE, qdb_answers_json: '{"srv_demo_overall":"5","comment":"Great service"}', qdb_submitted_on: '2024-01-15T10:00:00Z',
  });
  const { entityId: answerId } = await session.write('POST', 'qdb_survey_answers', {
    qdb_name: 'E2E B5 answer', 'qdb_survey_response_id@odata.bind': `/qdb_survey_responses(${responseId})`, qdb_question_code: 'comment', qdb_answer_text: 'Great service', qdb_answer_numeric: 5,
  });
  return { responseId, answerId };
}

async function scenarioRetention(session, { setupId, customers, settingsId, period }) {
  console.log('C — retention');
  const others = await session.rows(`qdb_survey_responses?$select=qdb_name&$filter=qdb_submitted_on lt ${new Date(Date.now() - 365 * 86400000).toISOString()} and not startswith(qdb_name,'E2E B5')`);
  if (others.length > 0) { session.check('no non-test responses older than a year (would be touched)', false, `${others.length} found; retention scenario skipped`); return; }
  const deletable = await createOldResponse(session, { accountId: customers.fresh, setupId, label: 'delete' });
  await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_retention_days: 365, qdb_retention_mode: RETENTION.delete });
  await runUntilComplete(session, period.quietDate);
  const answersLeft = await session.rows(`qdb_survey_answers?$select=qdb_survey_answerid&$filter=qdb_survey_answerid eq ${deletable.answerId}`);
  const responsesLeft = await session.rows(`qdb_survey_responses?$select=qdb_survey_responseid&$filter=qdb_survey_responseid eq ${deletable.responseId}`);
  session.check('Delete: old response and its answer are gone', responsesLeft.length === 0 && answersLeft.length === 0);
  const anonymisable = await createOldResponse(session, { accountId: customers.fresh, setupId, label: 'anonymise' });
  await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_retention_mode: RETENTION.anonymise });
  await runUntilComplete(session, period.quietDate);
  const [response] = await session.rows(`qdb_survey_responses?$select=_qdb_customer_id_value,qdb_answers_json,qdb_name&$filter=qdb_survey_responseid eq ${anonymisable.responseId}`);
  const [answer] = await session.rows(`qdb_survey_answers?$select=qdb_answer_text,qdb_answer_numeric&$filter=qdb_survey_answerid eq ${anonymisable.answerId}`);
  session.check('Anonymise: customer, JSON and answer text cleared', !response._qdb_customer_id_value && !response.qdb_answers_json && !answer.qdb_answer_text);
  session.check('Anonymise: numeric answer kept for reporting', Number(answer.qdb_answer_numeric) === 5);
  await session.write('DELETE', `qdb_survey_responses(${anonymisable.responseId})`);
}

async function scenarioNonAdministrator(session, period) {
  console.log('D — a user with neither System Administrator nor Survey Scheduler is refused');
  const user = await findUnprivilegedUser(session);
  if (!user) { session.check('a non-administrator user exists to test with', false); return; }
  const outcome = await session.client.sendAsUser('POST', 'qdb_srv_RunDueSurveys', { RunDate: period.quietDate }, user.systemuserid).then(() => 'allowed', (error) => error.message);
  session.check(`run by ${user.fullname} (neither System Administrator nor Survey Scheduler) is refused`, outcome !== 'allowed' && outcome.includes('Survey Scheduler'), outcome.slice(0, 160));
}

async function createCustomers(session, stamp, period) {
  const customers = {
    fresh: await createAccount(session, 'Fresh', stamp), fatigued: await createAccount(session, 'Fatigued', stamp),
    outside: await createAccount(session, 'Q4 only', stamp), expired: await createAccount(session, 'Expired', stamp),
  };
  await createBackdatedDisbursement(session, { accountId: customers.fresh, stamp, label: 'FRESH', createdOn: period.inPeriod });
  await createBackdatedDisbursement(session, { accountId: customers.fatigued, stamp, label: 'FATIGUED', createdOn: period.inPeriod });
  await createBackdatedDisbursement(session, { accountId: customers.outside, stamp, label: 'Q4' });
  return customers;
}

async function run() {
  const session = await openSession();
  console.log(`B5 E2E — ${session.client.orgUrl}`);
  const period = await chooseReviewPeriod(session);
  console.log(`  review period ${period.key}`);
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_survey_settingsid,qdb_retention_days,qdb_retention_mode');
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  const source = await findDisbursementSource(session);
  const setupId = await ensureQuarterlySetup(session, source.qdb_survey_sourceid);
  const stamp = runStamp();
  try {
    const customers = await createCustomers(session, stamp, period);
    const recentId = await scenarioScheduled(session, { setupId, customers, stamp, period });
    await scenarioPostponed(session, { setupId, customers, stamp, recentId, period });
    await scenarioRetention(session, { setupId, customers, settingsId: settings.qdb_survey_settingsid, period });
    await scenarioNonAdministrator(session, period);
  } finally {
    await session.write('PATCH', `qdb_survey_settingses(${settings.qdb_survey_settingsid})`, { qdb_retention_days: settings.qdb_retention_days, qdb_retention_mode: settings.qdb_retention_mode });
    await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: false });
    console.log('  restored: retention settings, test setup deactivated');
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
