/**
 * Seeds `rules-batch-2-demo` — one form that shows the four DFE-RULES-002 enhancements:
 *
 *   3. Disable specific options: Applicant type = Individual greys out the Gold and Platinum
 *      tiers in a dropdown, and one account in the Sponsor lookup.
 *   4. Arithmetic set value: Total = Quantity x Unit price, recalculated as either changes.
 *   5. Event start date: today up to the end of this month ten years out.
 *   6. Event end date: the same window, and never before the start date.
 *   1. Grid column rules: an Import shipment shows and requires the HS code column and makes
 *      Country of origin read-only; any other shipment type hides the HS code column.
 *   2. Related-record condition: the UAE declaration shows only when the selected Sponsor's own
 *      Country column is United Arab Emirates.
 *   7. Rating style: a five-option dropdown drawn as stars (needs the Rating option in the org).
 *
 * Then publishes the form and checks the published JSON carries every rule.
 *
 *   node --env-file=scripts/.env scripts/seed-rules-batch-2-demo.mjs [--force]
 */
const TENANT_ID = process.env.DV_TENANT_ID;
const CLIENT_ID = process.env.DV_CLIENT_ID;
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'rules-batch-2-demo';
const FORCE = process.argv.includes('--force');

const FIELD_TYPE = {
  text: 100000001, number: 100000003, date: 100000004, dropdown: 100000006,
  lookup: 100000008, decimal: 100000012, interactiveGrid: 100000021,
};
const GRID_MODE_ENTRY = 100000001;
const RADIO_STYLE_RATING = 100000002;
/** The Sponsor country the related-record rule looks for. */
const RELATED_COUNTRY = 'United Arab Emirates';
const SECTION_TWO_COLUMNS = 100000002;
const COLUMN_SPAN_ONE = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const STATUS_ACTIVE = 100000001;
const RULE_TYPE_CROSS_FIELD = 100000011;
const ACTION_CALCULATE_VALUE = 100000013;

/** Relative date tokens the runtime resolves (shared/src/engines/relativeDate.ts). */
const NOT_BEFORE_TODAY = '@today';
const WITHIN_TEN_YEARS = '@monthEnd+10y';

let H;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function post(entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${entitySet} -> ${res.status}: ${text.slice(0, 320)}`);
  return text ? JSON.parse(text) : null;
}

async function del(entitySet, id) {
  const res = await fetch(`${API}/${entitySet}(${id})`, { method: 'DELETE', headers: H });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${entitySet} -> ${res.status}`);
}

async function removeExisting(formId) {
  const rules = await get(`qdb_form_business_rules?$select=qdb_form_business_ruleid&$filter=_qdb_form_definition_id_value eq ${formId}`);
  for (const rule of rules.value) await del('qdb_form_business_rules', rule.qdb_form_business_ruleid);
  const caches = await get(`qdb_form_render_caches?$select=qdb_form_render_cacheid&$filter=qdb_form_code eq '${FORM_CODE}'`);
  for (const cache of caches.value) await del('qdb_form_render_caches', cache.qdb_form_render_cacheid);
  await del('qdb_form_definitions', formId);
}

/** Two real accounts: the one the rule disables, and one left selectable. */
async function pickAccounts() {
  const accounts = await get(`accounts?$select=accountid,name&$filter=statecode eq 0 and name ne null&$orderby=name asc&$top=2`);
  if (accounts.value.length < 2) throw new Error('Need at least two active accounts for the lookup demo.');
  return { disabled: accounts.value[0], allowed: accounts.value[1] };
}

function designerRule(formId, name, definition, extra = {}) {
  return post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: name,
    qdb_conditions_json: JSON.stringify(definition),
    qdb_priority: 100, qdb_is_active: true,
    ...extra,
  });
}

function crossFieldRule(fieldId, operator, targetFieldRef, errorMessage, priority) {
  return post('qdb_form_validation_rules', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_rule_type: RULE_TYPE_CROSS_FIELD,
    qdb_error_message: errorMessage,
    qdb_priority: priority, qdb_is_active: true,
    qdb_rule_json: JSON.stringify({ schemaVersion: 2, type: 'cross_field', operator, targetFieldRef }),
  });
}

async function seed(accounts) {
  const form = await post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE, qdb_title: 'Rules Batch 2 Demo',
    qdb_description: 'Disabled options, a calculated total, and event dates bounded by today and ten years out.',
    qdb_status: STATUS_ACTIVE, qdb_version: 1, qdb_allow_save_draft: false,
  });
  const formId = form.qdb_form_definitionid;

  const tab = await post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Event booking', qdb_display_order: 1, qdb_is_visible: true,
  });
  const makeSection = (label, order) => post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: label, qdb_display_order: order, qdb_columns: SECTION_TWO_COLUMNS, qdb_is_visible: true,
  });
  const makeField = (sectionId, attributes) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_column_span: COLUMN_SPAN_ONE, qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    ...attributes,
  });
  const makeOption = (fieldId, value, label, order) => post('qdb_form_option_values', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_value: value, qdb_label: label, qdb_display_order: order, qdb_is_active: true,
  });

  // ── 3. Disable specific options ─────────────────────────────────────────
  const secOptions = await makeSection('3 · Disable specific options', 1);
  const applicantType = await makeField(secOptions.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_applicant_type', qdb_label: 'Applicant type',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1,
  });
  await makeOption(applicantType.qdb_form_fieldid, 'company', 'Company', 1);
  await makeOption(applicantType.qdb_form_fieldid, 'individual', 'Individual', 2);

  const tier = await makeField(secOptions.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_tier', qdb_label: 'Membership tier',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 2,
  });
  await makeOption(tier.qdb_form_fieldid, 'silver', 'Silver', 1);
  await makeOption(tier.qdb_form_fieldid, 'gold', 'Gold', 2);
  await makeOption(tier.qdb_form_fieldid, 'platinum', 'Platinum', 3);

  const sponsor = await makeField(secOptions.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_sponsor', qdb_label: 'Sponsor',
    qdb_field_type: FIELD_TYPE.lookup, qdb_display_order: 3,
  });
  await post('qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${sponsor.qdb_form_fieldid})`,
    qdb_entity_logical_name: 'account', qdb_display_attribute: 'name',
    qdb_value_attribute: 'accountid', qdb_search_min_chars: 1, qdb_max_results: 20,
  });

  await designerRule(formId, 'Individuals cannot pick premium tiers or the restricted sponsor', {
    version: '1.0',
    trigger_field_code: 'rb2_applicant_type',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'rb2_applicant_type', operator: 'equals', value: 'individual' }],
    },
    actions: [
      { action_type: 'disable_options', target_field_code: 'rb2_tier', value: JSON.stringify(['gold', 'platinum']) },
      { action_type: 'disable_options', target_field_code: 'rb2_sponsor', value: JSON.stringify([accounts.disabled.accountid]) },
    ],
  });

  // ── 4. Arithmetic set value ─────────────────────────────────────────────
  const secCalc = await makeSection('4 · Calculated value', 2);
  await makeField(secCalc.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_quantity', qdb_label: 'Quantity (tickets)',
    qdb_field_type: FIELD_TYPE.number, qdb_display_order: 1,
  });
  await makeField(secCalc.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_unit_price', qdb_label: 'Unit price',
    qdb_field_type: FIELD_TYPE.decimal, qdb_display_order: 2,
  });
  const total = await makeField(secCalc.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_total', qdb_label: 'Total (calculated)',
    qdb_field_type: FIELD_TYPE.decimal, qdb_display_order: 3, qdb_is_readonly: true,
  });

  // Two triggers, so the total recalculates whichever input changes: the publisher attaches
  // a designer rule to its trigger field.
  for (const trigger of ['rb2_quantity', 'rb2_unit_price']) {
    await designerRule(formId, `Total = Quantity x Unit price (on ${trigger})`, {
      version: '1.0',
      trigger_field_code: trigger,
      trigger_event: 'on_change',
      condition_group: {
        logical_operator: 'AND',
        conditions: [
          { field_code: 'rb2_quantity', operator: 'is_not_empty', value: null },
          { field_code: 'rb2_unit_price', operator: 'is_not_empty', value: null },
        ],
      },
      actions: [{ action_type: 'calculate_value', target_field_code: 'rb2_total', value: '{rb2_quantity} * {rb2_unit_price}' }],
    }, {
      qdb_action: ACTION_CALCULATE_VALUE,
      'qdb_target_field_id@odata.bind': `/qdb_form_fields(${total.qdb_form_fieldid})`,
      qdb_action_value: '{rb2_quantity} * {rb2_unit_price}',
    });
  }

  // ── 5 & 6. Event dates ──────────────────────────────────────────────────
  const secDates = await makeSection('5 & 6 · Event dates', 3);
  const start = await makeField(secDates.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_event_start', qdb_label: 'Event start date',
    qdb_field_type: FIELD_TYPE.date, qdb_display_order: 1,
  });
  const end = await makeField(secDates.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_event_end', qdb_label: 'Event end date',
    qdb_field_type: FIELD_TYPE.date, qdb_display_order: 2,
  });

  await crossFieldRule(start.qdb_form_fieldid, '>=', NOT_BEFORE_TODAY, 'Event start date cannot be in the past.', 1);
  await crossFieldRule(start.qdb_form_fieldid, '<=', WITHIN_TEN_YEARS, 'Event start date must be within 10 years from the current month.', 2);
  await crossFieldRule(end.qdb_form_fieldid, '>=', NOT_BEFORE_TODAY, 'Event end date cannot be in the past.', 1);
  await crossFieldRule(end.qdb_form_fieldid, '<=', WITHIN_TEN_YEARS, 'Event end date must be within 10 years from the current month.', 2);
  await crossFieldRule(end.qdb_form_fieldid, '>=', 'rb2_event_start', 'Event end date cannot be before the start date.', 3);

  // ── 1. Business rules on grid columns ───────────────────────────────────
  const secGrid = await makeSection('1 · Grid column rules', 4);
  const shipment = await makeField(secGrid.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_shipment_type', qdb_label: 'Shipment type',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1,
  });
  await makeOption(shipment.qdb_form_fieldid, 'domestic', 'Domestic', 1);
  await makeOption(shipment.qdb_form_fieldid, 'import', 'Import', 2);

  const grid = await makeField(secGrid.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_items', qdb_label: 'Line items',
    qdb_field_type: FIELD_TYPE.interactiveGrid, qdb_display_order: 2, qdb_column_span: COLUMN_SPAN_TWO,
    qdb_grid_mode: GRID_MODE_ENTRY, qdb_max_rows: 10, qdb_grid_min_rows: 0,
    qdb_grid_entity_name: 'qdb_demo_document',
  });
  const makeGridColumn = (attributes) => post('qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${grid.qdb_form_fieldid})`,
    qdb_is_visible: true, qdb_is_editable: true, qdb_column_field_type: 'text', ...attributes,
  });
  await makeGridColumn({ qdb_column_label: 'Description', qdb_column_attribute: 'rb2_desc', qdb_display_order: 1 });
  const hsCode = await makeGridColumn({ qdb_column_label: 'HS code (imports only)', qdb_column_attribute: 'rb2_hs_code', qdb_display_order: 2 });
  const origin = await makeGridColumn({ qdb_column_label: 'Country of origin', qdb_column_attribute: 'rb2_origin', qdb_display_order: 3 });

  const columnAction = (actionType, columnId) =>
    ({ action_type: actionType, target_field_code: 'rb2_items', target_column_id: columnId });
  await designerRule(formId, 'Imports show and require HS code; origin becomes read-only', {
    version: '1.0',
    trigger_field_code: 'rb2_shipment_type',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'rb2_shipment_type', operator: 'equals', value: 'import' }],
    },
    actions: [
      columnAction('show_column', hsCode.qdb_grid_column_configid),
      columnAction('make_column_required', hsCode.qdb_grid_column_configid),
      columnAction('make_column_readonly', origin.qdb_grid_column_configid),
    ],
  });
  await designerRule(formId, 'Domestic shipments hide HS code', {
    version: '1.0',
    trigger_field_code: 'rb2_shipment_type',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'OR',
      conditions: [
        { field_code: 'rb2_shipment_type', operator: 'not_equals', value: 'import' },
        { field_code: 'rb2_shipment_type', operator: 'is_empty', value: null },
      ],
    },
    actions: [columnAction('hide_column', hsCode.qdb_grid_column_configid)],
  });

  // ── 2. Condition on the record selected in a lookup ─────────────────────
  // Reads the Sponsor's own Country column. The demo accounts carry little data and this is a
  // shared org, so the seed does not edit accounts: one of them already has a country set.
  const secRelated = await makeSection('2 · Condition on the selected sponsor record', 6);
  await makeField(secRelated.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_uae_declaration', qdb_label: 'UAE sponsor declaration (shown when the sponsor is in the UAE)',
    qdb_field_type: FIELD_TYPE.text, qdb_display_order: 1, qdb_column_span: COLUMN_SPAN_TWO,
  });
  const sponsorCountryRule = (name, operator, actionType) => designerRule(formId, name, {
    version: '1.0',
    trigger_field_code: 'rb2_sponsor',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'rb2_sponsor', related_attribute: 'address1_country', operator, value: RELATED_COUNTRY }],
    },
    actions: [{ action_type: actionType, target_field_code: 'rb2_uae_declaration' }],
  });
  await sponsorCountryRule('Show the UAE declaration for a UAE sponsor', 'equals', 'show_field');
  await sponsorCountryRule('Hide the UAE declaration otherwise', 'not_equals', 'hide_field');

  // ── 7. Dropdown drawn as a rating ───────────────────────────────────────
  const secRating = await makeSection('7 · Rating style', 5);
  const ratingStyle = await ratingOptionExists() ? { qdb_radio_render_style: RADIO_STYLE_RATING } : {};
  const satisfaction = await makeField(secRating.qdb_form_sectionid, {
    qdb_schema_name: 'rb2_satisfaction', qdb_label: 'How satisfied are you with the venue?',
    qdb_field_type: FIELD_TYPE.dropdown, qdb_display_order: 1, ...ratingStyle,
  });
  const ratingLabels = ['Very poor', 'Poor', 'Average', 'Good', 'Excellent'];
  for (const [index, label] of ratingLabels.entries()) {
    await makeOption(satisfaction.qdb_form_fieldid, String(index + 1), label, index + 1);
  }
  if (!ratingStyle.qdb_radio_render_style) {
    console.log('  NOTE: the Rating option is not in this org yet, so "rb2_satisfaction" draws as a plain dropdown.');
    console.log('        Run provision-rating-render-style.mjs, then reseed with --force.');
  }

  return formId;
}

async function ratingOptionExists() {
  const path = `EntityDefinitions(LogicalName='qdb_form_field')/Attributes(LogicalName='qdb_radio_render_style')`
    + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)';
  const metadata = await get(path);
  return metadata.OptionSet.Options.some((option) => option.Value === RADIO_STYLE_RATING);
}

async function publishAndRead() {
  const res = await fetch(`${API}/qdb_PublishForm`, {
    method: 'POST', headers: H, body: JSON.stringify({ FormCode: FORM_CODE, TargetVersion: 1, PublishJobId: '' }),
  });
  if (!res.ok) throw new Error(`qdb_PublishForm -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const caches = await get(`qdb_form_render_caches?$select=qdb_form_render_cacheid&$filter=qdb_form_code eq '${FORM_CODE}'`);
    if (caches.value.length >= 1) break;
  }
  const read = await fetch(`${API}/qdb_GetPublishedFormJson`, {
    method: 'POST', headers: H, body: JSON.stringify({ FormCode: FORM_CODE, LanguageCode: 'en', Version: 0 }),
  });
  const body = await read.json();
  if (!read.ok || body.errorCode) throw new Error(`qdb_GetPublishedFormJson -> ${read.status} ${JSON.stringify(body).slice(0, 300)}`);
  return JSON.parse(body.RuntimeJson);
}

function check(label, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return passed;
}

function verify(json, accounts) {
  const fields = json.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  const byCode = Object.fromEntries(fields.map((f) => [f.schemaName, f]));
  const rules = fields.flatMap((f) => f.businessRules ?? []);
  const disable = rules.filter((r) => r.action === 'disableOptions');
  const calc = rules.filter((r) => r.action === 'calculateValue');
  const crossOf = (code) => (byCode[code].validationRules ?? []).filter((v) => v.ruleType === 'crossField');
  const startBounds = crossOf('rb2_event_start').map((v) => `${v.crossFieldOperator} ${v.crossFieldTargetRef}`);
  const endBounds = crossOf('rb2_event_end').map((v) => `${v.crossFieldOperator} ${v.crossFieldTargetRef}`);

  return [
    check('3. tier: Gold + Platinum disabled for individuals',
      disable.some((r) => r.targetFieldId === byCode.rb2_tier.id && r.actionValue === '["gold","platinum"]')),
    check(`3. sponsor: "${accounts.disabled.name}" disabled for individuals`,
      disable.some((r) => r.targetFieldId === byCode.rb2_sponsor.id && r.actionValue.includes(accounts.disabled.accountid))),
    check('4. total calculated from quantity x unit price (both triggers)',
      calc.length === 2 && calc.every((r) => r.targetFieldId === byCode.rb2_total.id && r.actionValue === '{rb2_quantity} * {rb2_unit_price}')),
    check('5. start date bounds', ['>= @today', '<= @monthEnd+10y'].every((b) => startBounds.includes(b)), startBounds.join(', ')),
    check('6. end date bounds + not before start', ['>= @today', '<= @monthEnd+10y', '>= rb2_event_start'].every((b) => endBounds.includes(b)), endBounds.join(', ')),
    check('1. grid column rules published with grid + column targets',
      ['showColumn', 'makeColumnRequired', 'makeColumnReadonly', 'hideColumn'].every((action) =>
        rules.some((r) => r.action === action && r.targetFieldId === byCode.rb2_items.id && r.targetColumnId))),
    check('2. declaration rules read the sponsor record country',
      ['showField', 'hideField'].every((action) => rules.some((r) => r.action === action
        && r.conditions.some((c) => c.fieldId === 'rb2_sponsor' && c.relatedAttribute === 'address1_country')))),
    check('7. satisfaction field draws as a rating', byCode.rb2_satisfaction.radioRenderStyle === 'rating',
      `radioRenderStyle=${byCode.rb2_satisfaction.radioRenderStyle}`),
  ].every(Boolean);
}

async function run() {
  H = { Authorization: `Bearer ${await token()}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };
  const existing = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    if (!FORCE) { console.log(`Form '${FORM_CODE}' already exists. Pass --force to reseed.`); return; }
    await removeExisting(existing.value[0].qdb_form_definitionid);
  }
  const accounts = await pickAccounts();
  const formId = await seed(accounts);
  console.log(`seeded ${FORM_CODE}: form ${formId}`);
  console.log(`  sponsor disabled for individuals: "${accounts.disabled.name}"; still selectable: "${accounts.allowed.name}"`);
  const json = await publishAndRead();
  const ok = verify(json, accounts);
  console.log(`\nOpen: ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=qdb_form_runtime.html&data=${formId}`);
  process.exit(ok ? 0 : 1);
}

run().catch((error) => { console.error('SEED FAILED:', error.message); process.exit(1); });
