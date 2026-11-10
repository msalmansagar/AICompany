/**
 * B7 end-to-end test on a live (test) org (FR-CSE-048, 049, 050, NFR-CSE-001):
 *   A  A Pending secure-link invitation is dispatched once: token hash stored, an SMS row created in
 *      the configured SMS table (fax on this org) with the link, and an email activity regarding the
 *      invitation, or a "Not delivered" log row saying why email failed.
 *   B  A customer without a mobile number still gets the email; the missing SMS is logged.
 *   C  While secure link is disabled nothing is sent and the reason is logged.
 *   D  A Portal invitation is not dispatched.
 *   E  A Postponed secure-link invitation is dispatched when it is released to Pending.
 * Uses a fake mobile number and an example.invalid address, deletes the SMS rows it creates, and
 * restores the settings and SMS configuration in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b7-dispatch-e2e.mjs
 */
import { openSession, runStamp, pollFor, ensureRow } from './e2e-helpers.mjs';

const FORM_CODE = 'srv-customer-feedback-demo';
const SETUP_NAME = 'Demo - Customer feedback';
const BASE_URL = 'https://portal.example.test/survey';
const FAKE_MOBILE = '+97400000000';
const STATUS = { pending: 100000000, postponed: 100000001 };
const CHANNEL = { portal: 100000000, secureLink: 100000001 };
const NOT_DELIVERED = 100000009;
const SMS_SUBJECT = 'Survey E2E B7';

const tokenOf = async (session, invitationId) =>
  (await session.rows(`qdb_survey_invitations?$select=qdb_token_hash&$filter=qdb_survey_invitationid eq ${invitationId}`))[0].qdb_token_hash;
// Filtered in the script: substring filters on a memo column are not something to rely on in OData.
const logsFor = async (session, invitationId) =>
  (await session.rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail&$filter=qdb_reason eq ${NOT_DELIVERED}&$orderby=createdon desc&$top=50`))
    .filter((log) => log.qdb_detail?.includes(invitationId));
const waitForToken = (session, invitationId) => pollFor('the dispatch job', async () => ((await tokenOf(session, invitationId)) ? [1] : []));
const waitForLog = (session, invitationId) => pollFor('the not-delivered log', () => logsFor(session, invitationId));

async function createInvitation(session, { accountId, setupId, label, channel = CHANNEL.secureLink, status = STATUS.pending }) {
  return (await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: `${FORM_CODE} — B7 ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: FORM_CODE, qdb_pinned_version: 1, qdb_language_code: 'en', qdb_status: status, qdb_channel: channel,
    qdb_generated_on: new Date().toISOString(), qdb_expires_on: new Date(Date.now() + 14 * 86400000).toISOString(), qdb_dedupe_key: `E2E-B7-${label}-${runStamp()}`,
  })).entityId;
}

async function scenarioBothChannels(session, { accountId, setupId, smsRows }) {
  console.log('A — SMS and email for a secure-link invitation');
  const invitationId = await createInvitation(session, { accountId, setupId, label: 'both' });
  await waitForToken(session, invitationId);
  session.check('the token hash is stored (64 hex characters)', /^[0-9a-f]{64}$/.test(await tokenOf(session, invitationId) ?? ''));
  const sms = await session.rows(`faxes?$select=activityid,faxnumber,qdb_message_body,_regardingobjectid_value&$filter=_regardingobjectid_value eq ${accountId} and subject eq '${SMS_SUBJECT}'`);
  smsRows.push(...sms.map((row) => row.activityid));
  session.check('one SMS row in fax, to the mobile number, regarding the customer, carrying the link', sms.length === 1 && sms[0].faxnumber === FAKE_MOBILE && sms[0].qdb_message_body.includes(`${BASE_URL}?token=`),
    sms[0]?.qdb_message_body?.slice(0, 120));
  const emails = await session.rows(`emails?$select=subject,statuscode&$filter=_regardingobjectid_value eq ${invitationId}`);
  const logs = await logsFor(session, invitationId);
  const emailOutcome = emails.length === 1 ? `email activity "${emails[0].subject}" (statuscode ${emails[0].statuscode})` : `not sent: ${logs[0]?.qdb_detail ?? 'no log row'}`;
  session.check('the email is either created regarding the invitation, or its failure is logged', emails.length === 1 || logs.some((l) => l.qdb_detail.includes('Email')), emailOutcome);
  await session.write('PATCH', `qdb_survey_invitations(${invitationId})`, { qdb_status: STATUS.pending });
  await new Promise((resolve) => setTimeout(resolve, 20000));
  const again = await session.rows(`faxes?$select=activityid&$filter=_regardingobjectid_value eq ${accountId} and subject eq '${SMS_SUBJECT}'`);
  smsRows.push(...again.map((row) => row.activityid).filter((id) => !smsRows.includes(id)));
  session.check('saving the invitation again does not send a second SMS', again.length === 1);
}

async function scenarioNoMobile(session, { setupId, stamp }) {
  console.log('B — customer without a mobile number');
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey E2E B7 No Mobile ${stamp}`, emailaddress1: 'survey-e2e-b7@example.invalid', description: 'Survey B7 test customer. Safe to delete.' });
  const invitationId = await createInvitation(session, { accountId, setupId, label: 'no-mobile' });
  const logs = await waitForLog(session, invitationId);
  session.check('the missing SMS is logged as Not delivered', logs.some((l) => l.qdb_detail.includes('no mobile number')), logs[0]?.qdb_detail?.slice(0, 160));
}

async function scenarioDisabled(session, { accountId, setupId, settingsId }) {
  console.log('C — secure link disabled');
  await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_securelink_enabled: false });
  const invitationId = await createInvitation(session, { accountId, setupId, label: 'disabled' });
  const logs = await waitForLog(session, invitationId);
  session.check('nothing is sent and the disabled channel is logged', logs.some((l) => l.qdb_detail.includes('disabled')) && !(await tokenOf(session, invitationId)));
  await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_securelink_enabled: true });
}

async function scenarioPortal(session, { accountId, setupId }) {
  console.log('D — portal invitation');
  const invitationId = await createInvitation(session, { accountId, setupId, label: 'portal', channel: CHANNEL.portal });
  await new Promise((resolve) => setTimeout(resolve, 30000));
  session.check('a Portal invitation gets no token and no log row', !(await tokenOf(session, invitationId)) && (await logsFor(session, invitationId)).length === 0);
}

async function scenarioReleased(session, { accountId, setupId, smsRows }) {
  console.log('E — postponed invitation released to Pending');
  const invitationId = await createInvitation(session, { accountId, setupId, label: 'released', status: STATUS.postponed });
  await new Promise((resolve) => setTimeout(resolve, 20000));
  session.check('while Postponed it is not dispatched', !(await tokenOf(session, invitationId)));
  await session.write('PATCH', `qdb_survey_invitations(${invitationId})`, { qdb_status: STATUS.pending });
  await waitForToken(session, invitationId);
  session.check('once Pending it is dispatched', Boolean(await tokenOf(session, invitationId)));
  const sms = await session.rows(`faxes?$select=activityid&$filter=_regardingobjectid_value eq ${accountId} and subject eq '${SMS_SUBJECT}'`);
  smsRows.push(...sms.map((row) => row.activityid).filter((id) => !smsRows.includes(id)));
}

async function configure(session, stamp) {
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_survey_settingsid,qdb_securelink_enabled,qdb_securelink_base_url,_qdb_email_sender_queue_id_value');
  const [queue] = await session.rows("queues?$select=queueid&$filter=name eq 'Default messaging queue'");
  const active = await session.rows('qdb_survey_sms_configs?$select=qdb_survey_sms_configid&$filter=qdb_is_active eq true');
  if (active.length > 0) throw new Error('An SMS configuration is already active on this org; the test would bypass it.');
  const { entityId: smsConfigId } = await session.write('POST', 'qdb_survey_sms_configs', {
    qdb_name: `E2E B7 fax ${stamp}`, qdb_sms_table_logical_name: 'fax', qdb_recipient_field: 'faxnumber', qdb_message_field: 'qdb_message_body',
    qdb_customer_link_field: 'regardingobjectid', qdb_customer_phone_field: 'telephone1', qdb_static_columns_json: JSON.stringify({ subject: SMS_SUBJECT }), qdb_is_active: true,
  });
  await session.write('PATCH', `qdb_survey_settingses(${settings.qdb_survey_settingsid})`, {
    qdb_securelink_enabled: true, qdb_securelink_base_url: BASE_URL, 'qdb_email_sender_queue_id@odata.bind': `/queues(${queue.queueid})`,
  });
  return { settings, smsConfigId };
}

async function restore(session, { settings, smsConfigId, smsRows }) {
  await session.write('PATCH', `qdb_survey_settingses(${settings.qdb_survey_settingsid})`, { qdb_securelink_enabled: settings.qdb_securelink_enabled, qdb_securelink_base_url: settings.qdb_securelink_base_url });
  if (!settings._qdb_email_sender_queue_id_value) await session.write('DELETE', `qdb_survey_settingses(${settings.qdb_survey_settingsid})/qdb_email_sender_queue_id/$ref`).catch((error) => console.log(`  restore queue: ${error.message}`));
  await session.write('DELETE', `qdb_survey_sms_configs(${smsConfigId})`);
  for (const id of smsRows) await session.write('DELETE', `faxes(${id})`).catch((error) => console.log(`  delete fax ${id}: ${error.message}`));
  console.log(`  restored: settings, temporary SMS configuration deleted, ${smsRows.length} test SMS row(s) deleted`);
}

async function run() {
  const session = await openSession();
  console.log(`B7 E2E — ${session.client.orgUrl}`);
  const stamp = runStamp();
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, { qdb_name: SETUP_NAME, qdb_form_code: FORM_CODE });
  const { entityId: accountId } = await session.write('POST', 'accounts', {
    name: `Survey E2E B7 Customer ${stamp}`, telephone1: FAKE_MOBILE, emailaddress1: 'survey-e2e-b7@example.invalid', description: 'Survey B7 test customer. Safe to delete.',
  });
  const state = { ...(await configure(session, stamp)), smsRows: [] };
  try {
    await scenarioBothChannels(session, { accountId, setupId, smsRows: state.smsRows });
    await scenarioNoMobile(session, { setupId, stamp });
    await scenarioDisabled(session, { accountId, setupId, settingsId: state.settings.qdb_survey_settingsid });
    await scenarioPortal(session, { accountId, setupId });
    await scenarioReleased(session, { accountId, setupId, smsRows: state.smsRows });
  } finally {
    await restore(session, state);
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
