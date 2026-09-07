// Diagnostic: publish a form, then decompress its render-cache JSON and list the
// fields it actually carries — used to prove whether hidden fields survive publish.
//   node inspect-render-cache-fields.mjs <form-code> [--publish]
import { gunzipSync } from 'node:zlib';

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const formCode = process.argv[2];
const shouldPublish = process.argv.includes('--publish');
if (!formCode) { console.error('usage: node inspect-render-cache-fields.mjs <form-code> [--publish]'); process.exit(1); }

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

const form = await fetch(`${BASE}/qdb_form_definitions?$filter=qdb_form_code eq '${formCode}'&$select=qdb_form_definitionid,qdb_version`, { headers: H }).then((r) => r.json());
const definition = form.value[0];
if (!definition) { console.error(`form ${formCode} not found`); process.exit(1); }

const targetVersion = String(definition.qdb_version ?? '1');

if (shouldPublish) {
  const job = await fetch(`${BASE}/qdb_publish_jobs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ qdb_form_code: formCode, qdb_target_version: targetVersion, qdb_status: 1, qdb_trigger_reason: 1 }),
  }).then((r) => r.json());

  const publish = await fetch(`${BASE}/qdb_PublishForm`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ FormCode: formCode, TargetVersion: targetVersion, PublishJobId: job.qdb_publish_jobid }),
  });
  console.log(`publish → ${publish.status}`);
}

const cache = await fetch(
  `${BASE}/qdb_form_render_caches?$filter=qdb_form_code eq '${formCode}' and qdb_is_active eq true&$select=qdb_form_code,qdb_language_code,qdb_runtime_json,qdb_is_compressed,modifiedon`,
  { headers: H },
).then((r) => r.json());

if (!Array.isArray(cache.value)) { console.error(JSON.stringify(cache, null, 2)); process.exit(1); }

for (const row of cache.value) {
  const raw = Buffer.from(row.qdb_runtime_json, 'base64');
  const json = JSON.parse(
    row.qdb_is_compressed === false ? row.qdb_runtime_json : gunzipSync(raw).toString('utf8'),
  );
  const fields = (json.tabs ?? []).flatMap((tab) => (tab.sections ?? []).flatMap((section) => section.fields ?? []));
  console.log(`\n[${row.qdb_language_code}] modified ${row.modifiedon} — ${fields.length} fields`);
  for (const field of fields) {
    console.log(`   ${field.schemaName} hidden=${field.isHidden} visible=${field.isVisible} default=${JSON.stringify(field.defaultValue)} style=${field.numberDisplayStyle ?? '-'} barMax=${field.barMaxFieldSchemaName ?? '-'} barValue=${field.barValueFieldSchemaName ?? '-'}`);
  }
}
