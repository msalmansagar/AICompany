/**
 * Bar source configuration, on qdb_form_field (Number and Currency Config section).
 *
 * Replaces the qdb_form_bar_config child table with plain columns on the field record, so a
 * maker configures a bar where they already are instead of hand-creating a row in another
 * table.
 *
 *   qdb_bar_source          Choice   Form Field (default) | Static | Dynamic
 *   qdb_bar_min_value       Decimal  Static — literal minimum
 *   qdb_bar_max_value       Decimal  Static — literal maximum
 *   qdb_bar_source_entity   Text     Dynamic — table the bounds are read from
 *   qdb_bar_min_attribute   Text     Dynamic — column holding the minimum
 *
 * Reused unchanged:
 *   qdb_bar_max_field_schema    the maximum — a form field in Form Field mode, an entity
 *                               column in Dynamic mode
 *   qdb_bar_value_field_schema  where the AMOUNT lives; blank = the bar field's own value.
 *                               Independent of the source mode, applies to all three.
 *
 * NULL source = Form Field, so the seven existing bars keep working with no migration.
 *
 * Run: node --env-file=scripts/.env scripts/provision-bar-source-columns.mjs
 * Safe: checks for existence before creating — re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const SOLUTION = 'FormEngine';
const ENTITY = 'qdb_form_field';

/** Form Field is 0 so a null/unset column reads as the legacy behaviour. */
export const BAR_SOURCE = { formField: 100000000, static: 100000001, dynamic: 100000002 };

let H;

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'Token request failed');
  return j.access_token;
}

const label = (text) => ({ '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }] });

async function attributeExists(logicalName) {
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`, { headers: H });
  return r.ok;
}

async function addAttribute(schema, body) {
  if (await attributeExists(schema)) { console.log(`  exists — ${schema}`); return; }
  const r = await fetch(`${API}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`, {
    method: 'POST', headers: { ...H, 'MSCRM.SolutionUniqueName': SOLUTION }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`add ${schema}: ${(await r.text()).slice(0, 400)}`);
  console.log(`  created ${schema}`);
}

const decimalAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  Precision: 2,
  MinValue: -100000000000,
  MaxValue: 100000000000,
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
});

const stringAttr = (schema, display, description) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  SchemaName: schema,
  LogicalName: schema,
  MaxLength: 100,
  FormatName: { Value: 'Text' },
  RequiredLevel: { Value: 'None' },
  DisplayName: label(display),
  Description: label(description),
});

async function run() {
  console.log(`Bar source columns on ${ENTITY}\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(64)}`);
  const token = await acquireToken();
  H = { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  await addAttribute('qdb_bar_source', {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: 'qdb_bar_source',
    LogicalName: 'qdb_bar_source',
    RequiredLevel: { Value: 'None' },
    DisplayName: label('Bar Source'),
    Description: label(
      'Where the bar gets its minimum and maximum. Form Field (default) reads them from other '
      + 'fields on this form. Static uses the literal Min/Max Value below. Dynamic reads them '
      + 'from a column on another table.',
    ),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      OptionSetType: 'Picklist',
      Options: [
        { Value: BAR_SOURCE.formField, Label: label('Form Field') },
        { Value: BAR_SOURCE.static, Label: label('Static') },
        { Value: BAR_SOURCE.dynamic, Label: label('Dynamic') },
      ],
    },
  });

  await addAttribute('qdb_bar_min_value', decimalAttr(
    'qdb_bar_min_value', 'Bar Min Value',
    'Static source only. The value the bar starts from. Blank counts as zero.',
  ));
  await addAttribute('qdb_bar_max_value', decimalAttr(
    'qdb_bar_max_value', 'Bar Max Value',
    'Static source only. The value the bar fills towards.',
  ));

  await addAttribute('qdb_bar_source_entity', stringAttr(
    'qdb_bar_source_entity', 'Bar Source Entity',
    'Dynamic source only. Logical name of the table the minimum and maximum are read from.',
  ));
  await addAttribute('qdb_bar_min_attribute', stringAttr(
    'qdb_bar_min_attribute', 'Bar Min Field Schema Name',
    'Dynamic source only. Column on the source table holding the minimum. '
    + 'The maximum uses the existing Bar Max Field Schema column.',
  ));

  const publish = await fetch(`${API}/PublishXml`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ ParameterXml: `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>` }),
  });
  console.log(`  publish → ${publish.status}`);
  console.log(`${'─'.repeat(64)}\nUnset Bar Source = Form Field, so existing bars are unchanged.`);
}

run().catch((e) => { console.error('\nPROVISIONING FAILED:', e.message); process.exit(1); });
