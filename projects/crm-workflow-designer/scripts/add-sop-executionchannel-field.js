'use strict';

// Creates qdb_executionchannel (Text, max 20) on qdb_sopstep.
// Safe to re-run — skips silently if field already exists.
// Identity values come from the environment — see crm-api-client.js.
// Usage:
//   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
//   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://…";
//   node scripts/add-sop-executionchannel-field.js

const { loadCrmConfig, getToken, buildHeaders } = require('./crm-api-client');

const ENTITY = 'qdb_sopstep';
const FIELD  = 'qdb_executionchannel';
const SCHEMA = 'qdb_ExecutionChannel';

async function fieldExists(apiBase, token) {
  const res = await fetch(
    `${apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${FIELD}')`,
    { headers: buildHeaders(token) }
  );
  return res.ok;
}

async function createField(apiBase, token) {
  const body = {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: SCHEMA,
    LogicalName: FIELD,
    MaxLength: 20,
    FormatName: { Value: 'Text' },
    DisplayName: { LocalizedLabels: [{ Label: 'Execution Channel', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'None' },
  };
  const res = await fetch(
    `${apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`,
    {
      method: 'POST',
      headers: buildHeaders(token, { 'MSCRM.SolutionName': 'qdb_solution' }),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Create field failed: ${res.status} ${await res.text()}`);
  console.log(`  Created ${FIELD} on ${ENTITY}`);
}

async function publishEntity(apiBase, token) {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const res = await fetch(`${apiBase}/PublishXml`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) throw new Error(`Publish failed: ${res.status} ${await res.text()}`);
  console.log('  Published entity customizations');
}

async function main() {
  console.log(`Adding ${FIELD} to ${ENTITY} …`);
  const config = loadCrmConfig();
  const token = await getToken(config);
  if (await fieldExists(config.apiBase, token)) {
    console.log(`  Field ${FIELD} already exists — skipping`);
    return;
  }
  await createField(config.apiBase, token);
  await publishEntity(config.apiBase, token);
  console.log('Done');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
