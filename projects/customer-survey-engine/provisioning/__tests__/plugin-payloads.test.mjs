/**
 * SurveyTriggerPlugin registration payloads (B2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStepPayload, buildPreImagePayload, stepsForSources, stepName, PLUGIN, CUSTOM_APIS, DISPATCH, TRIGGER_VALIDATION, buildCustomApiPayload, describeSignature, missingRequestParameters, buildRequestParameterPayload } from '../lib/plugin-payloads.mjs';

const apiNamed = (uniqueName) => CUSTOM_APIS.find((api) => api.uniqueName === uniqueName);

test('buildCustomApiPayload_runDueSurveys_hasOptionalStringDateAndPassAndSummaryPlusIsCompleteOutputs', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_RunDueSurveys'), 'type-id');

  assert.deepEqual(payload.CustomAPIRequestParameters.map((p) => [p.uniquename, p.type, p.isoptional]), [['RunDate', 10, true], ['Pass', 10, true]]);
  assert.deepEqual(payload.CustomAPIResponseProperties.map((p) => [p.uniquename, p.type]), [['Summary', 10], ['IsComplete', 0]]);
});

test('missingRequestParameters_apiCreatedBeforePassExisted_listsOnlyPass', () => {
  const missing = missingRequestParameters(apiNamed('qdb_srv_RunDueSurveys'), ['RunDate']);

  assert.deepEqual(missing.map((input) => input.name), ['Pass']);
});

test('missingRequestParameters_everyInputPresent_listsNothing', () => {
  assert.deepEqual(missingRequestParameters(apiNamed('qdb_srv_RunDueSurveys'), ['RunDate', 'Pass']), []);
});

test('buildRequestParameterPayload_pass_bindsToTheExistingApiAsAnOptionalString', () => {
  const pass = apiNamed('qdb_srv_RunDueSurveys').inputs.find((input) => input.name === 'Pass');

  const payload = buildRequestParameterPayload(pass, 'api-id');

  assert.deepEqual([payload.uniquename, payload.type, payload.isoptional, payload['CustomAPIId@odata.bind']], ['Pass', 10, true, '/customapis(api-id)']);
});

// ADR-011: RecordFailure is a Pass value, not a new parameter or API.
test('runDueSurveys_passDescription_namesRecordFailure_FR011', () => {
  const pass = apiNamed('qdb_srv_RunDueSurveys').inputs.find((input) => input.name === 'Pass');

  assert.match(pass.description, /RecordFailure/);
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
  assert.equal(describeSignature(apiNamed('qdb_srv_RunDueSurveys')), 'RunDate, Pass → Summary, IsComplete');
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

test('describeSignature_oneTimeApis_takeATriggerIdAndReturnCountsOrProgress', () => {
  assert.deepEqual(['qdb_srv_PreviewAudience', 'qdb_srv_SendOneTimeTrigger'].map((name) => describeSignature(apiNamed(name))), [
    'TriggerId → Count, Message',
    'TriggerId → Status, Invited, Postponed, Suppressed, IsComplete, Message',
  ]);
});

test('buildCustomApiPayload_sendOneTimeTrigger_requiresAGuidTriggerIdAndBindsTheSendPlugin', () => {
  const payload = buildCustomApiPayload(apiNamed('qdb_srv_SendOneTimeTrigger'), 'send-id');

  assert.deepEqual([payload.CustomAPIRequestParameters[0].type, payload.CustomAPIRequestParameters[0].isoptional, payload['PluginTypeId@odata.bind']], [12, false, '/plugintypes(send-id)']);
});

test('buildStepPayload_triggerValidation_isSynchronousPreOperationWithoutAutoDelete', () => {
  const update = TRIGGER_VALIDATION.steps.find((step) => step.message === 'Update');
  const payload = buildStepPayload(update, { messageId: 'm', filterId: 'f', pluginTypeId: 't' });

  assert.deepEqual([payload.mode, payload.stage, 'asyncautodelete' in payload], [0, 20, false]);
  assert.equal(payload.name, 'Qdb.SurveyEngine.Plugins.TriggerAudienceValidationPlugin: Sync PreOperation Update of qdb_survey_trigger');
});

test('buildStepPayload_triggerValidationUpdate_isFilteredToTheDefinitionColumnsNotTheRunRecord', () => {
  const update = TRIGGER_VALIDATION.steps.find((step) => step.message === 'Update');
  const filtered = buildStepPayload(update, { messageId: 'm', filterId: 'f', pluginTypeId: 't' }).filteringattributes.split(',');

  assert.ok(filtered.includes('qdb_audience_fetchxml'));
  assert.ok(!filtered.some((column) => column.startsWith('qdb_run_') || column.endsWith('_count')));
});
