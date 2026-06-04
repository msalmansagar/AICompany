'use strict';

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;

// ─── Picklist codes (must match create-tables.js schema) ─────────────────────
const STATUS    = { active: 100000001 };
const COLUMNS   = { 1: 100000001, 2: 100000002, 3: 100000003, 4: 100000004 };
const COL_SPAN  = { 1: 100000001, 2: 100000002, 3: 100000003, 4: 100000004 };
const FIELD_TYPE = {
  text: 100000001, textarea: 100000002, number: 100000003,
  date: 100000004, datetime: 100000005, dropdown: 100000006,
  multiselect: 100000007, lookup: 100000008, checkbox: 100000009,
  radio: 100000010, currency: 100000011, decimal: 100000012,
  email: 100000013, phone: 100000014, file: 100000015,
  repeatingGrid: 100000016, richText: 100000017
};
const RULE_TYPE = {
  required: 100000001, minLength: 100000002, maxLength: 100000003,
  minValue: 100000004, maxValue: 100000005, regex: 100000006,
  email: 100000007, phone: 100000008
};
const ACTION = {
  showField: 100000001, hideField: 100000002,
  showSection: 100000003, hideSection: 100000004,
  showTab: 100000005, hideTab: 100000006,
  makeRequired: 100000007, makeOptional: 100000008
};
const LOGIC = { AND: 100000000, OR: 100000001 };

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getToken() {
  const pca = new msal.PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` }
  });
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${DATAVERSE}/.default`],
    deviceCodeCallback: (r) => console.log('\n' + r.message + '\n')
  });
  return result.accessToken;
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────
async function post(token, entitySet, body) {
  const res = await fetch(`${API}/${entitySet}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`  POST ${entitySet} ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`POST ${entitySet} failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function getRecords(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// Dataverse auto-names the PK as {entityLogicalName}id (e.g. qdb_form_definitionid).
// This helper extracts it from the POST response body.
function extractId(rec, entityLogicalName) {
  const pkKey = `${entityLogicalName}id`;
  if (rec[pkKey]) return rec[pkKey];
  // Fallback: any GUID-valued field
  for (const [, val] of Object.entries(rec)) {
    if (typeof val === 'string' && /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(val)) {
      return val;
    }
  }
  throw new Error(`Cannot extract ID from ${entityLogicalName} response`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  QDB Dynamic Form Engine — Sample Data Seeder');
  console.log('  Seeds one Loan Application form into all Dataverse tables');
  console.log('═══════════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Guard: skip if already seeded ──────────────────────────────────────────
  const existing = await getRecords(token, `/qdb_form_definitions?$filter=qdb_form_code eq 'loan-application'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    console.log(`Form 'loan-application' already exists: ${existing.value[0].qdb_form_definitionid}`);
    console.log('Delete it in Dataverse first to re-seed. Exiting.');
    return;
  }

  // ── Step 1: Form Definition ─────────────────────────────────────────────────
  console.log('─── Step 1: Form Definition ──────────────────────────────────');
  const formRec = await post(token, 'qdb_form_definitions', {
    qdb_form_code:                         'loan-application',
    qdb_title:                             'Loan Application',
    qdb_description:                       'Apply for a commercial loan facility with QDB.',
    qdb_status:                            STATUS.active,
    qdb_version:                           1,
    qdb_allow_save_draft:                  true,
    qdb_draft_expiry_days:                 90,
    qdb_confirmation_message:             'Your loan application has been submitted successfully. Our team will contact you within 2 business days.',
    qdb_confirmation_record_ref_attribute: 'ticketnumber'
  });
  const formId = extractId(formRec, 'qdb_form_definition');
  console.log(`✓ Form Definition: ${formId}\n`);

  // ── Step 2: Tabs ────────────────────────────────────────────────────────────
  console.log('─── Step 2: Tabs ─────────────────────────────────────────────');
  const tabs = {};
  for (const t of [
    { key: 'customer',    label: 'Customer Information', icon: 'Contact',         order: 1 },
    { key: 'facility',   label: 'Facility Details',      icon: 'Money',           order: 2 },
    { key: 'product',    label: 'Product Details',       icon: 'Product',         order: 3 },
    { key: 'documents',  label: 'Documents',             icon: 'Attach',          order: 4 },
    { key: 'declaration',label: 'Declaration',           icon: 'CheckboxChecked', order: 5 }
  ]) {
    const rec = await post(token, 'qdb_form_tabs', {
      qdb_label:                          t.label,
      qdb_icon_name:                      t.icon,
      qdb_display_order:                  t.order,
      qdb_is_visible:                     true,
      qdb_requires_previous_tab_complete: false,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`
    });
    tabs[t.key] = extractId(rec, 'qdb_form_tab');
    console.log(`✓ ${t.label}: ${tabs[t.key]}`);
  }

  // ── Step 3: Sections ────────────────────────────────────────────────────────
  console.log('\n─── Step 3: Sections ─────────────────────────────────────────');
  const sections = {};
  for (const s of [
    { key: 'customer-type', tabKey: 'customer',    label: 'Customer Details',      order: 1, cols: 2 },
    { key: 'facility',      tabKey: 'facility',    label: 'Facility Information',  order: 1, cols: 2 },
    { key: 'product',       tabKey: 'product',     label: 'Product Selection',     order: 1, cols: 2 },
    { key: 'docs',          tabKey: 'documents',   label: 'Required Documents',    order: 1, cols: 1 },
    { key: 'declaration',   tabKey: 'declaration', label: 'Terms and Declaration', order: 1, cols: 1 }
  ]) {
    const rec = await post(token, 'qdb_form_sections', {
      qdb_label:                    s.label,
      qdb_display_order:            s.order,
      qdb_columns:                  COLUMNS[s.cols],
      qdb_is_collapsible:           false,
      qdb_is_collapsed_by_default:  false,
      qdb_is_visible:               true,
      'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabs[s.tabKey]})`
    });
    sections[s.key] = extractId(rec, 'qdb_form_section');
    console.log(`✓ ${s.label}: ${sections[s.key]}`);
  }

  // ── Step 4: Fields ──────────────────────────────────────────────────────────
  console.log('\n─── Step 4: Fields ───────────────────────────────────────────');
  const fields = {};

  async function createField(key, secKey, type, schema, label, order, span, required, hidden, readonly, extras) {
    const body = {
      qdb_field_type:    FIELD_TYPE[type],
      qdb_schema_name:   schema,
      qdb_label:         label,
      qdb_display_order: order,
      qdb_column_span:   COL_SPAN[span],
      qdb_is_required:   required,
      qdb_is_hidden:     hidden,
      qdb_is_readonly:   readonly,
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sections[secKey]})`,
      ...extras
    };
    const rec = await post(token, 'qdb_form_fields', body);
    fields[key] = extractId(rec, 'qdb_form_field');
    console.log(`✓ ${label}: ${fields[key]}`);
  }

  // Customer tab
  await createField('customer-type',   'customer-type', 'dropdown',  'qdb_customer_type',         'Customer Type',                          1, 1, true,  false, false, { qdb_placeholder: 'Select customer type' });
  await createField('full-name',       'customer-type', 'text',      'qdb_full_name',             'Full Name',                              2, 1, true,  false, false, { qdb_placeholder: 'Enter full legal name' });
  await createField('cr-number',       'customer-type', 'text',      'qdb_cr_number',             'Commercial Registration Number',         3, 1, false, true,  false, { qdb_placeholder: 'Enter CR number' });
  await createField('email',           'customer-type', 'email',     'qdb_email',                 'Email Address',                          4, 1, true,  false, false, { qdb_placeholder: 'your@email.com' });
  await createField('phone',           'customer-type', 'phone',     'qdb_phone',                 'Phone Number',                           5, 1, true,  false, false, { qdb_placeholder: '+974 XXXX XXXX' });
  await createField('dob',             'customer-type', 'date',      'qdb_date_of_birth',         'Date of Birth',                          6, 1, false, false, false, {});
  // Facility tab
  await createField('facility-type',   'facility',      'dropdown',  'qdb_facility_type',         'Facility Type',                          1, 1, true,  false, false, { qdb_placeholder: 'Select facility type' });
  await createField('amount',          'facility',      'currency',  'qdb_requested_amount',      'Requested Amount (QAR)',                 2, 1, true,  false, false, { qdb_currency_code: 'QAR', qdb_decimal_places: 2 });
  await createField('tenure',          'facility',      'number',    'qdb_tenure_months',         'Tenure (months)',                        3, 1, true,  false, false, {});
  await createField('purpose',         'facility',      'textarea',  'qdb_purpose',               'Purpose of Financing',                   4, 2, false, false, false, { qdb_placeholder: 'Describe the purpose of the financing request' });
  // Product tab
  await createField('product',         'product',       'lookup',    'qdb_product_id',            'Product',                                1, 1, true,  false, false, { qdb_placeholder: 'Search for a product...' });
  await createField('interest-type',   'product',       'radio',     'qdb_interest_rate_type',    'Interest Rate Type',                     2, 1, true,  false, false, {});
  // Documents tab
  await createField('id-document',     'docs',          'file',      'qdb_id_document',           'ID Document',                            1, 1, true,  false, false, {});
  await createField('financial-stmts', 'docs',          'file',      'qdb_financial_statements',  'Financial Statements',                   2, 1, false, false, false, {});
  // Declaration tab
  await createField('declaration-text','declaration',   'richText',  'qdb_declaration_text',      'Declaration',                            1, 1, false, false, true,  {
    qdb_default_value: '<p>I/We hereby declare that all information provided in this application is true, accurate, and complete. I/We authorise QDB to conduct any verification it deems necessary. I/We understand that providing false information may result in rejection of this application and/or legal action.</p>'
  });
  await createField('agreement',       'declaration',   'checkbox',  'qdb_agrees_to_declaration', 'I have read and agree to the above declaration', 2, 1, true, false, false, {});

  // ── Step 5: Options ─────────────────────────────────────────────────────────
  console.log('\n─── Step 5: Options ──────────────────────────────────────────');
  const optionSets = [
    { fieldKey: 'customer-type', opts: [
      { value: 'Individual', label: 'Individual', order: 1, isDefault: true  },
      { value: 'Corporate',  label: 'Corporate',  order: 2, isDefault: false },
      { value: 'SME',        label: 'SME',        order: 3, isDefault: false }
    ]},
    { fieldKey: 'facility-type', opts: [
      { value: 'HomFinance',        label: 'Home Finance',       order: 1, isDefault: false },
      { value: 'CommercialFinance', label: 'Commercial Finance', order: 2, isDefault: false },
      { value: 'VehicleFinance',    label: 'Vehicle Finance',    order: 3, isDefault: false },
      { value: 'PersonalFinance',   label: 'Personal Finance',   order: 4, isDefault: false }
    ]},
    { fieldKey: 'interest-type', opts: [
      { value: 'Fixed',    label: 'Fixed Rate',    order: 1, isDefault: true  },
      { value: 'Variable', label: 'Variable Rate', order: 2, isDefault: false }
    ]}
  ];
  for (const { fieldKey, opts } of optionSets) {
    for (const o of opts) {
      await post(token, 'qdb_form_option_values', {
        qdb_value:         o.value,
        qdb_label:         o.label,
        qdb_display_order: o.order,
        qdb_is_default:    o.isDefault,
        qdb_is_active:     true,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fields[fieldKey]})`
      });
    }
    console.log(`✓ ${fieldKey}: ${opts.length} option(s)`);
  }

  // ── Step 6: Validation Rules ────────────────────────────────────────────────
  console.log('\n─── Step 6: Validation Rules ─────────────────────────────────');
  const validations = [
    { fk: 'customer-type', rules: [{ type: 'required', msg: 'Customer type is required.',                     p: 1 }] },
    { fk: 'full-name',     rules: [{ type: 'required', msg: 'Full name is required.',                         p: 1 },
                                   { type: 'maxLength', msg: 'Name must not exceed 250 characters.',          p: 2, maxLen: 250 }] },
    { fk: 'email',         rules: [{ type: 'required', msg: 'Email is required.',                             p: 1 },
                                   { type: 'email',    msg: 'Enter a valid email address.',                   p: 2 }] },
    { fk: 'phone',         rules: [{ type: 'required', msg: 'Phone number is required.',                      p: 1 },
                                   { type: 'phone',    msg: 'Enter a valid phone number.',                    p: 2 }] },
    { fk: 'facility-type', rules: [{ type: 'required', msg: 'Facility type is required.',                     p: 1 }] },
    { fk: 'amount',        rules: [{ type: 'required', msg: 'Requested amount is required.',                  p: 1 },
                                   { type: 'minValue', msg: 'Minimum amount is QAR 10,000.',                  p: 2, minVal: 10000 }] },
    { fk: 'tenure',        rules: [{ type: 'required', msg: 'Tenure is required.',                            p: 1 },
                                   { type: 'minValue', msg: 'Minimum tenure is 1 month.',                    p: 2, minVal: 1 },
                                   { type: 'maxValue', msg: 'Maximum tenure is 360 months.',                 p: 3, maxVal: 360 }] },
    { fk: 'purpose',       rules: [{ type: 'maxLength', msg: 'Purpose must not exceed 2,000 characters.',    p: 1, maxLen: 2000 }] },
    { fk: 'product',       rules: [{ type: 'required', msg: 'Product selection is required.',                 p: 1 }] },
    { fk: 'id-document',   rules: [{ type: 'required', msg: 'ID document is required.',                      p: 1 }] },
    { fk: 'agreement',     rules: [{ type: 'required', msg: 'You must agree to the declaration to proceed.', p: 1 }] }
  ];
  for (const { fk, rules } of validations) {
    for (const r of rules) {
      const body = {
        qdb_rule_type:    RULE_TYPE[r.type],
        qdb_error_message: r.msg,
        qdb_priority:      r.p,
        qdb_is_active:     true,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fields[fk]})`
      };
      if (r.maxLen  !== undefined) body.qdb_max_length = r.maxLen;
      if (r.minVal  !== undefined) body.qdb_min_value  = r.minVal;
      if (r.maxVal  !== undefined) body.qdb_max_value  = r.maxVal;
      await post(token, 'qdb_form_validation_rules', body);
    }
    console.log(`✓ ${fk}: ${rules.length} rule(s)`);
  }

  // ── Step 7: Lookup Config ────────────────────────────────────────────────────
  console.log('\n─── Step 7: Lookup Config ─────────────────────────────────────');
  await post(token, 'qdb_form_lookup_configs', {
    qdb_entity_logical_name: 'qdb_product',
    qdb_display_attribute:   'qdb_name',
    qdb_value_attribute:     'qdb_productid',
    qdb_search_min_chars:    2,
    qdb_max_results:         10,
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fields['product']})`
  });
  console.log('✓ Lookup config: product → qdb_product.qdb_name');

  // ── Step 8: Business Rules ───────────────────────────────────────────────────
  // NOTE: The qdb_form_business_rule entity links to form_definition (not directly to
  // trigger fields) per the provisioned schema. Conditions are stored as JSON in
  // qdb_conditions_json. The target field link uses qdb_target_field_id.
  console.log('\n─── Step 8: Business Rules ────────────────────────────────────');
  for (const br of [
    {
      name: 'Show CR Number for Corporate',
      action: ACTION.showField,
      priority: 1,
      targetKey: 'cr-number',
      conditions: [{ fieldId: fields['customer-type'], operator: 'equals', value: 'Corporate' }]
    },
    {
      name: 'Make CR Number required for Corporate',
      action: ACTION.makeRequired,
      priority: 2,
      targetKey: 'cr-number',
      conditions: [{ fieldId: fields['customer-type'], operator: 'equals', value: 'Corporate' }]
    },
    {
      name: 'Hide CR Number for Individual',
      action: ACTION.hideField,
      priority: 3,
      targetKey: 'cr-number',
      conditions: [{ fieldId: fields['customer-type'], operator: 'notEquals', value: 'Corporate' }]
    }
  ]) {
    await post(token, 'qdb_form_business_rules', {
      qdb_name:              br.name,
      qdb_action:            br.action,
      qdb_conditions_logic:  LOGIC.AND,
      qdb_conditions_json:   JSON.stringify(br.conditions),
      qdb_priority:          br.priority,
      qdb_is_active:         true,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
      'qdb_target_field_id@odata.bind':    `/qdb_form_fields(${fields[br.targetKey]})`
    });
    console.log(`✓ ${br.name}`);
  }

  // ── Step 9: Submission Mappings ──────────────────────────────────────────────
  console.log('\n─── Step 9: Submission Mappings ───────────────────────────────');
  for (const m of [
    { fk: 'full-name', entity: 'contact',      attr: 'fullname',      isChild: false, relName: null },
    { fk: 'email',     entity: 'contact',      attr: 'emailaddress1', isChild: false, relName: null },
    { fk: 'amount',    entity: 'opportunity',  attr: 'budgetamount',  isChild: true,  relName: 'opportunity_customer_contacts' }
  ]) {
    const body = {
      qdb_target_entity_logical_name:    m.entity,
      qdb_target_attribute_logical_name: m.attr,
      qdb_is_child_entity:               m.isChild,
      qdb_is_active:                     true,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
      'qdb_form_field_id@odata.bind':      `/qdb_form_fields(${fields[m.fk]})`
    };
    if (m.relName) body.qdb_child_entity_relationship_name = m.relName;
    await post(token, 'qdb_form_submission_mappings', body);
    console.log(`✓ ${m.fk} → ${m.entity}.${m.attr}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅  Seed complete!');
  console.log(`   Form ID   : ${formId}`);
  console.log('   Form code : loan-application');
  console.log('   5 tabs  ·  5 sections  ·  16 fields');
  console.log('   9 options  ·  17 validation rules');
  console.log('   1 lookup config  ·  3 business rules');
  console.log('   3 submission mappings');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
