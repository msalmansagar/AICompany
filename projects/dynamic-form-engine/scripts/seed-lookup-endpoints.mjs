/**
 * DFE-APILOOKUP-001 — seed the endpoint registry rows into the qdb_lookupendpoint
 * Dataverse table (replaces the env-var registry as the source of truth).
 *
 * Upserts by endpoint key. Both demo endpoints are public no-auth JSON APIs.
 *
 * Run: node --env-file=scripts/.env scripts/seed-lookup-endpoints.mjs
 */
const T = process.env.DV_TENANT_ID;
const C = process.env.DV_CLIENT_ID;
const S = process.env.DV_CLIENT_SECRET;
const U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;

const ENDPOINTS = [
  { qdb_endpoint_key: 'demo-users', qdb_target_url: 'https://jsonplaceholder.typicode.com/users', qdb_timeout_ms: 5000, qdb_is_active: true },
  { qdb_endpoint_key: 'open-meteo-cities', qdb_target_url: 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json', qdb_timeout_ms: 5000, qdb_is_active: true },
];

async function token() {
  if (!S) throw new Error('DV_CLIENT_SECRET not set.');
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token: ${j.error_description}`);
  return j.access_token;
}

async function main() {
  const tok = await token();
  const h = {
    Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation',
  };
  console.log('✓ Token acquired');

  for (const ep of ENDPOINTS) {
    const found = await (await fetch(`${API}/qdb_lookupendpoints?$select=qdb_lookupendpointid&$filter=qdb_endpoint_key eq '${ep.qdb_endpoint_key}'`, { headers: h })).json();
    if (found.value?.length) {
      const id = found.value[0].qdb_lookupendpointid;
      const r = await fetch(`${API}/qdb_lookupendpoints(${id})`, { method: 'PATCH', headers: h, body: JSON.stringify(ep) });
      if (!r.ok) throw new Error(`PATCH ${ep.qdb_endpoint_key}: ${(await r.json()).error?.message}`);
      console.log(`  ✓ updated ${ep.qdb_endpoint_key}`);
    } else {
      const r = await fetch(`${API}/qdb_lookupendpoints`, { method: 'POST', headers: h, body: JSON.stringify(ep) });
      if (!r.ok) throw new Error(`POST ${ep.qdb_endpoint_key}: ${(await r.json()).error?.message}`);
      console.log(`  ✓ created ${ep.qdb_endpoint_key}`);
    }
  }
  console.log('\n=== Done. Registry rows seeded into qdb_lookupendpoint. ===');
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
