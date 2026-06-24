'use strict';

/**
 * Seeds a small 3-tab form with qdb_show_summary_step = true.
 * Purpose: manual end-to-end testing of the Summary Step feature.
 *
 * Tabs:
 *   1. Personal Info  — Full Name, Email, Phone, Date of Birth
 *   2. Preferences    — Service Type (dropdown), Rating (radio), Comments (textarea)
 *   3. Confirmation   — Terms checkbox
 *
 * Safe to re-run — skips if form code 'summary-step-test' already exists.
 */

const msal  = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '51f81489-12ee-4a9e-aaae-a2591f45987d';
const DATAVERSE = 'https://org5869857f.crm4.dynamics.com';
const API       = `${DATAVERSE}/api/data/v9.2`;

const STATUS     = { active: 100000001 };
const COLUMNS    = { 1: 100000001, 2: 100000002 };
const COL_SPAN   = { 1: 100000001, 2: 100000002 };
const FIELD_TYPE = {
  text: 100000001, textarea: 100000002, number: 100000003,
  date: 100000004, dropdown: 100000006, checkbox: 100000009,
  radio: 100000010, email: 100000013, phone: 100000014,
};
const RULE_TYPE = { required: 100000001, email: 100000007, phone: 100000008 };

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

// ─── HTTP ─────────────────────────────────────────────────────────────────────
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
    console.error(`  POST ${entitySet} ${res.status}: ${text.slice(0, 400)}`);
    throw new Error(`POST ${entitySet} failed: ${res.status}`);
  }
  return JSON.parse(text);
}

async function get(token, path) {
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

function extractId(rec, entityLogicalName) {
  const pkKey = `${entityLogicalName}id`;
  if (rec[pkKey]) return rec[pkKey];
  for (const val of Object.values(rec)) {
    if (typeof val === 'string' && /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(val)) {
      return val;
    }
  }
  throw new Error(`Cannot extract ID from ${entityLogicalName} response`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  DFE — Seed: Summary Step Test Form');
  console.log('════════════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // Guard: skip if already seeded
  const existing = await get(token, `/qdb_form_definitions?$filter=qdb_form_code eq 'summary-step-test'&$select=qdb_form_definitionid`);
  if (existing.value.length > 0) {
    console.log(`Form 'summary-step-test' already exists: ${existing.value[0].qdb_form_definitionid}`);
    console.log('Delete it in Dataverse first to re-seed. Exiting.');
    return;
  }

  // ── Step 1: Form Definition ──────────────────────────────────────────────────
  console.log('─── Step 1: Form Definition ─────────────────────────────────');
  const formRec = await post(token, 'qdb_form_definitions', {
    qdb_form_code:            'summary-step-test',
    qdb_title:                'Summary Step Test',
    qdb_description:          'A minimal 3-tab form to test the Review & Submit summary step.',
    qdb_status:               STATUS.active,
    qdb_version:              1,
    qdb_allow_save_draft:     false,
    qdb_show_summary_step:    true,
    qdb_confirmation_message: 'Thank you! Your response has been submitted.'
  });
  const formId = extractId(formRec, 'qdb_form_definition');
  console.log(`✓ Form ID: ${formId}  (show_summary_step = true)\n`);

  // ── Step 2: Tabs ─────────────────────────────────────────────────────────────
  console.log('─── Step 2: Tabs ────────────────────────────────────────────');
  const tabDefs = [
    { key: 'personal',     label: 'Personal Info', icon: 'Contact', order: 1 },
    { key: 'preferences',  label: 'Preferences',   icon: 'Settings', order: 2 },
    { key: 'confirmation', label: 'Confirmation',  icon: 'CheckboxChecked', order: 3 },
  ];
  const tabs = {};
  for (const t of tabDefs) {
    const rec = await post(token, 'qdb_form_tabs', {
      qdb_label:                           t.label,
      qdb_icon_name:                       t.icon,
      qdb_display_order:                   t.order,
      qdb_is_visible:                      true,
      qdb_requires_previous_tab_complete:  false,
      'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`
    });
    tabs[t.key] = extractId(rec, 'qdb_form_tab');
    console.log(`✓ ${t.label}: ${tabs[t.key]}`);
  }

  // ── Step 3: Sections ─────────────────────────────────────────────────────────
  console.log('\n─── Step 3: Sections ────────────────────────────────────────');
  const sectionDefs = [
    { key: 'personal',     tabKey: 'personal',     label: 'Your Details',      order: 1, cols: 2 },
    { key: 'preferences',  tabKey: 'preferences',  label: 'Your Preferences',  order: 1, cols: 2 },
    { key: 'confirmation', tabKey: 'confirmation', label: 'Terms & Conditions', order: 1, cols: 1 },
  ];
  const sections = {};
  for (const s of sectionDefs) {
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

  // ── Step 4: Fields ────────────────────────────────────────────────────────────
  console.log('\n─── Step 4: Fields ──────────────────────────────────────────');
  const fields = {};

  async function field(key, secKey, type, schema, label, order, span, required, extras = {}) {
    const rec = await post(token, 'qdb_form_fields', {
      qdb_field_type:    FIELD_TYPE[type],
      qdb_schema_name:   schema,
      qdb_label:         label,
      qdb_display_order: order,
      qdb_column_span:   COL_SPAN[span],
      qdb_is_required:   required,
      qdb_is_hidden:     false,
      qdb_is_readonly:   false,
      'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sections[secKey]})`,
      ...extras
    });
    fields[key] = extractId(rec, 'qdb_form_field');
    console.log(`✓ [${type}] ${label}`);
  }

  // Personal Info tab
  await field('full-name', 'personal', 'text',     'qdb_sst_full_name', 'Full Name',     1, 1, true,  { qdb_placeholder: 'Enter your full name' });
  await field('email',     'personal', 'email',    'qdb_sst_email',     'Email Address', 2, 1, true,  { qdb_placeholder: 'you@example.com' });
  await field('phone',     'personal', 'phone',    'qdb_sst_phone',     'Phone Number',  3, 1, false, { qdb_placeholder: '+974 XXXX XXXX' });
  await field('dob',       'personal', 'date',     'qdb_sst_dob',       'Date of Birth', 4, 1, false, {});

  // Preferences tab
  await field('service',   'preferences', 'dropdown', 'qdb_sst_service',   'Service Type',   1, 1, true,  { qdb_placeholder: 'Select a service' });
  await field('rating',    'preferences', 'radio',    'qdb_sst_rating',    'Overall Rating', 2, 1, true,  {});
  await field('comments',  'preferences', 'textarea', 'qdb_sst_comments',  'Comments',       3, 2, false, { qdb_placeholder: 'Any additional comments...' });

  // Confirmation tab
  await field('agree', 'confirmation', 'checkbox', 'qdb_sst_agree', 'I confirm the information above is accurate', 1, 1, true, {});

  // ── Step 5: Options ───────────────────────────────────────────────────────────
  console.log('\n─── Step 5: Options ─────────────────────────────────────────');
  const optionSets = [
    { fieldKey: 'service', opts: [
      { value: 'BusinessLoans',   label: 'Business Loans',     order: 1, isDefault: false },
      { value: 'TradeFinance',    label: 'Trade Finance',      order: 2, isDefault: false },
      { value: 'AgriFinance',     label: 'Agriculture Finance',order: 3, isDefault: false },
      { value: 'Advisory',        label: 'Advisory Services',  order: 4, isDefault: false },
    ]},
    { fieldKey: 'rating', opts: [
      { value: '5', label: 'Excellent (5)', order: 1, isDefault: false },
      { value: '4', label: 'Good (4)',      order: 2, isDefault: false },
      { value: '3', label: 'Average (3)',   order: 3, isDefault: false },
      { value: '2', label: 'Poor (2)',      order: 4, isDefault: false },
      { value: '1', label: 'Very Poor (1)', order: 5, isDefault: false },
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

  // ── Step 6: Validation Rules ──────────────────────────────────────────────────
  console.log('\n─── Step 6: Validation Rules ────────────────────────────────');
  const validations = [
    { fk: 'full-name', rules: [{ type: 'required', msg: 'Full name is required.',         p: 1 }] },
    { fk: 'email',     rules: [{ type: 'required', msg: 'Email address is required.',     p: 1 },
                                { type: 'email',    msg: 'Enter a valid email address.',   p: 2 }] },
    { fk: 'service',   rules: [{ type: 'required', msg: 'Please select a service type.',  p: 1 }] },
    { fk: 'rating',    rules: [{ type: 'required', msg: 'Please select a rating.',        p: 1 }] },
    { fk: 'agree',     rules: [{ type: 'required', msg: 'You must confirm to proceed.',   p: 1 }] },
  ];
  for (const { fk, rules } of validations) {
    for (const r of rules) {
      await post(token, 'qdb_form_validation_rules', {
        qdb_rule_type:     RULE_TYPE[r.type],
        qdb_error_message: r.msg,
        qdb_priority:      r.p,
        qdb_is_active:     true,
        'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fields[fk]})`
      });
    }
    console.log(`✓ ${fk}: ${rules.length} rule(s)`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('✅  Seed complete!');
  console.log(`   Form ID   : ${formId}`);
  console.log('   Form code : summary-step-test');
  console.log('   3 tabs · 3 sections · 8 fields');
  console.log('   9 options · 6 validation rules');
  console.log('\n   To test: open the frontend, load form "summary-step-test".');
  console.log('   Fill in fields, then on the last tab click "Review & Submit"');
  console.log('   to see the summary screen before submitting.');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
