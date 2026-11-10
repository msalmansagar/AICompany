/**
 * Metadata payload builders (B1): what the provisioner sends to the Dataverse Web API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntityPayload, buildAttributePayload, buildRelationshipPayload, buildAlternateKeyPayload, privilegeNamesFor,
} from '../lib/payloads.mjs';

const LANGUAGE_CODE = 1033;
const labelText = (label) => label.LocalizedLabels[0].Label;

test('buildEntityPayload_surveyTable_isOrganizationOwnedWithAPrimaryName', () => {
  const payload = buildEntityPayload({ name: 'qdb_survey_setup', label: 'Survey Setup', pluralLabel: 'Survey Setups', description: 'd', columns: [] }, LANGUAGE_CODE);

  assert.equal(payload.SchemaName, 'qdb_survey_setup');
  assert.equal(payload.OwnershipType, 'OrganizationOwned');
  assert.equal(payload.HasNotes, false);
  assert.equal(payload.HasActivities, false);
  assert.equal(payload.Attributes[0].SchemaName, 'qdb_name');
  assert.equal(payload.Attributes[0].IsPrimaryName, true);
});

test('buildEntityPayload_tableWithActivities_enablesActivities', () => {
  const payload = buildEntityPayload({ name: 'qdb_survey_invitation', label: 'I', pluralLabel: 'Is', description: 'd', hasActivities: true, columns: [] }, LANGUAGE_CODE);

  assert.equal(payload.HasActivities, true);
});

test('buildAttributePayload_picklist_carriesItsOptionsAndDefault', () => {
  const payload = buildAttributePayload({
    name: 'qdb_status', type: 'picklist', label: 'Status',
    options: [{ value: 100000000, label: 'Pending' }, { value: 100000001, label: 'Postponed' }], defaultValue: 100000000,
  }, LANGUAGE_CODE);

  assert.equal(payload['@odata.type'], 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata');
  assert.deepEqual(payload.OptionSet.Options.map((o) => o.Value), [100000000, 100000001]);
  assert.equal(payload.OptionSet.IsGlobal, false);
  assert.equal(payload.DefaultFormValue, 100000000);
});

test('buildAttributePayload_requiredString_isApplicationRequired', () => {
  const payload = buildAttributePayload({ name: 'qdb_dedupe_key', type: 'string', label: 'Dedupe Key', maxLength: 200, required: true }, LANGUAGE_CODE);

  assert.equal(payload.MaxLength, 200);
  assert.equal(payload.RequiredLevel.Value, 'ApplicationRequired');
});

test('buildAttributePayload_boolean_hasYesNoAndItsDefault', () => {
  const payload = buildAttributePayload({ name: 'qdb_is_active', type: 'boolean', label: 'Is Active', defaultValue: true }, LANGUAGE_CODE);

  assert.equal(payload['@odata.type'], 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata');
  assert.equal(payload.DefaultValue, true);
  assert.equal(labelText(payload.OptionSet.TrueOption.Label), 'Yes');
});

test('buildAttributePayload_dateOnly_usesDateOnlyBehaviour', () => {
  const payload = buildAttributePayload({ name: 'qdb_active_from', type: 'datetime', label: 'Active From', format: 'DateOnly' }, LANGUAGE_CODE);

  assert.equal(payload.Format, 'DateOnly');
  assert.equal(payload.DateTimeBehavior.Value, 'DateOnly');
});

test('buildAttributePayload_memo_keepsItsMaxLength', () => {
  const payload = buildAttributePayload({ name: 'qdb_answers_json', type: 'memo', label: 'Answers', maxLength: 1048576 }, LANGUAGE_CODE);

  assert.equal(payload['@odata.type'], 'Microsoft.Dynamics.CRM.MemoAttributeMetadata');
  assert.equal(payload.MaxLength, 1048576);
});

test('buildAttributePayload_unknownType_throws', () => {
  assert.throws(() => buildAttributePayload({ name: 'qdb_x', type: 'money', label: 'X' }, LANGUAGE_CODE), /Unsupported column type 'money'/);
});

test('buildRelationshipPayload_parentChild_cascadesDelete', () => {
  const payload = buildRelationshipPayload({ lookup: 'qdb_survey_setup_id', label: 'Survey Setup', from: 'qdb_survey_trigger', to: 'qdb_survey_setup', cascade: 'Cascade', required: true }, LANGUAGE_CODE);

  assert.equal(payload.SchemaName, 'qdb_survey_setup_qdb_survey_trigger_qdb_survey_setup_id');
  assert.equal(payload.ReferencedEntity, 'qdb_survey_setup');
  assert.equal(payload.ReferencingEntity, 'qdb_survey_trigger');
  assert.equal(payload.CascadeConfiguration.Delete, 'Cascade');
  assert.equal(payload.Lookup.SchemaName, 'qdb_survey_setup_id');
  assert.equal(payload.Lookup.RequiredLevel.Value, 'ApplicationRequired');
});

test('buildRelationshipPayload_link_removesTheLinkOnDelete', () => {
  const payload = buildRelationshipPayload({ lookup: 'qdb_customer_id', label: 'Customer', from: 'qdb_survey_invitation', to: 'account', cascade: 'RemoveLink' }, LANGUAGE_CODE);

  assert.equal(payload.CascadeConfiguration.Delete, 'RemoveLink');
  assert.equal(payload.CascadeConfiguration.Assign, 'NoCascade');
  assert.equal(payload.Lookup.RequiredLevel.Value, 'None');
});

test('buildRelationshipPayload_schemaNameOverLimit_isShortenedDeterministically', () => {
  const relationship = { lookup: 'qdb_schedule_population_source_id', label: 'P', from: 'qdb_survey_trigger', to: 'qdb_survey_source', cascade: 'RemoveLink' };

  const first = buildRelationshipPayload(relationship, LANGUAGE_CODE).SchemaName;
  const second = buildRelationshipPayload(relationship, LANGUAGE_CODE).SchemaName;

  assert.ok(first.length <= 100);
  assert.equal(first, second);
});

test('buildAlternateKeyPayload_key_listsItsColumns', () => {
  const payload = buildAlternateKeyPayload({ name: 'qdb_invitation_dedupe', label: 'Dedupe Key', table: 'qdb_survey_invitation', columns: ['qdb_dedupe_key'] }, LANGUAGE_CODE);

  assert.equal(payload.SchemaName, 'qdb_invitation_dedupe');
  assert.deepEqual(payload.KeyAttributes, ['qdb_dedupe_key']);
});

test('privilegeNamesFor_rights_mapsToPlatformPrivilegeNames', () => {
  assert.deepEqual(privilegeNamesFor({ table: 'qdb_survey_answer', rights: ['Read', 'AppendTo'] }), ['prvReadqdb_survey_answer', 'prvAppendToqdb_survey_answer']);
});
