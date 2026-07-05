/**
 * DFE — deploy the in-CRM form runtime single-file bundle to the qdb_form_runtime.html
 * web resource, then publish. Reuses the service-principal creds (same as the schema
 * provisioners). Additive/idempotent: updates the existing web resource in place.
 * Run: node --env-file=scripts/.env scripts/deploy-runtime-webresource.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const WEB_RESOURCE_NAME = 'qdb_form_runtime.html';
const BUNDLE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/dist-webresource/index.html');

if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set');

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description);
  return json.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
  };
}

async function findWebResourceId(token) {
  const filter = encodeURIComponent(`name eq '${WEB_RESOURCE_NAME}'`);
  const res = await fetch(`${API_BASE}/webresourceset?$filter=${filter}&$select=webresourceid`, { headers: headers(token) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? res.status);
  return json.value?.[0]?.webresourceid ?? null;
}

async function main() {
  console.log('\n== Deploy qdb_form_runtime.html ==\n');
  const content = readFileSync(BUNDLE_PATH).toString('base64');
  console.log(`bundle: ${(content.length / 1024).toFixed(0)} KB base64`);
  const token = await getToken();
  console.log('✓ token');

  const id = await findWebResourceId(token);
  const body = JSON.stringify({ name: WEB_RESOURCE_NAME, displayname: WEB_RESOURCE_NAME, webresourcetype: 1, content });
  if (id) {
    const res = await fetch(`${API_BASE}/webresourceset(${id})`, { method: 'PATCH', headers: headers(token), body });
    if (!res.ok) throw new Error(await res.text());
    console.log('✓ updated existing web resource');
  } else {
    const res = await fetch(`${API_BASE}/webresourceset`, { method: 'POST', headers: headers(token), body });
    if (!res.ok) throw new Error(await res.text());
    console.log('✓ created web resource');
  }

  const pub = await fetch(`${API_BASE}/PublishAllXml`, { method: 'POST', headers: headers(token), body: '{}' });
  if (!pub.ok) throw new Error(await pub.text());
  console.log('✓ published\n✓ runtime deploy done.\n');
}

main().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
