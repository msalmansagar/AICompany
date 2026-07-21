/**
 * DFE-APILOOKUP-001 — demo of the external-API lookup source against a real, free
 * weather-service API (Open-Meteo geocoding). The lookup lets a user type a city name
 * and pick from live matches returned by the API — no CRM data involved.
 *
 * Endpoint key 'open-meteo-cities' is registered in the backend env as
 *   https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json
 * Typeahead mode sends the typed term as the 'name' query param.
 * Response: { results: [{ id, name, country, ... }] }  → value = id, label = name.
 *
 * Run: node --env-file=scripts/.env scripts/seed-weather-lookup-demo.mjs
 */
const T = process.env.DV_TENANT_ID;
const C = process.env.DV_CLIENT_ID;
const S = process.env.DV_CLIENT_SECRET;
const U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;

const FORM_CODE = 'weather-lookup-demo';
const FT = { text: 100000001, lookup: 100000008 };
const COL = { one: 100000001 };
const CS = { two: 100000002 };

async function token() {
  if (!S) throw new Error('DV_CLIENT_SECRET not set.');
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token: ${j.error_description}`);
  return j.access_token;
}
function client(tok) {
  const h = {
    Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation',
  };
  return {
    get: async (p) => { const r = await fetch(`${API}/${p}`, { headers: h }); const j = await r.json(); if (!r.ok) throw new Error(`GET ${p} → ${r.status}: ${j.error?.message}`); return j; },
    post: async (e, b) => { const r = await fetch(`${API}/${e}`, { method: 'POST', headers: h, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(`POST ${e} → ${r.status}: ${j.error?.message}`); return j; },
    del: async (p) => { await fetch(`${API}/${p}`, { method: 'DELETE', headers: h }); },
  };
}

async function main() {
  const db = client(await token());
  console.log('✓ Token acquired');

  const prior = await db.get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  for (const f of prior.value) { await db.del(`qdb_form_definitions(${f.qdb_form_definitionid})`); console.log(`  ✓ removed prior form ${f.qdb_form_definitionid}`); }

  const form = await db.post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Weather API Lookup Demo',
    qdb_description: 'Pick a city — options are fetched live from the Open-Meteo weather service via the backend proxy.',
    qdb_status: 100000001,
    qdb_version: 1,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`[Form] ${FORM_CODE} → ${fid}`);

  const tab = await db.post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Location', qdb_display_order: 1, qdb_is_visible: true,
  });
  const section = await db.post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: 'Choose a city', qdb_display_order: 1, qdb_columns: COL.one, qdb_is_visible: true,
  });
  const secId = section.qdb_form_sectionid;

  await db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
    qdb_schema_name: 'wl_label', qdb_field_type: FT.text, qdb_label: 'Report Title',
    qdb_display_order: 1, qdb_column_span: CS.two, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  });

  const lookupField = await db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
    qdb_schema_name: 'wl_city', qdb_field_type: FT.lookup, qdb_label: 'City (live from Open-Meteo weather API)',
    qdb_display_order: 2, qdb_column_span: CS.two, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  });
  console.log(`  ✓ lookup field ${lookupField.qdb_form_fieldid}`);

  await db.post('qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${lookupField.qdb_form_fieldid})`,
    // Entity columns are non-null in the schema but ignored when source='api'.
    qdb_entity_logical_name: 'external',
    qdb_display_attribute: 'name',
    qdb_value_attribute: 'id',
    qdb_search_min_chars: 2,
    qdb_max_results: 10,
    // DFE-APILOOKUP-001 — external weather-service API, typeahead on the 'name' param.
    qdb_lookup_source: 'api',
    qdb_lookup_api_endpoint_key: 'open-meteo-cities',
    qdb_lookup_api_value_path: 'id',
    qdb_lookup_api_label_path: 'name',
    qdb_lookup_api_search_mode: 'typeahead',
    qdb_lookup_api_search_param: 'name',
  });
  console.log('  ✓ lookup config: wl_city → "open-meteo-cities" (typeahead on name; value=id, label=name)');

  console.log(`\n=== Done. Open form code: ${FORM_CODE} (id ${fid}) ===`);
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
