/**
 * provision-i18n-schema-webapi.mjs
 *
 * Creates qdb_language_config and qdb_translation Dataverse entities via the
 * EntityDefinitions Web API, adds all attributes, creates alternate keys, and
 * polls until the keys are Active. Finishes with PublishAllXml.
 *
 * IMPORTANT — C-004 GATE
 * This script creates Dataverse schema changes. Execution against org5869857f
 * requires written approval from QDB IT Director per CEO condition C-004
 * (DFE-i18n-001 BRD approval document, 2026-06-24).
 * DO NOT execute this script until C-004 is cleared.
 *
 * NOTE — Solution unique name
 * The script uses 'QdbDfe' as the MSCRM.SolutionUniqueName header on all
 * EntityDefinitions and Keys operations. Confirm this matches the exact
 * solution unique name in your org before running. If unsure, check:
 *   GET /api/data/v9.2/solutions?$filter=uniquename eq 'QdbDfe'&$select=uniquename
 *
 * Run:
 *   node --env-file=scripts/.env scripts/provision-i18n-schema-webapi.mjs
 *
 * Required .env entry:
 *   DV_CLIENT_SECRET=<service-principal-secret>
 */

// ── Guard ─────────────────────────────────────────────────────────────────────

const DV_CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!DV_CLIENT_SECRET) {
  throw new Error(
    'DV_CLIENT_SECRET is not set. ' +
    'Run with: node --env-file=scripts/.env scripts/provision-i18n-schema-webapi.mjs'
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID       = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID       = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL   = 'https://org5869857f.crm4.dynamics.com';
const API_BASE        = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION_NAME   = 'QdbDynamicFormEngine'; // verified unique name on org5869857f (friendly: "QDB Dynamic Form Engine")
const KEY_POLL_MAX    = 20;       // max retries polling for key Active status
const KEY_POLL_DELAY  = 10_000;   // 10 s between polls

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
    method: 'POST',
    headers: buildHeaders(token, isMetadataOperation),
    body: JSON.stringify(body),
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

// ── Label builder ─────────────────────────────────────────────────────────────

function makeLabel(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{
      '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
      Label: text,
      LanguageCode: 1033,
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
      TrueOption:  {
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

// ── Add attribute if missing ──────────────────────────────────────────────────

async function addAttributeIfMissing(token, entityName, attributeMetadata) {
  const logicalName = attributeMetadata.LogicalName;
  if (await attributeExists(token, entityName, logicalName)) {
    console.log(`  [SKIP] ${entityName}.${logicalName} already exists`);
    return;
  }
  await apiPost(token, `EntityDefinitions(LogicalName='${entityName}')/Attributes`, attributeMetadata, true);
  console.log(`  [OK]   ${entityName}.${logicalName} created`);
}

// ── Create entity ─────────────────────────────────────────────────────────────

async function createEntityIfMissing(token, schemaName, displayLabel, primaryNameSchema, primaryNameLabel) {
  if (await entityExists(token, schemaName)) {
    console.log(`  [SKIP] Entity ${schemaName} already exists`);
    return false;
  }
  await apiPost(token, 'EntityDefinitions', {
    '@odata.type':           'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName:              schemaName,
    LogicalName:             schemaName.toLowerCase(),
    DisplayName:             makeLabel(displayLabel),
    DisplayCollectionName:   makeLabel(`${displayLabel}s`),
    OwnershipType:           'OrganizationOwned',
    HasNotes:                false,
    HasActivities:           false,
    IsAuditEnabled:          { Value: false },
    PrimaryNameAttribute:    primaryNameSchema.toLowerCase(),
    Attributes: [{
      '@odata.type':  'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName:     primaryNameSchema,
      LogicalName:    primaryNameSchema.toLowerCase(),
      IsPrimaryName:  true,
      MaxLength:      200,
      RequiredLevel:  { Value: 'ApplicationRequired' },
      DisplayName:    makeLabel(primaryNameLabel),
    }],
  }, true);
  console.log(`  [OK]   Entity ${schemaName} created`);
  return true;
}

// ── Alternate key creation ────────────────────────────────────────────────────

async function createAlternateKey(token, entityName, keySchemaName, keyAttributes) {
  try {
    await apiPost(
      token,
      `EntityDefinitions(LogicalName='${entityName}')/Keys`,
      {
        SchemaName:    keySchemaName,
        DisplayName:   makeLabel(keySchemaName),
        KeyAttributes: keyAttributes,
      },
      true
    );
    console.log(`  [OK]   Alternate key ${keySchemaName} submitted for ${entityName}`);
  } catch (err) {
    // 0x80060893 = EntityKeyNameExists — key already exists, treat as success
    if (err.message.includes('0x80060893') || err.message.includes('already exists')) {
      console.log(`  [SKIP] Alternate key ${keySchemaName} already exists on ${entityName}`);
      return;
    }
    throw err;
  }
}

// ── Alternate key polling ─────────────────────────────────────────────────────

async function pollUntilKeyActive(token, entityName, keySchemaName) {
  console.log(`  [WAIT] Polling for ${keySchemaName} to become Active (max ${KEY_POLL_MAX} attempts)...`);
  for (let attempt = 1; attempt <= KEY_POLL_MAX; attempt++) {
    const response = await apiGet(token, `EntityDefinitions(LogicalName='${entityName}')/Keys`);
    const targetKey = response.value?.find((k) => k.SchemaName === keySchemaName);
    if (targetKey) {
      const status = targetKey.EntityKeyIndexStatus;
      console.log(`  [WAIT] Attempt ${attempt}/${KEY_POLL_MAX} — status: ${status}`);
      if (status === 'Active') {
        console.log(`  [OK]   ${keySchemaName} is Active`);
        return;
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
    signal:  AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`PublishAllXml -> ${res.status}: ${await res.text()}`);
  console.log('[OK]   PublishAllXml complete');
}

// ── Entity definitions ────────────────────────────────────────────────────────

async function provisionLanguageConfigEntity(token) {
  console.log('\n--- [1/2] qdb_language_config ---');

  await createEntityIfMissing(token, 'qdb_language_config', 'Language Configuration', 'qdb_name', 'Name');

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildStringAttribute('qdb_language_code', 'Language Code', 10, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildStringAttribute('qdb_display_name', 'Display Name', 100, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildStringAttribute('qdb_display_name_native', 'Display Name (Native)', 100, 'None'));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildIntegerAttribute('qdb_lcid', 'LCID', 'None'));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildBooleanAttribute('qdb_is_active', 'Is Active', true));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildBooleanAttribute('qdb_is_default', 'Is Default', false));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildIntegerAttribute('qdb_display_order', 'Display Order', 'None'));

  await addAttributeIfMissing(token, 'qdb_language_config',
    buildBooleanAttribute('qdb_rtl_direction', 'RTL Direction', false));

  console.log('\n  Creating alternate key qdb_language_config_code_key...');
  await createAlternateKey(token, 'qdb_language_config', 'qdb_language_config_code_key', ['qdb_language_code']);
  await pollUntilKeyActive(token, 'qdb_language_config', 'qdb_language_config_code_key');
}

async function provisionTranslationEntity(token) {
  console.log('\n--- [2/2] qdb_translation ---');

  await createEntityIfMissing(token, 'qdb_translation', 'Translation', 'qdb_name', 'Name');

  await addAttributeIfMissing(token, 'qdb_translation',
    buildStringAttribute('qdb_entity_name', 'Entity Name', 100, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_translation',
    buildStringAttribute('qdb_record_id', 'Record ID', 36, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_translation',
    buildStringAttribute('qdb_field_name', 'Field Name', 100, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_translation',
    buildStringAttribute('qdb_language_code', 'Language Code', 10, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_translation',
    buildMemoAttribute('qdb_translated_value', 'Translated Value', 4000, 'ApplicationRequired'));

  await addAttributeIfMissing(token, 'qdb_translation',
    buildBooleanAttribute('qdb_is_active', 'Is Active', true));

  console.log('\n  Creating composite alternate key qdb_translation_composite_key...');
  await createAlternateKey(
    token,
    'qdb_translation',
    'qdb_translation_composite_key',
    ['qdb_entity_name', 'qdb_record_id', 'qdb_field_name', 'qdb_language_code']
  );
  await pollUntilKeyActive(token, 'qdb_translation', 'qdb_translation_composite_key');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== DFE i18n Schema Provisioning (Web API) ===');
  console.log(`    Org: ${DATAVERSE_URL}`);
  console.log(`    Solution: ${SOLUTION_NAME}`);
  console.log('');

  const token = await acquireToken();
  console.log('[OK]   Token acquired');

  await provisionLanguageConfigEntity(token);
  await provisionTranslationEntity(token);
  await publishAllCustomizations(token);

  console.log('\n=== Provisioning complete ===');
  console.log('Next step: run provision-i18n-schema.mjs to seed language-config records.');
}

await main();
