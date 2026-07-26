/**
 * Moves the grid saved view onto qdb_grid_saved_view_id, the column that sits in the
 * form's "Grid Config" section beside the other grid settings. The legacy twin
 * (qdb_saved_view_id, filed under "Lookup Config") is left in place and every reader
 * still falls back to it, so this migration is additive and safe to re-run.
 *
 *   node --env-file=scripts/.env scripts/migrate-saved-view-to-grid-config.mjs [--dry-run]
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const isDryRun = process.argv.includes('--dry-run');

const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
    }) },
).then((r) => r.json());
if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');

const H = {
  Authorization: `Bearer ${tokenJson.access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const fields = await fetch(
  `${BASE}/qdb_form_fields?$filter=qdb_saved_view_id ne null`
  + `&$select=qdb_form_fieldid,qdb_schema_name,qdb_label,qdb_saved_view_id,qdb_grid_saved_view_id`,
  { headers: H },
).then((r) => r.json());

console.log(`\n${fields.value.length} field(s) carry a legacy saved view\n`);

let copied = 0;
let alreadySet = 0;
let conflicting = 0;

for (const field of fields.value) {
  const legacy = field.qdb_saved_view_id;
  const current = field.qdb_grid_saved_view_id;

  if (current && current.toLowerCase() === legacy.toLowerCase()) {
    alreadySet++;
    continue;
  }

  // Never overwrite a Grid Config value a maker has already set to something else.
  if (current) {
    console.log(`SKIP  ${field.qdb_schema_name}: Grid Config already holds a different view (${current})`);
    conflicting++;
    continue;
  }

  if (isDryRun) {
    console.log(`WOULD ${field.qdb_schema_name} → ${legacy}`);
    copied++;
    continue;
  }

  const response = await fetch(`${BASE}/qdb_form_fields(${field.qdb_form_fieldid})`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ qdb_grid_saved_view_id: legacy }),
  });
  console.log(`${response.ok ? 'OK   ' : 'FAIL '} ${field.qdb_schema_name} → ${legacy} (${response.status})`);
  if (response.ok) copied++;
}

console.log(`\ncopied ${copied} · already set ${alreadySet} · skipped ${conflicting}`);
if (isDryRun) console.log('(dry run — nothing was written)');
