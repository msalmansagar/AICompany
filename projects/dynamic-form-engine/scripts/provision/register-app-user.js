'use strict';

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID    = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID    = '51f81489-12ee-4a9e-aaae-a2591f45987d'; // public CRM client (device code)
const DATAVERSE    = 'https://org5869857f.crm4.dynamics.com';
const API          = `${DATAVERSE}/api/data/v9.2`;

// The Azure AD app registration to register as a Dataverse application user
const APP_CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';

async function getToken() {
  const pca = new msal.PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` }
  });
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${DATAVERSE}/.default`],
    deviceCodeCallback: (r) => console.log('\n' + r.message + '\n')
  });
  return result.accessToken;
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} — ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Register DFE Backend API as Dataverse Application User');
  console.log('═══════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Check if already registered ──────────────────────────────────────────────
  const existing = await api(token, 'GET',
    `/systemusers?$filter=applicationid eq '${APP_CLIENT_ID}'&$select=systemuserid,fullname`
  );
  if (existing.value.length > 0) {
    const user = existing.value[0];
    console.log(`✓ Application user already exists: ${user.fullname} (${user.systemuserid})`);
    await assignSystemAdminRole(token, user.systemuserid);
    return;
  }

  // ── Create application user ───────────────────────────────────────────────────
  console.log('Creating application user...');
  const newUser = await api(token, 'POST', '/systemusers', {
    applicationid:  APP_CLIENT_ID,
    accessmode:     4,      // Non-interactive
    isdisabled:     false
  });
  const userId = newUser.systemuserid;
  console.log(`✓ Application user created: ${userId}`);

  await assignSystemAdminRole(token, userId);
}

async function assignSystemAdminRole(token, userId) {
  // ── Find System Administrator role ────────────────────────────────────────────
  console.log('\nLooking up System Administrator role...');
  const roles = await api(token, 'GET',
    `/roles?$filter=name eq 'System Administrator'&$select=roleid,name`
  );

  if (roles.value.length === 0) {
    console.error('✗ Could not find System Administrator role');
    process.exit(1);
  }

  const roleId = roles.value[0].roleid;
  console.log(`✓ Found role: ${roles.value[0].name} (${roleId})`);

  // ── Check if role already assigned ───────────────────────────────────────────
  const assigned = await api(token, 'GET',
    `/systemusers(${userId})/systemuserroles_association?$filter=roleid eq '${roleId}'&$select=roleid`
  );
  if (assigned.value.length > 0) {
    console.log('✓ System Administrator role already assigned');
    console.log('\n✅ Done — DFE Backend API is ready to connect to Dataverse.');
    return;
  }

  // ── Assign role ───────────────────────────────────────────────────────────────
  console.log('Assigning System Administrator role...');
  await api(token, 'POST',
    `/systemusers(${userId})/systemuserroles_association/$ref`,
    { '@odata.id': `${API}/roles(${roleId})` }
  );
  console.log('✓ Role assigned');

  console.log('\n✅ Done — DFE Backend API is ready to connect to Dataverse.');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
