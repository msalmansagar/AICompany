'use strict';

// Creates qdb_decisionlabel (Text, max 200) on qdb_sopstep.
// Stores the gateway question shown inside the decision diamond (e.g. "Approved?").
// Safe to re-run — skips silently if field already exists.
// Usage: $env:AZURE_CLIENT_SECRET="..."; node scripts/add-sop-decisionlabel-field.js

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.DATAVERSE_URL        ?? 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${ORG_URL}/api/data/v9.2`;

const ENTITY = 'qdb_sopstep';
const FIELD  = 'qdb_decisionlabel';
const SCHEMA = 'qdb_DecisionLabel';

async function getToken() {
  if (!CLIENT_SECRET) { console.error('[FATAL] AZURE_CLIENT_SECRET required.'); process.exit(1); }
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         `${ORG_URL}/.default`,
      }).toString(),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`Auth failed: ${res.status} ${t}`); }
  const { access_token } = await res.json();
  return access_token;
}

async function fieldExists(token) {
  const res = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${FIELD}')`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  );
  return res.ok;
}

async function createField(token) {
  const res = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'MSCRM.SolutionName': 'qdb_solution',
      },
      body: JSON.stringify({
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: SCHEMA,
        LogicalName: FIELD,
        MaxLength: 200,
        FormatName: { Value: 'Text' },
        DisplayName: { LocalizedLabels: [{ Label: 'Decision Label', LanguageCode: 1033 }] },
        Description: { LocalizedLabels: [{ Label: 'The question or condition shown inside the gateway diamond when a step has multiple outcomes. E.g. "Approved?"', LanguageCode: 1033 }] },
        RequiredLevel: { Value: 'None' },
      }),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`Create field failed: ${res.status} ${t}`); }
  console.log(`  Created ${FIELD} on ${ENTITY}`);
}

async function publishEntity(token) {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Publish failed: ${res.status} ${t}`); }
  console.log('  Published entity customizations');
}

async function main() {
  console.log(`Adding ${FIELD} to ${ENTITY} …`);
  const token = await getToken();
  if (await fieldExists(token)) {
    console.log(`  Field ${FIELD} already exists — skipping`);
    return;
  }
  await createField(token);
  await publishEntity(token);
  console.log('Done');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
