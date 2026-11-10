/**
 * B6 end-to-end test on a live (test) org (FR-CSE-047, 050..054, 056, NFR-CSE-009), on the demo
 * survey srv-customer-feedback-demo (2 pages, 6 questions, 2 star ratings):
 *   A  ListPendingSurveys returns the customer's open invitation with the setup's wording (en + ar).
 *   B  GetSurvey returns the pinned version's JSON; another customer is refused (survey_forbidden).
 *   C  SubmitResponse writes 1 Response + 6 Answers + JSON, labels the rating "Excellent" with
 *      numeric 5, closes the invitation; a second submit is refused; the list no longer shows it.
 *   D  Unknown question → survey_bad_request with nothing written; expired → survey_expired.
 *   E  Secure link: refused while disabled; enabled for the test, a token validates, submits once,
 *      then reads as used; a guessed token is unknown. The setting is restored.
 *   F  A user without the Survey Integration role is refused.
 * Finally leaves ONE open invitation for a demo customer and prints the CRM link to answer it.
 * Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b6-integration-api-e2e.mjs
 */
import { createHash, randomBytes } from 'node:crypto';
import { openSession, runStamp, findNonAdministrator, ensureRow } from './e2e-helpers.mjs';

const FORM_CODE = 'srv-customer-feedback-demo';
const SETUP_NAME = 'Demo - Customer feedback';
const STATUS = { pending: 100000000, submitted: 100000002 };
const ANSWERS = [
  { questionCode: 'srv_demo_overall', value: '5' }, { questionCode: 'srv_demo_ease', value: '4' },
  { questionCode: 'srv_demo_channel', value: '1' }, { questionCode: 'srv_demo_recommend', value: '1' },
  { questionCode: 'srv_demo_well', value: 'Quick approval and clear updates.' }, { questionCode: 'srv_demo_improve', value: 'More status notifications by SMS.' },
];

const call = (session, api, body) => session.client.send('POST', api, body).then(({ json }) => json);
const refusal = (promise) => promise.then(() => 'allowed', (error) => error.message);
const tokenHash = (token) => createHash('sha256').update(token, 'utf8').digest('hex');

async function ensureDemoSetup(session) {
  return ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: false,
    qdb_notif_title_en: 'How did we do?', qdb_notif_title_ar: 'كيف كانت تجربتك؟',
    qdb_notif_message_en: 'Please take two minutes to rate your recent experience with QDB.', qdb_notif_message_ar: 'يرجى تخصيص دقيقتين لتقييم تجربتك الأخيرة مع بنك قطر للتنمية.',
  });
}

async function publishedVersion(session) {
  const [cache] = await session.rows(`qdb_form_render_caches?$select=qdb_published_version&$filter=qdb_form_code eq '${FORM_CODE}' and qdb_language_code eq 'en' and qdb_is_active eq true and qdb_status eq 2`);
  if (!cache) throw new Error(`${FORM_CODE} is not published; run demo/seed-demo-survey.mjs first.`);
  return cache.qdb_published_version;
}

async function createInvitation(session, { accountId, setupId, version, label, expiresInDays = 14, token }) {
  const { entityId } = await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: `${FORM_CODE} — ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: FORM_CODE, qdb_pinned_version: version, qdb_language_code: 'en', qdb_status: STATUS.pending, qdb_channel: token ? 100000001 : 100000000,
    qdb_generated_on: new Date().toISOString(), qdb_expires_on: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
    qdb_dedupe_key: `E2E-B6-${label}-${runStamp()}`, ...(token ? { qdb_token_hash: tokenHash(token) } : {}),
  });
  return entityId;
}

async function scenarioListAndGet(session, { accountId, otherAccountId, invitationId }) {
  console.log('A/B — list pending and get survey');
  const list = JSON.parse((await call(session, 'qdb_srv_ListPendingSurveys', { CustomerId: accountId })).SurveysJson);
  const item = list.find((s) => s.invitationId === invitationId);
  session.check('the open invitation is listed with the English title', item?.title === 'How did we do?' && item.formCode === FORM_CODE, JSON.stringify(item ?? list).slice(0, 160));
  const arabic = JSON.parse((await call(session, 'qdb_srv_ListPendingSurveys', { CustomerId: accountId, Language: 'ar' })).SurveysJson);
  session.check('and with the Arabic title when ar is requested', arabic.find((s) => s.invitationId === invitationId)?.title === 'كيف كانت تجربتك؟');
  const survey = await call(session, 'qdb_srv_GetSurvey', { InvitationId: invitationId, CallerCustomerId: accountId });
  const form = JSON.parse(survey.RuntimeJson);
  session.check('GetSurvey returns the pinned survey JSON (2 pages)', survey.FormCode === FORM_CODE && form.tabs.length === 2, `version ${survey.Version}, ${survey.RenderedLanguage}`);
  const outcome = await refusal(call(session, 'qdb_srv_GetSurvey', { InvitationId: invitationId, CallerCustomerId: otherAccountId }));
  session.check('another customer is refused with survey_forbidden', outcome.includes('survey_forbidden'), outcome.slice(0, 140));
}

async function scenarioSubmit(session, { accountId, invitationId }) {
  console.log('C — submit response');
  const { ResponseId: responseId } = await call(session, 'qdb_srv_SubmitResponse', { InvitationId: invitationId, CallerCustomerId: accountId, AnswersJson: JSON.stringify(ANSWERS) });
  const [response] = await session.rows(`qdb_survey_responses?$select=qdb_answers_json,_qdb_customer_id_value,qdb_pinned_version&$filter=qdb_survey_responseid eq ${responseId}`);
  const answers = await session.rows(`qdb_survey_answers?$select=qdb_question_code,qdb_answer_text,qdb_answer_numeric,qdb_question_order&$filter=_qdb_survey_response_id_value eq ${responseId}&$orderby=qdb_question_order`);
  session.check('1 response with the answers JSON as sent and 6 answer rows', response?.qdb_answers_json === JSON.stringify(ANSWERS) && answers.length === 6, `${answers.length} answers`);
  const overall = answers.find((a) => a.qdb_question_code === 'srv_demo_overall');
  session.check('the star rating is stored as "Excellent" with numeric 5', overall?.qdb_answer_text === 'Excellent' && Number(overall.qdb_answer_numeric) === 5);
  session.check('the channel answer is stored as its label', answers.find((a) => a.qdb_question_code === 'srv_demo_channel')?.qdb_answer_text === 'QDB Digital portal');
  const [invitation] = await session.rows(`qdb_survey_invitations?$select=qdb_status&$filter=qdb_survey_invitationid eq ${invitationId}`);
  session.check('the invitation is now Submitted', invitation.qdb_status === STATUS.submitted);
  const again = await refusal(call(session, 'qdb_srv_SubmitResponse', { InvitationId: invitationId, CallerCustomerId: accountId, AnswersJson: JSON.stringify(ANSWERS) }));
  session.check('a second submit is refused with survey_already_submitted', again.includes('survey_already_submitted'), again.slice(0, 140));
  const list = JSON.parse((await call(session, 'qdb_srv_ListPendingSurveys', { CustomerId: accountId })).SurveysJson);
  session.check('and it is no longer in the pending list', !list.some((s) => s.invitationId === invitationId));
}

async function scenarioRefusals(session, { accountId, setupId, version }) {
  console.log('D — bad answers and expiry');
  const invitationId = await createInvitation(session, { accountId, setupId, version, label: 'bad-answers' });
  const bad = await refusal(call(session, 'qdb_srv_SubmitResponse', { InvitationId: invitationId, CallerCustomerId: accountId, AnswersJson: '[{"questionCode":"srv_not_a_question","value":"x"}]' }));
  const written = await session.rows(`qdb_survey_responses?$select=qdb_survey_responseid&$filter=_qdb_survey_invitation_id_value eq ${invitationId}`);
  session.check('an unknown question is refused with survey_bad_request and nothing is written', bad.includes('survey_bad_request') && written.length === 0, bad.slice(0, 140));
  const expiredId = await createInvitation(session, { accountId, setupId, version, label: 'expired', expiresInDays: -1 });
  const expired = await refusal(call(session, 'qdb_srv_GetSurvey', { InvitationId: expiredId, CallerCustomerId: accountId }));
  session.check('an expired invitation is refused with survey_expired', expired.includes('survey_expired'), expired.slice(0, 140));
}

async function scenarioSecureLink(session, { accountId, setupId, version, settingsId }) {
  console.log('E — secure link token');
  const token = randomBytes(32).toString('base64url');
  const invitationId = await createInvitation(session, { accountId, setupId, version, label: 'token', token });
  const disabled = await refusal(call(session, 'qdb_srv_ValidateLinkToken', { Token: token }));
  session.check('refused while the secure-link channel is disabled', disabled.includes('survey_forbidden'), disabled.slice(0, 140));
  await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_securelink_enabled: true });
  try {
    const valid = await call(session, 'qdb_srv_ValidateLinkToken', { Token: token });
    session.check('the token validates and names its invitation', valid.Valid === true && valid.InvitationId === invitationId);
    await call(session, 'qdb_srv_SubmitResponse', { Token: token, AnswersJson: JSON.stringify(ANSWERS.slice(0, 2)) });
    const used = await call(session, 'qdb_srv_ValidateLinkToken', { Token: token });
    session.check('after submit the token reads as used', used.Valid === false && used.Reason === 'used');
    const guessed = await call(session, 'qdb_srv_ValidateLinkToken', { Token: randomBytes(32).toString('base64url') });
    session.check('a guessed token reads as unknown', guessed.Valid === false && guessed.Reason === 'unknown');
  } finally {
    await session.write('PATCH', `qdb_survey_settingses(${settingsId})`, { qdb_securelink_enabled: false });
  }
}

async function scenarioUnprivileged(session, { accountId, invitationId }) {
  console.log('F — caller without the Survey Integration role');
  const user = await findNonAdministrator(session);
  if (!user) { session.check('a non-administrator user exists to test with', false); return; }
  const outcome = await refusal(session.client.sendAsUser('POST', 'qdb_srv_GetSurvey', { InvitationId: invitationId, CallerCustomerId: accountId }, user.systemuserid));
  session.check(`${user.fullname} (no survey role) is refused`, outcome !== 'allowed', outcome.slice(0, 160));
}

async function run() {
  const session = await openSession();
  console.log(`B6 E2E — ${session.client.orgUrl}`);
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_survey_settingsid,qdb_securelink_enabled');
  if (settings.qdb_securelink_enabled) throw new Error('Secure link is already enabled on this org; the test expects it disabled.');
  const setupId = await ensureDemoSetup(session);
  const version = await publishedVersion(session);
  const stamp = runStamp();
  const account = (label) => session.write('POST', 'accounts', { name: `Survey E2E B6 ${label} ${stamp}`, description: 'Test customer for the Customer Survey Engine B6 end-to-end test. Safe to delete.' }).then((r) => r.entityId);
  const accountId = await account('Customer');
  const otherAccountId = await account('Other');
  const invitationId = await createInvitation(session, { accountId, setupId, version, label: 'main' });
  await scenarioListAndGet(session, { accountId, otherAccountId, invitationId });
  const unprivilegedTarget = await createInvitation(session, { accountId, setupId, version, label: 'unprivileged' });
  await scenarioSubmit(session, { accountId, invitationId });
  await scenarioRefusals(session, { accountId, setupId, version });
  await scenarioSecureLink(session, { accountId, setupId, version, settingsId: settings.qdb_survey_settingsid });
  await scenarioUnprivileged(session, { accountId, invitationId: unprivilegedTarget });
  const demoAccount = await ensureRow(session, { entitySet: 'accounts', idAttribute: 'accountid', filter: "name eq 'Survey Demo Customer'" },
    { name: 'Survey Demo Customer', description: 'Demo customer for trying the Customer Survey Engine in CRM. Safe to delete.' });
  const demoInvitation = await createInvitation(session, { accountId: demoAccount, setupId, version, label: `demo-${stamp}` });
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  console.log(`\nTry it in CRM (answer and submit, then open Survey Responses):\n${session.client.orgUrl}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${encodeURIComponent(`invitationId=${demoInvitation}&customerId=${demoAccount}`)}`);
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
