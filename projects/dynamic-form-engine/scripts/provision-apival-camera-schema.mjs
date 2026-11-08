/**
 * DFE-APIVAL-CAM-001 — schema for the API validation rule type and camera-only file fields.
 *   qdb_form_validation_rule.qdb_rule_type  + option 100000014 "API Validation"
 *   qdb_form_field.qdb_file_capture_mode    new Picklist: Any 100000000 / Camera only 100000001
 *
 * 100000013 on qdb_rule_type is skipped on purpose: the designer already writes it for
 * Conditional Required (a separate, open defect), so it is not free.
 *
 * Live schema change — run only with explicit go-ahead. Additive and idempotent.
 *   node --env-file=scripts/.env scripts/provision-apival-camera-schema.mjs
 *
 * On-prem cannot run this (client-credentials auth). Add both by hand, with these exact values.
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const LANGUAGE_CODE = 1033;

const RULE_ENTITY = 'qdb_form_validation_rule';
const RULE_TYPE_ATTRIBUTE = 'qdb_rule_type';
const API_VALIDATION_VALUE = 100000014;

const FIELD_ENTITY = 'qdb_form_field';
const CAPTURE_ATTRIBUTE = 'qdb_file_capture_mode';
const CAPTURE_OPTIONS = [
  { value: 100000000, label: 'Any' },
  { value: 100000001, label: 'Camera only' },
];

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANGUAGE_CODE }],
});

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

function client(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  return async function call(method, path, body) {
    const res = await fetch(`${API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

async function readOptionSet(call, entity, attribute) {
  const path = `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Name,IsGlobal,Options)';
  return (await call('GET', path)).OptionSet;
}

async function attributeExists(call, entity, attribute) {
  try {
    await call('GET', `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')?$select=LogicalName`);
    return true;
  } catch (error) {
    if (String(error.message).includes('-> 404')) return false;
    throw error;
  }
}

async function addApiValidationOption(call) {
  const optionSet = await readOptionSet(call, RULE_ENTITY, RULE_TYPE_ATTRIBUTE);
  if (optionSet.Options.some((option) => option.Value === API_VALIDATION_VALUE)) {
    console.log(`  ↷ ${RULE_TYPE_ATTRIBUTE} already has ${API_VALIDATION_VALUE}`);
    return;
  }
  const target = optionSet.IsGlobal
    ? { OptionSetName: optionSet.Name }
    : { EntityLogicalName: RULE_ENTITY, AttributeLogicalName: RULE_TYPE_ATTRIBUTE };
  await call('POST', 'InsertOptionValue', { ...target, Value: API_VALIDATION_VALUE, Label: label('API Validation') });
  console.log(`  ✓ added ${API_VALIDATION_VALUE} "API Validation"`);
}

async function addCaptureModeColumn(call) {
  if (await attributeExists(call, FIELD_ENTITY, CAPTURE_ATTRIBUTE)) {
    console.log(`  ↷ ${CAPTURE_ATTRIBUTE} already exists`);
    return;
  }
  await call('POST', `EntityDefinitions(LogicalName='${FIELD_ENTITY}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: CAPTURE_ATTRIBUTE, LogicalName: CAPTURE_ATTRIBUTE,
    RequiredLevel: { Value: 'None' }, DisplayName: label('File Capture Mode'),
    Description: label('How a file field collects files on a phone. Camera only opens the rear camera; desktop browsers keep the file picker.'),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist',
      Options: CAPTURE_OPTIONS.map((option) => ({ Value: option.value, Label: label(option.label) })),
    },
  });
  console.log(`  ✓ created ${CAPTURE_ATTRIBUTE}`);
}

async function verify(call) {
  const ruleTypes = await readOptionSet(call, RULE_ENTITY, RULE_TYPE_ATTRIBUTE);
  const captureModes = await readOptionSet(call, FIELD_ENTITY, CAPTURE_ATTRIBUTE);
  const hasApiValidation = ruleTypes.Options.some((option) => option.Value === API_VALIDATION_VALUE);
  const hasCaptureModes = CAPTURE_OPTIONS.every((expected) => captureModes.Options.some((option) => option.Value === expected.value));
  console.log(`  ${hasApiValidation ? 'PASS' : 'FAIL'}  ${RULE_TYPE_ATTRIBUTE} has ${API_VALIDATION_VALUE}`);
  console.log(`  ${hasCaptureModes ? 'PASS' : 'FAIL'}  ${CAPTURE_ATTRIBUTE} has ${CAPTURE_OPTIONS.map((option) => option.value).join(', ')}`);
  return hasApiValidation && hasCaptureModes;
}

async function run() {
  const call = client(await token());
  console.log('[1] API Validation rule type');
  await addApiValidationOption(call);
  console.log('[2] File Capture Mode column');
  await addCaptureModeColumn(call);
  console.log('[3] Publish');
  await call('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><entities><entity>${RULE_ENTITY}</entity><entity>${FIELD_ENTITY}</entity></entities></importexportxml>`,
  });
  console.log('  ✓ published');
  console.log('[4] Read back');
  process.exit(await verify(call) ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
