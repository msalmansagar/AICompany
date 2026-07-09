'use strict';

/**
 * add-sop-steptype-field.js
 *
 * Adds qdb_steptypecode (Picklist / OptionSet) to qdb_sopstep.
 * The "_code" suffix follows CRM convention for option-set fields.
 * Safe to re-run — skips creation if the field already exists.
 *
 * Option values:
 *   100000000  Step
 *   100000001  Decision
 *   100000002  Approval
 *   100000003  Milestone
 *   100000004  Manual Activity
 *   100000005  System Activity
 *   100000006  Notification
 *   100000007  Wait State
 *   100000008  Sub-process
 *
 * Usage (all identity values come from the environment — see crm-api-client.js):
 *   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
 *   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://…";
 *   node scripts/add-sop-steptype-field.js
 */

const { loadCrmConfig, getToken, buildHeaders } = require('./crm-api-client');

const ENTITY = 'qdb_sopstep';
const FIELD  = 'qdb_steptypecode';
const SCHEMA = 'qdb_StepTypeCode';

function buildLabel(text) {
  return {
    LocalizedLabels:    [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
    UserLocalizedLabel: { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  };
}

function buildOptionLabel(text) {
  return { LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

async function fieldExists(apiBase, token) {
  const url = `${apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${FIELD}')`;
  const res = await fetch(url, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Field check ${res.status}: ${await res.text()}`);
}

async function createPicklistField(apiBase, token) {
  const url  = `${apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`;
  const body = {
    '@odata.type':     'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType:     'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName:        SCHEMA,
    LogicalName:       FIELD,
    DisplayName:       buildLabel('Step Type'),
    Description:       buildLabel('SOP V2 node type — controls the visual shape and semantics on the SOP canvas.'),
    RequiredLevel:     { Value: 'None' },
    OptionSet: {
      '@odata.type':  'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal:       false,
      OptionSetType:  'Picklist',
      Name:           `${ENTITY}_steptypecode`,
      DisplayName:    buildLabel('Step Type'),
      Options: [
        { Value: 100000000, Label: buildOptionLabel('Step') },
        { Value: 100000001, Label: buildOptionLabel('Decision') },
        { Value: 100000002, Label: buildOptionLabel('Approval') },
        { Value: 100000003, Label: buildOptionLabel('Milestone') },
        { Value: 100000004, Label: buildOptionLabel('Manual Activity') },
        { Value: 100000005, Label: buildOptionLabel('System Activity') },
        { Value: 100000006, Label: buildOptionLabel('Notification') },
        { Value: 100000007, Label: buildOptionLabel('Wait State') },
        { Value: 100000008, Label: buildOptionLabel('Sub-process') },
      ],
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: buildHeaders(token),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create picklist ${res.status}: ${await res.text()}`);
  console.log('  Picklist field created.');
}

async function run() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  SOP V2 — Provision qdb_steptypecode Picklist');
  console.log(`  Entity: ${ENTITY}`);
  console.log(`  Field:  ${FIELD}`);
  console.log('════════════════════════════════════════════════════\n');

  const config = loadCrmConfig();
  console.log('  Acquiring token…');
  const token = await getToken(config);
  console.log('  Token acquired.\n');

  if (await fieldExists(config.apiBase, token)) {
    console.log('  Field already exists — nothing to do.\n');
  } else {
    console.log('  Creating Picklist field with 9 options…');
    await createPicklistField(config.apiBase, token);
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('  qdb_steptypecode Picklist ready on qdb_sopstep.');
  console.log('════════════════════════════════════════════════════\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
