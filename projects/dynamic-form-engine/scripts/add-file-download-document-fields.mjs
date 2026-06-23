/**
 * Adds five new columns to qdb_form_field for the info-card download icon,
 * file-field download section, and document-template download settings.
 *
 *   qdb_info_card_download_icon   — Fluent UI icon name; overrides label when set (200 chars)
 *   qdb_file_download_label       — Download button label on file fields (200 chars)
 *   qdb_file_download_icon        — Fluent UI icon name for file-field download button (200 chars)
 *   qdb_upload_document_setting   — JSON blob: { entityName, attributeConfig[] } (Memo, 4000)
 *   qdb_download_document_setting — JSON blob: { downloadSetting: { attributeConfig[] } } (Memo, 4000)
 *
 * Run:  node scripts/add-file-download-document-fields.mjs
 * Safe: checks existence before creating — re-running is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const ENTITY        = 'qdb_form_field';

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
      Label:         text,
      LanguageCode:  1033,
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

async function addString(token, schemaName, displayName, description, maxLength) {
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
  console.log(`  ✓ Created ${logicalName} (String ${maxLength})`);
}

async function addMemo(token, schemaName, displayName, description, maxLength) {
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
        '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
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
  console.log(`  ✓ Created ${logicalName} (Memo ${maxLength})`);
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
  console.log('\n=== Adding file-download and document-template columns to qdb_form_field ===\n');

  const token = await acquireToken();
  console.log('✓ Token acquired\n');

  console.log('[1] qdb_info_card_download_icon');
  await addString(
    token,
    'qdb_info_card_download_icon',
    'Info Card Download Icon',
    'Fluent UI icon name. When set, shown instead of the download label (icon wins).',
    200,
  );

  console.log('\n[2] qdb_file_download_label');
  await addString(
    token,
    'qdb_file_download_label',
    'File Download Label',
    'Button label for the template download section above the file upload dropzone.',
    200,
  );

  console.log('\n[3] qdb_file_download_icon');
  await addString(
    token,
    'qdb_file_download_icon',
    'File Download Icon',
    'Fluent UI icon name for the file-field download button. Overrides the label when set.',
    200,
  );

  console.log('\n[4] qdb_upload_document_setting');
  await addMemo(
    token,
    'qdb_upload_document_setting',
    'Upload Document Setting',
    'JSON: { "entityName": "qdb_edms", "attributeConfig": [{ "attributeName": "...", "attributeValue": "...", "type": "lookup" }] }',
    4000,
  );

  console.log('\n[5] qdb_download_document_setting');
  await addMemo(
    token,
    'qdb_download_document_setting',
    'Download Document Setting',
    'JSON: { "downloadSetting": { "attributeConfig": [{ "attributeName": "documentName", "attributeValue": "...", "type": "string" }] } }',
    4000,
  );

  console.log('\n[6] Publishing');
  await publishEntity(token);

  console.log('\n=== Done ✓ ===');
  console.log('\nNew columns on qdb_form_field:');
  console.log('  qdb_info_card_download_icon    String(200) — Fluent icon name, overrides info-card download label');
  console.log('  qdb_file_download_label        String(200) — File-field download button label');
  console.log('  qdb_file_download_icon         String(200) — Fluent icon name, overrides file-field download label');
  console.log('  qdb_upload_document_setting    Memo(4000)  — JSON upload config blob');
  console.log('  qdb_download_document_setting  Memo(4000)  — JSON download config blob');
}

main().catch(e => {
  console.error('\n✗', e.message);
  process.exit(1);
});
