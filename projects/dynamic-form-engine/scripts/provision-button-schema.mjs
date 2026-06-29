// provision-button-schema.mjs — DFE-BTN-001 Dataverse schema (Theme A).
//
// Creates the qdb_form_scoped_button entity (tab/section scoped buttons) plus the
// three N:1 lookups the backend read path expects (_qdb_form_definition_id_value,
// _qdb_tab_id_value, _qdb_section_id_value). Additive and idempotent.
//
// LESSONS APPLIED (from the DFE-STYLE-001 allowlist provisioning):
//   1. SchemaName keeps underscores so the logical name matches code
//      (qdb_Form_Scoped_Button -> qdb_form_scoped_button).
//   2. The entity is created ATOMICALLY with all non-lookup attributes in one
//      POST, to avoid the metadata-propagation 404 when adding attributes to a
//      just-created entity. Lookups are added after the entity is queryable.
//
// DEPLOY GATING: this is part of the CLEARED scope (not behind G-1/G-2/G-3), but
// running it touches the live org — run only with explicit approval, per the
// engagement's deploy policy.
//
// Run:
//   node --env-file=scripts/.env scripts/provision-button-schema.mjs
//   node --env-file=scripts/.env scripts/provision-button-schema.mjs --dry-run

const REQUIRED_ENV = ['DV_CLIENT_SECRET', 'DV_TENANT_ID', 'DV_CLIENT_ID', 'DV_DATAVERSE_URL'];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  throw new Error(
    `Missing required env var(s): ${missingEnv.join(', ')}. ` +
    'Run with: node --env-file=scripts/.env scripts/provision-button-schema.mjs',
  );
}

const DRY_RUN = process.argv.includes('--dry-run');
const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = process.env.DV_SOLUTION_NAME || 'QdbDynamicFormEngine';
const LANG = 1033;

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Token request failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME, Consistency: 'Strong',
  };
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(token, path, payload) {
  if (DRY_RUN) { console.log(`  [dry-run] POST ${path}`); return {}; }
  const res = await fetch(`${API_BASE}/${path}`, { method: 'POST', headers: headers(token), body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }] });
const strAttr = (schema, display, maxLength, primary = false) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schema, MaxLength: maxLength,
  FormatName: { Value: 'Text' }, RequiredLevel: { Value: primary ? 'ApplicationRequired' : 'None' },
  IsPrimaryName: primary, DisplayName: label(display),
});
const memoAttr = (schema, display, maxLength) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: schema, MaxLength: maxLength,
  RequiredLevel: { Value: 'None' }, DisplayName: label(display),
});
const intAttr = (schema, display) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', SchemaName: schema,
  RequiredLevel: { Value: 'None' }, DisplayName: label(display),
});
const boolAttr = (schema, display, def) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', SchemaName: schema, DefaultValue: def,
  RequiredLevel: { Value: 'None' }, DisplayName: label(display),
  OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
    TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } },
});

async function entityExists(token, logical) {
  return !!(await apiGet(token, `EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`));
}
async function relationshipExists(token, schemaName) {
  return !!(await apiGet(token, `RelationshipDefinitions(SchemaName='${schemaName}')`));
}

async function createEntity(token) {
  if (await entityExists(token, 'qdb_form_scoped_button')) {
    console.log('-- qdb_form_scoped_button exists; skipping entity create --');
    return;
  }
  console.log('-- creating qdb_form_scoped_button (entity + attributes, atomic) --');
  await apiPost(token, 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: 'qdb_Form_Scoped_Button',
    DisplayName: label('Form Scoped Button'), DisplayCollectionName: label('Form Scoped Buttons'),
    OwnershipType: 'OrganizationOwned', HasActivities: false, HasNotes: false, IsActivity: false,
    Attributes: [
      strAttr('qdb_Label', 'Label', 200, true),
      strAttr('qdb_Placement_Scope', 'Placement Scope', 20),
      intAttr('qdb_Display_Order', 'Display Order'),
      boolAttr('qdb_Is_Primary', 'Is Primary', false),
      boolAttr('qdb_Is_Visible', 'Is Visible', true),
      boolAttr('qdb_Confirm_Required', 'Confirmation Required', false),
      strAttr('qdb_Confirm_Message', 'Confirmation Message', 400),
      strAttr('qdb_Action_Type', 'Action Type', 40),
      memoAttr('qdb_Action_Config_Json', 'Action Config JSON', 16000),
    ],
  });
  console.log('  + entity qdb_form_scoped_button with attributes');
}

async function waitForEntityQueryable(token) {
  if (DRY_RUN) return;
  for (let attempt = 1; attempt <= 18; attempt++) {
    if (await entityExists(token, 'qdb_form_scoped_button')) return;
    console.log(`  wait: entity not queryable yet (poll ${attempt}/18) — 10s`);
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error('qdb_form_scoped_button not queryable after ~3min — re-run (idempotent)');
}

// N:1 lookups. Lookup SchemaName underscores → logical (e.g. qdb_Tab_Id → qdb_tab_id),
// which OData exposes as _qdb_tab_id_value — matching the backend read path.
async function createLookup(token, schemaName, lookupSchema, referenced, displayName) {
  if (await relationshipExists(token, schemaName)) {
    console.log(`  skip lookup ${schemaName} (exists)`);
    return;
  }
  await apiPost(token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName,
    ReferencedEntity: referenced,
    ReferencingEntity: 'qdb_form_scoped_button',
    CascadeConfiguration: { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: lookupSchema, DisplayName: label(displayName), RequiredLevel: { Value: 'None' },
    },
  });
  console.log(`  + lookup ${lookupSchema} -> ${referenced}`);
}

async function run() {
  console.log(`DFE-BTN-001 button schema provisioning${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Org: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  await createEntity(token);
  await waitForEntityQueryable(token);

  console.log('\n-- ensuring lookups --');
  await createLookup(token, 'qdb_formdefinition_scopedbutton', 'qdb_Form_Definition_Id', 'qdb_form_definition', 'Form Definition');
  await createLookup(token, 'qdb_formtab_scopedbutton', 'qdb_Tab_Id', 'qdb_form_tab', 'Tab');
  await createLookup(token, 'qdb_formsection_scopedbutton', 'qdb_Section_Id', 'qdb_form_section', 'Section');

  console.log(`\n${'─'.repeat(56)}`);
  console.log('qdb_form_scoped_button entity + 3 lookups ensured.');
  console.log('NEXT: publish customizations, then deploy backend + designer.');
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
