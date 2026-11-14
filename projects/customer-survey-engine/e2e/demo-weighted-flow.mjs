/**
 * Seeds ONE realistic record through the whole survey flow on a live (test) org, for a person to
 * finish in CRM: an active setup on the weighted demo survey, the Disbursements source switched on
 * just long enough for one test disbursement to reach Payment Processed, the invitation the trigger
 * plugin creates, then the source and setup switched off again. Prints the link to answer it.
 * Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env demo-weighted-flow.mjs
 */
import { openSession, pollFor, runStamp, ensureRow, createDisbursement, moveDisbursement, findDisbursementSource, PAYMENT_PROCESSED, LETTER_OF_CREDIT } from './e2e-helpers.mjs';

const FORM_CODE = 'srv-weighted-demo';
const SETUP_NAME = 'Demo - Weighted disbursement feedback';

async function ensureActiveSetup(session, sourceId) {
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: true,
    qdb_notif_title_en: 'How was your disbursement?', qdb_notif_title_ar: 'كيف كانت تجربة الصرف؟',
    qdb_notif_message_en: 'Your payment has been processed. Please rate your experience.', qdb_notif_message_ar: 'تمت معالجة دفعتك. يرجى تقييم تجربتك.',
  });
  await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: true });
  await ensureRow(session, { entitySet: 'qdb_survey_triggers', idAttribute: 'qdb_survey_triggerid', filter: `_qdb_survey_setup_id_value eq ${setupId}` }, {
    qdb_name: `${SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, 'qdb_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: 100000000, qdb_status_values: String(PAYMENT_PROCESSED.statuscode), qdb_type_values: String(LETTER_OF_CREDIT), qdb_is_active: true,
  });
  return setupId;
}

async function run() {
  const session = await openSession();
  console.log(`Weighted demo flow — ${session.client.orgUrl}`);
  const source = await findDisbursementSource(session);
  const setupId = await ensureActiveSetup(session, source.qdb_survey_sourceid);
  const stamp = runStamp();
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey Demo Weighted Customer ${stamp}`, description: 'Demo customer for the weighted survey flow. Safe to delete.' });
  console.log(`  ${(await session.client.send('POST', 'qdb_srv_ActivateSource', { SourceId: source.qdb_survey_sourceid })).json.Message}`);
  let invitation;
  try {
    const recordId = await createDisbursement(session, { name: `SURVEY-DEMO-WEIGHTED-${stamp}`, accountId, type: LETTER_OF_CREDIT });
    await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
    console.log(`  disbursement SURVEY-DEMO-WEIGHTED-${stamp} moved to Payment Processed`);
    [invitation] = await pollFor('the trigger plugin to create the invitation', () =>
      session.rows(`qdb_survey_invitations?$select=qdb_survey_invitationid,qdb_status,qdb_pinned_version,qdb_language_code&$filter=qdb_source_record_id eq '${recordId}'`));
  } finally {
    console.log(`  ${(await session.client.send('POST', 'qdb_srv_DeactivateSource', { SourceId: source.qdb_survey_sourceid })).json.Message}`);
    await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: false });
    console.log('  setup switched off again');
  }
  if (!invitation) { console.log('✗ no invitation was created'); process.exit(1); }
  console.log(`  invitation ${invitation.qdb_survey_invitationid}: status ${invitation.qdb_status}, pinned v${invitation.qdb_pinned_version}, ${invitation.qdb_language_code}`);
  console.log(`\nANSWER IT HERE:\n${session.client.orgUrl}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${encodeURIComponent(`invitationId=${invitation.qdb_survey_invitationid}&customerId=${accountId}`)}`);
  console.log(`\ninvitationId=${invitation.qdb_survey_invitationid}\ncustomerId=${accountId}`);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
