/**
 * Worked example of writing lookup columns through the Web API, using a real
 * qdb_form_submission_mapping row (two lookups: form definition + form field).
 *
 * It resolves the navigation property names from metadata rather than assuming them,
 * then shows the three ways people get this wrong and the one that works:
 *   1. binding the column name that is not the nav property   -> 400
 *   2. writing the read-only _x_value form                     -> 400
 *   3. "<navProp>@odata.bind": "/<entityset>(guid)"            -> 201 / 204
 * ...followed by reading the value back (a third name again) and clearing it.
 *
 * Clearing: on this org (Dataverse 9.2 online) BOTH a null bind and DELETE .../$ref
 * clear the lookup — verified, not assumed. DELETE $ref is the older, universally
 * supported form, so prefer it if the same payload has to run against on-premise.
 *
 * The row is created INACTIVE (qdb_is_active=false) so it cannot affect a real
 * submission — the backend only reads mappings where qdb_is_active is true.
 *
 * Run: node --env-file=scripts/.env scripts/seed-lookup-binding-demo.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const ENTITY      = 'qdb_form_submission_mapping';
const ENTITY_SET  = 'qdb_form_submission_mappings';
const FORM_CODE   = 'three-changes-demo';

const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
    }) },
).then((r) => r.json());
if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');

const H = {
  Authorization: `Bearer ${tokenJson.access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const get = async (path) => (await fetch(`${BASE}/${path}`, { headers: H })).json();

async function send(method, path, body) {
  const response = await fetch(`${BASE}/${path}`, {
    method,
    headers: method === 'POST' ? { ...H, Prefer: 'return=representation' } : H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text ? JSON.parse(text) : null };
}

const line = (n = 72) => console.log('─'.repeat(n));

// ── 1. Resolve the navigation property names from metadata ───────────────────

line();
console.log('1. Which name goes before @odata.bind? Ask the metadata, do not guess.\n');

// RelationshipDefinitions only supports simple equality filters — the custom-column
// narrowing has to happen client-side.
const relationships = await get(
  `RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata`
  + `?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity`
  + `&$filter=ReferencingEntity eq '${ENTITY}'`,
);
if (!relationships.value) throw new Error(JSON.stringify(relationships.error ?? relationships));

const navPropByColumn = {};
for (const relationship of relationships.value.filter((r) => r.ReferencingAttribute.startsWith('qdb_'))) {
  navPropByColumn[relationship.ReferencingAttribute] = relationship.ReferencingEntityNavigationPropertyName;
  console.log(`   column ${relationship.ReferencingAttribute.padEnd(26)} nav prop "${relationship.ReferencingEntityNavigationPropertyName}"  ->  ${relationship.ReferencedEntity}`);
}

const formNav  = navPropByColumn['qdb_form_definition_id'];
const fieldNav = navPropByColumn['qdb_form_field_id'];

// Records to point at.
const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid,qdb_title`)).value[0];
const fields = (await get(`qdb_form_fields?$filter=qdb_schema_name eq 'demo3_limit_b' or qdb_schema_name eq 'demo3_drawn_b'&$select=qdb_form_fieldid,qdb_schema_name`)).value;
const [firstField, secondField] = fields;

console.log(`\n   target form  : ${form.qdb_title} (${form.qdb_form_definitionid})`);
console.log(`   target fields: ${fields.map((f) => f.qdb_schema_name).join(', ')}`);

// ── 2. The two ways it fails ─────────────────────────────────────────────────

line();
console.log('2. The two failures worth recognising\n');

const baseRow = {
  qdb_target_entity_logical_name: 'contact',
  qdb_target_attribute_logical_name: 'creditlimit',
  qdb_is_active: false,          // inactive: cannot affect a real submission
  qdb_is_child_entity: false,
};

const wrongNavProp = await send('POST', ENTITY_SET, {
  ...baseRow,
  // "qdb_form_definition" — plausible, but not the navigation property
  'qdb_form_definition@odata.bind': `/qdb_form_definitions(${form.qdb_form_definitionid})`,
});
console.log(`   a) wrong nav-prop name        -> ${wrongNavProp.status}`);
console.log(`      ${(wrongNavProp.body?.error?.message ?? '').slice(0, 150)}`);

const wroteValueForm = await send('POST', ENTITY_SET, {
  ...baseRow,
  // the _value form is what you READ; it is not writable
  _qdb_form_definition_id_value: form.qdb_form_definitionid,
});
console.log(`\n   b) writing the _x_value form  -> ${wroteValueForm.status}`);
console.log(`      ${(wroteValueForm.body?.error?.message ?? '').slice(0, 150)}`);

// ── 3. The form that works ───────────────────────────────────────────────────

line();
console.log('3. POST with @odata.bind\n');

const created = await send('POST', ENTITY_SET, {
  ...baseRow,
  [`${formNav}@odata.bind`]: `/qdb_form_definitions(${form.qdb_form_definitionid})`,
  [`${fieldNav}@odata.bind`]: `/qdb_form_fields(${firstField.qdb_form_fieldid})`,
});
console.log(`   POST -> ${created.status}`);
if (!created.ok) { console.error(created.body); process.exit(1); }

const recordId = created.body[`${ENTITY}id`];
console.log(`   created ${recordId}`);

// ── 4. PATCH re-points a lookup — same syntax ────────────────────────────────

line();
console.log('4. PATCH re-points the field lookup — identical syntax\n');

const patched = await send('PATCH', `${ENTITY_SET}(${recordId})`, {
  [`${fieldNav}@odata.bind`]: `/qdb_form_fields(${secondField.qdb_form_fieldid})`,
});
console.log(`   PATCH ${secondField.qdb_schema_name} -> ${patched.status}`);

// ── 5. Reading it back uses a third name ─────────────────────────────────────

line();
console.log('5. Reading back: _x_value, plus the FormattedValue annotation\n');

const readBack = await fetch(
  `${BASE}/${ENTITY_SET}(${recordId})?$select=qdb_target_attribute_logical_name,_qdb_form_definition_id_value,_qdb_form_field_id_value`,
  { headers: { ...H, Prefer: 'odata.include-annotations="*"' } },
).then((r) => r.json());

console.log(`   _qdb_form_definition_id_value = ${readBack._qdb_form_definition_id_value}`);
console.log(`      formatted -> ${readBack['_qdb_form_definition_id_value@OData.Community.Display.V1.FormattedValue']}`);
console.log(`   _qdb_form_field_id_value      = ${readBack._qdb_form_field_id_value}`);
console.log(`      formatted -> ${readBack['_qdb_form_field_id_value@OData.Community.Display.V1.FormattedValue']}`);

// ── 6. Clearing a lookup is not a null bind ──────────────────────────────────

line();
console.log('6. Clearing a lookup: both forms work on this org\n');

const nullBind = await send('PATCH', `${ENTITY_SET}(${recordId})`, { [`${fieldNav}@odata.bind`]: null });
console.log(`   PATCH "<navProp>@odata.bind": null -> ${nullBind.status} ${nullBind.ok ? '' : (nullBind.body?.error?.message ?? '').slice(0, 90)}`);

const deleteRef = await fetch(`${BASE}/${ENTITY_SET}(${recordId})/${fieldNav}/$ref`, { method: 'DELETE', headers: H });
console.log(`   DELETE /${ENTITY_SET}(id)/${fieldNav}/$ref -> ${deleteRef.status}`);

const afterClear = await get(`${ENTITY_SET}(${recordId})?$select=_qdb_form_field_id_value`);
console.log(`   _qdb_form_field_id_value is now ${afterClear._qdb_form_field_id_value ?? 'null'}`);

line();
console.log(`\nDemo row ${recordId} left in place, INACTIVE.`);
console.log(`Delete it with:  DELETE ${BASE}/${ENTITY_SET}(${recordId})\n`);
