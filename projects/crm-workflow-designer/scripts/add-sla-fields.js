'use strict';

/**
 * add-sla-fields.js  —  DP-2 SLA / Escalation schema provisioning.
 *
 * Creates, idempotently, on the LIVE org:
 *   - 4 GLOBAL option sets: qdb_sladurationunit, qdb_slabasis,
 *     qdb_escalationaction, qdb_escalationtargettype
 *   - 11 fields on qdb_work_item_steps:
 *       qdb_sla_enabled (Boolean), qdb_sla_duration (Integer),
 *       qdb_sla_duration_unit (global Picklist), qdb_sla_basis (global Picklist),
 *       qdb_sla_warning_pct (Integer), qdb_escalation_enabled (Boolean),
 *       qdb_escalation_action (global Picklist), qdb_escalation_target_type (global Picklist),
 *       qdb_escalation_user (Lookup -> systemuser), qdb_escalation_team (Lookup -> team),
 *       qdb_escalation_role (Lookup -> qdb_role)
 *
 * These fields are the CWFD-005 runtime contract. Config-only — nothing here
 * enforces SLAs. Option-set integer codes MUST match src/types/WorkflowTypes.ts.
 *
 * Usage (all identity from the environment — see crm-api-client.js):
 *   $env:AZURE_TENANT_ID="…"; $env:AZURE_CLIENT_ID="…";
 *   $env:AZURE_CLIENT_SECRET="…"; $env:DATAVERSE_URL="https://org…dynamics.com";
 *   node scripts/add-sla-fields.js
 */

const { loadCrmConfig, getToken, buildHeaders } = require('./crm-api-client');
const CODES = require('./sla-option-codes');

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

// --- Global option sets (codes MUST match WorkflowTypes.ts) ---

const GLOBAL_OPTION_SETS = [
  {
    name: 'qdb_sladurationunit', display: 'SLA Duration Unit',
    options: [
      [CODES.SLA_DURATION_UNIT.Hours, 'Hours'],
      [CODES.SLA_DURATION_UNIT.CalendarDays, 'Calendar Days'],
      [CODES.SLA_DURATION_UNIT.BusinessDays, 'Business Days'],
    ],
  },
  {
    name: 'qdb_slabasis', display: 'SLA Basis',
    options: [
      [CODES.SLA_BASIS.TaskCreated, 'Task Created'],
      [CODES.SLA_BASIS.TaskAssigned, 'Task Assigned'],
      [CODES.SLA_BASIS.PreviousStepCompleted, 'Previous Step Completed'],
    ],
  },
  {
    name: 'qdb_escalationaction', display: 'Escalation Action',
    options: [
      [CODES.ESCALATION_ACTION.Reassign, 'Reassign'],
      [CODES.ESCALATION_ACTION.Notify, 'Notify'],
      [CODES.ESCALATION_ACTION.Flag, 'Flag'],
      [CODES.ESCALATION_ACTION.ReassignAndNotify, 'Reassign and Notify'],
    ],
  },
  {
    name: 'qdb_escalationtargettype', display: 'Escalation Target Type',
    options: [
      [CODES.ESCALATION_TARGET_TYPE.SpecificUser, 'Specific User'],
      [CODES.ESCALATION_TARGET_TYPE.SpecificTeam, 'Specific Team'],
      [CODES.ESCALATION_TARGET_TYPE.ManagerOfAssignee, 'Manager of Assignee'],
      [CODES.ESCALATION_TARGET_TYPE.Role, 'Role'],
    ],
  },
];

// --- Scalar fields (boolean / integer / global picklist) ---

const BOOLEAN_FIELDS = [
  { logical: 'qdb_sla_enabled', schema: 'qdb_SLA_Enabled', display: 'SLA Enabled' },
  { logical: 'qdb_escalation_enabled', schema: 'qdb_Escalation_Enabled', display: 'Escalation Enabled' },
];

const INTEGER_FIELDS = [
  { logical: 'qdb_sla_duration', schema: 'qdb_SLA_Duration', display: 'SLA Duration', min: 1, max: 2147483647 },
  { logical: 'qdb_sla_warning_pct', schema: 'qdb_SLA_Warning_Pct', display: 'Warning Threshold (%)', min: 1, max: 99 },
];

const PICKLIST_FIELDS = [
  { logical: 'qdb_sla_duration_unit', schema: 'qdb_SLA_Duration_Unit', display: 'SLA Duration Unit', optionSet: 'qdb_sladurationunit' },
  { logical: 'qdb_sla_basis', schema: 'qdb_SLA_Basis', display: 'SLA Clock Basis', optionSet: 'qdb_slabasis' },
  { logical: 'qdb_escalation_action', schema: 'qdb_Escalation_Action', display: 'Escalation Action', optionSet: 'qdb_escalationaction' },
  { logical: 'qdb_escalation_target_type', schema: 'qdb_Escalation_Target_Type', display: 'Escalation Target Type', optionSet: 'qdb_escalationtargettype' },
];

const LOOKUP_FIELDS = [
  { logical: 'qdb_escalationuser', schema: 'qdb_EscalationUser', display: 'Escalation User', target: 'systemuser', relationship: 'qdb_escalationuser_workitemstep' },
  { logical: 'qdb_escalationteam', schema: 'qdb_EscalationTeam', display: 'Escalation Team', target: 'team', relationship: 'qdb_escalationteam_workitemstep' },
  { logical: 'qdb_escalationrole', schema: 'qdb_EscalationRole', display: 'Escalation Role', target: 'qdb_role', relationship: 'qdb_escalationrole_workitemstep' },
];

// --- Existence checks (idempotency) ---

async function optionSetExists(apiBase, token, name) {
  const res = await fetch(`${apiBase}/GlobalOptionSetDefinitions(Name='${name}')`, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Option-set check ${res.status}: ${await res.text()}`);
}

async function fieldExists(apiBase, token, logical) {
  const res = await fetch(`${apiBase}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logical}')`, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Field check ${res.status}: ${await res.text()}`);
}

// --- Creators ---

async function post(apiBase, token, path, body) {
  const res = await fetch(`${apiBase}/${path}`, { method: 'POST', headers: buildHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
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

function attributesPath() {
  return `EntityDefinitions(LogicalName='${ENTITY}')/Attributes`;
}

async function createBooleanField(apiBase, token, f) {
  await post(apiBase, token, attributesPath(), {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    AttributeType: 'Boolean',
    AttributeTypeName: { Value: 'BooleanType' },
    SchemaName: f.schema,
    LogicalName: f.logical,
    DisplayName: label(f.display),
    RequiredLevel: { Value: 'None' },
    DefaultValue: false,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: optionLabel('Yes') },
      FalseOption: { Value: 0, Label: optionLabel('No') },
    },
  });
}

async function createIntegerField(apiBase, token, f) {
  await post(apiBase, token, attributesPath(), {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    AttributeType: 'Integer',
    AttributeTypeName: { Value: 'IntegerType' },
    SchemaName: f.schema,
    LogicalName: f.logical,
    DisplayName: label(f.display),
    RequiredLevel: { Value: 'None' },
    MinValue: f.min,
    MaxValue: f.max,
  });
}

async function optionSetMetadataId(apiBase, token, name) {
  const res = await fetch(`${apiBase}/GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Option-set id lookup ${res.status}: ${await res.text()}`);
  const { MetadataId } = await res.json();
  return MetadataId;
}

async function createPicklistField(apiBase, token, f) {
  // A global option set must be bound by its MetadataId (GUID), not by Name.
  const metadataId = await optionSetMetadataId(apiBase, token, f.optionSet);
  await post(apiBase, token, attributesPath(), {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType: 'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName: f.schema,
    LogicalName: f.logical,
    DisplayName: label(f.display),
    RequiredLevel: { Value: 'None' },
    'GlobalOptionSet@odata.bind': `/GlobalOptionSetDefinitions(${metadataId})`,
  });
}

async function createLookupField(apiBase, token, f) {
  await post(apiBase, token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: f.relationship,
    ReferencedEntity: f.target,
    ReferencingEntity: ENTITY,
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: f.schema,
      LogicalName: f.logical,
      DisplayName: label(f.display),
      RequiredLevel: { Value: 'None' },
    },
  });
}

// --- Orchestration ---

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

async function ensureField(apiBase, token, f, creator) {
  if (await fieldExists(apiBase, token, f.logical)) {
    console.log(`  field ${f.logical} — exists`);
  } else {
    await creator(apiBase, token, f);
    console.log(`  field ${f.logical} — created`);
  }
}

async function run() {
  console.log('\n══ DP-2 — Provision SLA/escalation schema on qdb_work_item_steps ══\n');
  const config = loadCrmConfig();
  const token = await getToken(config);
  console.log('  token acquired\n');

  console.log('  Global option sets:');
  await ensureOptionSets(config.apiBase, token);

  console.log('\n  Fields:');
  for (const f of BOOLEAN_FIELDS) await ensureField(config.apiBase, token, f, createBooleanField);
  for (const f of INTEGER_FIELDS) await ensureField(config.apiBase, token, f, createIntegerField);
  for (const f of PICKLIST_FIELDS) await ensureField(config.apiBase, token, f, createPicklistField);
  for (const f of LOOKUP_FIELDS) await ensureField(config.apiBase, token, f, createLookupField);

  console.log('\n══ Done. Publish customizations in the org to expose the new fields. ══\n');
}

run().catch((err) => {
  console.error('\n[FATAL]', err.message ?? err);
  process.exit(1);
});
