/**
 * Seeds one form on org5869857f that exercises every point of the six-point batch.
 *
 *   1  Grid column validation — required / max length / format, with a custom pattern
 *   2  Form icon and image     — an icon on the form definition
 *   3  1000-character label    — a submit-confirmation label longer than the old 200 cap
 *   4  Tab rule from a lookup  — a Country lookup hides the Company Documents tab
 *   5  Hidden grid column      — a column that publishes but is not drawn
 *   6  Header and footer bands — maker-authored text and image above and below the form
 *
 * Re-running deletes the form and its children first, so the demo is always the current
 * shape rather than an accumulation of past runs.
 *
 * Run: node --env-file=scripts/.env scripts/seed-six-point-demo.mjs
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;
const FORM_CODE = 'six-point-demo';

// Picklist codes, matching CrmMetadataService and the provisioning scripts.
const FIELD_TYPE = { text: 100000001, dropdown: 100000006, lookup: 100000008, interactiveGrid: 100000021 };
const COLUMN_SPAN = { one: 100000001, two: 100000002 };
const SECTION_COLUMNS = { one: 100000001, two: 100000002 };
const FORM_STATUS_ACTIVE = 100000001;
const GRID_MODE_ENTRY = 100000001;

// Point 3: longer than the old String(200) cap, so the widened column is visibly in use.
const LONG_ACKNOWLEDGEMENT = 'I confirm that every detail supplied in this application is '
  + 'accurate and complete to the best of my knowledge, that I am authorised to submit it on '
  + 'behalf of the applicant named above, and that I understand the information provided will '
  + 'be used to assess eligibility. I accept that any material omission or misstatement may '
  + 'result in the application being declined or, where already approved, withdrawn, and that '
  + 'supporting documents may be verified with the issuing authority.';

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const response = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
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
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${path} → ${response.status}`);
  }
}

/**
 * Deletes a previous run's form and everything hanging off it.
 *
 * Children are removed explicitly rather than relying on cascade: a leftover business rule
 * pointing at a deleted tab is exactly the silent failure this batch added a linter rule for.
 */
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

    await remove(token, `qdb_form_definitions(${formId})`);
    console.log(`  ↷ removed previous "${FORM_CODE}" (${formId})`);
  }
}

async function run() {
  console.log(`\n=== Seeding "${FORM_CODE}" — the six-point demo ===\n`);
  const token = await acquireToken();
  console.log('✓ token');

  await deleteExistingForm(token);

  // ── Points 2, 3 and 6 all live on the form definition ──────────────────────
  const form = await post(token, 'qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Six-Point Demo',
    qdb_description: 'One form exercising all six points of the batch.',
    qdb_status: FORM_STATUS_ACTIVE,
    qdb_version: 1,
    qdb_allow_save_draft: false,
    qdb_confirmation_message: 'Thank you. Your application has been submitted.',
    // Point 2 — the form's own mark. An icon rather than an image URL, so the demo does
    // not depend on a third-party host the portal CSP has not been told about.
    qdb_icon_name: 'DocumentBulletList',
    // Point 3 — 470-odd characters, well past the old String(200) ceiling.
    qdb_submit_confirmation_label: LONG_ACKNOWLEDGEMENT,
    qdb_submit_confirmation_message: 'You are about to submit this application. Continue?',
    // Point 6 — maker-authored bands above and below the form.
    qdb_header_text: 'Applications for the 2026 cycle close on 31 March.\n'
      + 'Have your commercial registration to hand before you begin.',
    qdb_footer_text: 'Need help? Call 800 0000, Sunday to Thursday, 8am–4pm.\n'
      + 'Qatar Development Bank — this is a demonstration form.',
  });
  const formId = form.qdb_form_definitionid;
  console.log(`✓ form definition ${formId}`);
  console.log('  · point 2 — icon DocumentBulletList');
  console.log(`  · point 3 — acknowledgement label, ${LONG_ACKNOWLEDGEMENT.length} chars`);
  console.log('  · point 6 — header and footer bands');

  // ── Tab 1: applicant details, carrying the lookup that drives point 4 ──────
  const applicantTab = await post(token, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Applicant', qdb_display_order: 1, qdb_is_visible: true,
    qdb_requires_previous_tab_complete: false, qdb_hide_tab_bar: false,
  });
  const applicantSection = await post(token, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${applicantTab.qdb_form_tabid})`,
    qdb_label: 'Applicant Details', qdb_display_order: 1, qdb_columns: SECTION_COLUMNS.two,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });

  await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${applicantSection.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_applicant_name', qdb_field_type: FIELD_TYPE.text,
    qdb_label: 'Applicant Name', qdb_display_order: 1, qdb_column_span: COLUMN_SPAN.one,
    qdb_is_required: true, qdb_is_readonly: false, qdb_is_hidden: false,
  });

  // The lookup that drives point 4. A dropdown would have worked too, but the whole point
  // is that a LOOKUP can now drive a rule — its stored { id, displayName } used to make
  // every equals comparison fail.
  const countryField = await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${applicantSection.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_country', qdb_field_type: FIELD_TYPE.lookup,
    qdb_label: 'Country of Registration', qdb_display_order: 2, qdb_column_span: COLUMN_SPAN.one,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
  });

  // Where the lookup searches. This lives on its own entity, not on the field.
  await post(token, 'qdb_form_lookup_configs', {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${countryField.qdb_form_fieldid})`,
    qdb_entity_logical_name: 'qdb_country',
    qdb_display_attribute: 'qdb_name',
    qdb_search_min_chars: 1,
    qdb_max_results: 20,
  });
  console.log(`✓ tab "Applicant" with the Country lookup (${countryField.qdb_form_fieldid})`);

  // ── Tab 2: the tab point 4 hides ──────────────────────────────────────────
  const documentsTab = await post(token, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_label: 'Company Documents', qdb_display_order: 2, qdb_is_visible: true,
    qdb_requires_previous_tab_complete: false, qdb_hide_tab_bar: false,
  });
  const documentsSection = await post(token, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${documentsTab.qdb_form_tabid})`,
    qdb_label: 'Registration Documents', qdb_display_order: 1, qdb_columns: SECTION_COLUMNS.one,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
  });

  // ── Points 1 and 5 live on this grid's columns ────────────────────────────
  const grid = await post(token, 'qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${documentsSection.qdb_form_sectionid})`,
    qdb_schema_name: 'qdb_documents', qdb_field_type: FIELD_TYPE.interactiveGrid,
    qdb_label: 'Registration Documents', qdb_display_order: 1, qdb_column_span: COLUMN_SPAN.two,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_grid_mode: GRID_MODE_ENTRY, qdb_grid_entity_name: 'qdb_document',
  });
  const gridId = grid.qdb_form_fieldid;

  async function gridColumn(name, body) {
    return post(token, 'qdb_grid_column_configs', {
      'qdb_form_field_id@odata.bind': `/qdb_form_fields(${gridId})`,
      qdb_grid_column_configname: name,
      qdb_column_field_type: 'text',
      qdb_is_visible: true,
      qdb_is_editable: true,
      ...body,
    });
  }

  // Point 1 — required, and capped.
  await gridColumn('six-pt-doc-title', {
    qdb_column_label: 'Document Title', qdb_column_attribute: 'qdb_title', qdb_display_order: 1,
    qdb_is_required: true, qdb_max_length: 60,
    qdb_validation_message: 'Give the document a title of 60 characters or fewer',
  });

  // Point 1 — a named format.
  await gridColumn('six-pt-doc-contact', {
    qdb_column_label: 'Contact Email', qdb_column_attribute: 'qdb_contact_email', qdb_display_order: 2,
    qdb_is_required: true, qdb_validation_format: 'email',
  });

  // Point 1 — a custom pattern: two letters then six digits.
  await gridColumn('six-pt-doc-reference', {
    qdb_column_label: 'Reference No.', qdb_column_attribute: 'qdb_reference', qdb_display_order: 3,
    qdb_validation_format: 'custom', qdb_validation_pattern: '^[A-Z]{2}[0-9]{6}$',
    qdb_validation_message: 'Use two capital letters followed by six digits, e.g. QA123456',
  });

  // Point 5 — hidden, and required. It is published with isVisible:false, is not drawn,
  // and still takes part in the row. Before this batch it vanished from the JSON entirely.
  await gridColumn('six-pt-doc-key', {
    qdb_column_label: 'Internal Key', qdb_column_attribute: 'qdb_internal_key', qdb_display_order: 4,
    qdb_is_visible: false,
  });
  console.log('✓ grid with 4 columns');
  console.log('  · point 1 — required + max length, email format, custom pattern');
  console.log('  · point 5 — "Internal Key" hidden but published');

  // ── Point 4 — the rule the designer could not previously author ────────────
  const ruleDefinition = {
    version: '1.0',
    trigger_field_code: 'qdb_country',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'qdb_country', operator: 'equals', value: 'Qatar' }],
    },
    actions: [{ action_type: 'hide_tab', target_tab_id: documentsTab.qdb_form_tabid }],
  };
  await post(token, 'qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: 'Hide Company Documents when the country is Qatar',
    qdb_conditions_json: JSON.stringify(ruleDefinition),
    qdb_priority: 1,
    qdb_is_active: true,
  });
  console.log('✓ point 4 — rule: Country = Qatar hides the Company Documents tab');

  console.log(`\nSeeded. Form code: ${FORM_CODE}\n`);
  return formId;
}

run().catch(error => { console.error('\nSEED FAILED:', error.message); process.exit(1); });
