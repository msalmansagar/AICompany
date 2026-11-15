/**
 * Addendum C end-to-end test on a live (test) org: qdb_srv_EraseCustomerSurveyData
 * (FR-CSE-079, 081, 082, NFR-CSE-013, architecture risk R1). Two throwaway test accounts:
 *   F  A user without System Administrator or Survey Data Officer is refused, and nothing is logged.
 *   A1 Dry run on A: found counts, AreActual false, nothing changed, one dry-run log row.
 *   A2 Anonymise on A: responses kept with customer, invitation link and source pointer cleared (two
 *      responses with an empty invitation link at once is the R1 alternate-key check); invitations
 *      and the suppression log deleted; a started and a completed log row.
 *   B1 Delete on B: invitation, response, answer and suppression log all gone; two log rows.
 *   B2 Delete on B again: zero counts, complete.
 * Finally deletes everything it created (accounts, anonymised responses, log rows) and checks.
 * Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env erasure-e2e.mjs
 */
import { openSession, runStamp, findUnprivilegedUser } from './e2e-helpers.mjs';

const API = 'qdb_srv_EraseCustomerSurveyData';
const MODE = Object.freeze({ delete: 100000000, anonymise: 100000001 });
const SETUP_NAME = 'Demo - Customer feedback';
const FORM_CODE = 'srv-customer-feedback-demo';
const STAMP = runStamp();

const erase = (session, customerId, mode, dryRun) =>
  session.client.send('POST', API, { CustomerGuid: customerId, Mode: mode, DryRun: dryRun }).then(({ json }) => json);
const countsOf = (out) => `${out.InvitationCount}/${out.ResponseCount}/${out.AnswerCount}/${out.SuppressionLogCount}`;
const byCustomer = (entitySet, idAttribute, accountId) =>
  `${entitySet}?$select=${idAttribute}&$filter=_qdb_customer_id_value eq ${accountId}`;

async function findSetup(session) {
  const [setup] = await session.rows(`qdb_survey_setups?$select=qdb_survey_setupid&$filter=${encodeURIComponent(`qdb_name eq '${SETUP_NAME}'`)}`);
  if (!setup) throw new Error(`setup "${SETUP_NAME}" not found; run b6-integration-api-e2e.mjs first.`);
  return setup.qdb_survey_setupid;
}

async function createAccount(session, label) {
  return (await session.write('POST', 'accounts', { name: `E2E-ERASE ${STAMP} ${label}` })).entityId;
}

async function createAnsweredInvitation(session, { accountId, setupId, label }) {
  const account = `/accounts(${accountId})`;
  const setup = `/qdb_survey_setups(${setupId})`;
  const invitationId = (await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: `E2E-ERASE ${label}`, 'qdb_customer_id@odata.bind': account, 'qdb_survey_setup_id@odata.bind': setup,
    qdb_form_code: FORM_CODE, qdb_pinned_version: 1, qdb_language_code: 'en', qdb_status: 100000002, qdb_channel: 100000000,
    qdb_generated_on: new Date().toISOString(), qdb_dedupe_key: `E2E-ERASE-${STAMP}-${label}`,
  })).entityId;
  const responseId = (await session.write('POST', 'qdb_survey_responses', {
    qdb_name: `E2E-ERASE response ${label}`, 'qdb_customer_id@odata.bind': account, 'qdb_survey_setup_id@odata.bind': setup,
    'qdb_survey_invitation_id@odata.bind': `/qdb_survey_invitations(${invitationId})`, qdb_form_code: FORM_CODE,
    qdb_source_table: 'qdb_payment_authorization_ticket', qdb_source_record_id: '00000000-0000-0000-0000-00000000e2e0',
    qdb_submitted_on: new Date().toISOString(),
  })).entityId;
  await session.write('POST', 'qdb_survey_answers', {
    qdb_name: `E2E-ERASE answer ${label}`, 'qdb_survey_response_id@odata.bind': `/qdb_survey_responses(${responseId})`,
    qdb_question_code: 'srv_demo_well', qdb_answer_text: 'Test answer, to be erased.', qdb_question_order: 1,
  });
  return { invitationId, responseId };
}

async function createSuppression(session, { accountId, label }) {
  await session.write('POST', 'qdb_survey_suppression_logs', {
    qdb_name: `E2E-ERASE suppression ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`,
    qdb_reason: 100000000, qdb_logged_on: new Date().toISOString(),
  });
}

const logRows = (session, customerId) => session.rows(
  `qdb_survey_erasure_logs?$select=qdb_survey_erasure_logid,qdb_dry_run,qdb_are_actual,qdb_is_complete,qdb_invitation_count,qdb_caller_id&$filter=qdb_customer_guid eq '${customerId}'&$orderby=createdon asc`);

async function scenarioRefused(session, accountId) {
  // With no parameters at all the platform rejects the call before the plugin runs, so send a valid
  // dry run: the plugin's own role check must refuse it.
  console.log('F — a user without the role is refused');
  const user = await findUnprivilegedUser(session);
  const body = { CustomerGuid: accountId, Mode: MODE.delete, DryRun: true };
  const outcome = await session.client.sendAsUser('POST', API, body, user.systemuserid).then(() => 'allowed', (error) => error.message);
  session.check('unprivileged user refused with the role message', outcome.includes('Survey Data Officer'), outcome.slice(0, 120));
  session.check('no log row written for the refusal', (await logRows(session, accountId)).length === 0);
}

async function scenarioDryRun(session, accountId) {
  console.log('A1 — dry run');
  const out = await erase(session, accountId, MODE.delete, true);
  session.check('dry run finds 2 invitations, 2 responses, 2 answers, 1 suppression', countsOf(out) === '2/2/2/1', countsOf(out));
  session.check('dry run AreActual false, IsComplete true', out.AreActual === false && out.IsComplete === true);
  session.check('dry run changed nothing', (await session.rows(byCustomer('qdb_survey_invitations', 'qdb_survey_invitationid', accountId))).length === 2);
  const logs = await logRows(session, accountId);
  session.check('one dry-run log row', logs.length === 1 && logs[0].qdb_dry_run === true && logs[0].qdb_are_actual === false);
}

async function scenarioAnonymise(session, accountId, responseIds) {
  console.log('A2 — anonymise (R1: two responses with an empty invitation link)');
  const out = await erase(session, accountId, MODE.anonymise, false);
  session.check('anonymise AreActual true, IsComplete true', out.AreActual === true && out.IsComplete === true, countsOf(out));
  const responses = await session.rows(`qdb_survey_responses?$select=_qdb_customer_id_value,_qdb_survey_invitation_id_value,qdb_source_table,qdb_source_record_id&$filter=${encodeURIComponent(responseIds.map((id) => `qdb_survey_responseid eq ${id}`).join(' or '))}`);
  const cleared = responses.every((r) => !r._qdb_customer_id_value && !r._qdb_survey_invitation_id_value && !r.qdb_source_table && !r.qdb_source_record_id);
  session.check('both responses kept, customer + invitation link + source pointer cleared (R1 passes)', responses.length === 2 && cleared, `${responses.length} kept`);
  session.check('invitations deleted', (await session.rows(byCustomer('qdb_survey_invitations', 'qdb_survey_invitationid', accountId))).length === 0);
  session.check('suppression log deleted', (await session.rows(byCustomer('qdb_survey_suppression_logs', 'qdb_survey_suppression_logid', accountId))).length === 0);
  const live = (await logRows(session, accountId)).filter((row) => row.qdb_dry_run === false);
  session.check('started row then completed row', live.length === 2 && live[0].qdb_are_actual === false && live[1].qdb_are_actual === true && live[1].qdb_is_complete === true);
}

async function scenarioDelete(session, accountId) {
  console.log('B1 — delete');
  const out = await erase(session, accountId, MODE.delete, false);
  session.check('delete counts 1/1/1/1, complete', countsOf(out) === '1/1/1/1' && out.AreActual === true && out.IsComplete === true, countsOf(out));
  const left = await Promise.all([
    session.rows(byCustomer('qdb_survey_invitations', 'qdb_survey_invitationid', accountId)),
    session.rows(byCustomer('qdb_survey_responses', 'qdb_survey_responseid', accountId)),
    session.rows(byCustomer('qdb_survey_suppression_logs', 'qdb_survey_suppression_logid', accountId)),
  ]);
  session.check('nothing left for the customer', left.every((rows) => rows.length === 0));
  session.check('two log rows', (await logRows(session, accountId)).length === 2);
  console.log('B2 — delete again');
  const again = await erase(session, accountId, MODE.delete, false);
  session.check('rerun finds nothing and completes', countsOf(again) === '0/0/0/0' && again.IsComplete === true, countsOf(again));
}

const SURVEY_ROWS = [
  ['qdb_survey_invitations', 'qdb_survey_invitationid'], // cascades to linked responses and answers
  ['qdb_survey_responses', 'qdb_survey_responseid'],
  ['qdb_survey_suppression_logs', 'qdb_survey_suppression_logid'],
];

// Removes whatever a scenario left, even if it stopped part-way: the customer's survey rows,
// the responses anonymised away from it, its erasure-log rows, then the account itself.
async function cleanUp(session, { accounts, responseIds }) {
  console.log('Clean-up');
  for (const accountId of accounts) {
    for (const [entitySet, idAttribute] of SURVEY_ROWS) {
      for (const row of await session.rows(byCustomer(entitySet, idAttribute, accountId))) await session.write('DELETE', `${entitySet}(${row[idAttribute]})`);
    }
  }
  const anonymised = responseIds.length === 0 ? [] : await session.rows(`qdb_survey_responses?$select=qdb_survey_responseid&$filter=${encodeURIComponent(responseIds.map((id) => `qdb_survey_responseid eq ${id}`).join(' or '))}`);
  for (const row of anonymised) await session.write('DELETE', `qdb_survey_responses(${row.qdb_survey_responseid})`);
  for (const accountId of accounts) {
    for (const row of await logRows(session, accountId)) await session.write('DELETE', `qdb_survey_erasure_logs(${row.qdb_survey_erasure_logid})`);
    await session.write('DELETE', `accounts(${accountId})`);
  }
  const remaining = await session.rows(`accounts?$select=accountid&$filter=${encodeURIComponent(`startswith(name,'E2E-ERASE ${STAMP}')`)}`);
  session.check('test accounts, survey rows and log rows removed', remaining.length === 0);
}

const session = await openSession();
const setupId = await findSetup(session);
const accountA = await createAccount(session, 'A');
const accountB = await createAccount(session, 'B');
const created = { accounts: [accountA, accountB], responseIds: [] };
try {
  for (const label of ['A1', 'A2']) created.responseIds.push((await createAnsweredInvitation(session, { accountId: accountA, setupId, label })).responseId);
  await createSuppression(session, { accountId: accountA, label: 'A' });
  await createAnsweredInvitation(session, { accountId: accountB, setupId, label: 'B1' });
  await createSuppression(session, { accountId: accountB, label: 'B' });
  await scenarioRefused(session, accountA);
  await scenarioDryRun(session, accountA);
  await scenarioAnonymise(session, accountA, created.responseIds);
  await scenarioDelete(session, accountB);
} finally {
  await cleanUp(session, created);
}
console.log(session.allPassed() ? '\nALL PASSED' : '\nSOME CHECKS FAILED');
process.exitCode = session.allPassed() ? 0 : 1;
