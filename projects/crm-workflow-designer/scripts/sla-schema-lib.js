'use strict';

/**
 * sla-schema-lib.js  —  reusable SLA / escalation schema provisioning.
 *
 * Single source of truth for the SLA/escalation schema SHAPE. Both the process
 * step (qdb_work_item_steps) and the SOP step (qdb_sopstep) share the identical
 * set of 11 config fields and the same 4 GLOBAL option sets; only the target
 * entity and the (globally-unique) relationship schema names differ.
 *
 * The 4 global option sets are created once and reused across entities —
 * ensureOptionSets is idempotent, so a second caller simply finds them present.
 *
 * Option-set integer codes MUST match src/types/WorkflowTypes.ts (via
 * sla-option-codes.js). Config-only — nothing here enforces SLAs; these fields
 * are the CWFD-005 runtime contract.
 */

const { buildHeaders } = require('./crm-api-client');
const CODES = require('./sla-option-codes');

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

// --- Scalar fields (entity-independent: same logical + schema names everywhere) ---

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

/**
 * The lookup fields share logical + attribute schema names across entities
 * (attribute schema names are entity-scoped), but the RELATIONSHIP schema name
 * must be globally unique — hence the per-entity suffix.
 */
function lookupFields(relationshipSuffix) {
  return [
    { logical: 'qdb_escalationuser', schema: 'qdb_EscalationUser', display: 'Escalation User', target: 'systemuser', relationship: `qdb_escalationuser_${relationshipSuffix}` },
    { logical: 'qdb_escalationteam', schema: 'qdb_EscalationTeam', display: 'Escalation Team', target: 'team', relationship: `qdb_escalationteam_${relationshipSuffix}` },
    { logical: 'qdb_escalationrole', schema: 'qdb_EscalationRole', display: 'Escalation Role', target: 'qdb_role', relationship: `qdb_escalationrole_${relationshipSuffix}` },
  ];
}

// --- Existence checks (idempotency) ---

async function optionSetExists(apiBase, token, name) {
  const res = await fetch(`${apiBase}/GlobalOptionSetDefinitions(Name='${name}')`, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Option-set check ${res.status}: ${await res.text()}`);
}

async function fieldExists(apiBase, token, entity, logical) {
  const res = await fetch(`${apiBase}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${logical}')`, { headers: buildHeaders(token) });
  if (res.status === 404) return false;
  if (res.ok) return true;
  throw new Error(`Field check ${res.status}: ${await res.text()}`);
}

// --- Creators ---

async function post(apiBase, token, path, body) {
  const res = await fetch(`${apiBase}/${path}`, { method: 'POST', headers: buildHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
}

function attributesPath(entity) {
  return `EntityDefinitions(LogicalName='${entity}')/Attributes`;
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

async function createBooleanField(apiBase, token, entity, f) {
  await post(apiBase, token, attributesPath(entity), {
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

async function createIntegerField(apiBase, token, entity, f) {
  await post(apiBase, token, attributesPath(entity), {
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

async function createPicklistField(apiBase, token, entity, f) {
  // A global option set must be bound by its MetadataId (GUID), not by Name.
  const metadataId = await optionSetMetadataId(apiBase, token, f.optionSet);
  await post(apiBase, token, attributesPath(entity), {
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

async function createLookupField(apiBase, token, entity, f) {
  await post(apiBase, token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: f.relationship,
    ReferencedEntity: f.target,
    ReferencingEntity: entity,
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

async function ensureField(apiBase, token, entity, f, creator) {
  if (await fieldExists(apiBase, token, entity, f.logical)) {
    console.log(`  field ${f.logical} — exists`);
  } else {
    await creator(apiBase, token, entity, f);
    console.log(`  field ${f.logical} — created`);
  }
}

/**
 * Provision the full SLA/escalation schema on one entity.
 * @param {{apiBase: string}} config  resolved CRM config (from loadCrmConfig)
 * @param {string} token              bearer token
 * @param {string} entity             target entity logical name
 * @param {string} relationshipSuffix per-entity suffix for lookup relationships
 */
async function provisionSlaSchema(config, token, entity, relationshipSuffix) {
  console.log('  Global option sets:');
  await ensureOptionSets(config.apiBase, token);

  console.log('\n  Fields:');
  for (const f of BOOLEAN_FIELDS) await ensureField(config.apiBase, token, entity, f, createBooleanField);
  for (const f of INTEGER_FIELDS) await ensureField(config.apiBase, token, entity, f, createIntegerField);
  for (const f of PICKLIST_FIELDS) await ensureField(config.apiBase, token, entity, f, createPicklistField);
  for (const f of lookupFields(relationshipSuffix)) await ensureField(config.apiBase, token, entity, f, createLookupField);
}

module.exports = {
  GLOBAL_OPTION_SETS,
  BOOLEAN_FIELDS,
  INTEGER_FIELDS,
  PICKLIST_FIELDS,
  lookupFields,
  provisionSlaSchema,
};
