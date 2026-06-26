/**
 * provision-render-cache-schema.mjs
 *
 * Creates qdb_publish_job and qdb_form_render_cache Dataverse entities
 * via the EntityDefinitions Web API for the Publish-Time Render Cache feature.
 *
 * Entities created (in order):
 *   1. qdb_publish_job       — tracks publish/regen job lifecycle
 *   2. qdb_form_render_cache — holds per-language pre-rendered JSON blobs
 *
 * Relationships created:
 *   qdb_publish_job.qdb_form_definition_id         → qdb_form_definition (1:N)
 *   qdb_form_render_cache.qdb_form_definition_id   → qdb_form_definition (1:N)
 *   qdb_form_render_cache.qdb_publish_job_id       → qdb_publish_job (1:N)
 *   qdb_form_render_cache.qdb_published_by         → systemuser (1:N)
 *
 * Alternate key on qdb_form_render_cache:
 *   qdb_render_cache_key over (qdb_form_code, qdb_published_version, qdb_language_code)
 *
 * Run:
 *   node --env-file=scripts/.env scripts/provision-render-cache-schema.mjs
 *
 * Required .env entry:
 *   DV_CLIENT_SECRET=<service-principal-secret>
 */

// ── Guard ─────────────────────────────────────────────────────────────────────

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error(
    'DV_CLIENT_SECRET is not set. ' +
    'Run with: node --env-file=scripts/.env scripts/provision-render-cache-schema.mjs'
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME = 'QdbDynamicFormEngine';
const KEY_POLL_MAX  = 24;      // max polling attempts for alternate key activation
const KEY_POLL_DELAY = 10_000; // 10 s between polls
const ENTITY_SETTLE_MS = 8_000; // wait after entity creation before adding attributes

// ── Auth ──────────────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: DV_CLIENT_SECRET,
    scope:         `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error_description ?? 'Token acquisition failed');
  return json.access_token;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function buildHeaders(token, includeMetadataHeaders = false) {
  const headers = {
    Authorization:      `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version':    '4.0',
    Accept:             'application/json',
    'Content-Type':     'application/json',
  };
  if (includeMetadataHeaders) {
    headers['MSCRM.SolutionUniqueName'] = SOLUTION_NAME;
    headers['Prefer'] = 'return=representation';
  }
  return headers;
}

async function apiGet(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: buildHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPost(token, path, body, isMetadataOperation = false) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method:  'POST',
    headers: buildHeaders(token, isMetadataOperation),
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
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

async function attributeExists(token, entityName, attributeLogicalName) {
  try {
    await apiGet(
      token,
      `EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeLogicalName}')?$select=LogicalName`
    );
    return true;
  } catch {
    return false;
  }
}

async function relationshipExists(token, schemaName) {
  try {
    await apiGet(token, `RelationshipDefinitions(SchemaName='${schemaName}')?$select=SchemaName`);
    return true;
  } catch {
    return false;
  }
}

// ── Label builder ─────────────────────────────────────────────────────────────

function makeLabel(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{
      '@odata.type':  'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label:          text,
      LanguageCode:   1033,
    }],
  };
}

// ── Attribute metadata builders ───────────────────────────────────────────────

function buildStringAttribute(schemaName, displayLabel, maxLength, requiredLevel = 'None') {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    AttributeType:     'String',
    AttributeTypeName: { Value: 'StringType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    MaxLength:         maxLength,
    FormatName:        { Value: 'Text' },
    RequiredLevel:     { Value: requiredLevel },
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
  };
}

function buildMemoAttribute(schemaName, displayLabel, maxLength, requiredLevel = 'None') {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    AttributeType:     'Memo',
    AttributeTypeName: { Value: 'MemoType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    MaxLength:         maxLength,
    Format:            'TextArea',
    RequiredLevel:     { Value: requiredLevel },
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
  };
}

function buildIntegerAttribute(schemaName, displayLabel, requiredLevel = 'None') {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    AttributeType:     'Integer',
    AttributeTypeName: { Value: 'IntegerType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    RequiredLevel:     { Value: requiredLevel },
    MinValue:          -2147483648,
    MaxValue:          2147483647,
    Format:            'None',
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
  };
}

function buildDateTimeAttribute(schemaName, displayLabel) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    AttributeType:     'DateTime',
    AttributeTypeName: { Value: 'DateTimeType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    RequiredLevel:     { Value: 'None' },
    Format:            'DateAndTime',
    DateTimeBehavior:  { Value: 'UserLocal' },
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
  };
}

function buildBooleanAttribute(schemaName, displayLabel, defaultValue = false) {
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    AttributeType:     'Boolean',
    AttributeTypeName: { Value: 'BooleanType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    RequiredLevel:     { Value: 'None' },
    DefaultValue:      defaultValue,
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
        Value: 1,
        Label: makeLabel('Yes'),
      },
      FalseOption: {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
        Value: 0,
        Label: makeLabel('No'),
      },
    },
  };
}

function buildLocalPicklistAttribute(schemaName, displayLabel, options, entitySchemaName) {
  // options: [{ value: number, label: string }, ...]
  // Local (non-global) picklist — OptionSet embedded directly.
  // OptionSet Name must be globally unique in Dataverse even for local optionsets,
  // so we qualify it as <entitySchemaName>_<schemaName> to avoid collisions.
  const optionSetName = entitySchemaName
    ? `${entitySchemaName.toLowerCase()}_${schemaName.toLowerCase()}`
    : schemaName.toLowerCase();
  return {
    '@odata.type':     'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    AttributeType:     'Picklist',
    AttributeTypeName: { Value: 'PicklistType' },
    SchemaName:        schemaName,
    LogicalName:       schemaName.toLowerCase(),
    RequiredLevel:     { Value: 'None' },
    DisplayName:       makeLabel(displayLabel),
    Description:       makeLabel(displayLabel),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal:      false,
      OptionSetType: 'Picklist',
      Name:          optionSetName,
      DisplayName:   makeLabel(displayLabel),
      Options:       options.map((o) => ({
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionMetadata',
        Value:         o.value,
        Label:         makeLabel(o.label),
      })),
    },
  };
}

// Note: File columns (FileAttributeMetadata) are not used in this schema.
// qdb_runtime_json is stored as a Memo (Base64-encoded gzip) for cloud/on-prem portability.

// ── Add attribute if missing ──────────────────────────────────────────────────

async function addAttributeIfMissing(token, entityName, attributeMetadata) {
  const logicalName = attributeMetadata.LogicalName;
  if (await attributeExists(token, entityName, logicalName)) {
    console.log(`  [SKIP] ${entityName}.${logicalName} already exists`);
    return;
  }
  await apiPost(
    token,
    `EntityDefinitions(LogicalName='${entityName}')/Attributes`,
    attributeMetadata,
    true
  );
  console.log(`  [OK]   ${entityName}.${logicalName} created`);
}

// ── Create entity ─────────────────────────────────────────────────────────────

async function createEntityIfMissing(token, schemaName, displayLabel, collectionLabel) {
  if (await entityExists(token, schemaName)) {
    console.log(`  [SKIP] Entity ${schemaName} already exists`);
    return false;
  }
  await apiPost(token, 'EntityDefinitions', {
    '@odata.type':         'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName:            schemaName,
    LogicalName:           schemaName.toLowerCase(),
    DisplayName:           makeLabel(displayLabel),
    DisplayCollectionName: makeLabel(collectionLabel),
    OwnershipType:         'OrganizationOwned',
    HasNotes:              false,
    HasActivities:         false,
    IsAuditEnabled:        { Value: false },
    PrimaryNameAttribute:  'qdb_name',
    Attributes: [{
      '@odata.type':  'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName:     'qdb_name',
      LogicalName:    'qdb_name',
      IsPrimaryName:  true,
      MaxLength:      200,
      RequiredLevel:  { Value: 'ApplicationRequired' },
      DisplayName:    makeLabel('Name'),
    }],
  }, true);
  console.log(`  [OK]   Entity ${schemaName} created — waiting ${ENTITY_SETTLE_MS / 1000}s for metadata propagation...`);
  await new Promise((resolve) => setTimeout(resolve, ENTITY_SETTLE_MS));
  return true;
}

// ── Create 1:N relationship (lookup from child → parent) ─────────────────────

async function createRelationshipIfMissing(token, {
  schemaName,
  referencingEntity,
  referencingAttribute,
  referencedEntity,
  referencedPrimaryKey,
  lookupDisplayLabel,
}) {
  if (await relationshipExists(token, schemaName)) {
    console.log(`  [SKIP] Relationship ${schemaName} already exists`);
    return;
  }
  // Derive SchemaName for the lookup attribute: capitalise first letter after prefix underscore.
  // e.g. qdb_form_definition_id → qdb_Form_definition_id is wrong; Dataverse uses camelCase after prefix.
  // We pass it explicitly as referencingAttribute (already correct logical name).
  const lookupSchemaName = referencingAttribute
    .split('_')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('_');

  await apiPost(token, 'RelationshipDefinitions', {
    '@odata.type':        'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName:           schemaName,
    ReferencedEntity:     referencedEntity,
    ReferencedAttribute:  referencedPrimaryKey,
    ReferencingEntity:    referencingEntity,
    Lookup: {
      '@odata.type':  'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName:     lookupSchemaName,
      LogicalName:    referencingAttribute,
      DisplayName:    makeLabel(lookupDisplayLabel),
      Description:    makeLabel(lookupDisplayLabel),
      RequiredLevel:  { Value: 'None' },
    },
    AssociatedMenuConfiguration: {
      Behavior: 'UseCollectionName',
      Group:    'Details',
      Order:    10000,
    },
    CascadeConfiguration: {
      Assign:     'NoCascade',
      Delete:     'RemoveLink',
      Merge:      'NoCascade',
      Reparent:   'NoCascade',
      Share:      'NoCascade',
      Unshare:    'NoCascade',
      RollupView: 'NoCascade',
    },
  }, true);
  console.log(`  [OK]   Relationship ${schemaName} created (${referencingEntity}.${referencingAttribute} → ${referencedEntity})`);
}

// ── Alternate key creation ────────────────────────────────────────────────────

/**
 * Creates an alternate key and returns true if the key was newly submitted,
 * false if it already existed (so the caller can skip the poll).
 */
async function createAlternateKey(token, entityName, keySchemaName, keyAttributes) {
  const response = await apiGet(token, `EntityDefinitions(LogicalName='${entityName}')/Keys`);
  const existing = response.value?.find((k) => k.SchemaName === keySchemaName);
  if (existing) {
    console.log(`  [SKIP] Alternate key ${keySchemaName} already exists on ${entityName} (status: ${existing.EntityKeyIndexStatus})`);
    return false;
  }
  await apiPost(
    token,
    `EntityDefinitions(LogicalName='${entityName}')/Keys`,
    {
      SchemaName:    keySchemaName,
      DisplayName:   makeLabel('Render Cache Lookup Key'),
      KeyAttributes: keyAttributes,
    },
    true
  );
  console.log(`  [OK]   Alternate key ${keySchemaName} submitted for ${entityName}`);
  return true;
}

// ── Alternate key polling ─────────────────────────────────────────────────────

async function pollUntilKeyActive(token, entityName, keySchemaName) {
  console.log(`  [WAIT] Polling for ${keySchemaName} to become Active (max ${KEY_POLL_MAX} attempts × ${KEY_POLL_DELAY / 1000}s)...`);
  for (let attempt = 1; attempt <= KEY_POLL_MAX; attempt++) {
    const response = await apiGet(token, `EntityDefinitions(LogicalName='${entityName}')/Keys`);
    const targetKey = response.value?.find((k) => k.SchemaName === keySchemaName);
    if (targetKey) {
      const status = targetKey.EntityKeyIndexStatus;
      console.log(`  [WAIT] Attempt ${attempt}/${KEY_POLL_MAX} — status: ${status}`);
      if (status === 'Active') {
        console.log(`  [OK]   ${keySchemaName} is Active`);
        return status;
      }
      if (status === 'Failed') {
        throw new Error(`Alternate key ${keySchemaName} failed to activate on ${entityName}`);
      }
    } else {
      console.log(`  [WAIT] Attempt ${attempt}/${KEY_POLL_MAX} — key not yet visible`);
    }
    if (attempt < KEY_POLL_MAX) {
      await new Promise((resolve) => setTimeout(resolve, KEY_POLL_DELAY));
    }
  }
  throw new Error(`Alternate key ${keySchemaName} did not reach Active status after ${KEY_POLL_MAX} attempts`);
}

// ── Publish all customizations ────────────────────────────────────────────────

async function publishAllCustomizations(token) {
  console.log('\n[PUBLISH] Publishing all customizations (this may take 1-3 minutes)...');
  const res = await fetch(`${API_BASE}/PublishAllXml`, {
    method:  'POST',
    headers: buildHeaders(token),
    body:    '{}',
    signal:  AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`PublishAllXml -> ${res.status}: ${await res.text()}`);
  console.log('[OK]   PublishAllXml complete');
}

// ── Verification helpers ──────────────────────────────────────────────────────

async function verifyEntityRecordCount(token, entitySetName) {
  // Use /$count endpoint — returns a plain integer string.
  // The $top=0 pattern is not supported for Dataverse data queries.
  const res = await fetch(`${API_BASE}/${entitySetName}/$count`, { headers: buildHeaders(token) });
  if (!res.ok) throw new Error(`Count ${entitySetName} -> ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return parseInt(text.trim(), 10);
}

async function verifyAttributeExists(token, entityName, attrLogicalName) {
  return attributeExists(token, entityName, attrLogicalName);
}

async function getAlternateKeyStatus(token, entityName, keySchemaName) {
  const response = await apiGet(token, `EntityDefinitions(LogicalName='${entityName}')/Keys`);
  const key = response.value?.find((k) => k.SchemaName === keySchemaName);
  return key ? key.EntityKeyIndexStatus : 'NotFound';
}

async function getRelationshipInfo(token, entityName, schemaName) {
  // Query via the entity's relationship list — more reliable than RelationshipDefinitions(SchemaName=...)
  // for relationships that cross to system entities like systemuser.
  try {
    const result = await apiGet(
      token,
      `EntityDefinitions(LogicalName='${entityName}')/ManyToOneRelationships?$select=SchemaName,ReferencingEntity,ReferencedEntity,ReferencingAttribute`
    );
    const match = result.value?.find((r) => r.SchemaName === schemaName);
    if (match) return `${match.ReferencingEntity}.${match.ReferencingAttribute} → ${match.ReferencedEntity}`;

    // Also check OneToMany direction (for publish_job → form_definition)
    const result2 = await apiGet(
      token,
      `EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=SchemaName,ReferencingEntity,ReferencedEntity,ReferencingAttribute`
    );
    const match2 = result2.value?.find((r) => r.SchemaName === schemaName);
    if (match2) return `${match2.ReferencingEntity}.${match2.ReferencingAttribute} → ${match2.ReferencedEntity}`;

    return 'NOT FOUND';
  } catch {
    return 'ERROR';
  }
}

// ── Entity 1: qdb_publish_job ─────────────────────────────────────────────────

async function provisionPublishJobEntity(token) {
  console.log('\n=== [1/2] qdb_publish_job ===');

  await createEntityIfMissing(
    token,
    'qdb_publish_job',
    'Publish Job',
    'Publish Jobs'
  );

  // String attributes
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildStringAttribute('qdb_form_code', 'Form Code', 100));

  // Integer attributes
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildIntegerAttribute('qdb_target_version', 'Target Version'));

  // Local picklist: trigger reason
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildLocalPicklistAttribute('qdb_trigger_reason', 'Trigger Reason', [
      { value: 1, label: 'Publish' },
      { value: 2, label: 'TranslationChange' },
      { value: 3, label: 'ThemeChange' },
      { value: 4, label: 'ComponentChange' },
      { value: 5, label: 'ManualRegenerate' },
    ], 'qdb_publish_job')
  );

  // Local picklist: job status
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildLocalPicklistAttribute('qdb_status', 'Status', [
      { value: 1, label: 'Queued' },
      { value: 2, label: 'Running' },
      { value: 3, label: 'Completed' },
      { value: 4, label: 'PartiallyCompleted' },
      { value: 5, label: 'Failed' },
    ], 'qdb_publish_job')
  );

  // Memo attributes
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildMemoAttribute('qdb_languages_requested', 'Languages Requested', 4000));
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildMemoAttribute('qdb_languages_succeeded', 'Languages Succeeded', 4000));
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildMemoAttribute('qdb_languages_failed', 'Languages Failed', 4000));

  // DateTime attributes
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildDateTimeAttribute('qdb_requested_on', 'Requested On'));
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildDateTimeAttribute('qdb_started_on', 'Started On'));
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildDateTimeAttribute('qdb_completed_on', 'Completed On'));

  // Large memo for error details
  await addAttributeIfMissing(token, 'qdb_publish_job',
    buildMemoAttribute('qdb_error_details', 'Error Details', 100000));

  // Lookup: qdb_publish_job → qdb_form_definition (1:N on form_definition side)
  console.log('\n  Creating lookup: qdb_publish_job.qdb_form_definition_id → qdb_form_definition');
  await createRelationshipIfMissing(token, {
    schemaName:            'qdb_form_definition_qdb_publish_job',
    referencedEntity:      'qdb_form_definition',
    referencedPrimaryKey:  'qdb_form_definitionid',
    referencingEntity:     'qdb_publish_job',
    referencingAttribute:  'qdb_form_definition_id',
    lookupDisplayLabel:    'Form Definition',
  });
}

// ── Entity 2: qdb_form_render_cache ──────────────────────────────────────────

async function provisionFormRenderCacheEntity(token) {
  console.log('\n=== [2/2] qdb_form_render_cache ===');

  await createEntityIfMissing(
    token,
    'qdb_form_render_cache',
    'Form Render Cache',
    'Form Render Caches'
  );

  // String attributes (needed for alternate key — must be created before the key)
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildStringAttribute('qdb_form_code', 'Form Code', 100));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildStringAttribute('qdb_language_code', 'Language Code', 10));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildStringAttribute('qdb_json_hash', 'JSON Hash', 64));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildStringAttribute('qdb_generator_version', 'Generator Version', 20));

  // Integer attributes
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildIntegerAttribute('qdb_published_version', 'Published Version'));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildIntegerAttribute('qdb_lcid', 'LCID'));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildIntegerAttribute('qdb_json_size_bytes', 'JSON Size (Bytes)'));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildIntegerAttribute('qdb_generation_duration_ms', 'Generation Duration (ms)'));

  // Memo column holding Base64(gzip(render JSON)) — portable to on-prem 9.1 (no File column needed)
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildMemoAttribute('qdb_runtime_json', 'Runtime JSON (Compressed)', 1048576));

  // Boolean attributes
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildBooleanAttribute('qdb_is_compressed', 'Is Compressed', true));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildBooleanAttribute('qdb_is_active', 'Is Active', false));

  // Local picklist: cache entry status
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildLocalPicklistAttribute('qdb_status', 'Status', [
      { value: 1, label: 'Generating' },
      { value: 2, label: 'Active' },
      { value: 3, label: 'Superseded' },
      { value: 4, label: 'Failed' },
    ], 'qdb_form_render_cache')
  );

  // DateTime attributes
  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildDateTimeAttribute('qdb_published_on', 'Published On'));

  await addAttributeIfMissing(token, 'qdb_form_render_cache',
    buildDateTimeAttribute('qdb_last_generated_on', 'Last Generated On'));

  // Lookups
  console.log('\n  Creating lookups for qdb_form_render_cache...');

  await createRelationshipIfMissing(token, {
    schemaName:           'qdb_form_definition_qdb_form_render_cache',
    referencedEntity:     'qdb_form_definition',
    referencedPrimaryKey: 'qdb_form_definitionid',
    referencingEntity:    'qdb_form_render_cache',
    referencingAttribute: 'qdb_form_definition_id',
    lookupDisplayLabel:   'Form Definition',
  });

  await createRelationshipIfMissing(token, {
    schemaName:           'qdb_publish_job_qdb_form_render_cache',
    referencedEntity:     'qdb_publish_job',
    referencedPrimaryKey: 'qdb_publish_jobid',
    referencingEntity:    'qdb_form_render_cache',
    referencingAttribute: 'qdb_publish_job_id',
    lookupDisplayLabel:   'Publish Job',
  });

  await createRelationshipIfMissing(token, {
    schemaName:           'qdb_systemuser_form_render_cache_published_by',
    referencedEntity:     'systemuser',
    referencedPrimaryKey: 'systemuserid',
    referencingEntity:    'qdb_form_render_cache',
    referencingAttribute: 'qdb_published_by',
    lookupDisplayLabel:   'Published By',
  });

  // Alternate key — requires qdb_form_code, qdb_published_version, qdb_language_code to exist first
  console.log('\n  Creating alternate key qdb_render_cache_key...');
  const keySubmitted = await createAlternateKey(
    token,
    'qdb_form_render_cache',
    'qdb_render_cache_key',
    ['qdb_form_code', 'qdb_published_version', 'qdb_language_code']
  );
  // Only poll if we just submitted the key — skip polling on idempotent re-runs
  if (keySubmitted) {
    await pollUntilKeyActive(token, 'qdb_form_render_cache', 'qdb_render_cache_key');
  }
}

// ── Verification ──────────────────────────────────────────────────────────────

async function runVerification(token) {
  console.log('\n=== Verification ===\n');

  // Record counts (entity set names use plural logical collection name from Dataverse)
  const publishJobCount = await verifyEntityRecordCount(token, 'qdb_publish_jobs').catch(() => 'N/A');
  const renderCacheCount = await verifyEntityRecordCount(token, 'qdb_form_render_caches').catch(() => 'N/A');
  console.log(`  qdb_publish_jobs        record count: ${publishJobCount}`);
  console.log(`  qdb_form_render_caches  record count: ${renderCacheCount}`);

  // File column
  const fileColExists = await verifyAttributeExists(token, 'qdb_form_render_cache', 'qdb_runtime_json');
  console.log(`  File column qdb_runtime_json on qdb_form_render_cache: ${fileColExists ? 'EXISTS' : 'MISSING'}`);

  // Alternate key status
  const altKeyStatus = await getAlternateKeyStatus(token, 'qdb_form_render_cache', 'qdb_render_cache_key');
  console.log(`  Alternate key qdb_render_cache_key status: ${altKeyStatus}`);

  // Picklists
  const pjTriggerExists = await verifyAttributeExists(token, 'qdb_publish_job', 'qdb_trigger_reason');
  const pjStatusExists  = await verifyAttributeExists(token, 'qdb_publish_job', 'qdb_status');
  const rcStatusExists  = await verifyAttributeExists(token, 'qdb_form_render_cache', 'qdb_status');
  console.log(`  Picklist qdb_publish_job.qdb_trigger_reason:      ${pjTriggerExists ? 'EXISTS' : 'MISSING'}`);
  console.log(`  Picklist qdb_publish_job.qdb_status:              ${pjStatusExists ? 'EXISTS' : 'MISSING'}`);
  console.log(`  Picklist qdb_form_render_cache.qdb_status:        ${rcStatusExists ? 'EXISTS' : 'MISSING'}`);

  // Booleans
  const isCompressedExists = await verifyAttributeExists(token, 'qdb_form_render_cache', 'qdb_is_compressed');
  const isActiveExists     = await verifyAttributeExists(token, 'qdb_form_render_cache', 'qdb_is_active');
  console.log(`  Boolean qdb_form_render_cache.qdb_is_compressed:  ${isCompressedExists ? 'EXISTS' : 'MISSING'}`);
  console.log(`  Boolean qdb_form_render_cache.qdb_is_active:      ${isActiveExists ? 'EXISTS' : 'MISSING'}`);

  // Lookups / relationships — look up via the referencing entity's ManyToOne list
  const rel1 = await getRelationshipInfo(token, 'qdb_publish_job',       'qdb_form_definition_qdb_publish_job');
  const rel2 = await getRelationshipInfo(token, 'qdb_form_render_cache', 'qdb_form_definition_qdb_form_render_cache');
  const rel3 = await getRelationshipInfo(token, 'qdb_form_render_cache', 'qdb_publish_job_qdb_form_render_cache');
  const rel4 = await getRelationshipInfo(token, 'qdb_form_render_cache', 'qdb_systemuser_form_render_cache_published_by');
  console.log(`  Relationship qdb_form_definition_qdb_publish_job:               ${rel1}`);
  console.log(`  Relationship qdb_form_definition_qdb_form_render_cache:         ${rel2}`);
  console.log(`  Relationship qdb_publish_job_qdb_form_render_cache:             ${rel3}`);
  console.log(`  Relationship qdb_systemuser_form_render_cache_published_by:     ${rel4}`);

  return {
    publishJobCount,
    renderCacheCount,
    fileColExists,
    altKeyStatus,
    picklists: { pjTriggerExists, pjStatusExists, rcStatusExists },
    booleans:  { isCompressedExists, isActiveExists },
    relationships: { rel1, rel2, rel3, rel4 },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Render Cache Schema Provisioning (Web API) ===');
  console.log(`    Org:      ${DATAVERSE_URL}`);
  console.log(`    Solution: ${SOLUTION_NAME}`);
  console.log('');

  const token = await acquireToken();
  console.log('[OK]   Token acquired');

  await provisionPublishJobEntity(token);
  await provisionFormRenderCacheEntity(token);
  await publishAllCustomizations(token);
  await runVerification(token);

  console.log('\n=== Provisioning complete ===');
}

await main();
