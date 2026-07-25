// provision-dfe-role.mjs
// Provisions the "Form Designer User" Dataverse security role (DFE-ENH-001, LO-008):
//   - qdb_dfe_audit_log : Create + Read ONLY  (append-only defence-in-depth; NO Write/Delete)
//   - qdb_dfe_edit_lock : Create + Read + Write + Delete (full CRUD)
// Depth: Global (org-wide form configuration entities).
//
// Idempotent on the role (reused if present). Does NOT assign the role to any user
// — that is a QDB administrator decision. Auth: service principal (DV_* env vars).

const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const ORG_URL = (process.env.DV_DATAVERSE_URL ?? 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const API_BASE = `${ORG_URL}/api/data/v9.2`;

const ROLE_NAME = 'Form Designer User';
const ROOT_BUSINESS_UNIT_ID = '97c99afc-4e19-ec11-b6e5-6045bd8b2b7a';

// action → whether it is granted. Audit log is intentionally Create+Read only.
const PRIVILEGE_MATRIX = [
  { entity: 'qdb_dfe_audit_log', actions: ['Create', 'Read'] },
  { entity: 'qdb_dfe_edit_lock', actions: ['Create', 'Read', 'Write', 'Delete'] },
];
const DEPTH = 'Global';

async function getToken() {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('DV_TENANT_ID / DV_CLIENT_ID / DV_CLIENT_SECRET must be set (source scripts/.env).');
  }
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: `${ORG_URL}/.default`,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  const entityId = res.headers.get('OData-EntityId') ?? '';
  const match = entityId.match(/\(([0-9a-f-]{36})\)/i);
  return match ? match[1] : null;
}

async function findOrCreateRole(token) {
  const existing = await get(
    token,
    `roles?$select=roleid,name&$filter=name eq '${ROLE_NAME}'&$top=1`
  );
  if (existing.value?.length) {
    console.log(`  Role exists: ${ROLE_NAME} (${existing.value[0].roleid})`);
    return existing.value[0].roleid;
  }
  console.log(`  Creating role "${ROLE_NAME}" in root business unit...`);
  return post(token, 'roles', {
    name: ROLE_NAME,
    'businessunitid@odata.bind': `/businessunits(${ROOT_BUSINESS_UNIT_ID})`,
  });
}

async function resolvePrivilegeId(token, privilegeName) {
  const res = await get(token, `privileges?$select=privilegeid&$filter=name eq '${privilegeName}'&$top=1`);
  const id = res.value?.[0]?.privilegeid;
  if (!id) throw new Error(`Privilege not found: ${privilegeName}`);
  return id;
}

async function buildPrivilegePayload(token) {
  const payload = [];
  for (const spec of PRIVILEGE_MATRIX) {
    for (const action of spec.actions) {
      const name = `prv${action}${spec.entity}`;
      const id = await resolvePrivilegeId(token, name);
      payload.push({ PrivilegeId: id, Depth: DEPTH });
      console.log(`  + ${name} (${DEPTH})`);
    }
  }
  return payload;
}

async function assignPrivileges(token, roleId, privileges) {
  await post(token, `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges: privileges });
}

async function main() {
  console.log('=== Provision "Form Designer User" role on', ORG_URL, '===\n');
  const token = await getToken();

  console.log('1. Role...');
  const roleId = await findOrCreateRole(token);
  console.log(`   Role ID: ${roleId}`);

  console.log('2. Resolving privileges...');
  const privileges = await buildPrivilegePayload(token);

  console.log('3. Assigning privileges (AddPrivilegesRole)...');
  await assignPrivileges(token, roleId, privileges);

  console.log(`\n=== Role provisioned: ${privileges.length} privileges assigned ===`);
  console.log('  qdb_dfe_audit_log : Create + Read (NO Update/Delete — append-only)');
  console.log('  qdb_dfe_edit_lock : Create + Read + Write + Delete');
  console.log('\nNote: role is NOT assigned to any user — assign it via the QDB admin UI.');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
