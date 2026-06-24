'use strict';

/**
 * Adds qdb_show_summary_step (Boolean) to the qdb_form_definition entity.
 * Safe to re-run — skips if the attribute already exists.
 */

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;
const LANG      = 1033;

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
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }]
});

const req = (level) => ({ Value: level, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' });

async function attributeExists(token, entityLogicalName, attrLogicalName) {
  try {
    const r = await api(
      token, 'GET',
      `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$filter=LogicalName eq '${attrLogicalName}'&$select=LogicalName`
    );
    return r.value && r.value.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  DFE — Add qdb_show_summary_step to qdb_form_definition');
  console.log('════════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  const ENTITY  = 'qdb_form_definition';
  const ATTR    = 'qdb_show_summary_step';

  process.stdout.write(`Checking if ${ATTR} already exists on ${ENTITY}... `);
  if (await attributeExists(token, ENTITY, ATTR)) {
    console.log('already exists — nothing to do.');
    return;
  }
  console.log('not found, creating...');

  const attributeDef = {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: 'qdb_show_summary_step',
    LogicalName: 'qdb_show_summary_step',
    DisplayName: lbl('Show Summary Step'),
    Description: lbl('When enabled, the form shows a read-only summary of all answers before the user can submit.'),
    RequiredLevel: req('None'),
    DefaultValue: false,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption:  { Value: 1, Label: lbl('Yes') },
      FalseOption: { Value: 0, Label: lbl('No') }
    }
  };

  await api(token, 'POST', `/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, attributeDef);
  console.log(`✓ Created ${ATTR} on ${ENTITY}`);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  Done. Publish customizations to activate the new field:');
  console.log('  Settings → Customizations → Publish All Customizations');
  console.log('════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
