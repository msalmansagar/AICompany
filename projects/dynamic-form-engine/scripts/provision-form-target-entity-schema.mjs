/**
 * Target CRM entity on qdb_form_definition (additive):
 *   qdb_entity_logical_name  String(128)  Dataverse entity a submission maps onto
 *
 * The designer has always had a picker for this and a publish gate demanding it (PV-011),
 * but the column was never deployed. FormDefinitionService excluded it from both the select
 * and the update in three places, so the value could not be loaded or saved: every form read
 * back an empty target entity, PV-011 failed for all of them, and Confirm Publish stayed
 * disabled across the whole org.
 *
 * 128 is Dataverse's own ceiling for an entity logical name, so the column cannot hold a
 * value the platform would reject.
 *
 * Defaults to null, so every existing form is unchanged until someone sets one.
 *
 * Run: node --env-file=scripts/.env scripts/provision-form-target-entity-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_definition';
const ENTITY_LOGICAL_NAME_MAX_LENGTH = 128;

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

async function run() {
  console.log(`Form target entity\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_entity_logical_name', {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: 'qdb_entity_logical_name',
    LogicalName: 'qdb_entity_logical_name',
    MaxLength: ENTITY_LOGICAL_NAME_MAX_LENGTH,
    FormatName: { Value: 'Text' },
    RequiredLevel: { Value: 'None' },
    DisplayName: label('Target Entity'),
    Description: label(
      'Logical name of the Dataverse entity a submission of this form maps onto, '
      + 'e.g. account. Required before the form can be published.',
    ),
  });

  console.log(`${'─'.repeat(60)}\nTarget entity column ensured (defaults to blank).`);
}

run().catch(error => { console.error('\nPROVISIONING FAILED:', error.message); process.exit(1); });
