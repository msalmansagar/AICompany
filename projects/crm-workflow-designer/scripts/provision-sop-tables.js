'use strict';

/**
 * provision-sop-tables.js
 *
 * Creates all Dataverse tables and relationships required for CWFD-002 SOP Designer.
 * Safe to re-run — each step checks for existing objects and skips if already present.
 *
 * Tables created:
 *   qdb_role         — Roles (name, description, department)
 *   qdb_sop          — SOPs (name, description, purpose, status, version)
 *   qdb_sopstep      — SOP Steps (name, description, sequenceno, sop_id lookup, role_id lookup)
 *   qdb_sopoutcome   — SOP Outcomes (name, sequenceno, sopstep_id, nextsopstep_id)
 *
 * Modified tables:
 *   qdb_work_item_record_type — adds qdb_sop_id lookup (nullable)
 *
 * Global option sets created:
 *   qdb_sopstatus    — Draft / Published / Retired
 *
 * Usage:
 *   $env:AZURE_CLIENT_SECRET="..."; node scripts/provision-sop-tables.js
 */

const TENANT_ID     = process.env.AZURE_TENANT_ID     ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const ORG_URL       = process.env.CRM_ORG_URL         ?? 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${ORG_URL}/api/data/v9.2`;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken() {
  if (!CLIENT_SECRET) {
    console.error('[FATAL] AZURE_CLIENT_SECRET env var is required.');
    process.exit(1);
  }
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

function hdrs(token) {
  return {
    Authorization:      `Bearer ${token}`,
    'Content-Type':     'application/json; charset=utf-8',
    'OData-Version':    '4.0',
    'OData-MaxVersion': '4.0',
    Accept:             'application/json',
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: hdrs(token) });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(token, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method:  'POST',
    headers: hdrs(token),
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function apiPostAttr(token, entityLogical, body) {
  return apiPost(token, `EntityDefinitions(LogicalName='${entityLogical}')/Attributes`, body);
}

// ── Label helpers ─────────────────────────────────────────────────────────────

function lbl(text) {
  return {
    LocalizedLabels:    [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
    UserLocalizedLabel: { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  };
}

function optionLbl(text) {
  return { LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] };
}

// ── Attribute builders ────────────────────────────────────────────────────────

function primaryTextAttr(schemaName, displayName, maxLength = 100) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    AttributeType:     'String',
    AttributeTypeName: { Value: 'StringType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    DisplayName:       lbl(displayName),
    RequiredLevel:     { Value: 'ApplicationRequired' },
    MaxLength:         maxLength,
    FormatName:        { Value: 'Text' },
    IsPrimaryName:     true,
  };
}

function textAttr(schemaName, displayName, maxLength = 200, required = false) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    AttributeType:     'String',
    AttributeTypeName: { Value: 'StringType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    DisplayName:       lbl(displayName),
    RequiredLevel:     { Value: required ? 'ApplicationRequired' : 'None' },
    MaxLength:         maxLength,
    FormatName:        { Value: 'Text' },
  };
}

function memoAttr(schemaName, displayName) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    AttributeType:     'Memo',
    AttributeTypeName: { Value: 'MemoType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    DisplayName:       lbl(displayName),
    RequiredLevel:     { Value: 'None' },
    MaxLength:         2000,
    Format:            'TextArea',
  };
}

function intAttr(schemaName, displayName, required = false) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    AttributeType:     'Integer',
    AttributeTypeName: { Value: 'IntegerType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    DisplayName:       lbl(displayName),
    RequiredLevel:     { Value: required ? 'ApplicationRequired' : 'None' },
    Format:            'None',
    MinValue:          0,
    MaxValue:          2147483647,
  };
}

function picklistAttrWithId(schemaName, displayName, globalOptionSetMetadataId, defaultValue) {
  return {
    '@odata.type':                'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType:                'Picklist',
    AttributeTypeName:            { Value: 'PicklistType' },
    SchemaName:                   schemaName,
    LogicalName:                  schemaName.toLowerCase(),
    DisplayName:                  lbl(displayName),
    RequiredLevel:                { Value: 'None' },
    DefaultFormValue:             defaultValue,
    'GlobalOptionSet@odata.bind': `/GlobalOptionSetDefinitions(${globalOptionSetMetadataId})`,
  };
}

// ── Existence checks ──────────────────────────────────────────────────────────

async function entityExists(token, logicalName) {
  try {
    await apiGet(token, `EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName`);
    return true;
  } catch {
    return false;
  }
}

async function optionSetExists(token, name) {
  try {
    await apiGet(token, `GlobalOptionSetDefinitions(Name='${name}')?$select=Name`);
    return true;
  } catch {
    return false;
  }
}

async function attributeExists(token, entityLogical, attrLogical) {
  try {
    await apiGet(token, `EntityDefinitions(LogicalName='${entityLogical}')/Attributes(LogicalName='${attrLogical}')?$select=LogicalName`);
    return true;
  } catch {
    return false;
  }
}

async function relationshipExists(token, schemaName) {
  try {
    const res = await apiGet(token, `RelationshipDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return (res.value ?? []).length > 0;
  } catch {
    return false;
  }
}

// ── Creation helpers ──────────────────────────────────────────────────────────

async function createGlobalOptionSet(token, name, displayName, options) {
  if (await optionSetExists(token, name)) {
    console.log(`  [SKIP] Option set '${name}' already exists.`);
    return;
  }
  console.log(`  Creating option set '${name}'…`);
  await apiPost(token, 'GlobalOptionSetDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    Name:          name,
    DisplayName:   lbl(displayName),
    OptionSetType: 'Picklist',
    IsGlobal:      true,
    Options:       options.map(({ value, label }) => ({
      Value:       value,
      Label:       optionLbl(label),
      Description: optionLbl(''),
    })),
  });
  console.log(`  [OK] Option set '${name}' created.`);
}

async function getOptionSetMetadataId(token, name) {
  const res = await apiGet(token, `GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`);
  if (!res.MetadataId) throw new Error(`Option set '${name}' not found.`);
  return res.MetadataId;
}

async function createEntity(token, logicalName, displayName, collectionName, attributes) {
  if (await entityExists(token, logicalName)) {
    console.log(`  [SKIP] Entity '${logicalName}' already exists.`);
    return;
  }
  console.log(`  Creating entity '${logicalName}'…`);
  await apiPost(token, 'EntityDefinitions', {
    '@odata.type':         'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName:            logicalName.replace('qdb_', 'qdb_').replace(/^(.)/, (m) => m),
    LogicalName:           logicalName,
    DisplayName:           lbl(displayName),
    DisplayCollectionName: lbl(collectionName),
    Description:           lbl(''),
    OwnershipType:         'UserOwned',
    IsActivity:            false,
    HasActivities:         false,
    HasNotes:              false,
    Attributes:            attributes,
  });
  console.log(`  [OK] Entity '${logicalName}' created.`);
}

async function addAttribute(token, entityLogical, attr) {
  const attrLogical = attr.LogicalName ?? attr.SchemaName.toLowerCase();
  if (await attributeExists(token, entityLogical, attrLogical)) {
    console.log(`  [SKIP] Attribute '${attrLogical}' on '${entityLogical}' already exists.`);
    return;
  }
  console.log(`  Adding attribute '${attrLogical}' to '${entityLogical}'…`);
  await apiPostAttr(token, entityLogical, attr);
  console.log(`  [OK] Attribute '${attrLogical}' added.`);
}

async function createOneToManyRelationship(
  token, schemaName, referencedEntity, referencingEntity,
  lookupSchemaName, lookupDisplayName, required = false
) {
  if (await relationshipExists(token, schemaName)) {
    console.log(`  [SKIP] Relationship '${schemaName}' already exists.`);
    return;
  }
  console.log(`  Creating relationship '${schemaName}' (${referencedEntity} → ${referencingEntity}.${lookupSchemaName.toLowerCase()})…`);
  await apiPost(token, 'RelationshipDefinitions', {
    '@odata.type':      'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName:         schemaName,
    ReferencedEntity:   referencedEntity,
    ReferencingEntity:  referencingEntity,
    CascadeConfiguration: {
      Assign:   'NoCascade',
      Delete:   'RemoveLink',
      Merge:    'NoCascade',
      Reparent: 'NoCascade',
      Share:    'NoCascade',
      Unshare:  'NoCascade',
    },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName:    lookupSchemaName,
      LogicalName:   lookupSchemaName.toLowerCase(),
      DisplayName:   lbl(lookupDisplayName),
      RequiredLevel: { Value: required ? 'ApplicationRequired' : 'None' },
    },
  });
  console.log(`  [OK] Relationship '${schemaName}' created.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  CWFD-002 — SOP Designer Table Provisioning');
  console.log(`  Target: ${ORG_URL}`);
  console.log('════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('  Token acquired.\n');

  // ── Step 1: Global option sets ───────────────────────────────────────────
  console.log('── Step 1: Global Option Sets ──');
  await createGlobalOptionSet(token, 'qdb_sopstatus', 'SOP Status', [
    { value: 100000000, label: 'Draft' },
    { value: 100000001, label: 'Published' },
    { value: 100000002, label: 'Retired' },
  ]);
  console.log();

  // ── Step 2: Create qdb_role ──────────────────────────────────────────────
  console.log('── Step 2: qdb_role ──');
  await createEntity(token, 'qdb_role', 'Role', 'Roles', [
    primaryTextAttr('qdb_name', 'Name', 100),
    memoAttr('qdb_description', 'Description'),
    textAttr('qdb_department', 'Department', 100),
  ]);
  console.log();

  // ── Step 3: Create qdb_sop ───────────────────────────────────────────────
  console.log('── Step 3: qdb_sop ──');
  await createEntity(token, 'qdb_sop', 'SOP', 'SOPs', [
    primaryTextAttr('qdb_name', 'Name', 200),
    memoAttr('qdb_description', 'Description'),
    memoAttr('qdb_purpose', 'Purpose'),
    textAttr('qdb_version', 'Version', 20),
  ]);
  // Add qdb_status picklist: global option set binding requires MetadataId (not Name)
  console.log(`  Fetching qdb_sopstatus MetadataId…`);
  const sopStatusId = await getOptionSetMetadataId(token, 'qdb_sopstatus');
  console.log(`  MetadataId: ${sopStatusId}`);
  await addAttribute(token, 'qdb_sop', picklistAttrWithId('qdb_status', 'Status', sopStatusId, 100000000));
  console.log();

  // ── Step 4: Create qdb_sopstep ───────────────────────────────────────────
  console.log('── Step 4: qdb_sopstep ──');
  await createEntity(token, 'qdb_sopstep', 'SOP Step', 'SOP Steps', [
    primaryTextAttr('qdb_name', 'Name', 200),
    memoAttr('qdb_description', 'Description'),
    intAttr('qdb_sequenceno', 'Sequence No', true),
  ]);
  console.log();

  // ── Step 5: Create qdb_sopoutcome ────────────────────────────────────────
  console.log('── Step 5: qdb_sopoutcome ──');
  await createEntity(token, 'qdb_sopoutcome', 'SOP Outcome', 'SOP Outcomes', [
    primaryTextAttr('qdb_name', 'Name', 200),
    intAttr('qdb_sequenceno', 'Sequence No', true),
  ]);
  console.log();

  // ── Step 6: Relationships ─────────────────────────────────────────────────
  console.log('── Step 6: Relationships ──');

  // qdb_sop.qdb_recordtype_id → qdb_work_item_record_type (which process type does this SOP cover?)
  await createOneToManyRelationship(
    token,
    'qdb_work_item_record_type_qdb_sop_recordtype',
    'qdb_work_item_record_type',
    'qdb_sop',
    'qdb_recordtype_id',
    'Record Type',
    false
  );

  // qdb_sopstep.qdb_sop_id → qdb_sop (parent SOP)
  await createOneToManyRelationship(
    token,
    'qdb_sop_qdb_sopstep_sop_id',
    'qdb_sop',
    'qdb_sopstep',
    'qdb_sop_id',
    'SOP',
    true
  );

  // qdb_sopstep.qdb_role_id → qdb_role (responsible role)
  await createOneToManyRelationship(
    token,
    'qdb_role_qdb_sopstep_role_id',
    'qdb_role',
    'qdb_sopstep',
    'qdb_role_id',
    'Role',
    false
  );

  // qdb_sopoutcome.qdb_sopstep_id → qdb_sopstep (parent step)
  await createOneToManyRelationship(
    token,
    'qdb_sopstep_qdb_sopoutcome_sopstep_id',
    'qdb_sopstep',
    'qdb_sopoutcome',
    'qdb_sopstep_id',
    'SOP Step',
    true
  );

  // qdb_sopoutcome.qdb_nextsopstep_id → qdb_sopstep (next step in flow)
  await createOneToManyRelationship(
    token,
    'qdb_sopstep_qdb_sopoutcome_nextstep_id',
    'qdb_sopstep',
    'qdb_sopoutcome',
    'qdb_nextsopstep_id',
    'Next SOP Step',
    false
  );

  // qdb_work_item_record_type.qdb_sop_id → qdb_sop (which SOP derived this process?)
  await createOneToManyRelationship(
    token,
    'qdb_sop_qdb_work_item_record_type_sop_id',
    'qdb_sop',
    'qdb_work_item_record_type',
    'qdb_sop_id',
    'Source SOP',
    false
  );

  console.log();
  console.log('════════════════════════════════════════════════════');
  console.log('  All SOP tables provisioned successfully.');
  console.log('  Next step: register C# plugins via Plugin Registration Tool.');
  console.log('════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
