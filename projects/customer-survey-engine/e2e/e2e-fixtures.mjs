/**
 * Reusable test configuration for the survey end-to-end tests: survey forms and setups.
 * Each is created once and reused on later runs.
 *
 * @module survey-e2e/fixtures
 */
import { pollFor, ensureRow, PAYMENT_PROCESSED, LETTER_OF_CREDIT, REMITTANCE } from './e2e-helpers.mjs';

export const COMPLETION_FORM_CODE = 'srv-test-disbursement';
export const MILESTONE_FORM_CODE = 'srv-test-milestone';
export const COMPLETION_SETUP_NAME = 'E2E - Disbursement payment processed';
const MILESTONE_SETUP_NAME = 'E2E - Every 2nd disbursement';
const FORM = { typeSurvey: 100000001, statusActive: 100000001, fieldText: 100000001, oneColumn: 100000001, spanOne: 100000001 };
const DELIVERY = { portal: 100000000, none: 100000002 };
const KIND = { event: 100000000, milestone: 100000003 };

const activeCacheRows = (session, formCode) =>
  session.rows(`qdb_form_render_caches?$select=qdb_language_code,qdb_published_version&$filter=qdb_form_code eq '${formCode}' and qdb_is_active eq true and qdb_status eq 2`);

/** Ensures a one-question survey form exists and is published; answers its active cache rows. */
export async function ensureSurveyForm(session, formCode) {
  const existing = await session.rows(`qdb_form_definitions?$select=qdb_form_definitionid&$filter=qdb_form_code eq '${formCode}'`);
  if (existing.length === 0) await createSurveyForm(session, formCode);
  const published = await activeCacheRows(session, formCode);
  if (published.length > 0) return published;
  await session.write('POST', 'qdb_PublishForm', { FormCode: formCode, TargetVersion: 1, PublishJobId: '' });
  return pollFor(`form ${formCode} to publish`, () => activeCacheRows(session, formCode));
}

async function createSurveyForm(session, formCode) {
  const form = await session.write('POST', 'qdb_form_definitions', {
    qdb_form_code: formCode, qdb_title: `E2E test survey (${formCode})`, qdb_status: FORM.statusActive, qdb_version: 1, qdb_allow_save_draft: false, qdb_form_type: FORM.typeSurvey,
  });
  const tab = await session.write('POST', 'qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.entityId})`, qdb_label: 'Feedback', qdb_display_order: 1, qdb_is_visible: true });
  const section = await session.write('POST', 'qdb_form_sections', { 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.entityId})`, qdb_label: 'Your experience', qdb_display_order: 1, qdb_columns: FORM.oneColumn, qdb_is_visible: true });
  await session.write('POST', 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.entityId})`, qdb_schema_name: 'qdb_e2e_comment', qdb_label: 'How was the disbursement process?',
    qdb_field_type: FORM.fieldText, qdb_column_span: FORM.spanOne, qdb_display_order: 1, qdb_is_required: false, qdb_is_hidden: false, qdb_is_readonly: false,
  });
  console.log(`  created form ${formCode}`);
}

async function ensureActiveSetup(session, name, formCode) {
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${name}'` }, {
    qdb_name: name, qdb_form_code: formCode, qdb_delivery_digital: DELIVERY.portal, qdb_delivery_legacy: DELIVERY.none, qdb_expiry_days: 14, qdb_is_active: true,
  });
  await session.write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: true });
  return setupId;
}

/** The B2 setup: an Event trigger on a Letter of Credit entering Payment Processed. */
export async function ensureCompletionSetup(session, sourceId) {
  const setupId = await ensureActiveSetup(session, COMPLETION_SETUP_NAME, COMPLETION_FORM_CODE);
  const triggerId = await ensureRow(session, { entitySet: 'qdb_survey_triggers', idAttribute: 'qdb_survey_triggerid', filter: `_qdb_survey_setup_id_value eq ${setupId}` }, {
    qdb_name: `${COMPLETION_SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, 'qdb_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: KIND.event, qdb_status_values: String(PAYMENT_PROCESSED.statuscode), qdb_type_values: String(LETTER_OF_CREDIT), qdb_is_active: true,
  });
  return { setupId, triggerId };
}

/** The B3 setup: a milestone every 2nd Letter of Credit or Remittance in Payment Processed (N = 2 keeps test data small). */
export async function ensureMilestoneSetup(session, sourceId) {
  const setupId = await ensureActiveSetup(session, MILESTONE_SETUP_NAME, MILESTONE_FORM_CODE);
  const triggerId = await ensureRow(session, { entitySet: 'qdb_survey_triggers', idAttribute: 'qdb_survey_triggerid', filter: `_qdb_survey_setup_id_value eq ${setupId}` }, {
    qdb_name: `${MILESTONE_SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, 'qdb_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: KIND.milestone, qdb_milestone_every_n: 2, qdb_milestone_status_values: String(PAYMENT_PROCESSED.statuscode),
    qdb_milestone_type_values: `${LETTER_OF_CREDIT},${REMITTANCE}`, qdb_milestone_skip_reached: true, qdb_is_active: true,
  });
  return { setupId, triggerId };
}
