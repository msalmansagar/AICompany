/**
 * DFE-ENH-001 ENT-005 — Append-only field-level audit log entity provisioning.
 *
 * Creates the qdb_dfe_audit_log entity (new, purpose-built — not the existing
 * qdb_form_audit_log) with all columns specified in the Phase 3 architecture.
 * Security role assignment (CREATE + READ only) must be applied via the Dataverse
 * admin portal after entity creation; this script provisions the schema only.
 *
 * SAFE TO RE-RUN — entity existence is checked before creation; column existence
 * is checked before each attribute is created. All columns are optional (None).
 *
 * DO NOT RUN against a production org without change-management approval.
 * The immutability plugin (AuditImmutabilityPlugin.cs) must be registered
 * before any records are written; see PLUGIN-REGISTRATION.md for the step spec.
 *
 * Run:
 *   node --env-file=scripts/.env scripts/provision-dfe-audit-log.mjs
 *
 * Required env var:
 *   DV_CLIENT_SECRET — Azure AD client-credentials secret for the service principal.
 *
 * MSCRM.SolutionUniqueName header is sent on every create (Article XI compliance).
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'DynamicFormEngine';

if (!CLIENT_SECRET) {
  throw new Error('DV_CLIENT_SECRET not set (pass --env-file=scripts/.env)');
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
  if (!response.ok) throw new Error(json.error_description ?? 'Token acquisition failed');
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
    throw new Error(`POST ${path}: ${json.error?.message ?? response.status}`);
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

async function attrExists(token, entity, schema) {
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${schema}')?$select=LogicalName`,
    { headers: buildHeaders(token) },
  );
  return response.ok;
}

// ---------------------------------------------------------------------------
// Metadata label helpers
// ---------------------------------------------------------------------------

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Attribute creators
// ---------------------------------------------------------------------------

async function addString(token, entity, schemaName, displayName, maxLength = 200) {
  if (await attrExists(token, entity, schemaName)) {
    console.log(`  -> ${entity}.${schemaName} (already exists)`);
    return;
  }
  await post(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: schemaName,
    MaxLength: maxLength,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(displayName),
  });
  console.log(`  + ${entity}.${schemaName} (String, maxLength=${maxLength})`);
}

async function addMemo(token, entity, schemaName, displayName, maxLength = 10000) {
  if (await attrExists(token, entity, schemaName)) {
    console.log(`  -> ${entity}.${schemaName} (already exists)`);
    return;
  }
  await post(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: schemaName,
    MaxLength: maxLength,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(displayName),
  });
  console.log(`  + ${entity}.${schemaName} (Memo, maxLength=${maxLength})`);
}

async function addDateTime(token, entity, schemaName, displayName) {
  if (await attrExists(token, entity, schemaName)) {
    console.log(`  -> ${entity}.${schemaName} (already exists)`);
    return;
  }
  await post(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: schemaName,
    Format: 'DateAndTime',
    DateTimeBehavior: { Value: 'UserLocal' },
    RequiredLevel: { Value: 'None' },
    DisplayName: label(displayName),
  });
  console.log(`  + ${entity}.${schemaName} (DateTime/UTC)`);
}

async function addPicklist(token, entity, schemaName, displayName, options) {
  if (await attrExists(token, entity, schemaName)) {
    console.log(`  -> ${entity}.${schemaName} (already exists)`);
    return;
  }
  await post(token, `EntityDefinitions(LogicalName='${entity}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: schemaName,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(displayName),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: options.map(([value, text]) => ({ Value: value, Label: label(text) })),
    },
  });
  console.log(`  + ${entity}.${schemaName} (Picklist: ${options.map(([, t]) => t).join(' | ')})`);
}

async function addLookup(token, entity, schemaName, displayName, referencedEntity, referencedAttribute) {
  if (await attrExists(token, entity, schemaName)) {
    console.log(`  -> ${entity}.${schemaName} (already exists)`);
    return;
  }
  await post(token, 'RelationshipDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: `${entity}_${schemaName}_${referencedEntity}`,
    ReferencedEntity: referencedEntity,
    ReferencingEntity: entity,
    ReferencingAttribute: schemaName,
    Lookup: {
      SchemaName: schemaName,
      LogicalName: schemaName,
      DisplayName: label(displayName),
      RequiredLevel: { Value: 'None' },
    },
  });
  console.log(`  + ${entity}.${schemaName} (Lookup -> ${referencedEntity}.${referencedAttribute})`);
}

// ---------------------------------------------------------------------------
// Publish helper
// ---------------------------------------------------------------------------

async function publishEntity(token, entityName) {
  const xml = `<importexportxml><entities><entity>${entityName}</entity></entities></importexportxml>`;
  await post(token, 'PublishXml', { ParameterXml: xml });
  console.log(`  Published: ${entityName}`);
}

// ---------------------------------------------------------------------------
// Entity creator
// ---------------------------------------------------------------------------

async function createEntity(token) {
  const logicalName = 'qdb_dfe_audit_log';

  if (await entityExists(token, logicalName)) {
    console.log(`Entity ${logicalName} already exists — skipping entity creation, checking columns.\n`);
    return;
  }

  console.log(`Creating entity: ${logicalName}`);
  await post(token, 'EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: 'qdb_dfe_audit_log',
    LogicalName: 'qdb_dfe_audit_log',
    DisplayName: label('DFE Audit Log'),
    DisplayCollectionName: label('DFE Audit Logs'),
    Description: label(
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== DFE-ENH-001 ENT-005 — provision-dfe-audit-log.mjs ===\n');
  const token = await acquireToken();
  console.log('Token acquired.\n');

  const ENTITY = 'qdb_dfe_audit_log';

  // Step 1: Entity
  await createEntity(token);

  // Step 2: Columns
  // Primary key (qdb_dfe_audit_logid) is auto-created with the entity.
  // Standard audit columns (createdon/createdby/modifiedon/modifiedby) are auto-created.

  console.log('[1] Core relationship columns (Lookups)');
  // qdb_form_id — Lookup to qdb_form_definition
  await addLookup(token, ENTITY, 'qdb_form_id', 'Form', 'qdb_form_definition', 'qdb_form_definitionid');

  // qdb_form_version_id — Lookup to qdb_form_version (optional; null for pre-version saves)
  await addLookup(token, ENTITY, 'qdb_form_version_id', 'Form Version', 'qdb_form_version', 'qdb_form_versionid');

  // qdb_changed_by — Lookup to SystemUser
  await addLookup(token, ENTITY, 'qdb_changed_by', 'Changed By', 'systemuser', 'systemuserid');

  console.log('\n[2] Payload columns');
  // qdb_field_schema_name — field that changed; empty for form-level changes
  await addString(token, ENTITY, 'qdb_field_schema_name', 'Field Schema Name', 200);

  // qdb_change_path — JSON Pointer e.g. /fields/loan_amount/validationRules/0
  await addString(token, ENTITY, 'qdb_change_path', 'Change Path', 512);

  // qdb_before_value — JSON-serialized prior state; null for CREATE actions
  await addMemo(token, ENTITY, 'qdb_before_value', 'Before Value', 10000);

  // qdb_after_value — JSON-serialized new state; null for DELETE actions
  await addMemo(token, ENTITY, 'qdb_after_value', 'After Value', 10000);

  // qdb_session_id — browser session UUID; links entries across a single editing session
  await addString(token, ENTITY, 'qdb_session_id', 'Session ID', 100);

  console.log('\n[3] Classification columns (Picklists)');
  // qdb_action — Create / Update / Delete; derived from immer patch.op
  await addPicklist(token, ENTITY, 'qdb_action', 'Action', [
    [100000001, 'Create'],
    [100000002, 'Update'],
    [100000003, 'Delete'],
  ]);

  // qdb_event_type — high-level classification of what changed
  await addPicklist(token, ENTITY, 'qdb_event_type', 'Event Type', [
    [100000001, 'FieldChange'],
    [100000002, 'RuleChange'],
    [100000003, 'MappingChange'],
    [100000004, 'TranslationChange'],
    [100000005, 'FormImport'],
    [100000006, 'FormPublish'],
    [100000007, 'FormRestore'],
    [100000008, 'FormChange'],
  ]);

  console.log('\n[4] Timestamp column');
  // qdb_changed_on — set client-side at flush time (UTC)
  await addDateTime(token, ENTITY, 'qdb_changed_on', 'Changed On');

  console.log('\n[Publish]');
  await publishEntity(token, ENTITY);

  console.log(`
=== Provisioning complete ===

NEXT STEPS (manual — cannot be scripted):
1. Register AuditImmutabilityPlugin.cs (Pre-Validation, Update + Delete on ${ENTITY})
   See: projects/dynamic-form-engine/crm-plugins/Qdb.FormEngine/PLUGIN-REGISTRATION.md
2. Set security roles on ${ENTITY}:
   - All custom DFE roles: CREATE + READ only (no Update, no Delete)
   - System Administrator: no change to role itself (plugin blocks execution regardless)
3. Create indexes in Dataverse admin (recommended, not scriptable via Web API):
   - Composite: qdb_form_id + qdb_changed_on DESC (compliance report query)
   - Composite: qdb_changed_by + qdb_changed_on (user-activity queries)
4. Add ${ENTITY} as a root component in the DynamicFormEngine solution
   if it was not picked up automatically during provisioning.
`);
}

main().catch((error) => {
  console.error('\nProvisioning failed:', error.message);
  process.exit(1);
});
