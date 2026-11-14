/**
 * Creates and publishes a demo customer-feedback survey form (Form Type = Survey) so the survey
 * experience can be seen in CRM. It writes the same rows the Form Designer writes: one tab per
 * page, sections, fields as questions, option rows, and the Rating display style. Re-running it
 * with the form already present only re-reads and prints the link.
 *
 *   node --env-file=<dfe>/scripts/.env seed-demo-survey.mjs
 */
import { openSession, pollFor } from '../e2e/e2e-helpers.mjs';

const FORM_CODE = 'srv-customer-feedback-demo';
const FORM = { typeSurvey: 100000001, statusActive: 100000001, oneColumn: 100000001, spanOne: 100000001 };
const FIELD_TYPE = { textarea: 100000002, radio: 100000010 };
const STYLE = { list: 100000000, cards: 100000001, rating: 100000002 };
const RATING_LABELS = ['Very poor', 'Poor', 'Average', 'Good', 'Excellent'];

const PAGES = [
  {
    label: 'Your experience',
    sections: [{
      label: 'How did we do?',
      questions: [
        { schemaName: 'srv_demo_overall', label: 'Overall, how satisfied are you with QDB?', type: FIELD_TYPE.radio, style: STYLE.rating, options: RATING_LABELS, isRequired: true },
        { schemaName: 'srv_demo_ease', label: 'How easy was it to complete your request?', type: FIELD_TYPE.radio, style: STYLE.rating, options: RATING_LABELS, isRequired: true },
        { schemaName: 'srv_demo_channel', label: 'Which channel did you use?', type: FIELD_TYPE.radio, style: STYLE.cards, options: ['QDB Digital portal', 'Branch visit', 'Phone'] },
      ],
    }],
  },
  {
    label: 'Tell us more',
    sections: [{
      label: 'Your comments',
      questions: [
        { schemaName: 'srv_demo_recommend', label: 'Would you recommend QDB to another business?', type: FIELD_TYPE.radio, style: STYLE.list, options: ['Yes', 'Maybe', 'No'] },
        { schemaName: 'srv_demo_well', label: 'What did we do well?', type: FIELD_TYPE.textarea },
        { schemaName: 'srv_demo_improve', label: 'What could we improve?', type: FIELD_TYPE.textarea },
      ],
    }],
  },
];

async function createForm(session) {
  const form = await session.write('POST', 'qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'Customer feedback (demo survey)', qdb_status: FORM.statusActive, qdb_version: 1,
    qdb_allow_save_draft: false, qdb_form_type: FORM.typeSurvey,
  });
  for (const [pageIndex, page] of PAGES.entries()) await createPage(session, form.entityId, { page, order: pageIndex + 1 });
  console.log(`created form ${FORM_CODE} (${form.entityId})`);
  return form.entityId;
}

async function createPage(session, formId, { page, order }) {
  const tab = await session.write('POST', 'qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`, qdb_label: page.label, qdb_display_order: order, qdb_is_visible: true });
  for (const [sectionIndex, section] of page.sections.entries()) {
    const created = await session.write('POST', 'qdb_form_sections', {
      'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.entityId})`, qdb_label: section.label, qdb_display_order: sectionIndex + 1, qdb_columns: FORM.oneColumn, qdb_is_visible: true,
    });
    for (const [questionIndex, question] of section.questions.entries()) await createQuestion(session, created.entityId, { question, order: questionIndex + 1 });
  }
}

async function createQuestion(session, sectionId, { question, order }) {
  const field = await session.write('POST', 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`, qdb_schema_name: question.schemaName, qdb_label: question.label,
    qdb_field_type: question.type, qdb_column_span: FORM.spanOne, qdb_display_order: order, qdb_is_required: question.isRequired === true,
    qdb_is_hidden: false, qdb_is_readonly: false, ...(question.style ? { qdb_radio_render_style: question.style } : {}),
  });
  for (const [optionIndex, label] of (question.options ?? []).entries()) {
    await session.write('POST', 'qdb_form_option_values', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${field.entityId})`, qdb_value: String(optionIndex + 1), qdb_label: label, qdb_display_order: optionIndex + 1, qdb_is_active: true,
    });
  }
}

async function publish(session) {
  const activeCaches = () => session.rows(`qdb_form_render_caches?$select=qdb_language_code&$filter=qdb_form_code eq '${FORM_CODE}' and qdb_is_active eq true and qdb_status eq 2`);
  if ((await activeCaches()).length > 0) return;
  await session.write('POST', 'qdb_PublishForm', { FormCode: FORM_CODE, TargetVersion: 1, PublishJobId: '' });
  await pollFor(`form ${FORM_CODE} to publish`, activeCaches);
}

async function readPublished(session) {
  const { json } = await session.client.send('POST', 'qdb_GetPublishedFormJson', { FormCode: FORM_CODE, LanguageCode: 'en', Version: 0 });
  if (json.errorCode) throw new Error(`qdb_GetPublishedFormJson refused: ${json.errorCode} ${json.errorMessage ?? ''}`);
  return JSON.parse(json.RuntimeJson);
}

async function run() {
  const session = await openSession();
  const [existing] = await session.rows(`qdb_form_definitions?$select=qdb_form_definitionid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  const formId = existing ? existing.qdb_form_definitionid : await createForm(session);
  await publish(session);
  const published = await readPublished(session);
  const fields = published.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.fields));
  session.check('published with 2 pages', published.tabs.length === 2);
  session.check('6 questions published', fields.length === 6);
  session.check('the two rating questions draw as stars', fields.filter((field) => field.radioRenderStyle === 'rating').length === 2);
  console.log(`\nOpen: ${session.client.orgUrl}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
