/**
 * The saved view is configured in the form's "Grid Config" section
 * (qdb_grid_saved_view_id), beside the other grid settings. qdb_saved_view_id is the
 * legacy twin filed under "Lookup Config"; readers still fall back to it, but makers
 * should not fill it in.
 *
 * Both columns shipped with the identical label "Grid Saved View ID", which is how a
 * blank field and a populated one ended up looking the same. This labels each for what
 * it is. Data is untouched.
 *
 * Run:  node --env-file=scripts/.env scripts/relabel-dead-view-column.mjs
 * Safe: idempotent — re-running just rewrites the same labels.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const ENTITY       = 'qdb_form_field';
const DEAD_COLUMN  = 'qdb_saved_view_id';
const LIVE_COLUMN  = 'qdb_grid_saved_view_id';
const DEAD_LABEL   = 'Grid Saved View ID (legacy — use Grid Config)';
const LIVE_LABEL   = 'Grid Saved View ID';
const LCID         = 1033;

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

async function setLabel(column, label) {
  const url = `${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${column}')`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...H, 'MSCRM.MergeLabels': 'true' },
    body: JSON.stringify({
      '@odata.type': '#Microsoft.Dynamics.CRM.StringAttributeMetadata',
      LogicalName: column,
      SchemaName: column,
      DisplayName: {
        '@odata.type': '#Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': '#Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: label,
          LanguageCode: LCID,
        }],
      },
    }),
  });
  console.log(`${column} → "${label}" : ${response.status}`);
  if (!response.ok) console.error(await response.text());
  return response.ok;
}

// Both labels are written, not just the legacy one: the columns have swapped roles once
// already, so leaving either label unmanaged is how they drifted back to being identical.
const renamed = await setLabel(LIVE_COLUMN, LIVE_LABEL) && await setLabel(DEAD_COLUMN, DEAD_LABEL);
if (!renamed) process.exit(1);

// Publish so the new label shows on the form.
const publish = await fetch(`${BASE}/PublishXml`, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
});
console.log(`publish → ${publish.status}`);

const check = await fetch(
  `${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes?$select=LogicalName,DisplayName`,
  { headers: H },
).then((r) => r.json());

for (const attribute of check.value.filter((a) => [DEAD_COLUMN, LIVE_COLUMN].includes(a.LogicalName))) {
  console.log(`  ${attribute.LogicalName}: "${attribute.DisplayName?.UserLocalizedLabel?.Label}"`);
}
console.log(`\nThe live column remains ${LIVE_COLUMN} ("${LIVE_LABEL}").`);
