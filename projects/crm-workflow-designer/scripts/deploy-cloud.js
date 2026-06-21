'use strict';

/**
 * deploy-cloud.js — DEV / STAGING ONLY deployment script.
 *
 * Deploys workflow-designer.htm directly to Dataverse via Web API (PATCH webresourceset).
 * This bypasses solution ALM and is NOT suitable for production.
 *
 * PRODUCTION deployments must use:
 *   pac solution export --name QdbWorkflowDesigner --managed
 *   pac solution import --path QdbWorkflowDesigner_managed.zip --environment <prod-url>
 *
 * Auth: deploy-only service principal (separate from the dev-proxy principal).
 *   Required env vars:
 *     AZURE_DEPLOY_TENANT_ID   — Azure AD tenant ID for the deploy principal
 *     AZURE_DEPLOY_CLIENT_ID   — App registration client ID (deploy principal, NOT dev proxy)
 *     AZURE_DEPLOY_CLIENT_SECRET — Client secret for the deploy principal
 *     CRM_ORG_URL              — Target Dataverse org URL
 *
 * Optional:
 *   WR_NAME  — web resource logical name
 *              (default: qdb_/workflow-designer/workflow-designer.htm)
 *
 * Usage:
 *   node scripts/deploy-cloud.js
 */

const fs   = require('fs');
const path = require('path');

if (process.env.ENVIRONMENT === 'production') {
  console.error(
    '\n[BLOCKED] deploy-cloud.js must not run against a production environment.\n' +
    'Use: pac solution import --path QdbWorkflowDesigner_managed.zip --environment <prod-url>\n'
  );
  process.exit(1);
}

const TENANT_ID     = process.env.AZURE_DEPLOY_TENANT_ID;
const CLIENT_ID     = process.env.AZURE_DEPLOY_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_DEPLOY_CLIENT_SECRET;
const ORG_URL       = process.env.CRM_ORG_URL;
const WR_NAME       = process.env.WR_NAME ?? 'qdb_/workflow-designer/workflow-designer.htm';

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !ORG_URL) {
  console.error(
    '\n[ERROR] Missing required environment variables:\n' +
    '  AZURE_DEPLOY_TENANT_ID, AZURE_DEPLOY_CLIENT_ID,\n' +
    '  AZURE_DEPLOY_CLIENT_SECRET, CRM_ORG_URL\n' +
    'These must use the deploy-only service principal, not the dev-proxy principal.\n'
  );
  process.exit(1);
}

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
