/**
 * Form-level header and footer bands on qdb_form_definition (additive):
 *   qdb_header_text        Memo(4000)   text shown in a band above the form
 *   qdb_header_image_url   String(500)  absolute https image shown in that band
 *   qdb_footer_text        Memo(4000)   text shown in a band below the form
 *   qdb_footer_image_url   String(500)  absolute https image shown in that band
 *
 * The runtime had a header, but it was fixed markup — title, description and the language
 * and appearance controls. A maker could not add a word to it. There was no footer at all.
 *
 * The text is PLAIN, not HTML. Line breaks are preserved when rendered, but no markup is
 * interpreted: accepting HTML here would need a sanitiser this product does not have on the
 * form side, and an unsanitised banner authored by anyone with designer access reaches every
 * user of the form.
 *
 * The images are URLs, matching the form icon. The same caveats apply: the portal CSP has to
 * name the host, and an external image request leaks the viewer's IP and user-agent to it.
 * Only absolute http(s) URLs are published (see isRenderableImageUrl).
 *
 * All four default to null, so every existing form renders exactly as it did.
 *
 * Run: node --env-file=scripts/.env scripts/provision-form-header-footer-schema.mjs
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

const memoAttr = (schema, display, maxLength, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
  SchemaName: schema, LogicalName: schema, MaxLength: maxLength,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
});

const urlAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema, LogicalName: schema, MaxLength: 500,
  FormatName: { Value: 'Url' }, RequiredLevel: { Value: 'None' },
  DisplayName: label(display), Description: label(description),
});

async function run() {
  console.log(`Form header and footer bands\nOrg: ${DATAVERSE_URL}  Solution: ${SOLUTION_NAME}\n${'─'.repeat(60)}`);
  const token = await acquireToken();

  await addAttribute(token, 'qdb_header_text', memoAttr(
    'qdb_header_text', 'Header Text', 4000,
    'Plain text shown in a band above the form. Line breaks are preserved; HTML is not interpreted.',
  ));
  await addAttribute(token, 'qdb_header_image_url', urlAttr(
    'qdb_header_image_url', 'Header Image URL',
    'Absolute https image shown in the header band. The host must be allowed by the portal CSP.',
  ));
  await addAttribute(token, 'qdb_footer_text', memoAttr(
    'qdb_footer_text', 'Footer Text', 4000,
    'Plain text shown in a band below the form. Line breaks are preserved; HTML is not interpreted.',
  ));
  await addAttribute(token, 'qdb_footer_image_url', urlAttr(
    'qdb_footer_image_url', 'Footer Image URL',
    'Absolute https image shown in the footer band. The host must be allowed by the portal CSP.',
  ));

  console.log(`${'─'.repeat(60)}\nHeader and footer columns ensured (all default to blank).`);
}

run().catch(error => { console.error('\nPROVISIONING FAILED:', error.message); process.exit(1); });
