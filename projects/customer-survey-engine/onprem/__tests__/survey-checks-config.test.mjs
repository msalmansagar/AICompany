import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurveyChecks, emptyKit, emptyConfig, notFound, rows, fakeGet, checkOf, checksOf } from './support/check-fakes.mjs';

const { PASS, WARN, FAIL, INFO } = SurveyChecks;
const CONTACT_TABLE = 100000001;
const preflight = (answers, config = emptyConfig()) => SurveyChecks.preflight({ get: fakeGet(answers), kit: emptyKit(), config });

const LOAN_SOURCE = {
  qdb_name: 'Loans', qdb_table_logical_name: 'qdb_loan', qdb_customer_lookup_field: 'qdb_customer',
  qdb_type_field: 'qdb_type', qdb_status_field: 'statuscode', qdb_origin_field: 'TO_CONFIRM',
};
const LOAN_TABLE = "EntityDefinitions(LogicalName='qdb_loan')";
const CUSTOMER_TARGETS = `${LOAN_TABLE}/Attributes(LogicalName='qdb_customer')/Microsoft.Dynamics.CRM.LookupAttributeMetadata`;
const sourceCheck = async (answers, settings = {}) => checkOf(await preflight(answers, emptyConfig({ settings, sources: [LOAN_SOURCE] })), 'C-src');

// ── P12 grid-column census ──

test('preflight_gridColumnsUnreadable_warnsP12', async () => {
  const check = checkOf(await preflight({ qdb_grid_column_configs: notFound() }), 'P12');

  assert.deepEqual([check.status, check.detail.startsWith('could not read')], [WARN, true]);
});

test('preflight_noReadOnlyGridColumns_passesP12', async () => {
  assert.equal(checkOf(await preflight(), 'P12').status, PASS);
});

test('preflight_readOnlyGridColumns_warnsP12NamingGridAndColumn', async () => {
  const columns = rows(
    { qdb_column_label: 'Amount', _qdb_form_field_id_value: 'f1' },
    { qdb_column_attribute: 'qdb_due', _qdb_form_field_id_value: null },
  );
  const answers = {
    qdb_grid_column_configs: columns,
    "EntityDefinitions(LogicalName='qdb_form_field')": { PrimaryNameAttribute: 'qdb_name', EntitySetName: 'qdb_form_fields' },
    'qdb_form_fields(f1)': { qdb_name: 'Repayments grid' },
  };

  assert.equal(checkOf(await preflight(answers), 'P12').detail.split(': ').pop(), 'Repayments grid / Amount; no grid / qdb_due');
});

test('preflight_gridFieldTableUnreadable_namesTheGridByItsId', async () => {
  const answers = { qdb_grid_column_configs: rows({ qdb_column_label: 'Amount', _qdb_form_field_id_value: 'f1' }), "EntityDefinitions(LogicalName='qdb_form_field')": notFound() };

  assert.match(checkOf(await preflight(answers), 'P12').detail, /f1 \/ Amount$/);
});

// ── C-src: request-table sources ──

test('preflight_sourceTableToConfirm_reportsInfo', async () => {
  const config = emptyConfig({ sources: [{ qdb_name: 'Loans', qdb_table_logical_name: 'TO_CONFIRM' }] });

  assert.equal(checkOf(await preflight({}, config), 'C-src').status, INFO);
});

test('preflight_sourceTableMissing_failsCsrc', async () => {
  assert.equal((await sourceCheck({ [`${LOAN_TABLE}?$select=LogicalName`]: notFound() })).status, FAIL);
});

test('preflight_sourceFieldMissing_failsCsrcNamingIt', async () => {
  const check = await sourceCheck({ [`${LOAN_TABLE}/Attributes(LogicalName='qdb_type')`]: notFound(), [CUSTOMER_TARGETS]: { Targets: ['account'] } });

  assert.equal(check.detail, 'qdb_type_field qdb_type missing');
});

test('preflight_customerLookupTargetsAnotherTable_failsCsrc', async () => {
  const check = await sourceCheck({ [CUSTOMER_TARGETS]: { Targets: ['account'] } }, { qdb_customer_table: CONTACT_TABLE });

  assert.equal(check.detail, 'qdb_customer does not look up contact');
});

test('preflight_customerLookupUnreadable_failsCsrc', async () => {
  assert.equal((await sourceCheck({ [CUSTOMER_TARGETS]: notFound() })).status, FAIL);
});

test('preflight_sourceTableAndFieldsExist_passesCsrc', async () => {
  assert.equal((await sourceCheck({ [CUSTOMER_TARGETS]: { Targets: ['account'] } })).status, PASS);
});

// ── C-sms and C-lang ──

const SMS_CONFIG = { qdb_name: 'HL SMS', qdb_sms_table_logical_name: 'letter', qdb_recipient_field: 'qdb_to', qdb_message_field: 'description', qdb_customer_link_field: 'TO_CONFIRM', qdb_customer_phone_field: 'mobilephone' };
const smsCheck = async (answers) => checkOf(await preflight(answers, emptyConfig({ smsConfigs: [SMS_CONFIG] })), 'C-sms');

test('preflight_smsColumnsExist_passesCsms', async () => {
  assert.equal((await smsCheck()).status, PASS);
});

test('preflight_smsColumnsMissing_failsCsmsNamingEach', async () => {
  const answers = { "EntityDefinitions(LogicalName='letter')/Attributes(LogicalName='qdb_to')": notFound(), "EntityDefinitions(LogicalName='account')/Attributes": notFound() };

  assert.equal((await smsCheck(answers)).detail, 'letter.qdb_to missing; account.mobilephone missing');
});

test('preflight_configWithoutSmsList_checksNoSms', async () => {
  const config = emptyConfig({ smsConfigs: undefined });

  assert.deepEqual(checksOf(await preflight({}, config), 'C-sms'), []);
});

test('preflight_languageFieldMissing_failsClang', async () => {
  const config = emptyConfig({ settings: { qdb_language_field: 'qdb_language' } });

  assert.equal(checkOf(await preflight({ "EntityDefinitions(LogicalName='account')/Attributes": notFound() }, config), 'C-lang').status, FAIL);
});

test('preflight_languageFieldExists_passesClang', async () => {
  const config = emptyConfig({ settings: { qdb_language_field: 'qdb_language' } });

  assert.equal(checkOf(await preflight({}, config), 'C-lang').status, PASS);
});

// ── Render-cache snapshot ──

test('preflight_renderCacheUnreadable_recordsTheError', async () => {
  assert.equal((await preflight({ qdb_form_render_caches: notFound() })).renderCache.error, '404 Resource not found');
});

test('preflight_renderCacheRows_areMappedAndSortedByFormAndLanguage', async () => {
  const cache = rows(
    { qdb_form_code: 'b', qdb_language_code: 'en', qdb_published_version: 1, modifiedon: 't1', statecode: 0 },
    { qdb_form_code: 'a', qdb_language_code: 'en', qdb_published_version: 2, modifiedon: 't2', statecode: 0 },
  );

  assert.deepEqual((await preflight({ qdb_form_render_caches: cache })).renderCache.map((row) => `${row.formCode}|${row.version}`), ['a|2', 'b|1']);
});
