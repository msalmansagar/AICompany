/**
 * B2 end-to-end test on a live (test) org: a disbursement entering "Payment Processed" must
 * produce exactly one invitation, and re-entering must log a Duplicate instead of a second one.
 *
 * Creates (once, reused on re-runs): survey form srv-test-disbursement, account "Survey E2E Test
 * Customer", setup + Event trigger "E2E - Disbursement payment processed". Creates a new test
 * disbursement every run. Temporarily activates the Disbursements source and enables its
 * Update step; both are ALWAYS restored in `finally`. Live writes: run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b2-trigger-e2e.mjs
 */
import { createDataverseClient } from '../provisioning/lib/dataverse-client.mjs';
import { stepName } from '../provisioning/lib/plugin-payloads.mjs';

const TABLE = 'qdb_payment_authorization_ticket';
const FORM_CODE = 'srv-test-disbursement';
const ACCOUNT_NAME = 'Survey E2E Test Customer';
const SETUP_NAME = 'E2E - Disbursement payment processed';
const PAYMENT_PROCESSED = { statecode: 1, statuscode: 751090050 };
const SAVED = { statecode: 0, statuscode: 1 };
const LETTER_OF_CREDIT = 751090000;
const QDB_DIGITAL = 751090002;
const FORM = { typeSurvey: 100000001, statusActive: 100000001, fieldText: 100000001, oneColumn: 100000001, spanOne: 100000001 };
const POLL_MS = 10000;
const POLL_ATTEMPTS = 30;

const client = await createDataverseClient({ solutionUniqueName: 'SurveyEngine' });
const write = (method, path, body) => client.sendOutsideSolution(method, path, body);
const rows = async (path) => (await client.send('GET', path)).json.value;
const results = [];
const check = (label, passed, detail = '') => { results.push(passed); console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollFor(describe, query) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const found = await query();
    if (found.length > 0) return found;
    process.stdout.write(attempt === 1 ? `  waiting for ${describe}` : '.');
    await sleep(POLL_MS);
  }
  console.log('');
  return [];
}

async function ensureSurveyForm() {
  const existing = await rows(`qdb_form_definitions?$select=qdb_form_definitionid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  if (existing.length === 0) {
    const form = await write('POST', 'qdb_form_definitions', {
      qdb_form_code: FORM_CODE, qdb_title: 'E2E test survey (disbursement)', qdb_status: FORM.statusActive, qdb_version: 1,
      qdb_allow_save_draft: false, qdb_form_type: FORM.typeSurvey,
    });
    const tab = await write('POST', 'qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${form.entityId})`, qdb_label: 'Feedback', qdb_display_order: 1, qdb_is_visible: true });
    const section = await write('POST', 'qdb_form_sections', { 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.entityId})`, qdb_label: 'Your experience', qdb_display_order: 1, qdb_columns: FORM.oneColumn, qdb_is_visible: true });
    await write('POST', 'qdb_form_fields', {
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.entityId})`, qdb_schema_name: 'qdb_e2e_comment', qdb_label: 'How was the disbursement process?',
      qdb_field_type: FORM.fieldText, qdb_column_span: FORM.spanOne, qdb_display_order: 1, qdb_is_required: false, qdb_is_hidden: false, qdb_is_readonly: false,
    });
    console.log(`  created form ${FORM_CODE}`);
  }
  const published = await rows(`qdb_form_render_caches?$select=qdb_language_code,qdb_published_version&$filter=qdb_form_code eq '${FORM_CODE}' and qdb_is_active eq true and qdb_status eq 2`);
  if (published.length > 0) return published;
  await write('POST', 'qdb_PublishForm', { FormCode: FORM_CODE, TargetVersion: 1, PublishJobId: '' });
  return pollFor('the published form', () => rows(`qdb_form_render_caches?$select=qdb_language_code,qdb_published_version&$filter=qdb_form_code eq '${FORM_CODE}' and qdb_is_active eq true and qdb_status eq 2`));
}

async function ensureRow({ entitySet, idAttribute, filter }, body) {
  const found = await rows(`${entitySet}?$select=${idAttribute}&$filter=${encodeURIComponent(filter)}&$top=1`);
  if (found.length > 0) return found[0][idAttribute];
  return (await write('POST', entitySet, body)).entityId;
}

async function ensureSetupAndTrigger(sourceId) {
  const setupId = await ensureRow({ entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: true,
  });
  await write('PATCH', `qdb_survey_setups(${setupId})`, { qdb_is_active: true });
  const triggerId = await ensureRow({ entitySet: 'qdb_survey_triggers', idAttribute: 'qdb_survey_triggerid', filter: `_qdb_survey_setup_id_value eq ${setupId}` }, {
    qdb_name: `${SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`, 'qdb_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: 100000000, qdb_status_values: String(PAYMENT_PROCESSED.statuscode), qdb_type_values: String(LETTER_OF_CREDIT), qdb_is_active: true,
  });
  return { setupId, triggerId };
}

async function setStep(isEnabled) {
  const [step] = await rows(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${stepName('Update', TABLE)}'`);
  await write('PATCH', `sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, isEnabled ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 });
}

async function failedJobsSince(startedOn) {
  return rows(`asyncoperations?$select=name,message,friendlymessage,statuscode&$filter=createdon ge ${startedOn} and statuscode eq 31 and contains(name,'SurveyTriggerPlugin')`);
}

async function runScenario({ accountId, setupId, triggerId }) {
  const name = `SURVEY-E2E-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
  const { entityId: recordId } = await write('POST', 'qdb_payment_authorization_tickets', {
    // The Web API binds by navigation property, which keeps this lookup's schema-name casing.
    qdb_name: name, 'qdb_Customer_Name@odata.bind': `/accounts(${accountId})`, qdb_disbursement_type_1: LETTER_OF_CREDIT, qdb_source_location: QDB_DIGITAL,
  });
  console.log(`  test disbursement ${name} (${recordId})`);
  await write('PATCH', `qdb_payment_authorization_tickets(${recordId})`, PAYMENT_PROCESSED);
  const invitations = await pollFor('the invitation', () => rows(`qdb_survey_invitations?$select=qdb_status,qdb_channel,qdb_pinned_version,qdb_language_code,qdb_form_code,qdb_dedupe_key,qdb_expires_on,qdb_generated_on,_qdb_customer_id_value,_qdb_survey_setup_id_value,_qdb_survey_trigger_id_value&$filter=qdb_source_record_id eq '${recordId}'`));
  checkInvitation(invitations, { accountId, setupId, triggerId, recordId });
  await write('PATCH', `qdb_payment_authorization_tickets(${recordId})`, SAVED);
  await write('PATCH', `qdb_payment_authorization_tickets(${recordId})`, PAYMENT_PROCESSED);
  const duplicates = await pollFor('the Duplicate suppression row', () => rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail&$filter=qdb_source_record_id eq '${recordId}'`));
  check('re-entering Payment Processed logs Duplicate', duplicates.length === 1 && duplicates[0].qdb_reason === 100000002, duplicates.map((d) => `${d.qdb_reason}: ${d.qdb_detail}`).join('; '));
  const after = await rows(`qdb_survey_invitations?$select=qdb_survey_invitationid&$filter=qdb_source_record_id eq '${recordId}'`);
  check('still exactly one invitation', after.length === 1, `${after.length}`);
  return recordId;
}

function checkInvitation(invitations, expected) {
  check('exactly one invitation created', invitations.length === 1, `${invitations.length}`);
  const inv = invitations[0];
  if (!inv) return;
  const expectedKey = `${expected.setupId}|${expected.accountId}|${TABLE}:${expected.recordId}`;
  check('customer, setup and trigger linked', inv._qdb_customer_id_value === expected.accountId && inv._qdb_survey_setup_id_value === expected.setupId && inv._qdb_survey_trigger_id_value === expected.triggerId);
  check('status Pending, channel Portal (Digital origin)', inv.qdb_status === 100000000 && inv.qdb_channel === 100000000, `status ${inv.qdb_status}, channel ${inv.qdb_channel}`);
  check('form, language and pinned version', inv.qdb_form_code === FORM_CODE && inv.qdb_language_code === 'en' && inv.qdb_pinned_version >= 1, `${inv.qdb_form_code} ${inv.qdb_language_code} v${inv.qdb_pinned_version}`);
  check('dedupe key', inv.qdb_dedupe_key === expectedKey, inv.qdb_dedupe_key);
  const expiryDays = (new Date(inv.qdb_expires_on) - new Date(inv.qdb_generated_on)) / 86400000;
  check('expires 14 days after generation', Math.round(expiryDays) === 14, `${expiryDays.toFixed(2)} days`);
}

async function run() {
  const startedOn = new Date().toISOString();
  console.log(`B2 E2E — ${client.orgUrl}`);
  const published = await ensureSurveyForm();
  check('survey form published', published.length > 0, published.map((p) => `${p.qdb_language_code} v${p.qdb_published_version}`).join(', '));
  const accountId = await ensureRow({ entitySet: 'accounts', idAttribute: 'accountid', filter: `name eq '${ACCOUNT_NAME}'` }, { name: ACCOUNT_NAME, description: 'Test customer for the Customer Survey Engine end-to-end test. Safe to delete.' });
  const [source] = await rows(`qdb_survey_sources?$select=qdb_survey_sourceid,qdb_is_active&$filter=qdb_table_logical_name eq '${TABLE}'`);
  const ids = { accountId, ...(await ensureSetupAndTrigger(source.qdb_survey_sourceid)) };
  try {
    await write('PATCH', `qdb_survey_sources(${source.qdb_survey_sourceid})`, { qdb_is_active: true });
    await setStep(true);
    console.log('  source activated, Update step enabled');
    await runScenario(ids);
  } finally {
    await setStep(false);
    await write('PATCH', `qdb_survey_sources(${source.qdb_survey_sourceid})`, { qdb_is_active: source.qdb_is_active });
    await write('PATCH', `qdb_survey_setups(${ids.setupId})`, { qdb_is_active: false });
    console.log(`  restored: Update step disabled, source active=${source.qdb_is_active}, test setup deactivated`);
  }
  const failures = await failedJobsSince(startedOn);
  check('no failed SurveyTriggerPlugin system jobs', failures.length === 0, failures.map((f) => f.friendlymessage ?? f.message).join(' | ').slice(0, 300));
  console.log(results.every(Boolean) ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(results.every(Boolean) ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
