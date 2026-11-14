/**
 * B4 end-to-end test on a live (test) org (FR-CSE-002, 003, 004):
 *   A  Activating Disbursements through qdb_srv_ActivateSource enables its two pre-registered
 *      steps (reused, not created), a completed disbursement then produces an invitation, and
 *      qdb_srv_DeactivateSource disables them again.
 *   B  A non-administrator (impersonated) is refused.
 *   C  A trigger with a status code the table does not have makes activation refuse.
 *   D  A source added after deployment (a temporary source on qdb_survey_sms_config) gets its
 *      steps created on activation and deleted on deactivation.
 * Everything is restored in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b4-activation-e2e.mjs
 */
import { openSession, pollFor, createDisbursement, moveDisbursement, findDisbursementSource, failedPluginJobsSince, runStamp, isAdministrator, findUnprivilegedUser, PAYMENT_PROCESSED, LETTER_OF_CREDIT } from './e2e-helpers.mjs';
import { ensureSurveyForm, ensureCompletionSetup, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';
import { stepName } from '../provisioning/lib/plugin-payloads.mjs';

const TEMP_TABLE = 'qdb_survey_sms_config';

const activate = (session, sourceId) => session.client.send('POST', 'qdb_srv_ActivateSource', { SourceId: sourceId });
const deactivate = (session, sourceId) => session.client.send('POST', 'qdb_srv_DeactivateSource', { SourceId: sourceId });

async function stepsOf(session, table) {
  const names = ['Create', 'Update'].map((message) => stepName(message, table));
  const rows = await session.rows(`sdkmessageprocessingsteps?$select=name,statecode&$filter=${encodeURIComponent(names.map((n) => `name eq '${n}'`).join(' or '))}`);
  return rows.map((r) => ({ name: r.name, isEnabled: r.statecode === 0 }));
}

async function sourceState(session, sourceId) {
  const [row] = await session.rows(`qdb_survey_sources?$select=qdb_is_active,qdb_step_registration_json&$filter=qdb_survey_sourceid eq ${sourceId}`);
  return { isActive: row.qdb_is_active, registrations: row.qdb_step_registration_json ? JSON.parse(row.qdb_step_registration_json) : [] };
}

async function scenarioActivateSeedSource(session, { source, completion }) {
  console.log('A — activate and deactivate Disbursements (pre-registered steps)');
  const { json } = await activate(session, source.qdb_survey_sourceid);
  console.log(`  ${json.Message}`);
  const afterActivate = await sourceState(session, source.qdb_survey_sourceid);
  session.check('source marked active with 2 reused registrations', afterActivate.isActive && afterActivate.registrations.length === 2 && afterActivate.registrations.every((r) => !r.created));
  session.check('both disbursement steps enabled', (await stepsOf(session, 'qdb_payment_authorization_ticket')).filter((s) => s.isEnabled).length === 2);
  const stamp = runStamp();
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey E2E D ${stamp}`, description: 'Test customer for the Customer Survey Engine B4 end-to-end test. Safe to delete.' });
  const recordId = await createDisbursement(session, { name: `SURVEY-E2E-D1-${stamp}`, accountId, type: LETTER_OF_CREDIT });
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  const invitations = await pollFor('the invitation', () => session.rows(`qdb_survey_invitations?$select=_qdb_survey_setup_id_value&$filter=qdb_source_record_id eq '${recordId}'`));
  session.check('activated source triggers an invitation', invitations.length === 1 && invitations[0]._qdb_survey_setup_id_value === completion.setupId);
  console.log(`  ${(await deactivate(session, source.qdb_survey_sourceid)).json.Message}`);
  const afterDeactivate = await sourceState(session, source.qdb_survey_sourceid);
  session.check('source inactive, registrations cleared', !afterDeactivate.isActive && afterDeactivate.registrations.length === 0);
  session.check('both disbursement steps disabled, not deleted', (await stepsOf(session, 'qdb_payment_authorization_ticket')).filter((s) => !s.isEnabled).length === 2);
}

async function scenarioNonAdministrator(session, sourceId) {
  console.log('B — a non-administrator is refused');
  const user = await findUnprivilegedUser(session);
  if (!user) { session.check('a non-administrator user exists to test with', false, 'none found among the first 25 enabled users'); return; }
  const outcome = await session.client.sendAsUser('POST', 'qdb_srv_ActivateSource', { SourceId: sourceId }, user.systemuserid).then(() => 'allowed', (error) => error.message);
  session.check(`activation by ${user.fullname} is refused`, outcome !== 'allowed' && outcome.includes('System Administrator'), outcome.slice(0, 160));
  session.check('source still inactive', !(await sourceState(session, sourceId)).isActive);
}

async function scenarioBadCode(session, { tempSourceId, completion }) {
  console.log('C — an unknown trigger status code blocks activation');
  const { entityId: triggerId } = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: 'E2E temp trigger with a bad code', 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${completion.setupId})`,
    'qdb_source_id@odata.bind': `/qdb_survey_sources(${tempSourceId})`, qdb_trigger_kind: 100000000, qdb_status_values: '424242', qdb_is_active: true,
  });
  const outcome = await activate(session, tempSourceId).then(() => 'allowed', (error) => error.message);
  session.check('activation refused and names the bad code', outcome !== 'allowed' && outcome.includes('424242'), outcome.slice(0, 160));
  await session.write('DELETE', `qdb_survey_triggers(${triggerId})`);
}

async function scenarioNewSource(session, tempSourceId) {
  console.log('D — a source added after deployment gets steps created, then deleted');
  console.log(`  ${(await activate(session, tempSourceId)).json.Message}`);
  const afterActivate = await sourceState(session, tempSourceId);
  session.check('2 steps created and recorded as created', afterActivate.registrations.length === 2 && afterActivate.registrations.every((r) => r.created));
  session.check('the new steps exist and are enabled', (await stepsOf(session, TEMP_TABLE)).filter((s) => s.isEnabled).length === 2);
  console.log(`  ${(await deactivate(session, tempSourceId)).json.Message}`);
  session.check('deactivation deleted exactly those steps', (await stepsOf(session, TEMP_TABLE)).length === 0);
}

async function run() {
  const startedOn = new Date().toISOString();
  const session = await openSession();
  console.log(`B4 E2E — ${session.client.orgUrl}`);
  const { json: whoAmI } = await session.client.send('GET', 'WhoAmI');
  session.check('the calling application user is a System Administrator', await isAdministrator(session, whoAmI.UserId));
  await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  const source = await findDisbursementSource(session);
  const completion = await ensureCompletionSetup(session, source.qdb_survey_sourceid);
  const { entityId: tempSourceId } = await session.write('POST', 'qdb_survey_sources', {
    qdb_name: 'E2E temp source', qdb_table_logical_name: TEMP_TABLE, qdb_customer_lookup_field: 'ownerid', qdb_status_field: 'statuscode', qdb_is_active: false,
  });
  try {
    await scenarioActivateSeedSource(session, { source, completion });
    await scenarioNonAdministrator(session, source.qdb_survey_sourceid);
    await scenarioBadCode(session, { tempSourceId, completion });
    await scenarioNewSource(session, tempSourceId);
  } finally {
    await deactivate(session, source.qdb_survey_sourceid).catch((error) => console.log(`  restore: ${error.message}`));
    await deactivate(session, tempSourceId).catch((error) => console.log(`  restore: ${error.message}`));
    await session.write('DELETE', `qdb_survey_sources(${tempSourceId})`);
    await session.write('PATCH', `qdb_survey_setups(${completion.setupId})`, { qdb_is_active: false });
    console.log('  restored: Disbursements deactivated through the API, temp source deactivated and deleted, test setup deactivated');
  }
  const failures = await failedPluginJobsSince(session, startedOn);
  session.check('no failed SurveyTriggerPlugin system jobs', failures.length === 0, failures.map((f) => f.friendlymessage ?? f.message).join(' | ').slice(0, 300));
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
