// verify-audit-immutability.mjs
// Proves the AuditImmutabilityPlugin blocks Update + Delete on qdb_dfe_audit_log.
// Uses an existing audit record if present (non-destructive); otherwise creates one.
// Expected: PATCH → 400 "immutable"; DELETE → 400 "immutable".

const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const ORG_URL = (process.env.DV_DATAVERSE_URL ?? 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, '');
const API_BASE = `${ORG_URL}/api/data/v9.2`;
const SET = 'qdb_dfe_audit_logs';

async function getToken() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: `${ORG_URL}/.default`,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function findExisting(token) {
  const res = await fetch(`${API_BASE}/${SET}?$select=qdb_dfe_audit_logid&$top=1`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GET ${SET} → ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.value?.[0]?.qdb_dfe_audit_logid ?? null;
}

async function createRecord(token) {
  const res = await fetch(`${API_BASE}/${SET}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ qdb_name: 'immutability-verification-probe' }),
  });
  if (!res.ok) throw new Error(`CREATE → ${res.status}: ${await res.text()}`);
  const id = (res.headers.get('OData-EntityId') ?? '').match(/\(([0-9a-f-]{36})\)/i);
  if (!id) throw new Error('CREATE succeeded but no entity id returned.');
  return id[1];
}

function classify(status, text) {
  const isImmutableMsg = /immutable/i.test(text);
  const pass = status === 400 && isImmutableMsg;
  return { pass, status, immutableMsg: isImmutableMsg };
}

async function tryUpdate(token, id) {
  const res = await fetch(`${API_BASE}/${SET}(${id})`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ qdb_name: 'tamper-attempt' }),
  });
  const text = await res.text();
  return classify(res.status, text);
}

async function tryDelete(token, id) {
  const res = await fetch(`${API_BASE}/${SET}(${id})`, { method: 'DELETE', headers: headers(token) });
  const text = await res.text();
  return classify(res.status, text);
}

async function main() {
  console.log('=== Verify audit immutability on', ORG_URL, '===\n');
  const token = await getToken();

  let id = await findExisting(token);
  let created = false;
  if (id) {
    console.log(`Using existing audit record: ${id} (non-destructive test)`);
  } else {
    id = await createRecord(token);
    created = true;
    console.log(`No existing record — created probe: ${id}`);
  }

  console.log('\n1. Attempting UPDATE (expect 400 immutable)...');
  const upd = await tryUpdate(token, id);
  console.log(`   status=${upd.status} immutableMsg=${upd.immutableMsg} → ${upd.pass ? 'PASS' : 'FAIL'}`);

  console.log('2. Attempting DELETE (expect 400 immutable)...');
  const del = await tryDelete(token, id);
  console.log(`   status=${del.status} immutableMsg=${del.immutableMsg} → ${del.pass ? 'PASS' : 'FAIL'}`);

  if (created && del.pass) {
    console.log('\nNote: probe record is now immutable (Delete blocked, as designed) — it will remain in the audit log.');
  }

  const allPass = upd.pass && del.pass;
  console.log(`\n=== ${allPass ? 'IMMUTABILITY VERIFIED' : 'VERIFICATION FAILED'} ===`);
  if (!allPass) process.exit(2);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
