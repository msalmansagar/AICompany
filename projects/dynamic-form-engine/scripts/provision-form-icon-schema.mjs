/**
 * Form-level icon and image on qdb_form_definition (additive):
 *   qdb_icon_name   String(100)  Fluent icon name — same convention as tabs and sections
 *   qdb_image_url   String(500)  absolute https URL of an image to show instead of the icon
 *
 * Tabs and sections already carry qdb_icon_name; the form itself had nothing, so a form had
 * no mark of its own anywhere — not in the runtime header, not in the designer's form list.
 *
 * The image is a URL rather than an uploaded file. That keeps the schema to one string, but
 * it puts a third-party host in the form's render path: the portal's CSP must allow that
 * host, and an external image request leaks the viewer's IP and user-agent to it. Only https
 * is accepted (see isRenderableImageUrl) — that is a guard, not a substitute for the CSP
 * allowlist or the PDPPL review that a production rollout still needs.
 *
 * Both default to null, so every existing form renders exactly as it did.
 *
 * Run: node --env-file=scripts/.env scripts/provision-form-icon-schema.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const ENTITY = 'qdb_form_definition';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description ?? 'Token request failed');
  return payload.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
}

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
  };
}

async function attributeExists(token, logicalName) {
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers: headers(token) },
  );
  return response.ok;
}

async function addAttribute(token, schema, body) {
  if (await attributeExists(token, schema)) {
    console.log(`  ↷ ${schema} already exists — skipping`);
    return;
  }
  const response = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`add ${schema}: ${(await response.json()).error?.message}`);
  console.log(`  ✓ ${schema}`);
}

const stringAttr = (schema, display, maxLength, description, format = 'Text') => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema, LogicalName: schema, MaxLength: maxLength,
  FormatName: { Value: format }, RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
});

async function run() {
  console.log(`Form icon and image\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_icon_name', stringAttr(
    'qdb_icon_name', 'Icon Name', 100,
    'Fluent icon name shown beside the form title, e.g. DocumentBulletList. '
    + 'Ignored when Image URL is set.',
  ));
  await addAttribute(token, 'qdb_image_url', stringAttr(
    'qdb_image_url', 'Image URL', 500,
    'Absolute https URL of an image shown beside the form title, in place of the icon. '
    + 'The host must be allowed by the portal CSP.',
    'Url',
  ));

  console.log(`${'─'.repeat(60)}\nForm icon and image columns ensured (both default to blank).`);
}

run().catch(error => { console.error('\nPROVISIONING FAILED:', error.message); process.exit(1); });
