/**
 * Addendum A end-to-end test (FR-CSE-061..069, NFR-CSE-010) on a live (test) org.
 *   A  A weighted survey form (srv-weighted-demo) saved through the Form Engine tables publishes
 *      scoringMode, scoreWeight, scoreMin/Max and scorePoints into its runtime JSON.
 *   B  The addendum's worked example submitted through qdb_srv_SubmitResponse stores 27 of 40 =
 *      67.5 %, with points and weighted points per answer.
 *   C  A response that skips the "recommend" question scores 17 of 20 = 85 %.
 *   D  A response to the normal demo survey stores no score.
 * The weighted form and its setup are kept so the user can open them; test invitations,
 * responses and accounts stay as test data. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env scoring-e2e.mjs
 */
import { openSession, pollFor, runStamp, ensureRow } from './e2e-helpers.mjs';

const FORM_CODE = 'srv-weighted-demo';
const NORMAL_FORM_CODE = 'srv-customer-feedback-demo';
const SETUP_NAME = 'Demo - Weighted customer feedback';
const FIELD = { textarea: 100000002, number: 100000003, multiSelect: 100000007, radio: 100000010 };
const RATING = 100000002;
const WEIGHTED = 100000001;
const SURVEY = 100000001;
const STARS = ['Very poor', 'Poor', 'Average', 'Good', 'Excellent'];

const QUESTIONS = [
  { code: 'srv_w_overall', label: 'Overall, how satisfied are you with QDB?', type: FIELD.radio, style: RATING, weight: 3, options: STARS.map((label, i) => ({ value: String(i + 1), label })) },
  { code: 'srv_w_ease', label: 'How easy was it to complete your request?', type: FIELD.radio, style: RATING, options: STARS.map((label, i) => ({ value: String(i + 1), label })) },
  { code: 'srv_w_recommend', label: 'Would you recommend QDB to another business?', type: FIELD.radio, weight: 2,
    options: [{ value: 'y', label: 'Yes', points: 10 }, { value: 'm', label: 'Maybe', points: 5 }, { value: 'n', label: 'No', points: 0 }] },
  { code: 'srv_w_well', label: 'What did we do well?', type: FIELD.textarea },
];

async function createWeightedForm(session) {
  const form = await session.write('POST', 'qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'Customer feedback (weighted demo survey)', qdb_status: 100000001, qdb_version: 1,
    qdb_allow_save_draft: false, qdb_form_type: SURVEY, qdb_scoring_mode: WEIGHTED,
  });
  const tab = await session.write('POST', 'qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.entityId})`, qdb_label: 'Your experience', qdb_display_order: 1, qdb_is_visible: true });
  const section = await session.write('POST', 'qdb_form_sections', { 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.entityId})`, qdb_label: 'How did we do?', qdb_display_order: 1, qdb_columns: 100000001, qdb_is_visible: true });
  for (const [index, question] of QUESTIONS.entries()) {
    const field = await session.write('POST', 'qdb_form_fields', {
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.entityId})`, qdb_schema_name: question.code, qdb_label: question.label, qdb_field_type: question.type,
      qdb_column_span: 100000001, qdb_display_order: index + 1, qdb_is_required: false, qdb_is_hidden: false, qdb_is_readonly: false,
      ...(question.style ? { qdb_radio_render_style: question.style } : {}), ...(question.weight !== undefined ? { qdb_score_weight: question.weight } : {}),
    });
    for (const [order, option] of (question.options ?? []).entries()) {
      await session.write('POST', 'qdb_form_option_values', {
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${field.entityId})`, qdb_value: option.value, qdb_label: option.label, qdb_display_order: order + 1, qdb_is_active: true,
        ...(option.points !== undefined ? { qdb_score_points: option.points } : {}),
      });
    }
  }
  console.log(`  created ${FORM_CODE} (${form.entityId})`);
  return form.entityId;
}

async function publishedJson(session, formCode) {
  const { json } = await session.client.send('POST', 'qdb_GetPublishedFormJson', { FormCode: formCode, LanguageCode: 'en', Version: 0 });
  return JSON.parse(json.RuntimeJson);
}

async function ensurePublished(session) {
  const [existing] = await session.rows(`qdb_form_definitions?$select=qdb_form_definitionid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  const formId = existing?.qdb_form_definitionid ?? (await createWeightedForm(session));
  const active = () => session.rows(`qdb_form_render_caches?$select=qdb_published_version&$filter=qdb_form_code eq '${FORM_CODE}' and qdb_is_active eq true and qdb_status eq 2`);
  if ((await active()).length === 0) {
    await session.write('POST', 'qdb_PublishForm', { FormCode: FORM_CODE, TargetVersion: 1, PublishJobId: '' });
    await pollFor(`${FORM_CODE} to publish`, active);
  }
  return { formId, version: (await active())[0].qdb_published_version };
}

function scenarioPublished(session, json) {
  console.log('A — the publisher carries the scoring configuration');
  const fields = json.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  const byCode = Object.fromEntries(fields.map((f) => [f.schemaName, f]));
  session.check('form has scoringMode "weighted"', json.scoringMode === 'weighted');
  session.check('question weights are published (overall 3, recommend 2, ease unset)', byCode.srv_w_overall.scoreWeight === 3 && byCode.srv_w_recommend.scoreWeight === 2 && byCode.srv_w_ease.scoreWeight === undefined);
  session.check('option points are published (Yes 10, Maybe 5, No 0)', JSON.stringify(byCode.srv_w_recommend.options.map((o) => o.scorePoints)) === '[10,5,0]',
    JSON.stringify(byCode.srv_w_recommend.options.map((o) => o.scorePoints)));
  session.check('rating options carry no points (they score their own number)', byCode.srv_w_overall.options.every((o) => o.scorePoints === undefined));
}

async function invite(session, { setupId, accountId, formCode, version, label }) {
  return (await session.write('POST', 'qdb_survey_invitations', {
    qdb_name: `${formCode} — scoring ${label}`, 'qdb_customer_id@odata.bind': `/accounts(${accountId})`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_form_code: formCode, qdb_pinned_version: version, qdb_language_code: 'en', qdb_status: 100000000, qdb_channel: 100000000,
    qdb_generated_on: new Date().toISOString(), qdb_expires_on: new Date(Date.now() + 14 * 86400000).toISOString(), qdb_dedupe_key: `E2E-SCORE-${label}-${runStamp()}`,
  })).entityId;
}

async function submit(session, { invitationId, accountId, answers }) {
  const { json } = await session.client.send('POST', 'qdb_srv_SubmitResponse', {
    InvitationId: invitationId, CallerCustomerId: accountId, AnswersJson: JSON.stringify(answers.map(([questionCode, value]) => ({ questionCode, value }))),
  });
  const [response] = await session.rows(`qdb_survey_responses?$select=qdb_score_total,qdb_score_max,qdb_score_percent&$filter=qdb_survey_responseid eq ${json.ResponseId}`);
  const rows = await session.rows(`qdb_survey_answers?$select=qdb_question_code,qdb_points,qdb_weighted_points&$filter=_qdb_survey_response_id_value eq ${json.ResponseId}`);
  return { response, answers: Object.fromEntries(rows.map((r) => [r.qdb_question_code, r])) };
}

const scoreOf = (response) => `${Number(response.qdb_score_total)} of ${Number(response.qdb_score_max)} = ${Number(response.qdb_score_percent)}%`;

async function run() {
  const session = await openSession();
  console.log(`Scoring E2E — ${session.client.orgUrl}`);
  const { version } = await ensurePublished(session);
  scenarioPublished(session, await publishedJson(session, FORM_CODE));
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: false,
    qdb_notif_title_en: 'How did we do?', qdb_notif_title_ar: 'كيف كانت تجربتك؟',
  });
  const { entityId: accountId } = await session.write('POST', 'accounts', { name: `Survey E2E Scoring ${runStamp()}`, description: 'Weighted scoring test customer. Safe to delete.' });

  console.log('B — the worked example');
  const worked = await submit(session, { invitationId: await invite(session, { setupId, accountId, formCode: FORM_CODE, version, label: 'worked' }), accountId,
    answers: [['srv_w_overall', '4'], ['srv_w_ease', '5'], ['srv_w_recommend', 'm'], ['srv_w_well', 'Quick and clear.']] });
  session.check('response scores 27 of 40 = 67.5%', Number(worked.response.qdb_score_total) === 27 && Number(worked.response.qdb_score_max) === 40 && Number(worked.response.qdb_score_percent) === 67.5, scoreOf(worked.response));
  session.check('"recommend" answer stores 5 points, 10 weighted', Number(worked.answers.srv_w_recommend.qdb_points) === 5 && Number(worked.answers.srv_w_recommend.qdb_weighted_points) === 10);
  session.check('the text answer stores no points', worked.answers.srv_w_well.qdb_points == null);

  console.log('C — a skipped question is left out of the maximum');
  const skipped = await submit(session, { invitationId: await invite(session, { setupId, accountId, formCode: FORM_CODE, version, label: 'skipped' }), accountId,
    answers: [['srv_w_overall', '4'], ['srv_w_ease', '5']] });
  session.check('response scores 17 of 20 = 85%', Number(skipped.response.qdb_score_total) === 17 && Number(skipped.response.qdb_score_max) === 20 && Number(skipped.response.qdb_score_percent) === 85, scoreOf(skipped.response));

  console.log('D — a normal survey stores no score');
  const [normalSetup] = await session.rows("qdb_survey_setups?$select=qdb_survey_setupid&$filter=qdb_name eq 'Demo - Customer feedback'");
  const normal = await submit(session, { invitationId: await invite(session, { setupId: normalSetup.qdb_survey_setupid, accountId, formCode: NORMAL_FORM_CODE, version: 1, label: 'normal' }), accountId,
    answers: [['srv_demo_overall', '5'], ['srv_demo_recommend', '1']] });
  session.check('normal survey response has no score', normal.response.qdb_score_total == null && normal.response.qdb_score_percent == null);

  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
