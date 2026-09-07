/**
 * Per-column validation on qdb_grid_column_config (additive):
 *   qdb_is_required          Boolean      cell must carry a value
 *   qdb_max_length           Integer      character ceiling for text-like columns
 *   qdb_validation_format    String(20)   named format — see FORMATS below
 *   qdb_validation_pattern   String(500)  regular expression, used when format is 'custom'
 *   qdb_validation_message   String(500)  message shown when the cell fails
 *
 * Grid columns previously had no validation of any kind: a maker could require the grid
 * itself ("add at least one row") but not require a value in a column, cap its length, or
 * constrain its shape.
 *
 * ALL DEFAULT TO OFF — qdb_is_required defaults false and the rest are null, so existing
 * grids validate exactly as they did before a maker turns something on.
 *
 * Run: node --env-file=scripts/.env scripts/provision-grid-column-validation-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_grid_column_config';

// Kept in step with GridValidationFormat in shared/src/types/form.types.ts.
const FORMATS = "'none' | 'email' | 'phone' | 'url' | 'numeric' | 'alphanumeric' | 'custom'";

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description ?? 'Token request failed');
  return payload.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
}

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
  };
}

async function attributeExists(token, logicalName) {
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers: headers(token) },
  );
  return response.ok;
}

async function addAttribute(token, schema, body) {
  if (await attributeExists(token, schema)) {
    console.log(`  ↷ ${schema} already exists — skipping`);
    return;
  }
  const response = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`add ${schema}: ${(await response.json()).error?.message}`);
  console.log(`  ✓ ${schema}`);
}

const stringAttr = (schema, display, maxLength, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema, LogicalName: schema, MaxLength: maxLength,
  FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
});

const integerAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
  SchemaName: schema, LogicalName: schema,
  MinValue: 1, MaxValue: 1000000, Format: 'None',
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
});

// Defaults to false: a column that silently became required would break every
// existing grid the moment this deployed.
const booleanAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
  SchemaName: schema, LogicalName: schema, DefaultValue: false,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
  OptionSet: {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label('Yes') },
    FalseOption: { Value: 0, Label: label('No') },
  },
});

async function run() {
  console.log(`Grid column validation schema\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_is_required', booleanAttr(
    'qdb_is_required', 'Is Required',
    'When Yes, every row must carry a value in this column before the form can be submitted.',
  ));
  await addAttribute(token, 'qdb_max_length', integerAttr(
    'qdb_max_length', 'Max Length',
    'Maximum number of characters allowed in this column. Leave blank for no limit.',
  ));
  await addAttribute(token, 'qdb_validation_format', stringAttr(
    'qdb_validation_format', 'Validation Format', 20,
    `Shape the value must take: ${FORMATS}. Blank or 'none' means no format check.`,
  ));
  await addAttribute(token, 'qdb_validation_pattern', stringAttr(
    'qdb_validation_pattern', 'Validation Pattern', 500,
    "Regular expression applied when Validation Format is 'custom'.",
  ));
  await addAttribute(token, 'qdb_validation_message', stringAttr(
    'qdb_validation_message', 'Validation Message', 500,
    'Message shown when this column fails validation. Blank falls back to a generated message.',
  ));

  console.log(`${'─'.repeat(60)}\nGrid column validation columns ensured (all default to off).`);
}

run().catch(error => { console.error('\nPROVISIONING FAILED:', error.message); process.exit(1); });
