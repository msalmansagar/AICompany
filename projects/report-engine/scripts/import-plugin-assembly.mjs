// Imports (or updates) the Qdb.ReportEngine.CrmPlugin assembly and its plugin type into the
// qdb_reportengine solution, so the qdb_RunReport Custom API has something to bind to.
//
// Idempotent: PATCHes the content of an existing assembly rather than creating a second one, which
// matters because the assembly identity (name + public key token) is what Dataverse keys on — a
// duplicate would orphan the existing Custom API binding.
//
// Run register-customapi.mjs afterwards to bind the Custom API to the imported plugin type.
//
// Usage: node import-plugin-assembly.mjs <path-to-.env>
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const SOLUTION = 'qdb_reportengine';
const ASSEMBLY_NAME = 'Qdb.ReportEngine.CrmPlugin';
const PLUGIN_TYPES = [
  'Qdb.ReportEngine.CrmPlugin.RunReportPlugin',
  'Qdb.ReportEngine.CrmPlugin.RunDashboardPlugin',
  // Not a Custom API: this one is bound to qdb_reportdefinition messages by register-audit-steps.mjs.
  'Qdb.ReportEngine.CrmPlugin.ReportConfigurationAuditPlugin'
];
const ASSEMBLY_PATH = new URL(
  '../src/Qdb.ReportEngine.CrmPlugin/bin/Release/net462/Qdb.ReportEngine.CrmPlugin.dll',
  import.meta.url
);

// isolationmode 2 = Sandbox (required for cloud, and the safe default on-prem).
const SANDBOX = 2;
// sourcetype 0 = Database.
const DATABASE = 0;

function headers(extra = {}) {
  return { Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
  };
}

async function api(method, path, body, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : await res.json();
}

async function findId(entitySet, filter, idField) {
  const res = await api('GET', `${entitySet}?$filter=${encodeURIComponent(filter)}&$select=${idField}`);
  return res.value?.[0]?.[idField] ?? null;
}

function newIdFrom(response) {
  // Dataverse returns the new record's id in the OData-EntityId header, not the body.
  const match = /\(([0-9a-f-]{36})\)/i.exec(response.headers.get('OData-EntityId') ?? '');
  return match?.[1] ?? null;
}

async function post(path, body, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
  return newIdFrom(res);
}

async function upsertAssembly(content) {
  const existing = await findId('pluginassemblies', `name eq '${ASSEMBLY_NAME}'`, 'pluginassemblyid');
  if (existing) {
    await api('PATCH', `pluginassemblies(${existing})`, { content });
    console.log(`  ~ assembly ${ASSEMBLY_NAME} updated in place`);
    return existing;
  }

  const id = await post('pluginassemblies', {
    name: ASSEMBLY_NAME,
    content,
    isolationmode: SANDBOX,
    sourcetype: DATABASE
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + assembly ${ASSEMBLY_NAME} created ${id}`);
  return id;
}

async function ensurePluginType(assemblyId, PLUGIN_TYPE_NAME) {
  const existing = await findId('plugintypes', `typename eq '${PLUGIN_TYPE_NAME}'`, 'plugintypeid');
  if (existing) {
    console.log(`  = plugin type ${PLUGIN_TYPE_NAME} exists`);
    return existing;
  }

  // friendlyname must be unique within the assembly — reusing one string across both types fails
  // with a 412 "matching key values already exists", which reads like a duplicate typename and is not.
  const shortName = PLUGIN_TYPE_NAME.split('.').pop();
  const id = await post('plugintypes', {
    name: PLUGIN_TYPE_NAME,
    typename: PLUGIN_TYPE_NAME,
    friendlyname: `Report Engine — ${shortName}`,
    description: `Report Engine entry point: ${shortName}, executing as the calling user.`,
    'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`
  });
  console.log(`  + plugin type ${PLUGIN_TYPE_NAME} created ${id}`);
  return id;
}

async function main() {
  const envPath = process.argv[2];
  if (!envPath) throw new Error('Usage: node import-plugin-assembly.mjs <path-to-.env>');

  const content = readFileSync(ASSEMBLY_PATH).toString('base64');
  console.log(`Importing ${ASSEMBLY_NAME} (${content.length} base64 chars) into ${baseUrl}`);

  const assemblyId = await upsertAssembly(content);
  for (const typeName of PLUGIN_TYPES) await ensurePluginType(assemblyId, typeName);

  console.log('\nDone. Next: node register-customapi.mjs <env> to bind the Custom API.');
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
