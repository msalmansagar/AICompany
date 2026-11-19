/**
 * DEF-CSE-001 on a live (test) org: a status changed again before the async trigger job runs must not lose
 * the survey. A disbursement is moved into "Payment Processed" and, straight away, out again to "Saved", so
 * the first change's job runs after the record has already moved on. Before the fix that job read "Saved"
 * and created nothing; now it must create exactly one invitation.
 *
 * Same fixtures as B2 (form srv-test-disbursement, setup "E2E - Disbursement payment processed"), a new account
 * and disbursement per run. Temporarily activates the Disbursements source and enables its Update step; both
 * are ALWAYS restored in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env def-cse-001-chained-status-e2e.mjs
 */
import {
  openSession, setDisbursementStep, createDisbursement, moveDisbursement, findDisbursementSource, waitForJobsOn,
  failedPluginJobsSince, runStamp, PAYMENT_PROCESSED, SAVED, LETTER_OF_CREDIT,
} from './e2e-helpers.mjs';
import { ensureSurveyForm, ensureCompletionSetup, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';

async function runScenario(session, { accountId, triggerId }) {
  const name = `SURVEY-E2E-DEF001-${runStamp()}`;
  const recordId = await createDisbursement(session, { name, accountId, type: LETTER_OF_CREDIT });
  console.log(`  test disbursement ${name} (${recordId})`);
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  await moveDisbursement(session, recordId, SAVED);
  const secondSavedOn = new Date();
  await waitForJobsOn(session, recordId);
  await reportRace(session, recordId, secondSavedOn);
  const invitations = await session.rows(`qdb_survey_invitations?$select=qdb_status,_qdb_survey_trigger_id_value&$filter=qdb_source_record_id eq '${recordId}'`);
  session.check('the Payment Processed survey was not lost: exactly one invitation', invitations.length === 1, `${invitations.length}`);
  session.check('it belongs to the Payment Processed trigger', invitations.length === 1 && invitations[0]._qdb_survey_trigger_id_value === triggerId);
  const suppressions = await session.rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail&$filter=qdb_source_record_id eq '${recordId}'`);
  session.check('nothing suppressed for this record', suppressions.length === 0, suppressions.map((row) => `${row.qdb_reason}: ${row.qdb_detail}`).join('; '));
}

// Evidence that the defect's condition really occurred: the job that fired started after the second save.
// The trigger steps auto-delete succeeded system jobs, so the plugin trace log (which names the record) is read.
async function reportRace(session, recordId, secondSavedOn) {
  const traces = await session.rows(`plugintracelogs?$select=performanceexecutionstarttime,messageblock&$filter=contains(typename,'SurveyTriggerPlugin') and contains(messageblock,'${recordId}')&$orderby=createdon asc`);
  traces.forEach((row) => console.log(`    trace started ${row.performanceexecutionstarttime}: ${(row.messageblock || '').replace(/\s+/g, ' ').slice(0, 120)}`));
  const fired = traces.find((row) => /Invitation created/.test(row.messageblock || ''));
  const isRaced = Boolean(fired && new Date(fired.performanceexecutionstarttime) >= secondSavedOn);
  session.check('the race happened (the job that fired started after the second save)', isRaced, fired ? `started ${fired.performanceexecutionstarttime}, second save ${secondSavedOn.toISOString()}` : 'no trace row (is plugin tracing on?)');
}

async function run() {
  const startedOn = new Date().toISOString();
  const session = await openSession();
  console.log(`DEF-CSE-001 E2E — ${session.client.orgUrl}`);
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey E2E DEF-001 Customer ${runStamp()}`, description: 'Test customer for the DEF-CSE-001 end-to-end test. Safe to delete.' });
  const source = await findDisbursementSource(session);
  const completion = await ensureCompletionSetup(session, source.qdb_survey_sourceid);
  try {
    await session.write('PATCH', `qdb_survey_sources(${source.qdb_survey_sourceid})`, { qdb_is_active: true });
    await setDisbursementStep(session, true);
    console.log('  source activated, Update step enabled');
    await runScenario(session, { accountId, ...completion });
  } finally {
    await setDisbursementStep(session, false);
    await session.write('PATCH', `qdb_survey_sources(${source.qdb_survey_sourceid})`, { qdb_is_active: source.qdb_is_active });
    await session.write('PATCH', `qdb_survey_setups(${completion.setupId})`, { qdb_is_active: false });
    console.log(`  restored: Update step disabled, source active=${source.qdb_is_active}, test setup deactivated`);
  }
  const failures = await failedPluginJobsSince(session, startedOn);
  session.check('no failed SurveyTriggerPlugin system jobs', failures.length === 0, failures.map((f) => f.friendlymessage ?? f.message).join(' | ').slice(0, 300));
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
