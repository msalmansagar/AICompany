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
 * Usage:
 *   $env:AZURE_CLIENT_SECRET="..."; node scripts/add-sop-steptype-field.js
 */

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.CRM_ORG_URL         ?? 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${ORG_URL}/api/data/v9.2`;

const ENTITY  = 'qdb_sopstep';
const FIELD   = 'qdb_steptypecode';
const SCHEMA  = 'qdb_StepTypeCode';

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
  if (!res.ok) throw new Error(`Token error ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

function hdrs(token) {
  return {
    Authorization:      `Bearer ${token}`,
    'Content-Type':     'application/json; charset=utf-8',
    'OData-Version':    '4.0',
    'OData-MaxVersion': '4.0',
    Accept:             'application/json',
  };
}

function lbl(text) {
  return {
    LocalizedLabels:    [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
    UserLocalizedLabel: { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  };
}

function optLbl(text) {
  return { LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

async function fieldExists(token) {
  const url = `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${FIELD}')`;
  const res = await fetch(url, { headers: hdrs(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Field check ${res.status}: ${await res.text()}`);
}

async function createPicklistField(token) {
  const url  = `${API_BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`;
  const body = {
    '@odata.type':     'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType:     'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName:        SCHEMA,
    LogicalName:       FIELD,
    DisplayName:       lbl('Step Type'),
    Description:       lbl('SOP V2 node type — controls the visual shape and semantics on the SOP canvas.'),
    RequiredLevel:     { Value: 'None' },
    OptionSet: {
      '@odata.type':  'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal:       false,
      OptionSetType:  'Picklist',
      Name:           `${ENTITY}_steptypecode`,
      DisplayName:    lbl('Step Type'),
      Options: [
        { Value: 100000000, Label: optLbl('Step') },
        { Value: 100000001, Label: optLbl('Decision') },
        { Value: 100000002, Label: optLbl('Approval') },
        { Value: 100000003, Label: optLbl('Milestone') },
        { Value: 100000004, Label: optLbl('Manual Activity') },
        { Value: 100000005, Label: optLbl('System Activity') },
        { Value: 100000006, Label: optLbl('Notification') },
        { Value: 100000007, Label: optLbl('Wait State') },
        { Value: 100000008, Label: optLbl('Sub-process') },
      ],
    },
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: hdrs(token),
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

  console.log('  Acquiring token…');
  const token = await getToken();
  console.log('  Token acquired.\n');

  if (await fieldExists(token)) {
    console.log('  Field already exists — nothing to do.\n');
  } else {
    console.log('  Creating Picklist field with 9 options…');
    await createPicklistField(token);
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('  qdb_steptypecode Picklist ready on qdb_sopstep.');
  console.log('  Options: Step | Decision | Approval | Milestone |');
  console.log('           Manual Activity | System Activity |');
  console.log('           Notification | Wait State | Sub-process');
  console.log('════════════════════════════════════════════════════\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
