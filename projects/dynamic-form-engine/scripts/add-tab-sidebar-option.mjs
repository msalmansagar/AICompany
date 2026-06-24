/**
 * Adds the 'Sidebar' option (100000004) to the qdb_tab_style picklist
 * on the qdb_form_design entity.
 *
 * Run:  node scripts/add-tab-sidebar-option.mjs
 * Safe: checks for existing option before inserting — re-run is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const ENTITY        = 'qdb_form_design';
const ATTRIBUTE     = 'qdb_tab_style';
const OPTION_VALUE  = 100000004;
const OPTION_LABEL  = 'Sidebar';

// ── Auth ──────────────────────────────────────────────────────────────────────

const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  scope: `${DATAVERSE_URL}/.default`,
});
const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
).then(r => r.json());

if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');
const token = tokenJson.access_token;

const H = {
  Authorization:      `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version':    '4.0',
  Accept:             'application/json',
  'Content-Type':     'application/json',
};

console.log('\n=== Adding Sidebar option to qdb_tab_style ===\n');
console.log('✓ Token acquired');

// ── Check existing options ────────────────────────────────────────────────────

const metaUrl = `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${ATTRIBUTE}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`;
const metaRes = await fetch(metaUrl, { headers: H });
if (!metaRes.ok) {
  const err = await metaRes.json().catch(() => ({}));
  throw new Error(`Failed to fetch metadata: ${err.error?.message ?? metaRes.status}`);
}
const meta = await metaRes.json();
const existingValues = (meta.OptionSet?.Options ?? []).map(o => o.Value);

if (existingValues.includes(OPTION_VALUE)) {
  console.log(`\n⚠  Option ${OPTION_VALUE} ('${OPTION_LABEL}') already exists — skipping.\n`);
  process.exit(0);
}

console.log(`  Existing options: ${existingValues.join(', ')}`);
console.log(`  Adding: ${OPTION_VALUE} = '${OPTION_LABEL}'`);

// ── Insert new option ─────────────────────────────────────────────────────────

const insertUrl = `${API_BASE}/InsertOptionValue`;
const insertRes = await fetch(insertUrl, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    EntityLogicalName:    ENTITY,
    AttributeLogicalName: ATTRIBUTE,
    Value:                OPTION_VALUE,
    Label: {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [{
        '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
        Label:        OPTION_LABEL,
        LanguageCode: 1033,
      }],
    },
  }),
});

if (!insertRes.ok) {
  const err = await insertRes.json().catch(() => ({}));
  throw new Error(`InsertOptionValue failed: ${err.error?.message ?? insertRes.status}`);
}
console.log(`  ✓ Option inserted`);

// ── Publish ───────────────────────────────────────────────────────────────────

const pubRes = await fetch(`${API_BASE}/PublishXml`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`,
  }),
});

if (!pubRes.ok) {
  const err = await pubRes.json().catch(() => ({}));
  throw new Error(`Publish failed: ${err.error?.message ?? 'unknown'}`);
}
console.log(`  ✓ Published ${ENTITY}`);

console.log('\n=== Done ✓ ===');
console.log(`  qdb_tab_style now includes: Sidebar (${OPTION_VALUE})`);
console.log('  Backend map: CrmDesignService.mapTabStyle → 100000004 = "Sidebar"\n');
