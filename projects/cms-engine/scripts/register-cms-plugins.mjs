/**
 * Uploads the plugin assembly and binds each plugin type to its Custom API.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/register-cms-plugins.mjs
 *
 * Idempotent: an existing assembly is updated in place rather than duplicated,
 * which is only possible because the assembly is signed with a key we still
 * have. The Report Engine lost its key and can never update its assembly.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOLUTION_NAME = 'MssCmsEngine';
const ASSEMBLY_NAME = 'Msst.CmsEngine.Plugins';
const ASSEMBLY_VERSION = '1.0.0.0';
const PUBLIC_KEY_TOKEN = '1c8c9840833ee811';

const ISOLATION_SANDBOX = 2;
const SOURCE_TYPE_DATABASE = 0;

const here = dirname(fileURLToPath(import.meta.url));
const DLL_PATH = join(
  here,
  '..',
  'crm-plugins',
  'Msst.CmsEngine.Plugins',
  'bin',
  'Release',
  'net471',
  'Msst.CmsEngine.Plugins.dll',
);

/** Each plugin class becomes the main operation of one message. */
const BINDINGS = [
  { typeName: 'Msst.CmsEngine.Plugins.PublishPagePlugin', message: 'msst_CmsPublishPage' },
  {
    typeName: 'Msst.CmsEngine.Plugins.GetPublishedPageJsonPlugin',
    message: 'msst_CmsGetPublishedPageJson',
  },
];

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DV_CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}`);
  return (await res.json()).access_token;
}

function headers(token, { intoSolution = false } = {}) {
  const base = {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return intoSolution ? { ...base, 'MSCRM.SolutionUniqueName': SOLUTION_NAME } : base;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function apiSend(token, method, path, body, options = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: headers(token, options),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  const entityId = res.headers.get('OData-EntityId');
  return entityId ? entityId.match(/\(([^)]+)\)/)?.[1] : null;
}

async function upsertAssembly(token) {
  const content = readFileSync(DLL_PATH).toString('base64');
  const existing = await apiGet(
    token,
    `pluginassemblies?$select=pluginassemblyid&$filter=name eq '${ASSEMBLY_NAME}'`,
  );

  if (existing.value.length > 0) {
    const id = existing.value[0].pluginassemblyid;
    await apiSend(token, 'PATCH', `pluginassemblies(${id})`, { content, version: ASSEMBLY_VERSION });
    console.log(`assembly ${ASSEMBLY_NAME} — updated in place`);
    return id;
  }

  const id = await apiSend(
    token,
    'POST',
    'pluginassemblies',
    {
      name: ASSEMBLY_NAME,
      content,
      version: ASSEMBLY_VERSION,
      culture: 'neutral',
      publickeytoken: PUBLIC_KEY_TOKEN,
      sourcetype: SOURCE_TYPE_DATABASE,
      isolationmode: ISOLATION_SANDBOX,
    },
    { intoSolution: true },
  );
  console.log(`assembly ${ASSEMBLY_NAME} — uploaded`);
  return id;
}

async function upsertPluginType(token, assemblyId, typeName) {
  const existing = await apiGet(
    token,
    `plugintypes?$select=plugintypeid&$filter=typename eq '${typeName}'`,
  );
  if (existing.value.length > 0) {
    console.log(`  type ${typeName} — exists`);
    return existing.value[0].plugintypeid;
  }

  const id = await apiSend(
    token,
    'POST',
    'plugintypes',
    {
      typename: typeName,
      friendlyname: typeName,
      name: typeName,
      'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
    },
    { intoSolution: true },
  );
  console.log(`  type ${typeName} — created`);
  return id;
}

async function bindToMessage(token, message, pluginTypeId) {
  const api = await apiGet(
    token,
    `customapis?$select=customapiid&$filter=uniquename eq '${message}'`,
  );
  if (api.value.length === 0) throw new Error(`Custom API ${message} not found`);

  await apiSend(token, 'PATCH', `customapis(${api.value[0].customapiid})`, {
    'PluginTypeId@odata.bind': `/plugintypes(${pluginTypeId})`,
  });
  console.log(`  bound to ${message}`);
}

async function main() {
  if (!DATAVERSE_URL) throw new Error('DV_DATAVERSE_URL is not set');
  console.log(`Registering CMS plugins on ${DATAVERSE_URL}\n`);

  const token = await acquireToken();
  const assemblyId = await upsertAssembly(token);

  for (const binding of BINDINGS) {
    const pluginTypeId = await upsertPluginType(token, assemblyId, binding.typeName);
    await bindToMessage(token, binding.message, pluginTypeId);
  }

  console.log('\nDone.');
}

await main();
