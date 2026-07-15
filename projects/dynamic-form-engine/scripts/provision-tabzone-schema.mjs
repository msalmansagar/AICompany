/**
 * DFE-TABZONE-001 — schema for placing fields in a tab's header/footer zone.
 *
 * Adds to qdb_form_field (additive, non-destructive):
 *   qdb_placement       Picklist — Header(100000000) / Footer(100000001) / Body(100000002)
 *   qdb_form_tab_id      Lookup  → qdb_form_tab (OData: _qdb_form_tab_id_value)
 * And relaxes qdb_form_section_id to RequiredLevel=None so header/footer fields
 * (which target a tab, not a section) can be saved.
 *
 * Run:  node scripts/provision-tabzone-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_field';
const TAB_ENTITY = 'qdb_form_tab';
const SECTION_LOOKUP = 'qdb_form_section_id';

const PLACEMENT_OPTIONS = [
  [100000000, 'Header'],
  [100000001, 'Footer'],
  [100000002, 'Body'],
];

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Token request failed');
  return j.access_token;
}

function headers(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
    ...extra,
  };
}

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
  };
}

async function attributeExists(token, logicalName) {
  const r = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers: headers(token) },
  );
  return r.ok;
}

async function relationshipExists(token, schemaName) {
  const r = await fetch(`${API_BASE}/RelationshipDefinitions(SchemaName='${schemaName}')?$select=SchemaName`, {
    headers: headers(token),
  });
  return r.ok;
}

async function addPlacementPicklist(token) {
  if (await attributeExists(token, 'qdb_placement')) {
    console.log('  ↷ qdb_placement already exists — skipping');
    return;
  }
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: 'qdb_placement',
      LogicalName: 'qdb_placement',
      RequiredLevel: { Value: 'None' },
      DisplayName: label('Placement'),
      Description: label('Tab zone: Header / Footer / Body (Section).'),
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        IsGlobal: false,
        OptionSetType: 'Picklist',
        Options: PLACEMENT_OPTIONS.map(([v, l]) => ({ Value: v, Label: label(l) })),
      },
    }),
  });
  if (!r.ok) throw new Error(`addPlacementPicklist: ${(await r.json()).error?.message}`);
  console.log('  ✓ qdb_placement (Header/Footer/Body)');
}

// N:1 lookup qdb_form_field → qdb_form_tab. Lookup schema qdb_Form_Tab_Id →
// logical qdb_form_tab_id → OData _qdb_form_tab_id_value (matches the backend read path).
async function addTabLookup(token) {
  const schemaName = 'qdb_formtab_formfield';
  if (await relationshipExists(token, schemaName)) {
    console.log(`  ↷ lookup ${schemaName} already exists — skipping`);
    return;
  }
  const r = await fetch(`${API_BASE}/RelationshipDefinitions`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: schemaName,
      ReferencedEntity: TAB_ENTITY,
      ReferencingEntity: ENTITY,
      CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: 'qdb_Form_Tab_Id',
        DisplayName: label('Tab'),
        RequiredLevel: { Value: 'None' },
      },
    }),
  });
  if (!r.ok) throw new Error(`addTabLookup: ${(await r.json()).error?.message}`);
  console.log('  ✓ lookup qdb_form_tab_id -> qdb_form_tab');
}

// Relax the section lookup so header/footer fields (no section) can be saved.
async function relaxSectionRequirement(token) {
  const typedUrl =
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${SECTION_LOOKUP}')` +
    `/Microsoft.Dynamics.CRM.LookupAttributeMetadata`;
  const current = await fetch(`${typedUrl}?$select=LogicalName,RequiredLevel`, { headers: headers(token) });
  if (!current.ok) {
    console.log(`  ↷ ${SECTION_LOOKUP} not found — skipping requirement relax`);
    return;
  }
  const meta = await current.json();
  if (meta.RequiredLevel?.Value === 'None') {
    console.log(`  ↷ ${SECTION_LOOKUP} already optional — skipping`);
    return;
  }
  const r = await fetch(typedUrl, {
    method: 'PUT',
    headers: headers(token, { 'MSCRM.MergeLabels': 'true' }),
    body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      LogicalName: SECTION_LOOKUP,
      RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
    }),
  });
  if (!r.ok) throw new Error(`relaxSectionRequirement: ${(await r.json()).error?.message}`);
  console.log(`  ✓ ${SECTION_LOOKUP} → RequiredLevel None`);
}

async function run() {
  console.log(`DFE-TABZONE-001 schema provisioning\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  console.log('-- placement picklist --');
  await addPlacementPicklist(token);

  console.log('-- tab lookup --');
  await addTabLookup(token);

  console.log('-- relax section requirement --');
  await relaxSectionRequirement(token);

  console.log(`${'─'.repeat(56)}\nqdb_form_field tab-zone schema ensured.`);
}

run().catch((e) => {
  console.error('\nPROVISIONING FAILED:', e.message);
  process.exit(1);
});
