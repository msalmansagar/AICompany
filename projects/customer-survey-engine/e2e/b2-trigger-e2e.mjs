/**
 * B2 end-to-end test on a live (test) org: a disbursement entering "Payment Processed" must
 * produce exactly one invitation, and re-entering must log a Duplicate instead of a second one.
 *
 * Creates (once, reused on re-runs): survey form srv-test-disbursement, setup + Event trigger
 * "E2E - Disbursement payment processed". Creates a new account and test disbursement every run:
 * a reused account would be inside the 30-day fatigue window of its previous run (B3). Temporarily activates the Disbursements source and enables its
 * Update step; both are ALWAYS restored in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b2-trigger-e2e.mjs
 */
import {
  openSession, pollFor, setDisbursementStep, createDisbursement, moveDisbursement, findDisbursementSource,
  failedPluginJobsSince, runStamp, DISBURSEMENT_TABLE, PAYMENT_PROCESSED, SAVED, LETTER_OF_CREDIT,
} from './e2e-helpers.mjs';
import { ensureSurveyForm, ensureCompletionSetup, COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';


async function runScenario(session, { accountId, setupId, triggerId }) {
  const name = `SURVEY-E2E-${runStamp()}`;
  const recordId = await createDisbursement(session, { name, accountId, type: LETTER_OF_CREDIT });
  console.log(`  test disbursement ${name} (${recordId})`);
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  const invitations = await pollFor('the invitation', () => session.rows(`qdb_survey_invitations?$select=qdb_status,qdb_channel,qdb_pinned_version,qdb_language_code,qdb_form_code,qdb_dedupe_key,qdb_expires_on,qdb_generated_on,_qdb_customer_id_value,_qdb_survey_setup_id_value,_qdb_survey_trigger_id_value&$filter=qdb_source_record_id eq '${recordId}'`));
  checkInvitation(session, invitations, { accountId, setupId, triggerId, recordId });
  await moveDisbursement(session, recordId, SAVED);
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  const duplicates = await pollFor('the Duplicate suppression row', () => session.rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail&$filter=qdb_source_record_id eq '${recordId}'`));
  session.check('re-entering Payment Processed logs Duplicate', duplicates.length === 1 && duplicates[0].qdb_reason === 100000002, duplicates.map((d) => `${d.qdb_reason}: ${d.qdb_detail}`).join('; '));
  const after = await session.rows(`qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=qdb_source_record_id eq '${recordId}'`);
  session.check('still exactly one invitation', after.length === 1, `${after.length}`);
}

function checkInvitation(session, invitations, expected) {
  session.check('exactly one invitation created', invitations.length === 1, `${invitations.length}`);
  const inv = invitations[0];
  if (!inv) return;
  const expectedKey = `${expected.setupId}|${expected.accountId}|${DISBURSEMENT_TABLE}:${expected.recordId}`;
  session.check('customer, setup and trigger linked', inv._qdb_customer_id_value === expected.accountId && inv._qdb_survey_setup_id_value === expected.setupId && inv._qdb_survey_trigger_id_value === expected.triggerId);
  session.check('status Pending, channel Portal (Digital origin)', inv.qdb_status === 100000000 && inv.qdb_channel === 100000000, `status ${inv.qdb_status}, channel ${inv.qdb_channel}`);
  session.check('form, language and pinned version', inv.qdb_form_code === COMPLETION_FORM_CODE && inv.qdb_language_code === 'en' && inv.qdb_pinned_version >= 1, `${inv.qdb_form_code} ${inv.qdb_language_code} v${inv.qdb_pinned_version}`);
  session.check('dedupe key', inv.qdb_dedupe_key === expectedKey, inv.qdb_dedupe_key);
  const expiryDays = (new Date(inv.qdb_expires_on) - new Date(inv.qdb_generated_on)) / 86400000;
  session.check('expires 14 days after generation', Math.round(expiryDays) === 14, `${expiryDays.toFixed(2)} days`);
}

async function run() {
  const startedOn = new Date().toISOString();
  const session = await openSession();
  console.log(`B2 E2E — ${session.client.orgUrl}`);
  const published = await ensureSurveyForm(session, COMPLETION_FORM_CODE);
  session.check('survey form published', published.length > 0, published.map((p) => `${p.qdb_language_code} v${p.qdb_published_version}`).join(', '));
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey E2E Test Customer ${runStamp()}`, description: 'Test customer for the Customer Survey Engine end-to-end test. Safe to delete.' });
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
