/**
 * Controlled repro for 4 enhancement points, on ONE form (repro-4points):
 *   #1  Arabic scoped-button translation — a tab-scoped button "Verify" with an Arabic
 *       translation record; expected: field labels translate but the button stays English.
 *   #4  Field show/hide rule — hideField "Employer Name" when Employment Status = unemployed
 *       (a clean GUID-based rule); we check whether it lands in the JSON and works.
 *   #2  Multi-column lookup — a Company lookup (account) showing a single display column.
 *   #3  Language-aware lookup — Company lookup uses one display attribute regardless of lang.
 *
 * Also seeds an Arabic translation for the form title + a field label + the scoped button,
 * so #1 can be seen starkly (label translates, button does not).
 *
 * Run: node --env-file=scripts/.env scripts/seed-repro-4points.mjs
 */
const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;
const FORM_CODE = 'repro-4points';

const FT  = { text: 100000001, dropdown: 100000006, lookup: 100000008 };
const BRA = { showField: 100000001, hideField: 100000002 };
const COL = { one: 100000001 };
const CS  = { two: 100000002 };
const AND = 100000000;

async function token() {
  if (!S) throw new Error('DV_CLIENT_SECRET not set.');
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json(); if (!r.ok) throw new Error(`token: ${j.error_description}`); return j.access_token;
}
function db(tok) {
  const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation' };
  return {
    get: async (p) => { const r = await fetch(`${API}/${p}`, { headers: h }); const j = await r.json(); if (!r.ok) throw new Error(`GET ${p} → ${r.status}: ${j.error?.message}`); return j; },
    post: async (e, b) => { const r = await fetch(`${API}/${e}`, { method: 'POST', headers: h, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(`POST ${e} → ${r.status}: ${j.error?.message}`); return j; },
    del: async (p) => { await fetch(`${API}/${p}`, { method: 'DELETE', headers: h }); },
  };
}

async function main() {
  const c = db(await token());
  console.log('✓ Token acquired');

  const prior = await c.get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  for (const f of prior.value) { await c.del(`qdb_form_definitions(${f.qdb_form_definitionid})`); console.log(`  ✓ removed prior ${f.qdb_form_definitionid}`); }

  // Nav properties for scoped-button binds.
  const btnRel = await c.get(`EntityDefinitions(LogicalName='qdb_form_scoped_button')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`);
  const BTN_FORM_NAV = btnRel.value.find(r => r.ReferencedEntity === 'qdb_form_definition').ReferencingEntityNavigationPropertyName;
  const BTN_TAB_NAV = btnRel.value.find(r => r.ReferencedEntity === 'qdb_form_tab').ReferencingEntityNavigationPropertyName;

  const form = await c.post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: '4-Point Repro Form',
    qdb_description: 'Repro for scoped-button Arabic translation, field show/hide rules, and lookup multi-column / language.',
    qdb_status: 100000001, qdb_version: 1,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`[Form] ${FORM_CODE} → ${fid}`);

  const tab = await c.post('qdb_form_tabs', { 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_label: 'Details', qdb_display_order: 1, qdb_is_visible: true });
  const tabId = tab.qdb_form_tabid;
  const section = await c.post('qdb_form_sections', { 'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`, qdb_label: 'Application', qdb_display_order: 1, qdb_columns: COL.one, qdb_is_visible: true });
  const secId = section.qdb_form_sectionid;

  const field = (body) => c.post('qdb_form_fields', { 'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false, qdb_column_span: CS.two, ...body });

  // #4 trigger + target
  const empStatus = await field({ qdb_schema_name: 'qdb_r4_empstatus', qdb_field_type: FT.dropdown, qdb_label: 'Employment Status', qdb_display_order: 1 });
  for (const [i, [v, l]] of [['employed', 'Employed'], ['unemployed', 'Unemployed']].entries()) {
    await c.post('qdb_form_option_values', { 'qdb_form_field_id@odata.bind': `/qdb_form_fields(${empStatus.qdb_form_fieldid})`, qdb_value: v, qdb_label: l, qdb_display_order: i + 1, qdb_is_active: true });
  }
  const employer = await field({ qdb_schema_name: 'qdb_r4_employer', qdb_field_type: FT.text, qdb_label: 'Employer Name', qdb_display_order: 2 });
  console.log('  ✓ #4 fields: Employment Status (dropdown) + Employer Name (text)');

  // #4 rule: hideField Employer Name when Employment Status = unemployed (clean GUID condition)
  await c.post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_name: 'Hide Employer Name when Unemployed',
    qdb_conditions_json: JSON.stringify([{ fieldId: empStatus.qdb_form_fieldid, operator: 'equals', value: 'unemployed' }]),
    qdb_conditions_logic: AND, qdb_action: BRA.hideField,
    'qdb_target_field_id@odata.bind': `/qdb_form_fields(${employer.qdb_form_fieldid})`,
    qdb_priority: 10, qdb_is_active: true,
  });
  console.log('  ✓ #4 rule: hideField Employer Name when Employment Status = unemployed');

  // #2/#3 lookup → account, single display attribute
  const company = await field({ qdb_schema_name: 'qdb_r4_company', qdb_field_type: FT.lookup, qdb_label: 'Company', qdb_display_order: 3 });
  await c.post('qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${company.qdb_form_fieldid})`,
    qdb_entity_logical_name: 'account', qdb_display_attribute: 'name', qdb_value_attribute: 'accountid',
    qdb_search_min_chars: 1, qdb_max_results: 10,
  });
  console.log('  ✓ #2/#3 lookup: Company → account (single display attribute "name")');

  // #1 tab-scoped button
  const btn = await c.post('qdb_form_scoped_buttons', {
    [`${BTN_FORM_NAV}@odata.bind`]: `/qdb_form_definitions(${fid})`,
    [`${BTN_TAB_NAV}@odata.bind`]: `/qdb_form_tabs(${tabId})`,
    qdb_label: 'Verify', qdb_placement_scope: 'tab', qdb_display_order: 1, qdb_is_primary: false,
    qdb_is_visible: true, qdb_confirm_required: false, qdb_is_active: true,
    qdb_action_type: 'saveDraft', qdb_action_config_json: '{}',
  });
  console.log('  ✓ #1 tab-scoped button "Verify"');

  // Arabic translations: form title, a field label, tab label, AND the scoped button label.
  const tr = (entity, recordId, fieldName, value) => c.post('qdb_translations', {
    qdb_entity_name: entity, qdb_record_id: recordId, qdb_field_name: fieldName, qdb_language_code: 'ar', qdb_translated_value: value,
  });
  await tr('qdb_form_definition', fid, 'qdb_title', 'نموذج اختبار النقاط الأربع');
  await tr('qdb_form_tab', tabId, 'qdb_label', 'التفاصيل');
  await tr('qdb_form_field', employer.qdb_form_fieldid, 'qdb_label', 'اسم صاحب العمل');
  await tr('qdb_form_field', empStatus.qdb_form_fieldid, 'qdb_label', 'الحالة الوظيفية');
  await tr('qdb_form_field', company.qdb_form_fieldid, 'qdb_label', 'الشركة');
  await tr('qdb_form_scoped_button', btn.qdb_form_scoped_buttonid, 'qdb_label', 'تحقّق');  // <-- key: does the button translate?
  console.log('  ✓ Arabic translations seeded (incl. the scoped button label "تحقّق")');

  console.log(`\n=== Done. Open form code: ${FORM_CODE} (id ${fid}). Buttons id: ${btn.qdb_form_scoped_buttonid} ===`);
}
main().catch(e => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
