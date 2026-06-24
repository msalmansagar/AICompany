/**
 * Adds a new column to qdb_form_option_value for the option notes feature.
 *
 *   qdb_notes  — highlighted callout text shown on the radio card for this option (up to 1000 chars)
 *
 * Run:  node scripts/add-option-notes-field.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const ENTITY        = 'qdb_form_option_value';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Token request failed');
  return j.access_token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function headers(token) {
  return {
    Authorization:      `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
    Accept:             'application/json',
    'Content-Type':     'application/json',
  };
}

function crmLabel(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label:        text,
      LanguageCode: 1033,
    }],
  };
}

async function attributeExists(token, logicalName) {
  const r = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers: headers(token) },
  );
  return r.ok;
}

async function addStringAttribute(token, schemaName, displayName, maxLength, description) {
  const logicalName = schemaName.toLowerCase();
  if (await attributeExists(token, logicalName)) {
    console.log(`  ↷ ${logicalName} already exists — skipping`);
    return;
  }

  const r = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`,
    {
      method:  'POST',
      headers: headers(token),
      body: JSON.stringify({
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName:    schemaName,
        LogicalName:   logicalName,
        MaxLength:     maxLength,
        RequiredLevel: { Value: 'None' },
        DisplayName:   crmLabel(displayName),
        Description:   crmLabel(description),
      }),
    },
  );

  if (!r.ok) {
    const j = await r.json();
    throw new Error(`Failed to create ${schemaName}: ${j.error?.message ?? await r.text()}`);
  }
  console.log(`  ✓ Created ${logicalName}`);
}

async function publishEntity(token) {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const r = await fetch(
    `${API_BASE}/PublishXml`,
    { method: 'POST', headers: headers(token), body: JSON.stringify({ ParameterXml: xml }) },
  );
  if (!r.ok) {
    const j = await r.json();
    throw new Error(`Publish failed: ${j.error?.message ?? 'unknown'}`);
  }
  console.log(`  ✓ Published ${ENTITY}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Adding option notes column to qdb_form_option_value ===\n');

  const token = await acquireToken();
  console.log('✓ Token acquired\n');

  console.log('[1] qdb_notes');
  await addStringAttribute(
    token,
    'qdb_notes',
    'Option Notes',
    1000,
    'Highlighted callout text rendered on the radio card when this option is displayed.',
  );

  console.log('\n[2] Publishing');
  await publishEntity(token);

  console.log('\n=== Done ✓ ===');
  console.log('\nNew column on qdb_form_option_value:');
  console.log('  qdb_notes — Text string (1000), displayed as highlighted info box on radio cards');
}

main().catch(e => {
  console.error('\n✗', e.message);
  process.exit(1);
});
