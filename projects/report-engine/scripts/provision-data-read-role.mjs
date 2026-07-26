// Provisions a role granting READ on the entities a report targets, and optionally assigns it.
//
// The companion to provision-report-user-role.mjs, which grants read on report *configuration* only.
// That split is deliberate (ADR-RPT-011): a user who can see report definitions still sees no data
// until their own roles allow it, so row-level security keeps meaning something. The consequence is
// that running a report needs BOTH — which is what this script provides the other half of.
//
// Grants read at USER depth by default, so a user sees only records they own. Pass a wider depth
// only when the reports genuinely need it.
//
// Idempotent. Usage:
//   node provision-data-read-role.mjs <path-to-.env> "<role name>" <entity[,entity...]> [userId] [depth]
import { readFileSync } from 'node:fs';

const SOLUTION = 'qdb_reportengine';
const DEPTHS = ['Basic', 'Local', 'Deep', 'Global'];

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function getToken(tenant, clientId, secret, url) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, client_secret: secret, scope: `${url}/.default`
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let baseUrl, token;
const headers = (extra = {}) => ({
  Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function post(path, body, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/api/data/v9.2/${path}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
  const match = /\(([0-9a-f-]{36})\)/i.exec(res.headers.get('OData-EntityId') ?? '');
  return match?.[1] ?? null;
}

const findId = async (set, filter, idField) =>
  (await api('GET', `${set}?$filter=${encodeURIComponent(filter)}&$select=${idField}`)).value?.[0]?.[idField] ?? null;

async function ensureRole(roleName) {
  const existing = await findId('roles', `name eq '${roleName.replace(/'/g, "''")}'`, 'roleid');
  if (existing) {
    console.log(`  = role "${roleName}" exists`);
    return existing;
  }

  const units = await api('GET', 'businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid');
  const id = await post('roles', {
    name: roleName,
    description: 'Read access to the data a Report Engine report targets. Pairs with "Report User", '
      + 'which covers report configuration only.',
    'businessunitid@odata.bind': `/businessunits(${units.value[0].businessunitid})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + role "${roleName}" created ${id}`);
  return id;
}

/**
 * Resolves prvRead<Entity>. The privilege name uses the entity's SchemaName casing, not its logical
 * name, so it is read from metadata rather than assembled from the argument.
 */
async function readPrivilege(logicalName) {
  const definition = await api('GET',
    `EntityDefinitions(LogicalName='${logicalName}')?$select=SchemaName`);
  const name = `prvRead${definition.SchemaName}`;
  const id = await findId('privileges', `name eq '${name}'`, 'privilegeid');
  if (!id) throw new Error(`privilege ${name} not found for entity ${logicalName}`);
  return { name, id };
}

async function assignToUser(roleId, userId) {
  const existing = await api('GET',
    `systemusers(${userId})/systemuserroles_association?$filter=roleid eq ${roleId}&$select=roleid`);
  if (existing.value?.length) {
    console.log('  = already assigned to that user');
    return;
  }
  await api('POST', `systemusers(${userId})/systemuserroles_association/$ref`,
    { '@odata.id': `${baseUrl}/api/data/v9.2/roles(${roleId})` });
  console.log(`  + assigned to user ${userId}`);
}

async function main() {
  const [envPath, roleName, entityList, userId, depth = 'Basic'] = process.argv.slice(2);
  if (!envPath || !roleName || !entityList) {
    throw new Error('Usage: node provision-data-read-role.mjs <.env> "<role name>" <entity[,entity]> [userId] [depth]');
  }
  if (!DEPTHS.includes(depth)) throw new Error(`depth must be one of ${DEPTHS.join(', ')}`);

  const env = loadEnv(envPath);
  baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
  token = await getToken(env.DV_TENANT_ID, env.DV_CLIENT_ID, env.DV_CLIENT_SECRET, baseUrl);

  console.log(`Provisioning "${roleName}" on ${baseUrl} (depth=${depth})`);
  const roleId = await ensureRole(roleName);

  const privileges = [];
  for (const entity of entityList.split(',').map(e => e.trim()).filter(Boolean)) {
    const privilege = await readPrivilege(entity);
    privileges.push({ PrivilegeId: privilege.id, Depth: depth });
    console.log(`  · ${privilege.name}`);
  }

  // Replace, not Add: AddPrivilegesRole leaves an already-granted privilege at its existing depth,
  // so re-running with a wider depth would silently do nothing. Replace sets the exact set, which is
  // also what makes this script idempotent.
  await api('POST', `roles(${roleId})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`, { Privileges: privileges });
  console.log(`  + ${privileges.length} read privilege(s) applied at ${depth} depth`);

  if (userId) await assignToUser(roleId, userId);
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
