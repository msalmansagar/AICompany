/**
 * Why is my bar configuration not in the published JSON?
 *
 * For every bar field on a form, reports the four things that have to line up:
 *   1. the field is actually set to display as a bar
 *   2. a qdb_form_bar_config row exists and is COMPLETE
 *   3. the form has been republished since the config changed
 *   4. the value made it into the render-cache JSON
 *
 * The usual answer is (3) — the cache only regenerates on publish — or (2), because every
 * column on the config table is optional, so a half-filled row saves happily and is then
 * dropped at publish time rather than emitting a broken config.
 *
 * Run: node --env-file=scripts/.env scripts/inspect-bar-config.mjs [formCode]
 *      (omit formCode to scan every form that has a bar field)
 */
import zlib from 'node:zlib';

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const BAR_DISPLAY_STYLE = 100000002;
const targetFormCode = process.argv[2];

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

/** The published JSON for a form, or null when it has never been published. */
async function readCache(formId) {
  const response = await get(
    `qdb_form_render_caches?$filter=_qdb_form_definition_id_value eq ${formId}`
    + '&$select=qdb_runtime_json,modifiedon&$orderby=modifiedon desc&$top=1',
  );
  const row = response.value[0];
  if (!row) return null;
  try {
    return {
      modifiedOn: row.modifiedon,
      json: JSON.parse(zlib.gunzipSync(Buffer.from(row.qdb_runtime_json, 'base64')).toString('utf8')),
    };
  } catch {
    return null;
  }
}

function findFieldInJson(json, schemaName) {
  for (const tab of json.tabs ?? []) {
    for (const section of tab.sections ?? []) {
      const match = (section.fields ?? []).find((f) => f.schemaName === schemaName);
      if (match) return match;
    }
  }
  return null;
}

/** The reasons a config row would be dropped at publish time. */
function describeIncompleteness(config, sourceSchemaName) {
  const missing = [];
  if (!sourceSchemaName) missing.push('Source Lookup Field');
  if (!config.qdb_entity_logical_name) missing.push('Entity Logical Name');
  if (!config.qdb_max_attribute) missing.push('Maximum Attribute');
  return missing;
}

async function run() {
  const accessToken = await acquireToken();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json' };

  const formFilter = targetFormCode ? `&$filter=qdb_form_code eq '${targetFormCode}'` : '';
  const forms = await get(`qdb_form_definitions?$select=qdb_form_definitionid,qdb_form_code,qdb_title${formFilter}`);
  if (forms.value.length === 0) throw new Error(`No form found for code '${targetFormCode}'.`);

  const barFields = await get(
    `qdb_form_fields?$filter=qdb_number_display_style eq ${BAR_DISPLAY_STYLE}`
    + '&$select=qdb_form_fieldid,qdb_schema_name,qdb_bar_max_field_schema,qdb_bar_value_field_schema,_qdb_form_section_id_value,modifiedon',
  );
  const configs = await get(
    'qdb_form_bar_configs?$select=qdb_name,_qdb_form_field_id_value,_qdb_source_field_id_value,'
    + 'qdb_entity_logical_name,qdb_min_attribute,qdb_max_attribute,qdb_value_attribute,modifiedon',
  );
  const configByField = new Map(configs.value.map((c) => [c._qdb_form_field_id_value, c]));

  console.log(`Bar configuration report — ${DATAVERSE_URL}`);
  console.log(`bar fields: ${barFields.value.length}   bar config rows: ${configs.value.length}`);
  console.log('═'.repeat(74));

  // Section → form, so each bar field can be attributed to its form.
  const sectionIds = [...new Set(barFields.value.map((f) => f._qdb_form_section_id_value).filter(Boolean))];
  const sectionToForm = new Map();
  for (const sectionId of sectionIds) {
    const section = await get(`qdb_form_sections(${sectionId})?$select=_qdb_form_tab_id_value`);
    const tab = await get(`qdb_form_tabs(${section._qdb_form_tab_id_value})?$select=_qdb_form_definition_id_value`);
    sectionToForm.set(sectionId, tab._qdb_form_definition_id_value);
  }

  for (const form of forms.value) {
    const fields = barFields.value.filter(
      (f) => sectionToForm.get(f._qdb_form_section_id_value) === form.qdb_form_definitionid,
    );
    if (fields.length === 0) continue;

    const cache = await readCache(form.qdb_form_definitionid);
    console.log(`\nFORM ${form.qdb_form_code}`);
    console.log(`  cache: ${cache ? cache.modifiedOn : 'NEVER PUBLISHED — run republish-cached-forms.mjs'}`);

    for (const field of fields) {
      console.log(`\n  ${field.qdb_schema_name}`);
      const config = configByField.get(field.qdb_form_fieldid);

      if (!config) {
        const hasFieldBased = !!field.qdb_bar_max_field_schema;
        console.log(`    bar config row : none${hasFieldBased ? ' (using the field-based bar)' : ''}`);
        if (hasFieldBased) {
          console.log(`    max field      : ${field.qdb_bar_max_field_schema}`);
          console.log(`    value field    : ${field.qdb_bar_value_field_schema ?? "(this field's own value)"}`);
        } else {
          console.log('    ⚠ no bar config row AND no max field — this bar has nothing to read.');
        }
      } else {
        let sourceSchemaName = null;
        if (config._qdb_source_field_id_value) {
          const source = await get(`qdb_form_fields(${config._qdb_source_field_id_value})?$select=qdb_schema_name`);
          sourceSchemaName = source.qdb_schema_name;
        }
        const missing = describeIncompleteness(config, sourceSchemaName);

        console.log(`    bar config row : "${config.qdb_name}"  modified ${config.modifiedon}`);
        console.log(`    source lookup  : ${sourceSchemaName ?? '(EMPTY)'}`);
        console.log(`    entity         : ${config.qdb_entity_logical_name ?? '(EMPTY)'}`);
        console.log(`    min/max/value  : ${config.qdb_min_attribute ?? '-'} / ${config.qdb_max_attribute ?? '(EMPTY)'} / ${config.qdb_value_attribute ?? '-'}`);

        if (missing.length > 0) {
          console.log(`    ⚠ INCOMPLETE — publish drops this config. Missing: ${missing.join(', ')}`);
        }
        if (cache && config.modifiedon > cache.modifiedOn) {
          console.log('    ⚠ config is NEWER than the cache — republish the form.');
        }
      }

      if (!cache) continue;
      const published = findFieldInJson(cache.json, field.qdb_schema_name);
      if (!published) {
        console.log('    ⚠ field is NOT in the published JSON at all (hidden and unreferenced?)');
        continue;
      }
      console.log(`    JSON.barSourceConfig      = ${published.barSourceConfig ? JSON.stringify(published.barSourceConfig) : '(absent)'}`);
      console.log(`    JSON.barMaxFieldSchemaName= ${published.barMaxFieldSchemaName ?? '(absent)'}`);
    }
  }

  console.log(`\n${'═'.repeat(74)}`);
  console.log('If a config row is complete but absent from the JSON, republish:');
  console.log('  node --env-file=scripts/.env scripts/republish-cached-forms.mjs');
}

run().catch((e) => { console.error('\nINSPECTION FAILED:', e.message); process.exit(1); });
