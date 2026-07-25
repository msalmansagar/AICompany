// register-audit-plugin.mjs
// Registers the audit-immutability plugin against Dataverse (DFE-ENH-001 / ENT-005):
//   1. Plugin assembly  → Qdb.FormEngine.Plugins  (created, or content updated if present)
//   2. Plugin type      → Qdb.FormEngine.Plugins.AuditImmutabilityPlugin
//   3. Plugin steps      → PreValidation (stage 10), Synchronous, rank 1:
//        - Update on qdb_dfe_audit_log
//        - Delete on qdb_dfe_audit_log
//
// Idempotent: existing assembly/type/steps are reused, not duplicated.
//
// Auth: service principal (client credentials) from DV_* env vars. Run with the
// env sourced, e.g.:  set -a; . ../../scripts/.env; set +a; node register-audit-plugin.mjs

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const ORG_URL = (process.env.DV_DATAVERSE_URL ?? 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const API_BASE = `${ORG_URL}/api/data/v9.2`;

const ASSEMBLY_NAME = 'Qdb.FormEngine.Plugins';
const ASSEMBLY_VERSION = '0.0.0.0';
const ASSEMBLY_PUBLIC_KEY_TOKEN = 'cf86d1ff95e88037';
const PLUGIN_TYPE_NAME = 'Qdb.FormEngine.Plugins.AuditImmutabilityPlugin';
const TARGET_ENTITY = 'qdb_dfe_audit_log';
const BLOCKED_MESSAGES = ['Update', 'Delete'];
const DLL_PATH = resolve(__dirname, 'dist/Qdb.FormEngine.Plugins.dll');

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

function commonHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: commonHeaders(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: commonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  const entityId = res.headers.get('OData-EntityId') ?? '';
  const match = entityId.match(/\(([0-9a-f-]{36})\)/i);
  if (match) return match[1];
  throw new Error(`POST ${path} succeeded (${res.status}) but OData-EntityId header was missing.`);
}

async function patch(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PATCH',
    headers: commonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
}

function loadDllBase64() {
  const buf = readFileSync(DLL_PATH);
  console.log(`  DLL: ${DLL_PATH} (${buf.length.toLocaleString()} bytes)`);
  return buf.toString('base64');
}

async function upsertAssembly(token, dllBase64) {
  const existing = await get(
    token,
    `pluginassemblies?$select=pluginassemblyid,version,publickeytoken,isolationmode&$filter=name eq '${ASSEMBLY_NAME}'&$top=1`
  );
  if (existing.value?.length) {
    const row = existing.value[0];
    console.log(`  Assembly exists (${row.pluginassemblyid}) version=${row.version} token=${row.publickeytoken} isolation=${row.isolationmode} — updating content...`);
    await patch(token, `pluginassemblies(${row.pluginassemblyid})`, { content: dllBase64 });
    return row.pluginassemblyid;
  }
  console.log('  Assembly not found — creating (Sandbox, Database)...');
  return post(token, 'pluginassemblies', {
    name: ASSEMBLY_NAME,
    version: ASSEMBLY_VERSION,
    culture: 'neutral',
    publickeytoken: ASSEMBLY_PUBLIC_KEY_TOKEN,
    isolationmode: 2,
    sourcetype: 0,
    content: dllBase64,
  });
}

async function upsertPluginType(token, assemblyId) {
  const existing = await get(
    token,
    `plugintypes?$select=plugintypeid&$filter=typename eq '${PLUGIN_TYPE_NAME}'&$top=1`
  );
  if (existing.value?.length) {
    console.log(`  Plugin type exists: ${PLUGIN_TYPE_NAME} (${existing.value[0].plugintypeid})`);
    return existing.value[0].plugintypeid;
  }
  return post(token, 'plugintypes', {
    name: PLUGIN_TYPE_NAME,
    typename: PLUGIN_TYPE_NAME,
    friendlyname: 'AuditImmutabilityPlugin',
    description: 'Blocks Update/Delete on qdb_dfe_audit_log (append-only, ENT-005).',
    'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
  });
}

async function getMessageId(token, messageName) {
  const result = await get(token, `sdkmessages?$select=sdkmessageid&$filter=name eq '${messageName}'&$top=1`);
  if (!result.value?.length) throw new Error(`SDK message '${messageName}' not found.`);
  return result.value[0].sdkmessageid;
}

async function getOrCreateFilter(token, messageId, messageName) {
  const result = await get(
    token,
    `sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${TARGET_ENTITY}' and _sdkmessageid_value eq ${messageId}&$top=1`
  );
  if (result.value?.length) return result.value[0].sdkmessagefilterid;
  console.log(`  Creating sdkmessagefilter for ${messageName}/${TARGET_ENTITY}...`);
  return post(token, 'sdkmessagefilters', {
    'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
    primaryobjecttypecode: TARGET_ENTITY,
    secondaryobjecttypecode: 'none',
    availability: 0,
  });
}

async function upsertStep(token, typeId, messageId, filterId, messageName) {
  const stepName = `${PLUGIN_TYPE_NAME}: PreValidation ${messageName} of ${TARGET_ENTITY}`;
  const existing = await get(
    token,
    `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${stepName}'&$top=1`
  );
  if (existing.value?.length) {
    console.log(`  Step exists: ${messageName} (${existing.value[0].sdkmessageprocessingstepid})`);
    return existing.value[0].sdkmessageprocessingstepid;
  }
  return post(token, 'sdkmessageprocessingsteps', {
    name: stepName,
    description: `Immutability guard — blocks ${messageName} on ${TARGET_ENTITY} (ENT-005).`,
    mode: 0,
    rank: 1,
    stage: 10,
    asyncautodelete: false,
    invocationsource: 0,
    'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
    'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filterId})`,
    'plugintypeid@odata.bind': `/plugintypes(${typeId})`,
  });
}

async function main() {
  console.log('=== Qdb.FormEngine.Plugins — AuditImmutabilityPlugin registration ===\n');
  console.log(`Target org: ${ORG_URL}\n`);

  console.log('1. Loading DLL...');
  const dllBase64 = loadDllBase64();

  console.log('2. Authenticating (service principal)...');
  const token = await getToken();

  console.log('3. Upserting plugin assembly...');
  const assemblyId = await upsertAssembly(token, dllBase64);
  console.log(`   Assembly ID: ${assemblyId}`);

  console.log('4. Upserting plugin type...');
  const typeId = await upsertPluginType(token, assemblyId);
  console.log(`   Type ID: ${typeId}`);

  console.log('5. Registering steps...');
  const stepIds = {};
  for (const messageName of BLOCKED_MESSAGES) {
    const messageId = await getMessageId(token, messageName);
    const filterId = await getOrCreateFilter(token, messageId, messageName);
    stepIds[messageName] = await upsertStep(token, typeId, messageId, filterId, messageName);
    console.log(`   ${messageName} step ID: ${stepIds[messageName]}`);
  }

  console.log('\n=== Registration complete ===');
  console.log(`  Assembly    : ${assemblyId}`);
  console.log(`  Type        : ${typeId}`);
  for (const messageName of BLOCKED_MESSAGES) {
    console.log(`  Step ${messageName.padEnd(6)} : ${stepIds[messageName]}`);
  }
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
