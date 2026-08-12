/**
 * Seeds the two approval routes from architecture §5.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/seed-approval-routes.mjs
 *
 * Routes are data rather than constants because approver groups change with
 * people, and adding a third route later should be a data change, not a
 * release. The approver team is deliberately left empty: who approves is a
 * deployment-time decision for the customer, and Q3 answered how many routes,
 * not the names.
 *
 * Idempotent.
 */

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

const CLASSIFICATION = { STANDARD: 100000000, REGULATED: 100000001 };

const ROUTES = [
  {
    key: 'standard',
    classification: CLASSIFICATION.STANDARD,
    serves: 'News, campaigns, general pages',
  },
  {
    key: 'regulated',
    classification: CLASSIFICATION.REGULATED,
    serves: 'Legal, terms, privacy, anything carrying a compliance obligation',
  },
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

let token;
async function send(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

token = await acquireToken();
console.log(`Seeding approval routes on ${DATAVERSE_URL}\n`);

for (const route of ROUTES) {
  const existing = await send(
    'GET',
    `msst_cmsapprovalroutes?$select=msst_cmsapprovalrouteid&$filter=msst_routekey eq '${route.key}'`,
  );

  if (existing.value.length > 0) {
    console.log(`  ${route.key} - exists`);
    continue;
  }

  await send('POST', 'msst_cmsapprovalroutes', {
    msst_routekey: route.key,
    msst_classification: route.classification,
  });
  console.log(`  ${route.key} - created  (${route.serves})`);
}

console.log('\nDone. Approver teams are unset by design — who approves is the customer\'s decision.');
