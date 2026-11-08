/**
 * Seeds "Equipment Request" DIRECTLY VIA THE TABLES — no designer involved.
 *
 * The companion form, "Site Visit Request", is built through the designer UI instead, so the
 * two together show both creation paths landing on the same schema.
 *
 * This one carries the two features the demo video shows:
 *   - a LOOKUP that hides a tab   (Supplier = "Qatar National Bank" hides Delivery Details)
 *   - VALIDATION on grid columns  (required + max length, email format, custom pattern)
 *
 * Re-running deletes the form and its children first, so the demo is the current shape rather
 * than an accumulation of past runs.
 *
 * Run: node --env-file=scripts/.env scripts/seed-equipment-request-demo.mjs
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'equipment-request';

const FIELD_TYPE = { text: 100000001, lookup: 100000008, interactiveGrid: 100000021 };
const COLUMN_SPAN = { one: 100000001, two: 100000002 };
const SECTION_COLUMNS = { one: 100000001, two: 100000002 };
const FORM_STATUS_ACTIVE = 100000001;
const GRID_MODE_ENTRY = 100000001;

/** qdb_action option value for hideTab. */
const HIDE_TAB_ACTION_VALUE = 100000006;

/** Schema name of the lookup that drives the rule; the trigger must match it. */
const LOOKUP_FIELD_CODE = 'qdb_supplier';

/**
 * An account that really exists in this org, so the rule can be triggered by clicking.
 * qdb_country is NOT usable for this: it has 75 rows whose primary name is blank on every one.
 */
const RULE_MATCH_VALUE = 'Qatar National Bank';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Token: ${payload.error_description}`);
  return payload.access_token;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation',
  };
}

async function post(token, entity, body) {
  const response = await fetch(`${API_BASE}/${entity}`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`POST ${entity} → ${response.status}: ${payload.error?.message}`);
  return payload;
}

async function get(token, path) {
  const response = await fetch(`${API_BASE}/${path}`, { headers: headers(token) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${payload.error?.message}`);
  return payload;
}

async function remove(token, path) {
  const response = await fetch(`${API_BASE}/${path}`, { method: 'DELETE', headers: headers(token) });
  if (!response.ok && response.status !== 404) throw new Error(`DELETE ${path} → ${response.status}`);
}

/** Removes a previous run, children first — a rule left pointing at a deleted tab fails silently. */
async function deleteExistingForm(token) {
  const existing = await get(token,
    `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  for (const form of existing.value ?? []) {
    const formId = form.qdb_form_definitionid;

    const rules = await get(token,
      `qdb_form_business_rules?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_business_ruleid`);
    for (const rule of rules.value ?? []) {
      await remove(token, `qdb_form_business_rules(${rule.qdb_form_business_ruleid})`);
    }

    const tabs = await get(token,
      `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid`);
    for (const tab of tabs.value ?? []) {
      const sections = await get(token,
        `qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tab.qdb_form_tabid}&$select=qdb_form_sectionid`);
      for (const section of sections.value ?? []) {
        const fields = await get(token,
          `qdb_form_fields?$filter=_qdb_form_section_id_value eq ${section.qdb_form_sectionid}&$select=qdb_form_fieldid`);
        for (const field of fields.value ?? []) {
          const columns = await get(token,
            `qdb_grid_column_configs?$filter=_qdb_form_field_id_value eq ${field.qdb_form_fieldid}&$select=qdb_grid_column_configid`);
          for (const column of columns.value ?? []) {
            await remove(token, `qdb_grid_column_configs(${column.qdb_grid_column_configid})`);
          }
          await remove(token, `qdb_form_fields(${field.qdb_form_fieldid})`);
        }
        await remove(token, `qdb_form_sections(${section.qdb_form_sectionid})`);
      }
      await remove(token, `qdb_form_tabs(${tab.qdb_form_tabid})`);
    }

    // Render caches are keyed by FORM CODE, not by id — a stale one keeps being served to the
    // runtime after the form is rebuilt under the same code.
    const caches = await get(token,
      `qdb_form_render_caches?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_render_cacheid`);
    for (const cache of caches.value ?? []) {
      await remove(token, `qdb_form_render_caches(${cache.qdb_form_render_cacheid})`);
    }

    await remove(token, `qdb_form_definitions(${formId})`);
    console.log(`  ↷ removed previous "${FORM_CODE}"`);
  }
}

async function run() {
  console.log(`\n=== Seeding "${FORM_CODE}" directly via the tables ===\n`);
  const token = await acquireToken();
  console.log('✓ token');

  await deleteExistingForm(token);

  const form = await post(token, 'qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Equipment Request',
    qdb_description: 'Built directly from the tables — no designer involved.',
    qdb_status: FORM_STATUS_ACTIVE,
    qdb_version: 1,
    qdb_allow_save_draft: false,
    qdb_confirmation_message: 'Your equipment request has been submitted.',
    qdb_icon_name: 'Box',
    qdb_header_text: 'Equipment requests are reviewed within two working days.',
    qdb_footer_text: 'Questions? Call the procurement desk on 800 0000.',
  });
  const formId = form.qdb_form_definitionid;
  console.log(`✓ form ${formId}`);

  // ── Tab 1: the request, carrying the lookup that drives the rule ───────────
  const requestTab = await post(token, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Request', qdb_display_order: 1, qdb_is_visible: true,
    qdb_requires_previous_tab_complete: false, qdb_hide_tab_bar: false,
  });
  const requestSection = await post(token, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${requestTab.qdb_form_tabid})`,
    qdb_label: 'Request Details', qdb_display_order: 1, qdb_columns: SECTION_COLUMNS.two,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });

  await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${requestSection.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_equipment_name', qdb_field_type: FIELD_TYPE.text,
    qdb_label: 'Equipment Name', qdb_display_order: 1, qdb_column_span: COLUMN_SPAN.one,
    qdb_is_required: true, qdb_is_readonly: false, qdb_is_hidden: false,
  });

  const supplierField = await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${requestSection.qdb_form_sectionid})`,
    qdb_schema_name: LOOKUP_FIELD_CODE, qdb_field_type: FIELD_TYPE.lookup,
    qdb_label: 'Supplier', qdb_display_order: 2, qdb_column_span: COLUMN_SPAN.one,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  });
  await post(token, 'qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${supplierField.qdb_form_fieldid})`,
    qdb_entity_logical_name: 'account',
    qdb_display_attribute: 'name',
    qdb_search_min_chars: 1,
    qdb_max_results: 20,
  });
  console.log('✓ tab "Request" with the Supplier lookup');

  // ── Tab 2: the tab the rule hides, holding the validated grid ──────────────
  const deliveryTab = await post(token, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Delivery Details', qdb_display_order: 2, qdb_is_visible: true,
    qdb_requires_previous_tab_complete: false, qdb_hide_tab_bar: false,
  });
  const deliverySection = await post(token, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${deliveryTab.qdb_form_tabid})`,
    qdb_label: 'Delivery Contacts', qdb_display_order: 1, qdb_columns: SECTION_COLUMNS.one,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });

  const grid = await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${deliverySection.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_delivery_contacts', qdb_field_type: FIELD_TYPE.interactiveGrid,
    qdb_label: 'Delivery Contacts', qdb_display_order: 1, qdb_column_span: COLUMN_SPAN.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID_MODE_ENTRY, qdb_grid_entity_name: 'qdb_contact_person',
  });
  const gridId = grid.qdb_form_fieldid;

  const gridColumn = (name, body) => post(token, 'qdb_grid_column_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridId})`,
    qdb_grid_column_configname: name,
    qdb_column_field_type: 'text',
    qdb_is_visible: true,
    qdb_is_editable: true,
    ...body,
  });

  await gridColumn('eq-col-contact', {
    qdb_column_label: 'Contact Name', qdb_column_attribute: 'qdb_contact_name', qdb_display_order: 1,
    qdb_is_required: true, qdb_max_length: 40,
    qdb_validation_message: 'Give a contact name of 40 characters or fewer',
  });
  await gridColumn('eq-col-email', {
    qdb_column_label: 'Email', qdb_column_attribute: 'qdb_email', qdb_display_order: 2,
    qdb_is_required: true, qdb_validation_format: 'email',
  });
  await gridColumn('eq-col-ref', {
    qdb_column_label: 'Site Code', qdb_column_attribute: 'qdb_site_code', qdb_display_order: 3,
    qdb_validation_format: 'custom', qdb_validation_pattern: '^[A-Z]{2}[0-9]{4}$',
    qdb_validation_message: 'Use two capital letters then four digits, e.g. QA1234',
  });
  console.log('✓ tab "Delivery Details" with a validated 3-column grid');

  // ── The rule: a LOOKUP value hides a TAB ──────────────────────────────────
  // Matched on the lookup's display name — the engine tries the record id and the display
  // name, so a maker may configure either; the name is what they see on screen.
  const ruleDefinition = {
    version: '1.0',
    trigger_field_code: LOOKUP_FIELD_CODE,
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: LOOKUP_FIELD_CODE, operator: 'equals', value: RULE_MATCH_VALUE }],
    },
    actions: [{ action_type: 'hide_tab', target_tab_id: deliveryTab.qdb_form_tabid }],
  };
  // The structured columns mirror the single action, exactly as the designer now writes it.
  // Without them the record defaults to showField with no target — the opposite of the truth.
  await post(token, 'qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: `Hide Delivery Details when the supplier is ${RULE_MATCH_VALUE}`,
    qdb_conditions_json: JSON.stringify(ruleDefinition),
    qdb_priority: 1,
    qdb_is_active: true,
    qdb_action: HIDE_TAB_ACTION_VALUE,
    'qdb_target_tab_id@odata.bind': `/qdb_form_tabs(${deliveryTab.qdb_form_tabid})`,
  });
  console.log(`✓ rule: Supplier = "${RULE_MATCH_VALUE}" hides Delivery Details`);

  console.log(`\nSeeded. Form code: ${FORM_CODE}  |  id: ${formId}\n`);
}

run().catch(error => { console.error('\nSEED FAILED:', error.message); process.exit(1); });
