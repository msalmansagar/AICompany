'use strict';

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;
const LANG      = 1033;

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getToken() {
  const pca = new msal.PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` }
  });
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${DATAVERSE}/.default`],
    deviceCodeCallback: (r) => console.log('\n' + r.message + '\n')
  });
  return result.accessToken;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Metadata helpers ─────────────────────────────────────────────────────────

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }]
});

const req = (level) => ({ Value: level, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' });

function str(schemaName, display, maxLen, required, isPrimary = false) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    MaxLength: maxLen, Format: 'Text', IsPrimaryName: isPrimary
  };
}

function memo(schemaName, display, maxLen) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('None'),
    Format: 'TextArea', MaxLength: maxLen || 1048576
  };
}

function int(schemaName, display, required, min = 0, max = 9999) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    Format: 'None', MinValue: min, MaxValue: max
  };
}

function bool(schemaName, display, defaultVal, trueLabel = 'Yes', falseLabel = 'No') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('ApplicationRequired'),
    DefaultValue: defaultVal,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: lbl(trueLabel) },
      FalseOption: { Value: 0, Label: lbl(falseLabel) }
    }
  };
}

function picklist(schemaName, display, options, defaultValue, required = true) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    DefaultFormValue: defaultValue,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) }))
    }
  };
}

// ─── Entity definition ────────────────────────────────────────────────────────

const ENTITY = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_form_button',
  DisplayName: lbl('Form Button'),
  DisplayCollectionName: lbl('Form Buttons'),
  OwnershipType: 'OrganizationOwned',
  IsActivity: false, HasNotes: false, HasActivities: false,
  PrimaryNameAttribute: 'qdb_label',
  Attributes: [
    str('qdb_label',                'Label',                 250,  true, true),
    picklist('qdb_action', 'Action', [
      [100000001, 'Submit'],
      [100000002, 'Save Draft'],
      [100000003, 'Cancel'],
      [100000004, 'Reset']
    ], 100000001),
    int('qdb_display_order',        'Display Order',         true, 0, 9999),
    bool('qdb_is_visible',          'Is Visible',            true),
    bool('qdb_is_primary',          'Is Primary',            false),
    bool('qdb_confirmation_required','Confirmation Required', false),
    memo('qdb_confirmation_message', 'Confirmation Message', 1000),
    bool('qdb_is_active',           'Is Active',             true)
  ]
};

// ─── Relationship definition ──────────────────────────────────────────────────

function cascade(deleteType = 'Cascade') {
  const del = deleteType === 'NoCascade' ? 'RemoveLink' : deleteType;
  return { Assign: 'NoCascade', Delete: del, Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' };
}

const RELATIONSHIP = {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
  SchemaName: 'qdb_formdef_button',
  ReferencedEntity: 'qdb_form_definition',
  ReferencingEntity: 'qdb_form_button',
  CascadeConfiguration: cascade('Cascade'),
  Lookup: {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: 'qdb_form_definition_id',
    DisplayName: lbl('Form Definition'),
    RequiredLevel: req('ApplicationRequired')
  }
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function entityExists(token, schemaName) {
  try {
    const r = await api(token, 'GET', `/EntityDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return r.value && r.value.length > 0;
  } catch { return false; }
}

async function relationshipExists(token, schemaName) {
  try {
    const r = await api(token, 'GET', `/RelationshipDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return r.value && r.value.length > 0;
  } catch { return false; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  QDB Dynamic Form Engine — Form Button Table');
  console.log('═══════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Step 1: Create entity ──
  console.log('─── Step 1: Creating qdb_form_button ─────────────────');
  process.stdout.write('  qdb_form_button... ');
  try {
    if (await entityExists(token, 'qdb_form_button')) {
      console.log('already exists — skipped');
    } else {
      await api(token, 'POST', '/EntityDefinitions', ENTITY);
      console.log('✓ created');
    }
  } catch (e) {
    console.log(`✗ FAILED\n  ${e.message.slice(0, 400)}`);
    process.exit(1);
  }

  // ── Step 2: Wait for Dataverse to publish the entity ──
  process.stdout.write('\nWaiting 30 s for Dataverse to publish the entity...');
  await sleep(30000);
  console.log(' done\n');

  // ── Step 3: Create relationship (with retry) ──
  console.log('─── Step 2: Creating qdb_formdef_button relationship ──');
  process.stdout.write('  qdb_formdef_button... ');

  let succeeded = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (await relationshipExists(token, 'qdb_formdef_button')) {
        console.log('already exists — skipped');
        succeeded = true;
        break;
      }
      await api(token, 'POST', '/RelationshipDefinitions', RELATIONSHIP);
      console.log('✓ created');
      succeeded = true;
      break;
    } catch (e) {
      const msg = e.message;
      if (msg.includes('already exists') || msg.includes('0x80048404') ||
          msg.includes('duplicate') || msg.includes('not unique')) {
        console.log('already exists — skipped');
        succeeded = true;
        break;
      }
      const isTransient = msg.includes('ENOTFOUND') || msg.includes('ECONNRESET') ||
                          msg.includes('0x80044151') || msg.includes('0x80071151') ||
                          msg.includes('timeout') || msg.includes('429');
      if (isTransient && attempt < 4) {
        const delay = attempt * 15000;
        process.stdout.write(`retrying in ${delay / 1000}s... `);
        await sleep(delay);
      } else {
        console.log(`✗ FAILED (attempt ${attempt})\n  ${msg.slice(0, 400)}`);
      }
    }
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════');
  if (succeeded) {
    console.log('  Done. Publish customizations in Dataverse to activate:');
    console.log('  Settings → Customizations → Publish All Customizations');
  } else {
    console.log('  Relationship creation failed. Re-run — the script is idempotent.');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
