/**
 * DFE-ENH-001 ENT-005 — Append-only field-level audit log entity provisioning.
 *
 * Creates the qdb_dfe_audit_log entity (new, purpose-built — not the existing
 * qdb_form_audit_log) with all columns specified in the Phase 3 architecture.
 * Security role assignment (CREATE + READ only) must be applied via the Dataverse
 * admin portal after entity creation; this script provisions the schema only.
 *
 * SAFE TO RE-RUN — entity existence is checked before creation; attribute
 * existence is checked before each column is created. All columns are optional (None).
 *
 * DO NOT RUN against a production org without change-management approval.
 * The immutability plugin (AuditImmutabilityPlugin.cs) must be registered
 * before any records are written; see PLUGIN-REGISTRATION.md for the step spec.
 *
 * Run:
 *   node --env-file=scripts/.env scripts/provision-dfe-audit-log.mjs
 *
 * Required env vars (all in scripts/.env):
 *   DV_TENANT_ID     — Azure AD tenant GUID
 *   DV_CLIENT_ID     — Service principal application (client) GUID
 *   DV_CLIENT_SECRET — Service principal client secret
 *
 * MSCRM.SolutionUniqueName header is sent on every create (Article XI compliance).
 */

// ---------------------------------------------------------------------------
// Environment + config
// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set (pass --env-file=scripts/.env)`);
  return value;
}

const TENANT_ID     = requireEnv('DV_TENANT_ID');
const CLIENT_ID     = requireEnv('DV_CLIENT_ID');
const CLIENT_SECRET = requireEnv('DV_CLIENT_SECRET');
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'DynamicFormEngine';

// ---------------------------------------------------------------------------
// Domain-specific error types
// ---------------------------------------------------------------------------

class DataverseTokenError extends Error {
  constructor(description) {
    super(`Token acquisition failed: ${description}`);
    this.name = 'DataverseTokenError';
  }
}

class DataverseApiError extends Error {
  constructor(path, detail) {
    super(`POST ${path}: ${detail}`);
    this.name = 'DataverseApiError';
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  const json = await response.json();
  if (!response.ok) throw new DataverseTokenError(json.error_description ?? 'unknown error');
  return json.access_token;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function buildHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
}

async function post(token, path, payload) {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new DataverseApiError(path, json.error?.message ?? response.status);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Existence checks
// ---------------------------------------------------------------------------

async function entityExists(token, logicalName) {
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers: buildHeaders(token) },
  );
  return response.ok;
}

async function attributeExists(token, entity, schemaName) {
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${schemaName}')?$select=LogicalName`,
    { headers: buildHeaders(token) },
  );
  return response.ok;
}

/**
 * Checks whether an attribute already exists and logs a skip message if so.
 * Returns true when the caller should skip creating the attribute.
 */
async function skipIfAttributeExists(token, spec) {
  if (!await attributeExists(token, spec.entity, spec.schemaName)) return false;
  console.log(`  -> ${spec.entity}.${spec.schemaName} (already exists)`);
  return true;
}

// ---------------------------------------------------------------------------
// Label builder
// ---------------------------------------------------------------------------

function buildLabel(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Attribute creators (token + spec parameter object — max 2 params each)
// ---------------------------------------------------------------------------

async function addString(token, spec) {
  if (await skipIfAttributeExists(token, spec)) return;
  await post(token, `EntityDefinitions(LogicalName='${spec.entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: spec.schemaName,
    LogicalName: spec.schemaName,
    MaxLength: spec.maxLength ?? 200,
    RequiredLevel: { Value: 'None' },
    DisplayName: buildLabel(spec.displayName),
  });
  console.log(`  + ${spec.entity}.${spec.schemaName} (String, maxLength=${spec.maxLength ?? 200})`);
}

async function addMemo(token, spec) {
  if (await skipIfAttributeExists(token, spec)) return;
  await post(token, `EntityDefinitions(LogicalName='${spec.entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: spec.schemaName,
    LogicalName: spec.schemaName,
    MaxLength: spec.maxLength ?? 10000,
    RequiredLevel: { Value: 'None' },
    DisplayName: buildLabel(spec.displayName),
  });
  console.log(`  + ${spec.entity}.${spec.schemaName} (Memo, maxLength=${spec.maxLength ?? 10000})`);
}

async function addDateTime(token, spec) {
  if (await skipIfAttributeExists(token, spec)) return;
  await post(token, `EntityDefinitions(LogicalName='${spec.entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: spec.schemaName,
    LogicalName: spec.schemaName,
    Format: 'DateAndTime',
    DateTimeBehavior: { Value: 'UserLocal' },
    RequiredLevel: { Value: 'None' },
    DisplayName: buildLabel(spec.displayName),
  });
  console.log(`  + ${spec.entity}.${spec.schemaName} (DateTime/UTC)`);
}

async function addPicklist(token, spec) {
  if (await skipIfAttributeExists(token, spec)) return;
  await post(token, `EntityDefinitions(LogicalName='${spec.entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: spec.schemaName,
    LogicalName: spec.schemaName,
    RequiredLevel: { Value: 'None' },
    DisplayName: buildLabel(spec.displayName),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: spec.options.map(([value, text]) => ({ Value: value, Label: buildLabel(text) })),
    },
  });
  console.log(`  + ${spec.entity}.${spec.schemaName} (Picklist: ${spec.options.map(([, t]) => t).join(' | ')})`);
}

async function addLookup(token, spec) {
  if (await skipIfAttributeExists(token, spec)) return;
  await post(token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${spec.entity}_${spec.schemaName}_${spec.referencedEntity}`,
    ReferencedEntity: spec.referencedEntity,
    ReferencingEntity: spec.entity,
    ReferencingAttribute: spec.schemaName,
    Lookup: {
      SchemaName: spec.schemaName,
      LogicalName: spec.schemaName,
      DisplayName: buildLabel(spec.displayName),
      RequiredLevel: { Value: 'None' },
    },
  });
  console.log(`  + ${spec.entity}.${spec.schemaName} (Lookup -> ${spec.referencedEntity})`);
}

// ---------------------------------------------------------------------------
// Entity creator
// ---------------------------------------------------------------------------

async function provisionEntity(token) {
  const logicalName = 'qdb_dfe_audit_log';
  if (await entityExists(token, logicalName)) {
    console.log(`Entity ${logicalName} already exists — skipping creation, checking columns.\n`);
    return;
  }
  console.log(`Creating entity: ${logicalName}`);
  await post(token, 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: logicalName,
    LogicalName: logicalName,
    DisplayName: buildLabel('DFE Audit Log'),
    DisplayCollectionName: buildLabel('DFE Audit Logs'),
    Description: buildLabel(
      'Append-only field-level change history for the Dynamic Form Engine designer. ' +
      'ENT-005 (DFE-ENH-001). No UPDATE or DELETE is permitted — enforced by plugin.',
    ),
    OwnershipType: 'OrganizationOwned',
    HasNotes: false,
    HasActivities: false,
    IsActivity: false,
    IsActivityParty: false,
    PrimaryNameAttribute: 'qdb_change_path',
    PrimaryIdAttribute: 'qdb_dfe_audit_logid',
  });
  console.log(`  Created entity ${logicalName}\n`);
}

// ---------------------------------------------------------------------------
// Column group provisioners
// ---------------------------------------------------------------------------

async function provisionLookupColumns(token, entity) {
  console.log('[1] Core relationship columns (Lookups)');
  await addLookup(token, { entity, schemaName: 'qdb_form_id', displayName: 'Form', referencedEntity: 'qdb_form_definition' });
  await addLookup(token, { entity, schemaName: 'qdb_form_version_id', displayName: 'Form Version', referencedEntity: 'qdb_form_version' });
  await addLookup(token, { entity, schemaName: 'qdb_changed_by', displayName: 'Changed By', referencedEntity: 'systemuser' });
}

async function provisionPayloadColumns(token, entity) {
  console.log('\n[2] Payload columns');
  await addString(token, { entity, schemaName: 'qdb_field_schema_name', displayName: 'Field Schema Name', maxLength: 200 });
  await addString(token, { entity, schemaName: 'qdb_change_path', displayName: 'Change Path', maxLength: 512 });
  await addMemo(token, { entity, schemaName: 'qdb_before_value', displayName: 'Before Value', maxLength: 10000 });
  await addMemo(token, { entity, schemaName: 'qdb_after_value', displayName: 'After Value', maxLength: 10000 });
  await addString(token, { entity, schemaName: 'qdb_session_id', displayName: 'Session ID', maxLength: 100 });
}

async function provisionClassificationColumns(token, entity) {
  console.log('\n[3] Classification columns (Picklists)');
  await addPicklist(token, {
    entity, schemaName: 'qdb_action', displayName: 'Action',
    options: [[100000001, 'Create'], [100000002, 'Update'], [100000003, 'Delete']],
  });
  await addPicklist(token, {
    entity, schemaName: 'qdb_event_type', displayName: 'Event Type',
    options: [
      [100000001, 'FieldChange'], [100000002, 'RuleChange'],
      [100000003, 'MappingChange'], [100000004, 'TranslationChange'],
      [100000005, 'FormImport'], [100000006, 'FormPublish'],
      [100000007, 'FormRestore'], [100000008, 'FormChange'],
    ],
  });
}

async function provisionTimestampColumn(token, entity) {
  console.log('\n[4] Timestamp column');
  await addDateTime(token, { entity, schemaName: 'qdb_changed_on', displayName: 'Changed On' });
}

// ---------------------------------------------------------------------------
// Publish helper
// ---------------------------------------------------------------------------

async function publishEntity(token, entityName) {
  console.log('\n[Publish]');
  const xml = `<importexportxml><entities><entity>${entityName}</entity></entities></importexportxml>`;
  await post(token, 'PublishXml', { ParameterXml: xml });
  console.log(`  Published: ${entityName}`);
}

// ---------------------------------------------------------------------------
// Post-run guidance
// ---------------------------------------------------------------------------

function printNextSteps(entity) {
  console.log(`
=== Provisioning complete ===

NEXT STEPS (manual — cannot be scripted):
1. Register AuditImmutabilityPlugin.cs (Pre-Validation, Update + Delete on ${entity})
   See: projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/PLUGIN-REGISTRATION.md
2. Set security roles on ${entity}:
   - All custom DFE roles: CREATE + READ only (no Update, no Delete)
   - System Administrator: no change to role itself (plugin blocks execution regardless)
3. Create indexes in Dataverse admin (recommended, not scriptable via Web API):
   - Composite: qdb_form_id + qdb_changed_on DESC (compliance report query)
   - Composite: qdb_changed_by + qdb_changed_on (user-activity queries)
4. Add ${entity} as a root component in the DynamicFormEngine solution
   if it was not picked up automatically during provisioning.
`);
}

// ---------------------------------------------------------------------------
// Main — pure orchestrator
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== DFE-ENH-001 ENT-005 — provision-dfe-audit-log.mjs ===\n');
  const token = await acquireToken();
  console.log('Token acquired.\n');

  const ENTITY = 'qdb_dfe_audit_log';

  await provisionEntity(token);
  await provisionLookupColumns(token, ENTITY);
  await provisionPayloadColumns(token, ENTITY);
  await provisionClassificationColumns(token, ENTITY);
  await provisionTimestampColumn(token, ENTITY);
  await publishEntity(token, ENTITY);

  printNextSteps(ENTITY);
}

main().catch((error) => {
  console.error('\nProvisioning failed:', error.message);
  process.exit(1);
});
