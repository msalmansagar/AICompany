/**
 * Reads back every column the six-point batch provisions, straight from the org.
 *
 * The provisioning scripts report what they asked for, not what the org ended up with — and
 * during this batch the org repeatedly refused customisation while another solution import
 * was running, so "the script printed a tick" is not evidence on its own.
 *
 * Run: node --env-file=scripts/.env scripts/verify-six-point-schema.mjs
 * Exits non-zero if anything is missing or the wrong shape.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

/** [entity, attribute, expected AttributeType, expected MaxLength or null] */
const EXPECTED = [
  // Point 3 — widened acknowledgement label.
  ['qdb_form_definition', 'qdb_submit_confirmation_label', 'String', 1000],
  ['qdb_form_tab', 'qdb_submit_confirmation_label', 'String', 1000],
  // Point 1 — grid column validation.
  ['qdb_grid_column_config', 'qdb_is_required', 'Boolean', null],
  ['qdb_grid_column_config', 'qdb_max_length', 'Integer', null],
  ['qdb_grid_column_config', 'qdb_validation_format', 'String', 20],
  ['qdb_grid_column_config', 'qdb_validation_pattern', 'String', 500],
  ['qdb_grid_column_config', 'qdb_validation_message', 'String', 500],
  // Point 2 — form icon and image.
  ['qdb_form_definition', 'qdb_icon_name', 'String', 100],
  ['qdb_form_definition', 'qdb_image_url', 'String', 500],
  // Point 6 — header and footer bands.
  ['qdb_form_definition', 'qdb_header_text', 'Memo', 4000],
  ['qdb_form_definition', 'qdb_header_image_url', 'String', 500],
  ['qdb_form_definition', 'qdb_footer_text', 'Memo', 4000],
  ['qdb_form_definition', 'qdb_footer_image_url', 'String', 500],
];

if (!process.env.DV_CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');

const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  }),
});
const { access_token: accessToken } = await tokenResponse.json();
const requestHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

// MaxLength lives on the DERIVED metadata type, not on AttributeMetadata. Selecting it from
// the base collection returns 400 for every attribute, which reads as "the column is missing"
// — this verifier said exactly that about columns it had just watched being created.
const DERIVED_TYPE = {
  String: 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
  Memo: 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
};

async function readAttribute(entity, attribute, expectedType) {
  const cast = DERIVED_TYPE[expectedType];
  const select = cast ? '?$select=LogicalName,AttributeType,MaxLength' : '?$select=LogicalName,AttributeType';
  const response = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')`
    + (cast ? `/${cast}` : '') + select,
    { headers: requestHeaders },
  );
  if (response.ok) return response.json();

  // A cast that does not match the stored type also 404s, which would be indistinguishable
  // from a missing column. Fall back to the base read so the type mismatch is reported as one.
  const base = await fetch(
    `${API_BASE}/EntityDefinitions(LogicalName='${entity}')/Attributes(LogicalName='${attribute}')`
    + '?$select=LogicalName,AttributeType',
    { headers: requestHeaders },
  );
  return base.ok ? base.json() : null;
}

console.log(`Six-point schema verification\nOrg: ${DATAVERSE_URL}\n${'─'.repeat(72)}`);
const failures = [];

for (const [entity, attribute, expectedType, expectedMaxLength] of EXPECTED) {
  const actual = await readAttribute(entity, attribute, expectedType);

  if (!actual) {
    failures.push(`${entity}.${attribute} — MISSING`);
    console.log(`  ✗ ${entity}.${attribute} — missing`);
    continue;
  }
  if (actual.AttributeType !== expectedType) {
    failures.push(`${entity}.${attribute} — type ${actual.AttributeType}, expected ${expectedType}`);
    console.log(`  ✗ ${entity}.${attribute} — type ${actual.AttributeType}, expected ${expectedType}`);
    continue;
  }
  if (expectedMaxLength !== null && actual.MaxLength !== expectedMaxLength) {
    failures.push(`${entity}.${attribute} — MaxLength ${actual.MaxLength}, expected ${expectedMaxLength}`);
    console.log(`  ✗ ${entity}.${attribute} — MaxLength ${actual.MaxLength}, expected ${expectedMaxLength}`);
    continue;
  }

  const shape = expectedMaxLength !== null ? `${expectedType}(${actual.MaxLength})` : expectedType;
  console.log(`  ✓ ${entity}.${attribute.padEnd(30)} ${shape}`);
}

console.log('─'.repeat(72));
if (failures.length > 0) {
  console.error(`${failures.length} of ${EXPECTED.length} checks FAILED:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`All ${EXPECTED.length} columns present and correctly shaped.`);
