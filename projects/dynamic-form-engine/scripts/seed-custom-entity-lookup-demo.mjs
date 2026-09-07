/**
 * DEMO: writing a lookup onto a CUSTOM entity, and what the new Submission Mapping
 * override columns do.
 *
 * Everything here is custom (`qdb_`) — the point being that with custom tables NEITHER
 * name involved in a lookup write can be guessed from the column:
 *
 *   child  : qdb_nfgapplication            (currently empty in this org — safe to seed)
 *   target : qdb_applicationstatus
 *            entity set  = qdb_applicationstatuses    NOT qdb_applicationstatuss  ← 404
 *   columns: qdb_externalstatus → navigation property qdb_ExternalStatus  ← casing differs
 *            qdb_internalstatus → navigation property qdb_InternalStatus
 *
 * The form maps BOTH lookups to the same target table, deliberately:
 *
 *   External Status → mapping WITH the override columns filled in
 *                     (qdb_target_navigation_property + qdb_target_entity_set_name)
 *   Internal Status → mapping with them BLANK, resolved from metadata
 *
 * Both produce the identical @odata.bind. That is the lesson: blank is the normal case,
 * and the override is only an escape hatch for an environment where metadata cannot be
 * read. See docs/DEVELOPER-GUIDE-lookup-binding.md §8.
 *
 * Run: node --env-file=scripts/.env scripts/seed-custom-entity-lookup-demo.mjs
 * Idempotent: guards on the form code; re-running is a no-op.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'custom-entity-lookup-demo';
const CHILD_ENTITY = 'qdb_nfgapplication';
const TARGET_ENTITY = 'qdb_applicationstatus';
const TARGET_ENTITY_SET = 'qdb_applicationstatuses';

const FIELD_TYPE = { text: 100000001, lookup: 100000008 };
const COLUMN_SPAN = { two: 100000002 };
const SECTION_COLUMNS = { one: 100000001 };
const STATUS_ACTIVE = 100000001;

const DEMO_STATUSES = ['DFE DEMO — Approved', 'DFE DEMO — Under Review'];

let H;

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token request failed');
  return j.access_token;
}

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Reference rows to point the demo lookups at — the table is empty in this org. */
async function ensureStatusRecords() {
  const existing = await get(`${TARGET_ENTITY_SET}?$select=${TARGET_ENTITY}id,qdb_name&$filter=startswith(qdb_name,'DFE DEMO')`);
  if (existing.value.length >= DEMO_STATUSES.length) {
    console.log(`  ${existing.value.length} demo status rows already present`);
    return existing.value;
  }

  const created = [];
  for (const name of DEMO_STATUSES) {
    created.push(await post(TARGET_ENTITY_SET, { qdb_name: name }));
    console.log(`  created status '${name}'`);
  }
  return created;
}

async function run() {
  const accessToken = await acquireToken();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  const existingForm = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existingForm.value.length > 0) {
    console.log(`Form '${FORM_CODE}' already exists (${existingForm.value[0].qdb_form_definitionid}) — nothing to do.`);
    return;
  }

  console.log(`Seeding '${FORM_CODE}'\n${'─'.repeat(66)}`);
  await ensureStatusRecords();

  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Custom Entity Lookup Binding Demo',
    qdb_description:
      'Writes two lookups onto a custom entity. One mapping pins the binding with the '
      + 'override columns; the other resolves it from metadata. Both produce the same @odata.bind.',
    qdb_status: STATUS_ACTIVE,
    qdb_version: 1,
    qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;
  console.log(`  form ${formId}`);

  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Application',
    qdb_display_order: 1,
    qdb_is_visible: true,
  });
  const section = await post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: 'Details',
    qdb_display_order: 1,
    qdb_columns: SECTION_COLUMNS.one,
    qdb_is_visible: true,
  });

  const makeField = (attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${section.qdb_form_sectionid})`,
    qdb_column_span: COLUMN_SPAN.two,
    qdb_is_required: false,
    qdb_is_readonly: false,
    qdb_is_hidden: false,
    ...attributes,
  });

  const nameField = await makeField({
    qdb_schema_name: 'cel_application_name',
    qdb_label: 'Application name',
    qdb_field_type: FIELD_TYPE.text,
    qdb_display_order: 1,
  });

  const externalField = await makeField({
    qdb_schema_name: 'cel_external_status',
    qdb_label: 'External Status (binding PINNED on the mapping)',
    qdb_field_type: FIELD_TYPE.lookup,
    qdb_display_order: 2,
  });
  const internalField = await makeField({
    qdb_schema_name: 'cel_internal_status',
    qdb_label: 'Internal Status (binding RESOLVED from metadata)',
    qdb_field_type: FIELD_TYPE.lookup,
    qdb_display_order: 3,
  });

  // Both lookup controls read the same custom reference table.
  for (const field of [externalField, internalField]) {
    await post('qdb_form_lookup_configs', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${field.qdb_form_fieldid})`,
      qdb_entity_logical_name: TARGET_ENTITY,
      qdb_display_attribute: 'qdb_name',
      qdb_value_attribute: `${TARGET_ENTITY}id`,
    });
  }
  console.log('  fields + lookup configs created');

  const makeMapping = (field, attribute, overrides) => post('qdb_form_submission_mappings', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${field.qdb_form_fieldid})`,
    qdb_target_entity_logical_name: CHILD_ENTITY,
    qdb_target_attribute_logical_name: attribute,
    qdb_is_child_entity: false,
    qdb_is_active: true,
    ...overrides,
  });

  await makeMapping(nameField, 'qdb_name', {});

  // THE POINT OF THE DEMO — the two new override columns, filled in by hand.
  await makeMapping(externalField, 'qdb_externalstatus', {
    qdb_target_navigation_property: 'qdb_ExternalStatus',
    qdb_target_entity_set_name: TARGET_ENTITY_SET,
  });
  console.log('  mapping 1: qdb_externalstatus  → overrides PINNED (qdb_ExternalStatus / qdb_applicationstatuses)');

  // The same write, with both override columns left blank.
  await makeMapping(internalField, 'qdb_internalstatus', {});
  console.log('  mapping 2: qdb_internalstatus  → overrides BLANK (resolved from metadata)');

  console.log(`${'─'.repeat(66)}`);
  console.log(`Portal:  http://localhost:3000/forms/${FORM_CODE}`);
  console.log(`In CRM:  ...&pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
  console.log('\nWhat to show the team:');
  console.log(`  · target entity set is '${TARGET_ENTITY_SET}', NOT '${TARGET_ENTITY}s' (that 404s)`);
  console.log("  · nav property 'qdb_ExternalStatus' differs from the column 'qdb_externalstatus' by casing");
  console.log('  · both mappings emit the same "<navProp>@odata.bind": "/<entitySet>(<guid>)"');
}

run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
