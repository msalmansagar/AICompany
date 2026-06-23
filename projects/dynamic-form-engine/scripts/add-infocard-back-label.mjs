const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
const t = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(r => r.json()).then(j => j.access_token);
console.log('✓ Token acquired');

const hdrs = { Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };
const lbl = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });

const check = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='qdb_form_definition')/Attributes(LogicalName='qdb_infocard_back_label')?$select=LogicalName`, { headers: hdrs });
if (check.ok) { console.log('  ↷ qdb_infocard_back_label already exists'); }
else {
  const r = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='qdb_form_definition')/Attributes`, {
    method: 'POST', headers: hdrs,
    body: JSON.stringify({ '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'qdb_infocard_back_label', LogicalName: 'qdb_infocard_back_label', MaxLength: 100, RequiredLevel: { Value: 'None' }, DisplayName: lbl('Info Card Back Label') }),
  });
  if (!r.ok) throw new Error(await r.text());
  console.log('  ✓ Created qdb_infocard_back_label');
}

const xml = `<importexportxml><entities><entity>qdb_form_definition</entity></entities></importexportxml>`;
await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: hdrs, body: JSON.stringify({ ParameterXml: xml }) });
console.log('  ✓ Published\nDone.');
