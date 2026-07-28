/**
 * DFE-BARSRC-001 — deploy the Form Field bar-source visibility script as a JavaScript web
 * resource, add it to the FormEngine solution, and publish.
 *
 * The script itself only shows and hides columns; it has to be registered on the
 * qdb_form_field main form by hand (Form Properties → Events):
 *   OnLoad                                → Qdb.FormField.BarSource.onLoad
 *   OnChange qdb_bar_source               → Qdb.FormField.BarSource.onBarSourceChange
 *   OnChange qdb_number_display_style     → Qdb.FormField.BarSource.onBarSourceChange
 * Tick "Pass execution context as first parameter" on all three.
 *
 * Run: node --env-file=scripts/.env scripts/deploy-form-field-script.mjs
 * Idempotent: updates the existing web resource in place.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION = 'FormEngine';

const WEB_RESOURCE_NAME = 'qdb_form_field_bar_source.js';
const DISPLAY_NAME = 'DFE — Form Field bar source visibility';
const SCRIPT_TYPE = 3; // JavaScript
const SOURCE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../crm-webresources/qdb_form_field_bar_source.js',
);

if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set');

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description);
  return j.access_token;
}

const headers = (token) => ({
  Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8',
  'MSCRM.SolutionUniqueName': SOLUTION,
});

async function run() {
  const token = await getToken();
  const content = Buffer.from(readFileSync(SOURCE_PATH, 'utf8'), 'utf8').toString('base64');
  console.log(`Deploy ${WEB_RESOURCE_NAME} (${Math.round(content.length / 1024)} KB base64)`);

  const found = await fetch(
    `${API}/webresourceset?$filter=${encodeURIComponent(`name eq '${WEB_RESOURCE_NAME}'`)}&$select=webresourceid`,
    { headers: headers(token) },
  ).then((r) => r.json());

  let webResourceId = found.value?.[0]?.webresourceid;

  if (webResourceId) {
    const r = await fetch(`${API}/webresourceset(${webResourceId})`, {
      method: 'PATCH', headers: headers(token), body: JSON.stringify({ content }),
    });
    if (!r.ok) throw new Error(`update: ${(await r.text()).slice(0, 300)}`);
    console.log('  ✓ updated existing web resource');
  } else {
    const r = await fetch(`${API}/webresourceset`, {
      method: 'POST',
      headers: { ...headers(token), Prefer: 'return=representation' },
      body: JSON.stringify({
        name: WEB_RESOURCE_NAME,
        displayname: DISPLAY_NAME,
        webresourcetype: SCRIPT_TYPE,
        content,
      }),
    });
    if (!r.ok) throw new Error(`create: ${(await r.text()).slice(0, 300)}`);
    webResourceId = (await r.json()).webresourceid;
    console.log(`  ✓ created web resource ${webResourceId}`);
  }

  const publish = await fetch(`${API}/PublishXml`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({
      ParameterXml: `<importexportxml><webresources><webresource>${webResourceId}</webresource></webresources></importexportxml>`,
    }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log('\nRegister on the qdb_form_field main form (Form Properties → Events):');
  console.log('  OnLoad                            → Qdb.FormField.BarSource.onLoad');
  console.log('  OnChange qdb_bar_source           → Qdb.FormField.BarSource.onBarSourceChange');
  console.log('  OnChange qdb_number_display_style → Qdb.FormField.BarSource.onBarSourceChange');
  console.log('  (tick "Pass execution context as first parameter" on each)');
}

run().catch((e) => { console.error('\nDEPLOY FAILED:', e.message); process.exit(1); });
