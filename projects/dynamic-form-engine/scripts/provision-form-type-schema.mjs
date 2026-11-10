/**
 * FR-CSE-019 — Form Type column for the Customer Survey Engine.
 *   qdb_form_definition.qdb_form_type  new Picklist: Standard 100000000 / Survey 100000001
 *
 * Optional, no default written to existing rows: an empty value means Standard, so every
 * existing form keeps its current behaviour (phase-3-arch.md §5.1, PAT-003).
 *
 * Live schema change — run only with explicit go-ahead. Additive and idempotent.
 *   node --env-file=scripts/.env scripts/provision-form-type-schema.mjs
 *
 * On-prem cannot run this (client-credentials auth). Add it by hand, with these exact values,
 * or ship it inside the DFE solution kit.
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const LANGUAGE_CODE = 1033;
const SOLUTION_NAME = 'QdbDynamicFormEngine';

const FORM_ENTITY = 'qdb_form_definition';
const FORM_TYPE_ATTRIBUTE = 'qdb_form_type';
const FORM_TYPE_OPTIONS = [
  { value: 100000000, label: 'Standard' },
  { value: 100000001, label: 'Survey' },
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
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
  return async function call(method, path, body) {
    const res = await fetch(`${API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

async function attributeExists(call) {
  try {
    await call('GET', `EntityDefinitions(LogicalName='${FORM_ENTITY}')/Attributes(LogicalName='${FORM_TYPE_ATTRIBUTE}')?$select=LogicalName`);
    return true;
  } catch (error) {
    if (String(error.message).includes('-> 404')) return false;
    throw error;
  }
}

async function addFormTypeColumn(call) {
  if (await attributeExists(call)) {
    console.log(`  ↷ ${FORM_TYPE_ATTRIBUTE} already exists`);
    return;
  }
  await call('POST', `EntityDefinitions(LogicalName='${FORM_ENTITY}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: FORM_TYPE_ATTRIBUTE, LogicalName: FORM_TYPE_ATTRIBUTE,
    RequiredLevel: { Value: 'None' }, DisplayName: label('Form Type'),
    Description: label('Standard forms behave as before. Survey forms are used by the Customer Survey Engine and need a code starting srv- or srv_. Empty means Standard.'),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata', IsGlobal: false, OptionSetType: 'Picklist',
      Options: FORM_TYPE_OPTIONS.map((option) => ({ Value: option.value, Label: label(option.label) })),
    },
  });
  console.log(`  ✓ created ${FORM_TYPE_ATTRIBUTE}`);
}

async function verify(call) {
  const path = `EntityDefinitions(LogicalName='${FORM_ENTITY}')/Attributes(LogicalName='${FORM_TYPE_ATTRIBUTE}')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)';
  const options = (await call('GET', path)).OptionSet.Options;
  const hasAllOptions = FORM_TYPE_OPTIONS.every((expected) => options.some((option) => option.Value === expected.value));
  console.log(`  ${hasAllOptions ? 'PASS' : 'FAIL'}  ${FORM_TYPE_ATTRIBUTE} has ${FORM_TYPE_OPTIONS.map((option) => option.value).join(', ')}`);
  return hasAllOptions;
}

async function verifyReadable(call) {
  const rows = await call('GET', `qdb_form_definitions?$select=qdb_form_code,${FORM_TYPE_ATTRIBUTE}&$top=1`);
  const isReadable = Array.isArray(rows.value);
  console.log(`  ${isReadable ? 'PASS' : 'FAIL'}  ${FORM_TYPE_ATTRIBUTE} is selectable through the Web API`);
  return isReadable;
}

async function run() {
  const call = client(await token());
  console.log('[1] Form Type column');
  await addFormTypeColumn(call);
  console.log('[2] Publish');
  await call('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><entities><entity>${FORM_ENTITY}</entity></entities></importexportxml>`,
  });
  console.log('  ✓ published');
  console.log('[3] Read back');
  const isMetadataValid = await verify(call);
  const isReadable = await verifyReadable(call);
  process.exit(isMetadataValid && isReadable ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
