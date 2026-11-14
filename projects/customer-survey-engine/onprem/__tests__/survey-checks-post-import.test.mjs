import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurveyChecks, emptyKit, notFound, rows, fakeGet, checkOf, base64Of, sha256Of } from './support/check-fakes.mjs';

const { PASS, WARN, FAIL } = SurveyChecks;
const postImport = (answers, kit = emptyKit()) => SurveyChecks.postImport({ get: fakeGet(answers), kit });
const statusesOf = (report, ids) => ids.map((id) => checkOf(report, id).status);

// ── Q1–Q4 components ──

test('postImport_allComponentsPresent_passesQ1ToQ4', async () => {
  const kit = emptyKit({ surveyTables: ['qdb_survey_setup'], roleNames: ['Survey Admin'] });
  const answers = { solutions: rows({ version: '1.0.0.0' }), roles: rows({ name: 'Survey Admin' }), appmodules: rows({ uniquename: 'qdb_survey_engine' }) };

  assert.deepEqual(statusesOf(await postImport(answers, kit), ['Q1', 'Q2', 'Q3', 'Q4']), [PASS, PASS, PASS, PASS]);
});

test('postImport_nothingImported_failsQ1ToQ4', async () => {
  const kit = emptyKit({ surveyTables: ['qdb_survey_setup'], roleNames: ['Survey Admin'] });
  const answers = { "EntityDefinitions(LogicalName='qdb_survey_setup')": notFound() };

  assert.deepEqual(statusesOf(await postImport(answers, kit), ['Q1', 'Q2', 'Q3', 'Q4']), [FAIL, FAIL, FAIL, FAIL]);
});

// ── Q5 Custom API bindings ──

const API_KIT = emptyKit({ customApis: ['qdb_srv_GetSurvey'] });
const boundTo = (assemblyname) => rows({ uniquename: 'qdb_srv_GetSurvey', PluginTypeId: { typename: 'GetSurveyPlugin', assemblyname } });

test('postImport_customApiBoundToSurveyPlugin_passesQ5', async () => {
  assert.equal(checkOf(await postImport({ customapis: boundTo('Qdb.SurveyEngine') }, API_KIT), 'Q5').status, PASS);
});

test('postImport_customApiBoundElsewhere_failsQ5', async () => {
  assert.equal(checkOf(await postImport({ customapis: boundTo('Other') }, API_KIT), 'Q5').detail, 'qdb_srv_GetSurvey not bound to Qdb.SurveyEngine');
});

test('postImport_customApiWithoutPluginType_failsQ5', async () => {
  assert.equal(checkOf(await postImport({ customapis: rows({ uniquename: 'qdb_srv_GetSurvey' }) }, API_KIT), 'Q5').status, FAIL);
});

test('postImport_customApiMissing_failsQ5', async () => {
  assert.equal(checkOf(await postImport({}, API_KIT), 'Q5').detail, 'qdb_srv_GetSurvey missing');
});

// ── Q6 plugin steps ──

const step = (typename, statecode) => ({ name: typename, statecode, plugintypeid: { typename } });

test('postImport_stepsUnreadable_warnsQ6', async () => {
  assert.equal(checkOf(await postImport({ sdkmessageprocessingsteps: notFound() }), 'Q6').status, WARN);
});

test('postImport_twoEnabledDispatchStepsAndNoTrigger_passesQ6', async () => {
  const steps = rows(step('Dispatch', 0), step('Dispatch', 0));

  assert.equal(checkOf(await postImport({ sdkmessageprocessingsteps: steps }), 'Q6').status, PASS);
});

test('postImport_triggerStepAlreadyRegistered_warnsQ6', async () => {
  const steps = rows(step('Dispatch', 0), step('Dispatch', 0), step('Trigger', 0), { name: 'orphan', statecode: 0 });

  assert.equal(checkOf(await postImport({ sdkmessageprocessingsteps: steps }), 'Q6').status, WARN);
});

test('postImport_dispatchStepDisabled_warnsQ6', async () => {
  const steps = rows(step('Dispatch', 0), step('Dispatch', 1));

  assert.equal(checkOf(await postImport({ sdkmessageprocessingsteps: steps }), 'Q6').status, WARN);
});

// ── Q12 one Survey Scheduler role (security review SEC-NEW-001) ──
// The daily run admits holders of a role with this name, so a second role created under the same name by
// someone who can create roles would also be admitted. Business-unit copies share one root role.

const SCHEDULER_KIT = emptyKit({ schedulerRoleName: 'Survey Scheduler' });
const schedulerRole = (roleid, root) => ({ roleid, _parentrootroleid_value: root });

test('postImport_schedulerRoleAndItsBusinessUnitCopies_passesQ12', async () => {
  const answers = { roles: rows(schedulerRole('r1', 'r1'), schedulerRole('r2', 'r1')) };

  assert.equal(checkOf(await postImport(answers, SCHEDULER_KIT), 'Q12').status, PASS);
});

test('postImport_secondIndependentSchedulerRole_failsQ12', async () => {
  const answers = { roles: rows(schedulerRole('r1', 'r1'), schedulerRole('x9', 'x9')) };

  assert.equal(checkOf(await postImport(answers, SCHEDULER_KIT), 'Q12').status, FAIL);
});

test('postImport_noSchedulerRole_failsQ12', async () => {
  assert.equal(checkOf(await postImport({}, SCHEDULER_KIT), 'Q12').status, FAIL);
});

test('postImport_rolesUnreadable_warnsQ12', async () => {
  assert.equal(checkOf(await postImport({ roles: notFound() }, SCHEDULER_KIT), 'Q12').status, WARN);
});

// ── Q13 change history on the audited survey tables (audit AUD-01, checklist B9) ──

const AUDIT_KIT = emptyKit({ auditedTables: ['qdb_survey_setup', 'qdb_survey_invitation'] });
const audited = (isOn) => ({ IsAuditEnabled: { Value: isOn } });
const orgAuditing = (isOn) => ({ organizations: rows({ isauditenabled: isOn }) });

test('postImport_auditedTablesAndOrgAuditingOn_passesQ13', async () => {
  const answers = { ...orgAuditing(true), "EntityDefinitions(LogicalName='qdb_survey_setup')": audited(true), "EntityDefinitions(LogicalName='qdb_survey_invitation')": audited(true) };

  assert.equal(checkOf(await postImport(answers, AUDIT_KIT), 'Q13').status, PASS);
});

test('postImport_aTableNotAudited_failsQ13AndNamesIt', async () => {
  const answers = { ...orgAuditing(true), "EntityDefinitions(LogicalName='qdb_survey_setup')": audited(true), "EntityDefinitions(LogicalName='qdb_survey_invitation')": audited(false) };

  assert.match(checkOf(await postImport(answers, AUDIT_KIT), 'Q13').detail, /qdb_survey_invitation/);
});

test('postImport_tablesAuditedButOrgAuditingOff_warnsQ13', async () => {
  const answers = { ...orgAuditing(false), "EntityDefinitions(LogicalName='qdb_survey_setup')": audited(true), "EntityDefinitions(LogicalName='qdb_survey_invitation')": audited(true) };

  assert.equal(checkOf(await postImport(answers, AUDIT_KIT), 'Q13').status, WARN);
});

// ── Q7–Q10 Form Engine update ──

const HASH_KIT = emptyKit({ hashes: { designer: sha256Of('designer'), runtime: sha256Of('runtime'), formEnginePlugin: sha256Of('dll') } });
const contentOf = (text) => rows({ content: base64Of(text) });
const kitBuilds = {
  "webresourceset?$select=content&$filter=name eq 'qdb_designer'": contentOf('designer'),
  "webresourceset?$select=content&$filter=name eq 'qdb_runtime'": contentOf('runtime'),
};

test('postImport_formEngineColumnMissing_failsQ7', async () => {
  const kit = emptyKit({ formEngineColumns: ['qdb_form.qdb_form_type'] });

  assert.equal(checkOf(await postImport({ "EntityDefinitions(LogicalName='qdb_form')/Attributes": notFound() }, kit), 'Q7').status, FAIL);
});

test('postImport_designerAndRuntimeAreKitBuilds_passesQ8AndQ9', async () => {
  assert.deepEqual(statusesOf(await postImport(kitBuilds, HASH_KIT), ['Q8', 'Q9']), [PASS, PASS]);
});

test('postImport_designerAndRuntimeAbsent_failsQ8AndQ9', async () => {
  assert.deepEqual(statusesOf(await postImport({}, HASH_KIT), ['Q8', 'Q9']), [FAIL, FAIL]);
});

test('postImport_kitPluginInstalled_saysSoInQ10', async () => {
  const report = await postImport({ "pluginassemblies?$select=content": contentOf('dll') }, HASH_KIT);

  assert.equal(checkOf(report, 'Q10').detail, 'the kit DLL is installed');
});

test('postImport_previousPluginStillInstalled_saysSoInQ10', async () => {
  const report = await postImport({ "pluginassemblies?$select=content": contentOf('older dll') }, HASH_KIT);

  assert.match(checkOf(report, 'Q10').detail, /^the previous DLL is still installed/);
});

// ── Rollback backup ──

test('rollbackBackup_resourcesAndPluginPresent_keepsEach', async () => {
  const answers = { "webresourceset?$select=name,content,modifiedon&$filter=name eq 'qdb_designer'": rows({ name: 'qdb_designer' }), pluginassemblies: rows({ name: 'Qdb.FormEngine.Plugins' }) };
  const backup = await SurveyChecks.rollbackBackup({ get: fakeGet(answers), kit: emptyKit() });

  assert.deepEqual([backup.designer.name, backup.formEnginePlugin.name], ['qdb_designer', 'Qdb.FormEngine.Plugins']);
});

test('rollbackBackup_pluginAbsent_recordsNull', async () => {
  assert.equal((await SurveyChecks.rollbackBackup({ get: fakeGet(), kit: emptyKit() })).formEnginePlugin, null);
});
