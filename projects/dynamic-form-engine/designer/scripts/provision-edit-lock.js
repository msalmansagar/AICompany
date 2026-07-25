#!/usr/bin/env node
/**
 * ============================================================
 * DO NOT RUN — provisioning script only, run manually by CRM Admin
 * ============================================================
 *
 * Creates the qdb_dfe_edit_lock custom entity in a Dataverse environment
 * using the Dataverse Web API via MSAL (Service Principal auth).
 *
 * Prerequisites:
 *   npm install @azure/msal-node node-fetch
 *
 * Environment variables (set before running):
 *   DV_DATAVERSE_URL — https://<org>.crm.dynamics.com
 *   DV_CLIENT_ID     — App registration client ID
 *   DV_CLIENT_SECRET — App registration client secret
 *   DV_TENANT_ID     — Azure AD tenant ID
 *
 * Usage (CRM Admin only):
 *   node scripts/provision-edit-lock.js
 */

'use strict';

const { ConfidentialClientApplication } = require('@azure/msal-node');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set`);
  return value;
}

const DATAVERSE_URL = requireEnv('DV_DATAVERSE_URL');
const CLIENT_ID     = requireEnv('DV_CLIENT_ID');
const CLIENT_SECRET = requireEnv('DV_CLIENT_SECRET');
const TENANT_ID     = requireEnv('DV_TENANT_ID');

// ── Schema ───────────────────────────────────────────────────────────────────

const ENTITY_LOGICAL_NAME   = 'qdb_dfe_edit_lock';
const ENTITY_DISPLAY_NAME   = 'DFE Edit Lock';
const ENTITY_PLURAL_NAME    = 'DFE Edit Locks';
const ENTITY_SCHEMA_NAME    = 'qdb_dfe_edit_lock';

/**
 * Attribute definitions for qdb_dfe_edit_lock.
 * All attributes follow the Maqsad AI naming convention (qdb_ prefix).
 */
const ATTRIBUTES = [
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName:    'qdb_form_id',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Form ID', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    MaxLength:     100,
  },
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName:    'qdb_editor_user_id',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Editor User ID', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    MaxLength:     100,
  },
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName:    'qdb_editor_display_name',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Editor Display Name', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    MaxLength:     200,
  },
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName:    'qdb_session_id',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Session ID', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    MaxLength:     50,
  },
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName:    'qdb_last_heartbeat',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Last Heartbeat', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    Format:        'DateAndTime',
  },
  {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName:    'qdb_opened_at',
    DisplayName:   { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Opened At', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
    Format:        'DateAndTime',
  },
];

// ── MSAL token acquisition ────────────────────────────────────────────────────

async function acquireToken() {
  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId:     CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      authority:    `https://login.microsoftonline.com/${TENANT_ID}`,
    },
  });

  const response = await msalApp.acquireTokenByClientCredential({
    scopes: [`${DATAVERSE_URL}/.default`],
  });

  if (!response?.accessToken) {
    throw new Error('MSAL did not return an access token');
  }

  return response.accessToken;
}

// ── Dataverse API helpers ─────────────────────────────────────────────────────

async function callDataverseApi(token, path, method, body) {
  const url = `${DATAVERSE_URL}/api/data/v9.2${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization':    `Bearer ${token}`,
      'Content-Type':     'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version':    '4.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Dataverse API ${method} ${path} failed: ${response.status} ${errorText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// ── Provisioning steps ────────────────────────────────────────────────────────

async function createEntity(token) {
  console.log(`Creating entity: ${ENTITY_SCHEMA_NAME}...`);

  const entityDefinition = {
    '@odata.type':              'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName:                 ENTITY_SCHEMA_NAME,
    LogicalName:                ENTITY_LOGICAL_NAME,
    DisplayName:                { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: ENTITY_DISPLAY_NAME, LanguageCode: 1033 }] },
    DisplayCollectionName:      { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: ENTITY_PLURAL_NAME, LanguageCode: 1033 }] },
    OwnershipType:              'UserOwned',
    IsActivity:                 false,
    HasActivities:              false,
    HasNotes:                   false,
    IsAuditEnabled:             { Value: false },
    IsAvailableOffline:         false,
    IsConnectionsEnabled:       { Value: false },
    IsDuplicateDetectionEnabled: { Value: false },
    PrimaryNameAttribute:       'qdb_editor_display_name',
    Attributes: [
      {
        '@odata.type':  'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName:     'qdb_editor_display_name',
        RequiredLevel:  { Value: 'ApplicationRequired' },
        MaxLength:      200,
        DisplayName:    { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Editor Display Name', LanguageCode: 1033 }] },
        IsPrimaryName:  true,
      },
    ],
  };

  const result = await callDataverseApi(token, '/EntityDefinitions', 'POST', entityDefinition);
  console.log('Entity created:', result);
}

async function addAttributes(token) {
  // Skip qdb_editor_display_name — it was added as the primary name during entity creation
  const additionalAttributes = ATTRIBUTES.filter(a => a.SchemaName !== 'qdb_editor_display_name');

  for (const attribute of additionalAttributes) {
    console.log(`  Adding attribute: ${attribute.SchemaName}...`);
    await callDataverseApi(
      token,
      `/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes`,
      'POST',
      attribute,
    );
    console.log(`  Attribute ${attribute.SchemaName} created.`);
  }
}

async function publishEntity(token) {
  console.log('Publishing entity customizations...');
  await callDataverseApi(token, '/PublishXml', 'POST', {
    ParameterXml: `<importexportxml><entities><entity>${ENTITY_LOGICAL_NAME}</entity></entities></importexportxml>`,
  });
  console.log('Published.');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== qdb_dfe_edit_lock Provisioning Script ===');
  console.log('Target environment:', DATAVERSE_URL);
  console.log('');

  const token = await acquireToken();
  console.log('Token acquired.\n');

  await createEntity(token);
  await addAttributes(token);
  await publishEntity(token);

  console.log('\nProvisioning complete.');
  console.log('Next steps:');
  console.log('  1. Verify the entity appears in Power Apps make.powerapps.com');
  console.log('  2. Assign appropriate security roles (System Administrator / DFE Admin)');
  console.log('  3. Add the entity to the QDB solution via solution.xml RootComponents');
}

main().catch(err => {
  console.error('Provisioning failed:', err);
  process.exitCode = 1;
});
