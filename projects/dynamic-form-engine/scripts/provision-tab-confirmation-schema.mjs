/**
 * Tab-level submit confirmation on qdb_form_tab (additive):
 *   qdb_require_submit_confirmation   Boolean       enable the gate on this tab
 *   qdb_submit_confirmation_label     String(200)   text beside the checkbox
 *   qdb_submit_confirmation_message   String(2000)  body of the confirmation dialog
 *
 * The form already has a single acknowledgement on qdb_form_definition, which gates the
 * final submit. These scope the same idea to one tab: the checkbox renders on that tab,
 * forward navigation is blocked until it is ticked, and submit re-checks every enabled tab
 * so a tab reached by a jump-to-tab button cannot leave its gate unsatisfied.
 *
 * DEFAULT IS FALSE — existing tabs gain nothing until a maker turns it on.
 *
 * Run: node --env-file=scripts/.env scripts/provision-tab-confirmation-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_tab';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Token request failed');
  return j.access_token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', 'MSCRM.SolutionUniqueName': SOLUTION_NAME };
}

function label(text) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

async function attributeExists(token, logicalName) {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`, { headers: headers(token) });
  return r.ok;
}

async function addAttribute(token, schema, body) {
  if (await attributeExists(token, schema)) { console.log(`  already exists — skipping ${schema}`); return; }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.json()).error?.message}`);
  console.log(`  created ${schema}`);
}

const booleanAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  DefaultValue: false,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
  OptionSet: {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label('Yes') },
    FalseOption: { Value: 0, Label: label('No') },
  },
});

const stringAttr = (schema, display, description, maxLength) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  MaxLength: maxLength,
  FormatName: { Value: 'Text' },
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
});

async function run() {
  console.log(`Tab-level submit confirmation\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_require_submit_confirmation', booleanAttr(
    'qdb_require_submit_confirmation',
    'Require Submit Confirmation',
    'When Yes, this tab shows an acknowledgement checkbox. The user cannot move forward '
    + 'past this tab, and the form cannot be submitted, until it is ticked.',
  ));
  await addAttribute(token, 'qdb_submit_confirmation_label', stringAttr(
    'qdb_submit_confirmation_label',
    'Submit Confirmation Label',
    'Text shown beside the checkbox on this tab. Leave blank for a default acknowledgement.',
    200,
  ));
  await addAttribute(token, 'qdb_submit_confirmation_message', stringAttr(
    'qdb_submit_confirmation_message',
    'Submit Confirmation Message',
    'Optional longer message shown in a dialog when the user ticks the checkbox.',
    2000,
  ));

  const publish = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(60)}\nTab confirmation columns ensured (default off).`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
