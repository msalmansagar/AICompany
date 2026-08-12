/**
 * Verifies the provisioned CMS schema against the acceptance contract.
 * READ-ONLY. Run:
 *   node --env-file=<path-to>/.env projects/cms-engine/scripts/verify-cms-schema.mjs
 *
 * Exists because ADR-CMS-001's storage decision has one failure mode that is
 * invisible until it bites: a Memo column provisioned at the Dataverse default
 * of 2000 characters instead of 1048576 would truncate the first realistic page
 * and breach NFR-09 silently. AC-08.1 is that assertion.
 *
 * Exit code 1 if any check fails, so this can gate a pipeline.
 */

const PAYLOAD_MAX_LENGTH = 1048576;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

/** Columns that carry a gzip+Base64 payload and must be at the Memo maximum. */
const PAYLOAD_COLUMNS = [
  ['msst_cmspageversion', 'msst_contentjson'],
  ['msst_cmsrendercache', 'msst_runtimejson'],
  ['msst_cmsnavigation', 'msst_treejson'],
];

const EXPECTED_ENTITIES = [
  'msst_cmspage',
  'msst_cmspageversion',
  'msst_cmsrendercache',
  'msst_cmspublishlog',
  'msst_cmsmediaasset',
  'msst_cmsicon',
  'msst_cmsthemetoken',
  'msst_cmsnavigation',
  'msst_cmsapprovalroute',
  'msst_cmsapproval',
];

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DV_CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}`);
  return (await res.json()).access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const failures = [];
const pass = (message) => console.log(`  PASS  ${message}`);
const fail = (message) => {
  console.log(`  FAIL  ${message}`);
  failures.push(message);
};

const token = await acquireToken();
console.log(`Verifying CMS schema on ${DATAVERSE_URL}\n`);

console.log('Entities exist');
const all = await apiGet(token, 'EntityDefinitions?$select=LogicalName');
const present = new Set(all.value.map((entity) => entity.LogicalName));
for (const name of EXPECTED_ENTITIES) {
  if (present.has(name)) pass(name);
  else fail(`${name} is missing`);
}

console.log('\nAC-08.1 — payload columns at the Memo maximum');
for (const [entity, attribute] of PAYLOAD_COLUMNS) {
  if (!present.has(entity)) {
    fail(`${entity}.${attribute} — entity missing, cannot check`);
    continue;
  }
  try {
    const meta = await apiGet(
      token,
      `EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=LogicalName,MaxLength`,
    );
    if (meta.MaxLength === PAYLOAD_MAX_LENGTH) {
      pass(`${entity}.${attribute} MaxLength = ${meta.MaxLength}`);
    } else {
      fail(
        `${entity}.${attribute} MaxLength = ${meta.MaxLength}, expected ${PAYLOAD_MAX_LENGTH}` +
          (meta.MaxLength === 2000 ? ' — this is the Dataverse default, the column was not configured' : ''),
      );
    }
  } catch (error) {
    fail(`${entity}.${attribute} — ${error.message}`);
  }
}

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed.`}`);
if (failures.length > 0) process.exit(1);
