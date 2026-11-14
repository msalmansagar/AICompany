/**
 * FR-CSE-061..069 — Weighted Scoring columns for the Customer Survey Engine.
 *
 * Five columns across three entities:
 *   qdb_form_definition.qdb_scoring_mode   Picklist  None 100000000 / Weighted 100000001
 *   qdb_form_field.qdb_score_weight        Decimal   precision 2, 0..1000
 *   qdb_form_field.qdb_score_min           Decimal   precision 2, -1000000..1000000
 *   qdb_form_field.qdb_score_max           Decimal   precision 2, -1000000..1000000
 *   qdb_form_option_value.qdb_score_points Decimal   precision 2, -1000000..1000000
 *
 * No default is written to existing rows: absent = not a weighted survey / not scored.
 * Additive and idempotent — safe to run against an org that already has the columns.
 *
 * Usage:
 *   node --env-file=scripts/.env scripts/provision-scoring-schema.mjs         # plan only
 *   node --env-file=scripts/.env scripts/provision-scoring-schema.mjs --apply # write to Dataverse
 *
 * On-prem cannot run this (client-credentials auth). Add the columns by hand with these exact
 * schema names and values, or ship them inside a DFE solution kit.
 *
 * Required env vars: DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET, DV_DATAVERSE_URL.
 */

const APPLY = process.argv.includes('--apply');
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = (process.env.DV_DATAVERSE_URL ?? '').replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const LANGUAGE_CODE = 1033;
const SOLUTION_NAME = 'QdbDynamicFormEngine';

// ─── Entity names ─────────────────────────────────────────────────────────────
const FORM_ENTITY = 'qdb_form_definition';
const FIELD_ENTITY = 'qdb_form_field';
const OPTION_ENTITY = 'qdb_form_option_value';

// ─── Column descriptors ───────────────────────────────────────────────────────
const SCORING_MODE_ATTRIBUTE = 'qdb_scoring_mode';
const SCORING_MODE_OPTIONS = [
  { value: 100000000, label: 'None' },
  { value: 100000001, label: 'Weighted' },
];

const FIELD_DECIMAL_COLUMNS = [
  {
    logicalName: 'qdb_score_weight',
    displayName: 'Score Weight',
    description: 'Relative importance of this question in the total score. Null or absent means 1 (default weight). 0 excludes the question from scoring.',
    minValue: 0,
    maxValue: 1000,
    precision: 2,
  },
  {
    logicalName: 'qdb_score_min',
    displayName: 'Score Minimum',
    description: 'Minimum score boundary for a scored number/decimal/currency question.',
    minValue: -1000000,
    maxValue: 1000000,
    precision: 2,
  },
  {
    logicalName: 'qdb_score_max',
    displayName: 'Score Maximum',
    description: 'Maximum score boundary for a scored number/decimal/currency question.',
    minValue: -1000000,
    maxValue: 1000000,
    precision: 2,
  },
];

const OPTION_DECIMAL_COLUMNS = [
  {
    logicalName: 'qdb_score_points',
    displayName: 'Score Points',
    description: 'Points awarded when a respondent selects this option in a weighted survey.',
    minValue: -1000000,
    maxValue: 1000000,
    precision: 2,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const label = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANGUAGE_CODE }],
});

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

function client(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    'MSCRM.SolutionUniqueName': SOLUTION_NAME,
  };
  return async function call(method, path, body) {
    const res = await fetch(`${API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
}

async function columnExists(call, entityLogicalName, attributeLogicalName) {
  try {
    await call('GET', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')?$select=LogicalName`);
    return true;
  } catch (error) {
    if (String(error.message).includes('-> 404')) return false;
    throw error;
  }
}

async function ensurePicklistColumn(call, entityLogicalName, attributeLogicalName, displayNameText, descriptionText, options) {
  if (await columnExists(call, entityLogicalName, attributeLogicalName)) {
    console.log(`    ↷ ${entityLogicalName}.${attributeLogicalName} already exists`);
    return;
  }
  if (!APPLY) {
    console.log(`    + would create ${entityLogicalName}.${attributeLogicalName} (Picklist)`);
    return;
  }
  await call('POST', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: attributeLogicalName,
    LogicalName: attributeLogicalName,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(displayNameText),
    Description: label(descriptionText),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: options.map((o) => ({ Value: o.value, Label: label(o.label) })),
    },
  });
  console.log(`    ✓ created ${entityLogicalName}.${attributeLogicalName}`);
}

async function ensureDecimalColumn(call, entityLogicalName, col) {
  if (await columnExists(call, entityLogicalName, col.logicalName)) {
    console.log(`    ↷ ${entityLogicalName}.${col.logicalName} already exists`);
    return;
  }
  if (!APPLY) {
    console.log(`    + would create ${entityLogicalName}.${col.logicalName} (Decimal, precision ${col.precision}, ${col.minValue}..${col.maxValue})`);
    return;
  }
  await call('POST', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, {
    '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
    SchemaName: col.logicalName,
    LogicalName: col.logicalName,
    RequiredLevel: { Value: 'None' },
    DisplayName: label(col.displayName),
    Description: label(col.description),
    Precision: col.precision,
    MinValue: col.minValue,
    MaxValue: col.maxValue,
  });
  console.log(`    ✓ created ${entityLogicalName}.${col.logicalName}`);
}

async function publishEntities(call, entityLogicalNames) {
  const entityXml = entityLogicalNames.map((n) => `<entity>${n}</entity>`).join('');
  await call('POST', 'PublishXml', {
    ParameterXml: `<importexportxml><entities>${entityXml}</entities></importexportxml>`,
  });
  console.log(`  ✓ published ${entityLogicalNames.join(', ')}`);
}

async function verifyPicklist(call, entityLogicalName, attributeLogicalName, expectedOptions) {
  try {
    const path = `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`
      + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)';
    const options = (await call('GET', path)).OptionSet.Options;
    const hasAll = expectedOptions.every((exp) => options.some((o) => o.Value === exp.value));
    console.log(`    ${hasAll ? 'PASS' : 'FAIL'}  ${entityLogicalName}.${attributeLogicalName} has options ${expectedOptions.map((o) => o.value).join(', ')}`);
    return hasAll;
  } catch {
    console.log(`    FAIL  ${entityLogicalName}.${attributeLogicalName} could not be read`);
    return false;
  }
}

async function verifyDecimal(call, entityLogicalName, attributeLogicalName) {
  try {
    const path = `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${attributeLogicalName}')`
      + '/Microsoft.Dynamics.CRM.DecimalAttributeMetadata?$select=LogicalName,Precision,MinValue,MaxValue';
    await call('GET', path);
    console.log(`    PASS  ${entityLogicalName}.${attributeLogicalName} exists`);
    return true;
  } catch {
    console.log(`    FAIL  ${entityLogicalName}.${attributeLogicalName} could not be read`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  if (!APPLY) {
    console.log('DRY RUN — pass --apply to write changes to Dataverse.\n');
  }

  const call = client(await token());

  console.log('[1] qdb_form_definition columns');
  await ensurePicklistColumn(
    call, FORM_ENTITY, SCORING_MODE_ATTRIBUTE,
    'Scoring Mode',
    'Scoring mode for survey forms. None = standard survey, Weighted = questions carry a score weight.',
    SCORING_MODE_OPTIONS,
  );

  console.log('[2] qdb_form_field columns');
  for (const col of FIELD_DECIMAL_COLUMNS) {
    await ensureDecimalColumn(call, FIELD_ENTITY, col);
  }

  console.log('[3] qdb_form_option_value columns');
  for (const col of OPTION_DECIMAL_COLUMNS) {
    await ensureDecimalColumn(call, OPTION_ENTITY, col);
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete. No changes were written.');
    return;
  }

  console.log('[4] Publish');
  await publishEntities(call, [FORM_ENTITY, FIELD_ENTITY, OPTION_ENTITY]);

  console.log('[5] Read back');
  const results = await Promise.all([
    verifyPicklist(call, FORM_ENTITY, SCORING_MODE_ATTRIBUTE, SCORING_MODE_OPTIONS),
    ...FIELD_DECIMAL_COLUMNS.map((col) => verifyDecimal(call, FIELD_ENTITY, col.logicalName)),
    ...OPTION_DECIMAL_COLUMNS.map((col) => verifyDecimal(call, OPTION_ENTITY, col.logicalName)),
  ]);
  process.exit(results.every(Boolean) ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
