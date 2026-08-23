/**
 * End-to-end check of the six-point batch against the DEPLOYED plugin.
 *
 * Publishes the demo form, waits for the async publish to build the render cache, reads the
 * cache back through qdb_GetPublishedFormJson, and asserts every point appears in the JSON
 * the CRM runtime will actually serve.
 *
 * This is the only check that exercises the deployed C# assembly. The unit tests cover the
 * generator in isolation; they cannot tell you whether the DLL in the org is the one that
 * was built.
 *
 * Run: node --env-file=scripts/.env scripts/verify-six-point-demo.mjs
 * Exits non-zero if any point is missing from the published JSON.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'six-point-demo';

const CACHE_POLL_ATTEMPTS = 30;
const CACHE_POLL_INTERVAL_MS = 4000;

if (!process.env.DV_CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');

const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  }),
});
const { access_token: accessToken } = await tokenResponse.json();
const requestHeaders = {
  Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
};

async function get(path) {
  const response = await fetch(`${API_BASE}/${path}`, { headers: requestHeaders });
  const payload = await response.json();
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${payload.error?.message}`);
  return payload;
}

async function callApi(name, body) {
  const response = await fetch(`${API_BASE}/${name}`, {
    method: 'POST', headers: requestHeaders, body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  // A refused Custom API can come back 200 with an error payload rather than a 4xx, so the
  // status code alone is not evidence that anything worked.
  if (!response.ok || payload.error) {
    throw new Error(`${name} → ${response.status}: ${payload.error?.message ?? text.slice(0, 300)}`);
  }
  return payload;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

console.log(`\n=== Verifying "${FORM_CODE}" through the deployed plugin ===\n`);

const forms = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid,qdb_version`);
if (!forms.value?.length) throw new Error(`Form "${FORM_CODE}" not found — run seed-six-point-demo.mjs first.`);
const { qdb_form_definitionid: formId, qdb_version: version } = forms.value[0];
console.log(`form ${formId} (version ${version})`);

// Clear any cache from a previous run so a stale hit cannot be mistaken for a fresh publish.
const staleCaches = await get(
  `qdb_form_render_caches?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_render_cacheid`);
for (const cache of staleCaches.value ?? []) {
  await fetch(`${API_BASE}/qdb_form_render_caches(${cache.qdb_form_render_cacheid})`,
    { method: 'DELETE', headers: requestHeaders });
}
console.log(`cleared ${staleCaches.value?.length ?? 0} stale cache record(s)`);

// PublishJobId is declared REQUIRED on the Custom API even though the plugin documents it
// as optional and auto-creates the job when it is blank. Omitting it is a 400; blank is the
// only way to reach the documented auto-create path.
await callApi('qdb_PublishForm', { FormCode: FORM_CODE, TargetVersion: version ?? 1, PublishJobId: '' });
console.log('qdb_PublishForm accepted (asynchronous — waiting for the cache)');

let cacheReady = false;
for (let attempt = 1; attempt <= CACHE_POLL_ATTEMPTS; attempt += 1) {
  await sleep(CACHE_POLL_INTERVAL_MS);
  const caches = await get(
    `qdb_form_render_caches?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_render_cacheid,qdb_language_code`);
  if (caches.value?.length) {
    console.log(`cache built after ~${attempt * CACHE_POLL_INTERVAL_MS / 1000}s `
      + `(${caches.value.length} language record(s))`);
    cacheReady = true;
    break;
  }
}
if (!cacheReady) throw new Error('Publish did not produce a render cache — check the publish job record.');

const { RuntimeJson } = await callApi('qdb_GetPublishedFormJson', { FormCode: FORM_CODE, LanguageCode: 'en', Version: 0 });
const form = JSON.parse(RuntimeJson);
console.log(`published JSON: ${RuntimeJson.length} chars\n`);

const gridColumns = form.tabs
  .flatMap(tab => tab.sections)
  .flatMap(section => section.fields)
  .filter(field => field.gridConfig)
  .flatMap(field => field.gridConfig.columnConfigs ?? []);

const rules = form.tabs
  .flatMap(tab => tab.sections)
  .flatMap(section => section.fields)
  .flatMap(field => field.businessRules ?? []);

const column = label => gridColumns.find(c => c.columnLabel === label);

/** [point, what it proves, assertion] */
const CHECKS = [
  [1, 'grid column "Document Title" is required',
    () => column('Document Title')?.isRequired === true],
  [1, 'grid column "Document Title" caps at 60 characters',
    () => column('Document Title')?.maxLength === 60],
  [1, 'grid column "Contact Email" carries the email format',
    () => column('Contact Email')?.validationFormat === 'email'],
  [1, 'grid column "Reference No." carries the custom pattern',
    () => column('Reference No.')?.validationPattern === '^[A-Z]{2}[0-9]{6}$'],
  [2, 'form publishes its icon',
    () => form.iconName === 'DocumentBulletList'],
  [3, 'acknowledgement label survives past the old 200-character cap',
    () => (form.submitConfirmation?.checkboxLabel?.length ?? 0) > 200],
  [4, 'a rule targets a TAB rather than a field',
    () => rules.some(r => r.action === 'hideTab' && !!r.targetTabId)],
  [4, 'that rule is triggered by the lookup field',
    () => rules.some(r => r.action === 'hideTab'
      && r.conditions?.some(c => c.fieldId === 'qdb_country'))],
  [5, 'the hidden column is PUBLISHED, not dropped',
    () => !!column('Internal Key')],
  [5, 'and it is marked not visible',
    () => column('Internal Key')?.isVisible === false],
  [5, 'while a visible column is still marked visible',
    () => column('Document Title')?.isVisible !== false],
  [6, 'header band text is published',
    () => (form.header?.text ?? '').includes('close on 31 March')],
  [6, 'footer band text is published',
    () => (form.footer?.text ?? '').includes('800 0000')],
];

let failed = 0;
for (const [point, description, assertion] of CHECKS) {
  let passed = false;
  try { passed = assertion() === true; } catch { passed = false; }
  console.log(`  ${passed ? '✓' : '✗'} [${point}] ${description}`);
  if (!passed) failed += 1;
}

console.log(`\n${'─'.repeat(64)}`);
if (failed > 0) {
  console.error(`${failed} of ${CHECKS.length} checks FAILED against the deployed plugin.`);
  process.exit(1);
}
console.log(`All ${CHECKS.length} checks passed against the deployed plugin.`);
