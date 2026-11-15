/**
 * SurveyTriggerPlugin registration payloads (B2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStepPayload, buildPreImagePayload, stepsForSources, stepName, PLUGIN, CUSTOM_APIS, DISPATCH, buildCustomApiPayload, describeSignature } from '../lib/plugin-payloads.mjs';

const apiNamed = (uniqueName) => CUSTOM_APIS.find((api) => api.uniqueName === uniqueName);

test('buildCustomApiPayload_runDueSurveys_hasAnOptionalStringDateAndSummaryPlusIsCompleteOutputs', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_RunDueSurveys'), 'type-id');

  assert.deepEqual(payload.CustomAPIRequestParameters.map((p) => [p.uniquename, p.type, p.isoptional]), [['RunDate', 10, true]]);
  assert.deepEqual(payload.CustomAPIResponseProperties.map((p) => [p.uniquename, p.type]), [['Summary', 10], ['IsComplete', 0]]);
});

test('CUSTOM_APIS_everyParameterDescription_fitsDataverses100CharacterLimit', () => {
  const tooLong = CUSTOM_APIS.flatMap((api) => [...api.inputs, ...api.outputs].filter((p) => p.description.length > 100).map((p) => `${api.uniqueName}.${p.name}`));

  assert.deepEqual(tooLong, []);
});

test('CUSTOM_APIS_integration_registersTheFourApisWithTheirPluginTypes', () => {
  const names = ['qdb_srv_ListPendingSurveys', 'qdb_srv_GetSurvey', 'qdb_srv_SubmitResponse', 'qdb_srv_ValidateLinkToken'];

  assert.deepEqual(names.map((name) => apiNamed(name)?.typeName.split('.').pop()),
    ['ListPendingSurveysPlugin', 'GetSurveyPlugin', 'SubmitResponsePlugin', 'ValidateLinkTokenPlugin']);
});

test('buildCustomApiPayload_submitResponse_requiresAnswersJsonAndKeepsIdentificationOptional', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_SubmitResponse'), 'type-id');

  assert.deepEqual(payload.CustomAPIRequestParameters.map((p) => [p.uniquename, p.isoptional]),
    [['InvitationId', true], ['CallerCustomerId', true], ['Token', true], ['AnswersJson', false]]);
});

test('buildCustomApiPayload_getSurvey_returnsTheVersionAsAnInteger', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_GetSurvey'), 'type-id');

  assert.equal(payload.CustomAPIResponseProperties.find((p) => p.uniquename === 'Version').type, 7);
});

test('describeSignature_runDueSurveys_listsInputsAndOutputs', () => {
  assert.equal(describeSignature(apiNamed('qdb_srv_RunDueSurveys')), 'RunDate → Summary, IsComplete');
});

test('buildCustomApiPayload_activate_isAnUnboundActionWithAGuidInputAndAStringOutput', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_ActivateSource'), 'type-id');

  assert.equal(payload.uniquename, 'qdb_srv_ActivateSource');
  assert.equal(payload.bindingtype, 0);
  assert.equal(payload.isfunction, false);
  assert.equal(payload['PluginTypeId@odata.bind'], '/plugintypes(type-id)');
  assert.deepEqual(payload.CustomAPIRequestParameters.map((p) => [p.uniquename, p.type, p.isoptional]), [['SourceId', 12, false]]);
  assert.deepEqual(payload.CustomAPIResponseProperties.map((p) => [p.uniquename, p.type]), [['Message', 10]]);
});

const IDS = { messageId: 'm', filterId: 'f', pluginTypeId: 't' };

test('buildStepPayload_update_isAsyncPostOperationFilteredToTheStatusField', () => {
  const payload = buildStepPayload({ message: 'Update', table: 'qdb_cheque_clearing', statusField: 'statuscode' }, IDS);

  assert.equal(payload.mode, 1);
  assert.equal(payload.stage, 40);
  assert.equal(payload.filteringattributes, 'statuscode');
  assert.equal(payload.asyncautodelete, true);
});

test('buildStepPayload_create_hasNoAttributeFilter', () => {
  const payload = buildStepPayload({ message: 'Create', table: 'qdb_cheque_clearing', statusField: 'statuscode' }, IDS);

  assert.equal('filteringattributes' in payload, false);
});

test('buildPreImagePayload_statusField_usesTheAliasThePluginReads', () => {
  const payload = buildPreImagePayload('statuscode', 's');

  assert.equal(payload.entityalias, PLUGIN.preImageName);
  assert.equal(payload.imagetype, 0);
  assert.equal(payload.attributes, 'statuscode');
});

test('stepsForSources_threeSources_givesCreateAndUpdateForEach', () => {
  const sources = [{ qdb_table_logical_name: 'a' }, { qdb_table_logical_name: 'b', qdb_status_field: 'qdb_state' }, { qdb_table_logical_name: 'c' }];

  const steps = stepsForSources(sources);

  assert.equal(steps.length, 6);
  assert.deepEqual(steps.find((s) => s.table === 'b' && s.message === 'Update'), { message: 'Update', table: 'b', statusField: 'qdb_state' });
});

test('buildStepPayload_dispatchUpdate_isNamedForTheDispatchPluginAndFilteredToStatus', () => {
  const update = DISPATCH.steps.find((s) => s.message === 'Update');
  const payload = buildStepPayload(update, IDS);

  assert.equal(payload.name, 'Qdb.SurveyEngine.Plugins.InvitationDispatchPlugin: Async Update of qdb_survey_invitation');
  assert.equal(payload.filteringattributes, 'qdb_status');
  assert.ok(update.isEnabled && update.hasPreImage === false);
});

test('stepName_isStable_soReRunsFindTheExistingStep', () => {
  assert.equal(stepName('Update', 'qdb_cheque_clearing'), 'Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin: Async Update of qdb_cheque_clearing');
});

// ── Addendum C: qdb_srv_EraseCustomerSurveyData and new parameter builders ──

test('buildCustomApiPayload_eraseCustomerSurveyData_hasThreeRequiredInputsWithGuidIntegerBoolean', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_EraseCustomerSurveyData'), 'type-id');

  // CustomerGuid (guid=12), Mode (integer=7), DryRun (boolean=0); all required (isoptional=false).
  assert.deepEqual(payload.CustomAPIRequestParameters.map((p) => [p.uniquename, p.type, p.isoptional]),
    [['CustomerGuid', 12, false], ['Mode', 7, false], ['DryRun', 0, false]]);
});

test('buildCustomApiPayload_eraseCustomerSurveyData_hasSixOutputsIncludingIsComplete', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_EraseCustomerSurveyData'), 'type-id');

  assert.deepEqual(payload.CustomAPIResponseProperties.map((p) => [p.uniquename, p.type]), [
    ['InvitationCount', 7], ['ResponseCount', 7], ['AnswerCount', 7], ['SuppressionLogCount', 7],
    ['AreActual', 0], ['IsComplete', 0],
  ]);
});

test('buildCustomApiPayload_eraseCustomerSurveyData_isUnboundAndBoundToErasePlugin', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_EraseCustomerSurveyData'), 'erase-id');

  assert.equal(payload.uniquename, 'qdb_srv_EraseCustomerSurveyData');
  assert.equal(payload.bindingtype, 0);
  assert.equal(payload['PluginTypeId@odata.bind'], '/plugintypes(erase-id)');
});

test('describeSignature_eraseCustomerSurveyData_listsAllParameters', () => {
  assert.equal(describeSignature(apiNamed('qdb_srv_EraseCustomerSurveyData')),
    'CustomerGuid, Mode, DryRun → InvitationCount, ResponseCount, AnswerCount, SuppressionLogCount, AreActual, IsComplete');
});
