// Diagnostic helper: toggle qdb_is_hidden on named form fields.
//   node set-field-hidden.mjs <form-code> <true|false> <schemaName> [<schemaName> ...]
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const [formCode, hiddenArg, ...schemaNames] = process.argv.slice(2);
if (!formCode || !hiddenArg || schemaNames.length === 0) {
  console.error('usage: node set-field-hidden.mjs <form-code> <true|false> <schemaName>...');
  process.exit(1);
}
const isHidden = hiddenArg === 'true';

const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DV}/.default` }) }
).then((r) => r.json());

const H = {
  Authorization: `Bearer ${token.access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const form = await fetch(`${BASE}/qdb_form_definitions?$filter=qdb_form_code eq '${formCode}'&$select=qdb_form_definitionid`, { headers: H }).then((r) => r.json());
const formId = form.value[0]?.qdb_form_definitionid;
if (!formId) { console.error(`form ${formCode} not found`); process.exit(1); }

for (const schemaName of schemaNames) {
  const found = await fetch(
    `${BASE}/qdb_form_fields?$filter=qdb_schema_name eq '${schemaName}'&$select=qdb_form_fieldid,qdb_label`,
    { headers: H },
  ).then((r) => r.json());

  for (const field of found.value) {
    const response = await fetch(`${BASE}/qdb_form_fields(${field.qdb_form_fieldid})`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ qdb_is_hidden: isHidden }),
    });
    console.log(`${schemaName} (${field.qdb_label}) → hidden=${isHidden} : ${response.status}`);
  }
}
