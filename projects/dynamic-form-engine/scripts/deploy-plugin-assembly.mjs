// Updates the registered Qdb.FormEngine plugin assembly content in Dataverse.
// The currently registered content is written to disk first so a bad deploy can be
// rolled back with --restore <backup-file>.
//   node deploy-plugin-assembly.mjs [--restore <backup-file>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const ASSEMBLY_NAME = 'Qdb.FormEngine.Plugins';
const DLL_PATH      = resolve('../crm-plugins/Qdb.FormEngine/dist/Qdb.FormEngine.Plugins.dll');

const restoreIndex = process.argv.indexOf('--restore');
const restorePath = restoreIndex >= 0 ? process.argv[restoreIndex + 1] : null;

const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` }) }
).then((r) => r.json());

const H = {
  Authorization: `Bearer ${token.access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const assemblies = await fetch(
  `${BASE}/pluginassemblies?$filter=name eq '${ASSEMBLY_NAME}'&$select=pluginassemblyid,name,version,content`,
  { headers: H },
).then((r) => r.json());

const assembly = assemblies.value?.[0];
if (!assembly) { console.error(`plugin assembly ${ASSEMBLY_NAME} not registered`); process.exit(1); }

const backupPath = resolve(`./plugin-assembly-backup-${assembly.pluginassemblyid}.b64`);
writeFileSync(backupPath, assembly.content, 'utf8');
console.log(`registered version ${assembly.version}, current content backed up to ${backupPath}`);

const content = restorePath
  ? readFileSync(resolve(restorePath), 'utf8')
  : readFileSync(DLL_PATH).toString('base64');

console.log(restorePath ? `restoring from ${restorePath}` : `uploading ${DLL_PATH} (${Math.round(content.length / 1024)} KB base64)`);

const response = await fetch(`${BASE}/pluginassemblies(${assembly.pluginassemblyid})`, {
  method: 'PATCH',
  headers: H,
  body: JSON.stringify({ content }),
});

console.log(`PATCH pluginassembly.content → ${response.status}`);
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
