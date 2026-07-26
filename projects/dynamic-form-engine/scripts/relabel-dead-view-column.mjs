/**
 * qdb_form_field carries two columns labelled "Grid Saved View ID", both on the
 * Information form: qdb_saved_view_id (written by the designer, read by the portal and —
 * since the FieldBuilder fix — by the publish generator) and qdb_grid_saved_view_id,
 * which is populated on zero records and read by nothing. A maker cannot tell them apart.
 *
 * This relabels the dead one so the live field is unambiguous. The column itself is left
 * in place; renaming a label changes no data and is reversible.
 *
 * Run:  node --env-file=scripts/.env scripts/relabel-dead-view-column.mjs
 * Safe: idempotent — re-running just rewrites the same label.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const ENTITY       = 'qdb_form_field';
const DEAD_COLUMN  = 'qdb_grid_saved_view_id';
const LIVE_COLUMN  = 'qdb_saved_view_id';
const DEAD_LABEL   = 'Grid Saved View ID (unused — do not fill)';
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

// Refuse to relabel a column that turns out to hold data — the "dead" one must be empty.
const populated = await fetch(
  `${BASE}/qdb_form_fields?$filter=${DEAD_COLUMN} ne null&$select=${DEAD_COLUMN}&$top=1`,
  { headers: H },
).then((r) => r.json());

if (populated.value?.length) {
  console.error(`${DEAD_COLUMN} has data — not relabelling. Investigate before changing anything.`);
  process.exit(1);
}

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

const renamed = await setLabel(DEAD_COLUMN, DEAD_LABEL);
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
