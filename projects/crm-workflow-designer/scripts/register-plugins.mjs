// register-plugins.mjs
// Builds on the compiled DLL and registers:
//   1. Plugin assembly  → Qdb.WorkflowDesigner.Plugins
//   2. Plugin types     → RoleDeletionGuardPlugin, CreateProcessFromSopPlugin
//   3. Plugin step      → RoleDeletionGuardPlugin on PreValidation/Delete/qdb_role (sync)
//
// CreateProcessFromSopPlugin is registered as a type only (no step); the Custom API
// it would service is now handled client-side via deriveProcessFromSop.ts.
//
// Usage:
//   $env:AZURE_CLIENT_SECRET = "<secret>"; node scripts/register-plugins.mjs

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.CRM_ORG_URL         ?? 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${ORG_URL}/api/data/v9.2`;

const DLL_PATH = resolve(
  __dirname,
  '../plugins/Qdb.WorkflowDesigner.Plugins/bin/Release/net462/Qdb.WorkflowDesigner.Plugins.dll'
);

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getToken() {
  if (!CLIENT_SECRET) throw new Error('AZURE_CLIENT_SECRET env var is required.');
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: `${ORG_URL}/.default`,
      }).toString(),
    }
  );
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

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
  // Dataverse returns 204 No Content with OData-EntityId: https://.../entity(guid)
  const entityId = res.headers.get('OData-EntityId') ?? '';
  const match = entityId.match(/\(([0-9a-f-]{36})\)/i);
  if (match) return match[1];
  throw new Error(
    `POST ${path} succeeded (${res.status}) but OData-EntityId header was missing.\n` +
    `Headers: ${JSON.stringify([...res.headers.entries()])}`
  );
}

// ─── Step 1: Read + encode DLL ───────────────────────────────────────────────

function loadDllBase64() {
  try {
    const buf = readFileSync(DLL_PATH);
    console.log(`  DLL size: ${buf.length.toLocaleString()} bytes`);
    return buf.toString('base64');
  } catch (err) {
    throw new Error(
      `Cannot read DLL at ${DLL_PATH}.\n` +
      `Run: dotnet build -c Release in plugins/Qdb.WorkflowDesigner.Plugins/\n` +
      `Original error: ${err.message}`
    );
  }
}

// ─── Step 2: Register assembly (create or update) ────────────────────────────

async function registerAssembly(token, dllBase64) {
  const existing = await get(
    token,
    `pluginassemblies?$select=pluginassemblyid,name&$filter=name eq 'Qdb.WorkflowDesigner.Plugins'&$top=1`
  );

  if (existing.value?.length) {
    const id = existing.value[0].pluginassemblyid;
    console.log(`  Assembly already exists (${id}) — updating DLL content...`);
    const res = await fetch(`${API_BASE}/pluginassemblies(${id})`, {
      method: 'PATCH',
      headers: commonHeaders(token),
      body: JSON.stringify({ content: dllBase64 }),
    });
    if (!res.ok) throw new Error(`PATCH pluginassemblies(${id}) → ${res.status}: ${await res.text()}`);
    return id;
  }

  return post(token, 'pluginassemblies', {
    name: 'Qdb.WorkflowDesigner.Plugins',
    version: '1.0.0.0',
    culture: 'neutral',
    publickeytoken: 'cba5fe3ab802d4fe',
    isolationmode: 2,   // Sandbox
    sourcetype: 0,      // Database
    content: dllBase64,
  });
}

// ─── Step 3: Register plugin types (idempotent) ──────────────────────────────

async function registerPluginType(token, assemblyId, shortName) {
  const fullName = `Qdb.WorkflowDesigner.Plugins.${shortName}`;

  const existing = await get(
    token,
    `plugintypes?$select=plugintypeid,typename&$filter=typename eq '${fullName}'&$top=1`
  );
  if (existing.value?.length) {
    console.log(`  Plugin type already exists: ${fullName} (${existing.value[0].plugintypeid})`);
    return existing.value[0].plugintypeid;
  }

  return post(token, 'plugintypes', {
    name: fullName,
    typename: fullName,
    friendlyname: shortName,
    description: '',
    'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
  });
}

// ─── Step 4: Resolve Delete message ID ───────────────────────────────────────

async function getDeleteMessageId(token) {
  const result = await get(
    token,
    `sdkmessages?$select=sdkmessageid,name&$filter=name eq 'Delete'&$top=1`
  );
  const msg = result.value?.[0];
  if (!msg) throw new Error("Could not find 'Delete' SDK message in Dataverse.");
  return msg.sdkmessageid;
}

// ─── Step 5: Resolve (or create) Delete/qdb_role SDK message filter ──────────

async function getOrCreateRoleDeleteFilter(token, deleteMessageId) {
  const result = await get(
    token,
    `sdkmessagefilters?$select=sdkmessagefilterid,primaryobjecttypecode` +
    `&$filter=primaryobjecttypecode eq 'qdb_role' and _sdkmessageid_value eq ${deleteMessageId}&$top=1`
  );

  if (result.value?.length) {
    console.log('  Found existing sdkmessagefilter for Delete/qdb_role.');
    return result.value[0].sdkmessagefilterid;
  }

  console.log('  No existing filter found — creating sdkmessagefilter for Delete/qdb_role...');
  return post(token, 'sdkmessagefilters', {
    'sdkmessageid@odata.bind': `/sdkmessages(${deleteMessageId})`,
    primaryobjecttypecode: 'qdb_role',
    secondaryobjecttypecode: 'none',
    availability: 0,   // 0 = Server
  });
}

// ─── Step 6: Register plugin step ────────────────────────────────────────────

async function registerRoleGuardStep(token, typeId, deleteMessageId, filterIdOrNull) {
  const body = {
    name: 'Qdb.WorkflowDesigner.Plugins.RoleDeletionGuardPlugin: PreValidation of qdb_role',
    description: 'Prevents deletion of qdb_role records that are assigned to SOP steps.',
    mode: 0,           // Synchronous
    rank: 1,
    stage: 10,         // PreValidation
    asyncautodelete: false,
    invocationsource: 0,
    'sdkmessageid@odata.bind': `/sdkmessages(${deleteMessageId})`,
    'plugintypeid@odata.bind': `/plugintypes(${typeId})`,
  };

  if (filterIdOrNull) {
    body['sdkmessagefilterid@odata.bind'] = `/sdkmessagefilters(${filterIdOrNull})`;
  } else {
    console.warn(
      '  WARNING: No sdkmessagefilter found or created for qdb_role.\n' +
      '  The step will be registered as global (fires on ALL entity deletes).\n' +
      '  Fix this in Plugin Registration Tool: set Primary Entity = qdb_role.'
    );
  }

  return post(token, 'sdkmessageprocessingsteps', body);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Qdb.WorkflowDesigner.Plugins — Dataverse Registration ===\n');

  console.log('1. Loading DLL...');
  const dllBase64 = loadDllBase64();

  console.log('2. Authenticating...');
  const token = await getToken();

  console.log('3. Registering plugin assembly...');
  const assemblyId = await registerAssembly(token, dllBase64);
  console.log(`   Assembly ID: ${assemblyId}`);

  console.log('4. Registering plugin types...');
  const roleGuardTypeId = await registerPluginType(token, assemblyId, 'RoleDeletionGuardPlugin');
  console.log(`   RoleDeletionGuardPlugin type ID : ${roleGuardTypeId}`);

  const createProcessTypeId = await registerPluginType(token, assemblyId, 'CreateProcessFromSopPlugin');
  console.log(`   CreateProcessFromSopPlugin type ID: ${createProcessTypeId}`);

  console.log('5. Resolving Delete SDK message...');
  const deleteMessageId = await getDeleteMessageId(token);
  console.log(`   Delete message ID: ${deleteMessageId}`);

  console.log('6. Resolving sdkmessagefilter for Delete / qdb_role...');
  let filterId = null;
  try {
    filterId = await getOrCreateRoleDeleteFilter(token, deleteMessageId);
    console.log(`   Filter ID: ${filterId}`);
  } catch (err) {
    console.warn(`   WARNING: Could not resolve/create filter — ${err.message}`);
  }

  console.log('7. Registering RoleDeletionGuardPlugin step (PreValidation, Sync)...');
  const stepId = await registerRoleGuardStep(token, roleGuardTypeId, deleteMessageId, filterId);
  console.log(`   Step ID: ${stepId}`);

  console.log('\n=== Registration complete ===');
  console.log('');
  console.log('Summary:');
  console.log(`  Assembly  : ${assemblyId}`);
  console.log(`  Type (guard)  : ${roleGuardTypeId}`);
  console.log(`  Type (create) : ${createProcessTypeId}`);
  console.log(`  Step (guard)  : ${stepId}`);
  console.log('');
  console.log('Note: CreateProcessFromSopPlugin is registered as a type only.');
  console.log('      Process derivation is handled client-side (deriveProcessFromSop.ts).');
  console.log('      If you need the Custom API later, register it in Plugin Reg Tool.');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
