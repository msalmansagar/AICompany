import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurveyChecks, HEALTH_VIEW, emptyKit, emptyConfig, notFound, rows, fakeGet, checkOf } from './support/check-fakes.mjs';

const { PASS, WARN, FAIL } = SurveyChecks;
const preflight = (answers, kit = emptyKit()) => SurveyChecks.preflight({ get: fakeGet(answers), kit, config: emptyConfig() });

test('preflight_version8_failsP1', async () => {
  assert.equal(checkOf(await preflight({ 'RetrieveVersion()': { Version: '8.2.0.1' } }), 'P1').status, FAIL);
});

test('preflight_retrieveVersionRefused_failsP1WithReason', async () => {
  const check = checkOf(await preflight({ 'RetrieveVersion()': notFound() }), 'P1');

  assert.deepEqual([check.status, check.detail], [FAIL, 'RetrieveVersion failed']);
});

test('preflight_uploadLimitFitsLargestResource_passesP2', async () => {
  assert.equal(checkOf(await preflight({ organizations: rows({ maxuploadfilesize: 100 }) }), 'P2').status, PASS);
});

test('preflight_organizationUnreadable_failsP2', async () => {
  assert.equal(checkOf(await preflight({ organizations: notFound() }), 'P2').status, FAIL);
});

test('preflight_formEngineCustomApiPresent_passesP4', async () => {
  assert.equal(checkOf(await preflight({ customapis: rows({ uniquename: 'qdb_GetPublishedFormJson' }) }), 'P4').status, PASS);
});

test('preflight_formEngineCustomApiAbsent_warnsP4', async () => {
  assert.equal(checkOf(await preflight(), 'P4').status, WARN);
});

test('preflight_formEngineTableMissing_failsP5NamingIt', async () => {
  const check = checkOf(await preflight({ "EntityDefinitions(LogicalName='qdb_form')": notFound() }, emptyKit({ formEngineTables: ['qdb_form'] })), 'P5');

  assert.deepEqual([check.status, check.detail], [FAIL, 'missing: qdb_form']);
});

test('preflight_formEngineIconMissing_failsP6', async () => {
  assert.equal(checkOf(await preflight({}, emptyKit({ formEngineIcons: ['qdb_icon.svg'] })), 'P6').status, FAIL);
});

test('preflight_formEngineIconPresent_passesP6', async () => {
  const kit = emptyKit({ formEngineIcons: ['qdb_icon.svg'] });

  assert.equal(checkOf(await preflight({ webresourceset: rows({ name: 'qdb_icon.svg' }) }, kit), 'P6').status, PASS);
});

test('preflight_formEnginePluginSandboxed_passesP7NamingSandbox', async () => {
  const plugin = { name: 'Qdb.FormEngine.Plugins', version: '1.0', modifiedon: 't', isolationmode: 2 };
  const check = checkOf(await preflight({ 'pluginassemblies?$select=name,version': rows(plugin) }), 'P7');

  assert.equal(check.status, PASS);
  assert.match(check.detail, /isolation Sandbox/);
});

test('preflight_formEnginePluginNotSandboxed_reportsItsIsolationMode', async () => {
  const plugin = { name: 'Qdb.FormEngine.Plugins', version: '1.0', modifiedon: 't', isolationmode: 1 };

  assert.match(checkOf(await preflight({ 'pluginassemblies?$select=name,version': rows(plugin) }), 'P7').detail, /isolation 1\./);
});

test('preflight_formEnginePluginAbsent_failsP7', async () => {
  assert.equal(checkOf(await preflight(), 'P7').status, FAIL);
});

test('preflight_publisherAbsent_warnsP8', async () => {
  assert.equal(checkOf(await preflight(), 'P8').status, WARN);
});

test('preflight_publisherWithKitPrefixes_passesP8', async () => {
  const publisher = { customizationprefix: 'qdb', customizationoptionvalueprefix: 10000 };

  assert.equal(checkOf(await preflight({ publishers: rows(publisher) }), 'P8').status, PASS);
});

test('preflight_publisherWithOtherOptionPrefix_failsP8', async () => {
  const publisher = { customizationprefix: 'qdb', customizationoptionvalueprefix: 20000 };

  assert.equal(checkOf(await preflight({ publishers: rows(publisher) }), 'P8').status, FAIL);
});

test('preflight_nothingOfTheKitExists_passesP9', async () => {
  const kit = emptyKit({ surveyTables: ['qdb_survey_setup'] });

  assert.equal(checkOf(await preflight({ "EntityDefinitions(LogicalName='qdb_survey_setup')": notFound() }, kit), 'P9').status, PASS);
});

test('preflight_kitComponentsAlreadyPresent_warnsP9ListingEach', async () => {
  const kit = emptyKit({
    surveyTables: ['qdb_survey_setup'], roleNames: ['Survey Admin'], customApis: ['qdb_srv_GetSurvey'], surveyIcons: ['qdb_srv.svg'],
    surveyViews: [HEALTH_VIEW], formEngineColumns: ['qdb_form.qdb_form_type'],
  });
  const present = rows({ name: 'any' });
  const answers = { roles: present, customapis: present, webresourceset: present, savedqueries: present, appmodules: present, pluginassemblies: present, solutions: present };
  const detail = checkOf(await preflight(answers, kit), 'P9').detail;

  const labels = ['table qdb_survey_setup', 'role Survey Admin', 'Custom API qdb_srv_GetSurvey', 'web resource qdb_srv.svg', `view "${HEALTH_VIEW.name}"`,
    'app qdb_survey_engine', 'plugin assembly Qdb.SurveyEngine', 'solution SurveyEngine', 'column qdb_form.qdb_form_type'];
  assert.deepEqual(labels.filter((label) => !detail.includes(label)), []);
});

test('preflight_recentJobAndSandboxedAssembly_passesP10AndP11', async () => {
  const report = await preflight({ asyncoperations: rows({ asyncoperationid: 'j1' }), pluginassemblies: rows({ name: 'Any' }) });

  assert.deepEqual([checkOf(report, 'P10').status, checkOf(report, 'P11').status], [PASS, PASS]);
});

test('preflight_noRecentJobOrSandboxedAssembly_warnsP10AndP11', async () => {
  const report = await preflight();

  assert.deepEqual([checkOf(report, 'P10').status, checkOf(report, 'P11').status], [WARN, WARN]);
});

test('preflight_systemJobMetadataUnreadable_failsP13', async () => {
  const kit = emptyKit({ surveyViews: [HEALTH_VIEW] });

  assert.equal(checkOf(await preflight({ "EntityDefinitions(LogicalName='asyncoperation')": notFound() }, kit), 'P13').status, FAIL);
});

// ── P14 org auditing (audit AUD-01): table history records nothing while the org switch is off ──

test('preflight_orgAuditingOn_passesP14', async () => {
  assert.equal(checkOf(await preflight({ organizations: rows({ isauditenabled: true }) }), 'P14').status, PASS);
});

test('preflight_orgAuditingOff_warnsP14', async () => {
  assert.equal(checkOf(await preflight({ organizations: rows({ isauditenabled: false }) }), 'P14').status, WARN);
});

test('preflight_orgSettingsUnreadable_warnsP14', async () => {
  assert.equal(checkOf(await preflight({ organizations: notFound() }), 'P14').status, WARN);
});
