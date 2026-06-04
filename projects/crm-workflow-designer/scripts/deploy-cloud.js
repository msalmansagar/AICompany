'use strict';

/**
 * deploy-cloud.js — deploys workflow-designer.htm directly to Dataverse via Web API.
 *
 * Bypasses CRM solution import entirely. Creates or updates the web resource
 * record via POST /webresourceset (create) or PATCH /webresourceset(guid) (update),
 * then calls PublishXml to make it live.
 *
 * Auth: service principal (client credentials flow)
 *   Required env vars:
 *     AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *
 * Optional:
 *   CRM_ORG_URL  — override target org (default: https://org5869857f.crm4.dynamics.com)
 *   WR_NAME      — logical name (default: qdb_/workflow-designer/workflow-designer.htm)
 *
 * Usage:
 *   node scripts/deploy-cloud.js
 */

const fs   = require('fs');
const path = require('path');

const TENANT_ID    = process.env.AZURE_TENANT_ID    ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID    = process.env.AZURE_CLIENT_ID    ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL      = process.env.CRM_ORG_URL        ?? 'https://org5869857f.crm4.dynamics.com';
const WR_NAME      = process.env.WR_NAME            ?? 'qdb_/workflow-designer/workflow-designer.htm';

const API_BASE     = `${ORG_URL}/api/data/v9.2`;
const HTM_PATH     = path.join(__dirname, '..', 'dist', 'workflow-designer.htm');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken() {
  const url  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         `${ORG_URL}/.default`,
  });

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function headers(token) {
  return {
    Authorization:     `Bearer ${token}`,
    'Content-Type':    'application/json; charset=utf-8',
    'OData-Version':   '4.0',
    'OData-MaxVersion':'4.0',
    Accept:            'application/json',
  };
}

async function findExistingWebResource(token) {
  const url = `${API_BASE}/webresourceset?$filter=name eq '${WR_NAME}'&$select=webresourceid,name&$top=1`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`Query error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.value[0]?.webresourceid ?? null;
}

async function createWebResource(token, content64) {
  console.log('  Creating new web resource…');
  const res = await fetch(`${API_BASE}/webresourceset`, {
    method:  'POST',
    headers: { ...headers(token), Prefer: 'return=representation' },
    body: JSON.stringify({
      name:            WR_NAME,
      displayname:     'Workflow Designer',
      description:     'CRM Visual Workflow Designer — deployed by deploy-cloud.js',
      webresourcetype: 1,   // 1 = Webpage (HTML)
      content:         content64,
    }),
  });
  if (!res.ok) throw new Error(`Create error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.webresourceid;
}

async function updateWebResource(token, id, content64) {
  console.log(`  Updating existing web resource (${id})…`);
  const res = await fetch(`${API_BASE}/webresourceset(${id})`, {
    method:  'PATCH',
    headers: headers(token),
    body: JSON.stringify({ content: content64 }),
  });
  if (!res.ok) throw new Error(`Update error ${res.status}: ${await res.text()}`);
}

async function publishWebResource(token, id) {
  console.log('  Publishing…');
  const xml = `<importexportxml><webresources><webresource>{${id}}</webresource></webresources></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, {
    method:  'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) throw new Error(`Publish error ${res.status}: ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  CRM Workflow Designer — Direct Cloud Deployment');
  console.log(`  Target: ${ORG_URL}`);
  console.log(`  File:   ${WR_NAME}`);
  console.log('════════════════════════════════════════════════════\n');

  if (!CLIENT_SECRET) {
    throw new Error('AZURE_CLIENT_SECRET env var is required.');
  }
  if (!fs.existsSync(HTM_PATH)) {
    throw new Error(`Build output not found: ${HTM_PATH}\nRun: npm run build`);
  }

  const fileSizeKb = (fs.statSync(HTM_PATH).size / 1024).toFixed(1);
  console.log(`  Reading ${HTM_PATH} (${fileSizeKb} KB)…`);
  const content64 = fs.readFileSync(HTM_PATH).toString('base64');
  console.log(`  Base64 length: ${(content64.length / 1024).toFixed(1)} KB`);

  console.log('\n  Acquiring token…');
  const token = await getToken();
  console.log('  Token acquired.');

  console.log('\n  Checking for existing web resource…');
  const existingId = await findExistingWebResource(token);

  let resourceId;
  if (existingId) {
    console.log(`  Found existing record: ${existingId}`);
    await updateWebResource(token, existingId, content64);
    resourceId = existingId;
  } else {
    console.log('  No existing record found.');
    resourceId = await createWebResource(token, content64);
    console.log(`  Created: ${resourceId}`);
  }

  await publishWebResource(token, resourceId);

  console.log('\n════════════════════════════════════════════════════');
  console.log('  Deployment complete.');
  console.log(`  Web resource ID: ${resourceId}`);
  console.log(`\n  Open in CRM:`);
  console.log(`  ${ORG_URL}/WebResources/${WR_NAME}`);
  console.log('════════════════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
