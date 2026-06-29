// provision-style-schema.mjs — DFE-STYLE-001 Dataverse schema provisioning.
//
// SCOPE (reconciled against org5869857f, 2026-06-29): DFE-STYLE-001 adds only
//   1. qdb_section_design.qdb_css_class        (Text)  — SectionDesign.cssClassName
//   2. qdb_field_design.qdb_field_css_class    (Text)  — FieldDesign.cssClassName
//   3. qdb_css_allowlist_config                (new entity) + a seeded default record
// Everything else the designer/runtime reads (theme/form/section/field/button design
// attributes and qdb_layout_grid) ALREADY EXISTS from the DFE-ADD engagement under the
// names in designer/src/constants/styleAttributeNames.ts. This script does NOT recreate
// them. (The earlier "56 new attributes" figure from the architecture was incorrect —
// those attributes pre-existed under different names than the arch doc assumed.)
//
// Idempotent: existing attributes/entity/record are detected and skipped.
// Deploy BEFORE the code that reads the new attributes (all optional/nullable → zero-downtime).
//
// Run:
//   node --env-file=scripts/.env scripts/provision-style-schema.mjs
//   node --env-file=scripts/.env scripts/provision-style-schema.mjs --dry-run
//
// Required .env entry: DV_CLIENT_SECRET=<service-principal-secret>

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error('DV_CLIENT_SECRET not set. Run with: node --env-file=scripts/.env scripts/provision-style-schema.mjs');
}

const DRY_RUN = process.argv.includes('--dry-run');

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';   // solution the design entities live in
const LANG = 1033;

// ── Auth ────────────────────────────────────────────────────────────────────
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

function headers(token, metadata = false) {
  const h = {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  if (metadata) { h['MSCRM.SolutionUniqueName'] = SOLUTION_NAME; h['Consistency'] = 'Strong'; }
  return h;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(token, path, payload, metadata = true) {
  if (DRY_RUN) { console.log(`  [dry-run] POST ${path}`); return {}; }
  const res = await fetch(`${API_BASE}/${path}`, { method: 'POST', headers: headers(token, metadata), body: JSON.stringify(payload) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

// ── Metadata builders ─────────────────────────────────────────────────────────
const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }] });
const schemaName = (logical) => logical.split('_').map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join('_');

function strAttr(logical, display, maxLength) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: schemaName(logical), MaxLength: maxLength,
    FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' }, DisplayName: label(display) };
}
function memoAttr(logical, display, maxLength) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', SchemaName: schemaName(logical), MaxLength: maxLength,
    RequiredLevel: { Value: 'None' }, DisplayName: label(display) };
}
function boolAttr(logical, display, defaultValue) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata', SchemaName: schemaName(logical), DefaultValue: defaultValue,
    RequiredLevel: { Value: 'None' }, DisplayName: label(display),
    OptionSet: { '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') } } };
}

async function attributeExists(token, entity, logical) {
  const r = await apiGet(token, `EntityDefinitions(LogicalName='${entity}')/Attributes?$select=LogicalName&$filter=LogicalName eq '${logical}'`);
  return !!(r && r.value && r.value.length);
}
async function entityExists(token, logical) {
  const r = await apiGet(token, `EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`);
  return !!r;
}
async function ensureAttribute(token, entity, meta) {
  const logical = meta.SchemaName.toLowerCase();
  if (await attributeExists(token, entity, logical)) { console.log(`  skip  ${entity}.${logical} (exists)`); return false; }
  await apiPost(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, meta);
  console.log(`  +     ${entity}.${logical}`); return true;
}

// ── 1+2. The two net-new cssClassName attributes ───────────────────────────────
// Names match designer/src/constants/styleAttributeNames.ts (SECTION/FIELD_DESIGN_STYLE_ATTRS.CSS_CLASS).
async function createCssClassAttributes(token) {
  let created = 0;
  if (await ensureAttribute(token, 'qdb_section_design', strAttr('qdb_css_class', 'CSS Class', 100))) created++;
  if (await ensureAttribute(token, 'qdb_field_design', strAttr('qdb_field_css_class', 'CSS Class', 100))) created++;
  return created;
}

// ── 3. New configuration entity: qdb_css_allowlist_config ───────────────────────
async function createAllowlistEntity(token) {
  if (!(await entityExists(token, 'qdb_css_allowlist_config'))) {
    console.log('\n-- creating qdb_css_allowlist_config --');
    await apiPost(token, 'EntityDefinitions', {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_CssAllowlistConfig', DisplayName: label('CSS Allowlist Config'), DisplayCollectionName: label('CSS Allowlist Configs'),
      OwnershipType: 'OrganizationOwned', HasActivities: false, HasNotes: false, IsActivity: false,
      Attributes: [{ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'qdb_ConfigKey',
        MaxLength: 100, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'ApplicationRequired' },
        IsPrimaryName: true, DisplayName: label('Config Key') }],
    });
  } else { console.log('\n-- qdb_css_allowlist_config exists; ensuring attributes --'); }

  for (const meta of [
    memoAttr('qdb_allowed_domains_json', 'Allowed Domains JSON', 8000),
    boolAttr('qdb_is_active', 'Is Active', true),
    memoAttr('qdb_notes', 'Notes', 2000),
  ]) await ensureAttribute(token, 'qdb_css_allowlist_config', meta);
}

// ── Seed the default allowlist record (SC-01 / runbook step 2) ──────────────────
// NOTE: AllowlistService queries qdb_config_key eq 'global'. The seed key MUST match.
async function seedAllowlist(token) {
  const existing = await apiGet(token, `qdb_css_allowlist_configs?$filter=qdb_configkey eq 'global'&$select=qdb_css_allowlist_configid`);
  if (existing && existing.value && existing.value.length) { console.log('\n-- allowlist seed: global record exists, skipping --'); return; }
  console.log('\n-- seeding qdb_css_allowlist_config global record --');
  const domains = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  await apiPost(token, 'qdb_css_allowlist_configs', {
    qdb_configkey: 'global', qdb_is_active: true,
    qdb_allowed_domains_json: JSON.stringify(domains),
    qdb_notes: 'Initial approved CDN domains for customCss url() and ThemeDefinition.fontUrl. Expand per OQ-007 (QDB Brand confirmation).',
  }, false);
  console.log(`  + global record (domains: ${domains.join(', ')})`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`DFE-STYLE-001 schema provisioning${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Org: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);
  const token = await acquireToken();

  console.log('\n-- net-new cssClassName attributes --');
  const css = await createCssClassAttributes(token);
  await createAllowlistEntity(token);
  await seedAllowlist(token);

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`cssClassName attributes: ${css} created (qdb_section_design.qdb_css_class, qdb_field_design.qdb_field_css_class).`);
  console.log('Entity qdb_css_allowlist_config ensured + global record seeded.');
  console.log('All other design attributes pre-exist from DFE-ADD — not touched.');
  console.log('\nNEXT (runbook): add the CSS Allowlist Admin role, publish customizations, deploy code.');
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
