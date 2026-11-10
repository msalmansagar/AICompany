/**
 * SurveyTriggerPlugin registration payloads (B2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStepPayload, buildPreImagePayload, stepsForSources, stepName, PLUGIN, ACTIVATION_APIS, buildCustomApiPayload } from '../lib/plugin-payloads.mjs';

test('buildCustomApiPayload_activate_isAnUnboundActionWithAGuidInputAndAStringOutput', () => {
  const payload = buildCustomApiPayload(ACTIVATION_APIS[0], 'type-id');

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

test('stepName_isStable_soReRunsFindTheExistingStep', () => {
  assert.equal(stepName('Update', 'qdb_cheque_clearing'), 'Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin: Async Update of qdb_cheque_clearing');
});
