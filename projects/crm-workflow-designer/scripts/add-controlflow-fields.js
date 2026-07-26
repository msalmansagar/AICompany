'use strict';

/**
 * add-controlflow-fields.js  —  DP-1 parallel (AND) gateway schema.
 *
 * Provisions, idempotently, on the LIVE org, the control-flow semantics on
 * qdb_work_item_steps:
 *   - 2 GLOBAL option sets (qdb_splittype, qdb_jointype)
 *   - 2 picklist fields   (qdb_splittype, qdb_jointype)
 *
 * Both columns are nullable with no default. A null reads back as
 * Exclusive/None, which is the compatibility guarantee: every step that predates
 * DP-1 keeps exactly the behaviour it has today, and no backfill is needed.
 *
 * Option-set integer codes MUST match src/types/WorkflowTypes.ts (via
 * controlflow-option-codes.js). Config-only — nothing here executes anything;
 * these fields are the contract the future CWFD-005 runtime reads. A process
 * that uses them cannot currently be published (ADR-1-003).
 *
 * Usage (identity from the environment — see crm-api-client.js):
 *   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
 *   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://org…dynamics.com";
 *   node scripts/add-controlflow-fields.js
 */

const { loadCrmConfig, getToken, buildHeaders } = require('./crm-api-client');
const CODES = require('./controlflow-option-codes');

const ENTITY = 'qdb_work_item_steps';
const LANG = Number(process.env.DATAVERSE_LANG ?? 1033);

function label(text) {
  return {
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }],
    UserLocalizedLabel: { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG },
  };
}

function optionLabel(text) {
  return { LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }] };
}

// The global option sets are named distinctly from the columns that bind them.
// Sharing a string between a global option-set name and an attribute logical name
// is probably legal, but "probably" is not worth discovering against a live org.
const GLOBAL_OPTION_SETS = [
  {
    name: 'qdb_gatewaysplittype', display: 'Split Type',
    options: [
      [CODES.SPLIT_TYPE.Exclusive, 'Exclusive'],
      [CODES.SPLIT_TYPE.Parallel, 'Parallel'],
    ],
  },
  {
    name: 'qdb_gatewayjointype', display: 'Join Type',
    options: [
      [CODES.JOIN_TYPE.None, 'None'],
      [CODES.JOIN_TYPE.AndJoin, 'Wait For All Branches'],
    ],
  },
];

// Dataverse derives a column's logical name from its SchemaName, so LogicalName
// is stated explicitly here and matches the string the adapters read — the trap
// DP-2 hit with qdb_escalation_user vs qdb_escalationuser.
const PICKLIST_FIELDS = [
  {
    logical: 'qdb_splittype', schema: 'qdb_SplitType', optionSet: 'qdb_gatewaysplittype',
    display: 'Split Type',
    description: 'How this step’s outcomes relate: Exclusive (one branch is taken) or Parallel (all branches run concurrently).',
  },
  {
    logical: 'qdb_jointype', schema: 'qdb_JoinType', optionSet: 'qdb_gatewayjointype',
    display: 'Join Type',
    description: 'Whether this step waits for all inbound concurrent branches before it starts.',
  },
];

async function post(apiBase, token, path, body) {
  const res = await fetch(`${apiBase}/${path}`, { method: 'POST', headers: buildHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
}

async function optionSetExists(apiBase, token, name) {
  const res = await fetch(`${apiBase}/GlobalOptionSetDefinitions(Name='${name}')`, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Option-set check ${res.status}: ${await res.text()}`);
}

async function fieldExists(apiBase, token, entity, logical) {
  const res = await fetch(
    `${apiBase}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${logical}')`,
    { headers: buildHeaders(token) }
  );
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Field check ${res.status}: ${await res.text()}`);
}

async function optionSetMetadataId(apiBase, token, name) {
  const res = await fetch(`${apiBase}/GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Option-set id lookup ${res.status}: ${await res.text()}`);
  const { MetadataId } = await res.json();
  return MetadataId;
}

async function createGlobalOptionSet(apiBase, token, def) {
  await post(apiBase, token, 'GlobalOptionSetDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    Name: def.name,
    DisplayName: label(def.display),
    IsGlobal: true,
    OptionSetType: 'Picklist',
    Options: def.options.map(([value, text]) => ({ Value: value, Label: optionLabel(text) })),
  });
}

async function createPicklistField(apiBase, token, entity, field) {
  // A global option set must be bound by its MetadataId (GUID), not by Name.
  const metadataId = await optionSetMetadataId(apiBase, token, field.optionSet);
  await post(apiBase, token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType: 'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName: field.schema,
    LogicalName: field.logical,
    DisplayName: label(field.display),
    Description: label(field.description),
    RequiredLevel: { Value: 'None' },
    'GlobalOptionSet@odata.bind': `/GlobalOptionSetDefinitions(${metadataId})`,
  });
}

async function ensureOptionSets(apiBase, token) {
  for (const def of GLOBAL_OPTION_SETS) {
    if (await optionSetExists(apiBase, token, def.name)) {
      console.log(`  option set ${def.name} — exists`);
    } else {
      await createGlobalOptionSet(apiBase, token, def);
      console.log(`  option set ${def.name} — created`);
    }
  }
}

async function ensureFields(apiBase, token) {
  for (const field of PICKLIST_FIELDS) {
    if (await fieldExists(apiBase, token, ENTITY, field.logical)) {
      console.log(`  field ${field.logical} — exists`);
    } else {
      await createPicklistField(apiBase, token, ENTITY, field);
      console.log(`  field ${field.logical} — created`);
    }
  }
}

async function run() {
  console.log('\n══ DP-1 — Provision control-flow schema on qdb_work_item_steps ══\n');
  const config = loadCrmConfig();
  const token = await getToken(config);
  console.log('  token acquired\n');

  console.log('  Global option sets:');
  await ensureOptionSets(config.apiBase, token);

  console.log('\n  Fields:');
  await ensureFields(config.apiBase, token);

  console.log('\n══ Done. Publish customizations in the org to expose the new fields. ══\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
