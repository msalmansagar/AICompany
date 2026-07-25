// provision-cbtn-schema.mjs — DFE-CBTN-001: conditional visibility/enablement columns.
//
// Adds two Memo columns to the EXISTING qdb_form_scoped_button entity:
//   qdb_visible_conditions_json  — stores ButtonConditionSet JSON for visibleWhen
//   qdb_enabled_conditions_json  — stores ButtonConditionSet JSON for enabledWhen
//
// Additive and idempotent: skips any column that already exists on the entity.
// The MSCRM.SolutionUniqueName header ensures each new attribute is tracked in the
// QdbDynamicFormEngine solution automatically.
//
// Run:
//   node --env-file=scripts/.env scripts/provision-cbtn-schema.mjs
//   node --env-file=scripts/.env scripts/provision-cbtn-schema.mjs --dry-run

const REQUIRED_ENV = ['DV_CLIENT_SECRET', 'DV_TENANT_ID', 'DV_CLIENT_ID', 'DV_DATAVERSE_URL'];
const missingEnv = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  throw new Error(
    `Missing required env var(s): ${missingEnv.join(', ')}. ` +
    'Run with: node --env-file=scripts/.env scripts/provision-cbtn-schema.mjs',
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
const ENTITY_LOGICAL = 'qdb_form_scoped_button';

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

const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }],
});

const memoAttr = (schema, display, maxLength) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema,
  MaxLength: maxLength,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
});

async function attributeExists(token, attrLogical) {
  const result = await apiGet(
    token,
    `EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes(LogicalName='${attrLogical}')?$select=LogicalName`,
  );
  return result !== null;
}

async function ensureMemoColumn(token, attrSchemaName, attrLogical, displayName, maxLength) {
  if (await attributeExists(token, attrLogical)) {
    console.log(`  skip ${attrLogical} (already exists)`);
    return false;
  }
  console.log(`  + adding ${attrLogical} to ${ENTITY_LOGICAL} ...`);
  await apiPost(
    token,
    `EntityDefinitions(LogicalName='${ENTITY_LOGICAL}')/Attributes`,
    memoAttr(attrSchemaName, displayName, maxLength),
  );
  console.log(`    created ${attrLogical}`);
  return true;
}

async function verifyColumnsLive(token) {
  console.log('\n-- verifying columns are live --');
  for (const logical of ['qdb_visible_conditions_json', 'qdb_enabled_conditions_json']) {
    const exists = await attributeExists(token, logical);
    console.log(`  ${logical}: ${exists ? 'LIVE' : 'NOT FOUND — re-run after CRM propagation'}`);
  }
}

async function run() {
  console.log(`DFE-CBTN-001 button condition schema provisioning${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`Org: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(56)}`);

  const token = await acquireToken();

  console.log(`-- ensuring memo columns on ${ENTITY_LOGICAL} --`);
  await ensureMemoColumn(
    token,
    'qdb_Visible_Conditions_Json',
    'qdb_visible_conditions_json',
    'Visible When (conditions JSON)',
    100000,
  );
  await ensureMemoColumn(
    token,
    'qdb_Enabled_Conditions_Json',
    'qdb_enabled_conditions_json',
    'Enabled When (conditions JSON)',
    100000,
  );

  await verifyColumnsLive(token);

  console.log(`\n${'─'.repeat(56)}`);
  console.log('Done. If columns show NOT FOUND, wait ~30s for CRM propagation and re-run.');
  console.log('NEXT: deploy backend — no customization publish required for memo columns.');
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
