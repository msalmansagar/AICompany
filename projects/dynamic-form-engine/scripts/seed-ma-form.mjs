/**
 * Seed: Mergers and Acquisition form (Reyada / QDB portal design)
 *
 * Creates the full M&A form as Dataverse records and applies the QDB Green theme.
 * Entities created: qdb_form_definition, qdb_form_tab, qdb_form_section,
 *   qdb_form_field, qdb_form_option_value, qdb_form_design
 *
 * Run:  node scripts/seed-ma-form.mjs
 * Safe: checks for existing form by code before creating — re-run is a no-op.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'ma_application';

// ── Auth ──────────────────────────────────────────────────────────────────────

const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  scope: `${DV}/.default`,
});
const tokenJson = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
).then(r => r.json());

if (!tokenJson.access_token) throw new Error(tokenJson.error_description ?? 'Token request failed');
const token = tokenJson.access_token;

const H = {
  Authorization:      `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version':    '4.0',
  Accept:             'application/json',
  'Content-Type':     'application/json',
  Prefer:             'return=representation',
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function post(entity, body) {
  const r = await fetch(`${BASE}/${entity}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST ${entity}: ${j.error?.message ?? r.status}`);
  return j;
}

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

// ── Picklist constants ────────────────────────────────────────────────────────

const FT  = { text: 100000001, textarea: 100000002, number: 100000003, date: 100000004,
               dropdown: 100000006, multi_select: 100000007, radio: 100000010,
               decimal: 100000012, boolean: 100000019, infoCard: 100000020 };
const COL = { one: 100000001, two: 100000002 };
const CS  = { one: 100000001, two: 100000002 };
const RRS = { list: 100000000, cards: 100000001 };
const ICS = { info: 100000000 };
const ST  = { draft: 100000000 };
const BOOL= { toggle: 100000000 };

// ── Header ────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   Reyada / QDB — Mergers and Acquisition Form       ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Guard: skip if already seeded ────────────────────────────────────────────

const existing = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`,
);
if (existing.value?.length) {
  console.log(`\n⚠  Form '${FORM_CODE}' already exists (${existing.value[0].qdb_form_definitionid}).`);
  console.log('   Delete the record first to re-seed.\n');
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════
// [1] FORM DEFINITION
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[1] Form Definition…');
const form = await post('qdb_form_definitions', {
  qdb_form_code:            FORM_CODE,
  qdb_title:                'Mergers and Acquisition',
  qdb_description:          'Submit your M&A request for QDB review. Complete all steps to proceed to assessment.',
  qdb_status:               ST.draft,
  qdb_version:              1,
  qdb_allow_save_draft:     true,
  qdb_show_summary_step:    true,
  qdb_confirmation_message: 'Your Mergers and Acquisition application has been submitted successfully. Our team will review your submission and contact you within 5 business days.',
});
const fid = form.qdb_form_definitionid;
console.log(`  ✓ Form '${FORM_CODE}' → ${fid}`);

// ══════════════════════════════════════════════════════════════════════════════
// [2] TABS (5 steps)
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[2] Tabs…');
const tabDef = (label, order) => ({
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_label: label,
  qdb_display_order: order,
  qdb_is_visible: true,
});
const tab1 = await post('qdb_form_tabs', tabDef('Transaction Type',           1));
const tab2 = await post('qdb_form_tabs', tabDef('Financial Overview',         2));
const tab3 = await post('qdb_form_tabs', tabDef('Operational Profile',        3));
const tab4 = await post('qdb_form_tabs', tabDef('Deal Readiness',             4));
const tab5 = await post('qdb_form_tabs', tabDef('Legal & Corporate Structure',5));
console.log('  ✓ 5 tabs created');

// ══════════════════════════════════════════════════════════════════════════════
// [3] SECTIONS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[3] Sections…');

const secDef = (tabId, label, desc, order, cols = COL.two) => ({
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
  qdb_label: label,
  qdb_description: desc,
  qdb_display_order: order,
  qdb_columns: cols,
  qdb_is_collapsible: false,
  qdb_is_collapsed_by_default: false,
  qdb_is_visible: true,
});

// Tab 1: Transaction Type
const secTxType = await post('qdb_form_sections', secDef(
  tab1.qdb_form_tabid,
  'Select Transaction Type',
  'Choose the type of transaction you wish to initiate with QDB.',
  1, COL.one,
));

// Tab 2: Financial Overview
const secRevenue = await post('qdb_form_sections', secDef(
  tab2.qdb_form_tabid,
  'Revenue & Profitability',
  'Provide the most recent financial year figures.',
  1, COL.two,
));
const secBalance = await post('qdb_form_sections', secDef(
  tab2.qdb_form_tabid,
  'Balance Sheet Summary',
  'Provide total assets, liabilities, and net equity as of last audit date.',
  2, COL.two,
));

// Tab 3: Operational Profile
const secBizInfo = await post('qdb_form_sections', secDef(
  tab3.qdb_form_tabid,
  'Business Information',
  'Describe the industry, workforce, and operating history of the target entity.',
  1, COL.two,
));
const secMarket = await post('qdb_form_sections', secDef(
  tab3.qdb_form_tabid,
  'Market Presence',
  'Identify current and target geographic markets.',
  2, COL.one,
));

// Tab 4: Deal Readiness
const secDealParams = await post('qdb_form_sections', secDef(
  tab4.qdb_form_tabid,
  'Deal Parameters',
  'Provide deal value, funding approach, and acquisition rationale.',
  1, COL.two,
));
const secDiligence = await post('qdb_form_sections', secDef(
  tab4.qdb_form_tabid,
  'Due Diligence Status',
  'Confirm which due diligence documents are ready for submission.',
  2, COL.two,
));

// Tab 5: Legal & Corporate Structure
const secEntityInfo = await post('qdb_form_sections', secDef(
  tab5.qdb_form_tabid,
  'Entity Information',
  'Provide the legal registration details of the target entity.',
  1, COL.two,
));
const secOwnership = await post('qdb_form_sections', secDef(
  tab5.qdb_form_tabid,
  'Ownership Structure',
  'Describe the current and proposed ownership arrangement.',
  2, COL.one,
));

console.log('  ✓ 9 sections created');

// ══════════════════════════════════════════════════════════════════════════════
// [4] FIELDS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[4] Fields…');

const fld = (secId, body) => ({
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
  qdb_is_required: false,
  qdb_is_readonly: false,
  qdb_is_hidden: false,
  qdb_column_span: CS.one,
  ...body,
});

// ── Tab 1: Transaction Type ───────────────────────────────────────────────────

const fTxType = await post('qdb_form_fields', fld(secTxType.qdb_form_sectionid, {
  qdb_schema_name:       'ma_transaction_type',
  qdb_field_type:        FT.radio,
  qdb_label:             'Transaction Type',
  qdb_display_order:     1,
  qdb_is_required:       true,
  qdb_column_span:       CS.two,
  qdb_radio_render_style: RRS.cards,
}));

// ── Tab 2: Financial Overview ─────────────────────────────────────────────────

const fAnnualRevenue = await post('qdb_form_fields', fld(secRevenue.qdb_form_sectionid, {
  qdb_schema_name:   'ma_annual_revenue',
  qdb_field_type:    FT.number,
  qdb_label:         'Annual Revenue',
  qdb_placeholder:   '0',
  qdb_display_order: 1,
  qdb_is_required:   true,
  qdb_prefix:        'QAR',
}));
const fNetProfit = await post('qdb_form_fields', fld(secRevenue.qdb_form_sectionid, {
  qdb_schema_name:   'ma_net_profit',
  qdb_field_type:    FT.number,
  qdb_label:         'Net Profit / (Loss)',
  qdb_placeholder:   '0',
  qdb_display_order: 2,
  qdb_prefix:        'QAR',
}));
const fEbitda = await post('qdb_form_fields', fld(secRevenue.qdb_form_sectionid, {
  qdb_schema_name:   'ma_ebitda',
  qdb_field_type:    FT.number,
  qdb_label:         'EBITDA',
  qdb_placeholder:   '0',
  qdb_display_order: 3,
  qdb_prefix:        'QAR',
}));
const fProfitMargin = await post('qdb_form_fields', fld(secRevenue.qdb_form_sectionid, {
  qdb_schema_name:   'ma_profit_margin',
  qdb_field_type:    FT.decimal,
  qdb_label:         'Net Profit Margin',
  qdb_placeholder:   '0.00',
  qdb_display_order: 4,
  qdb_suffix:        '%',
  qdb_decimal_places: 2,
}));

const fTotalAssets = await post('qdb_form_fields', fld(secBalance.qdb_form_sectionid, {
  qdb_schema_name:   'ma_total_assets',
  qdb_field_type:    FT.number,
  qdb_label:         'Total Assets',
  qdb_placeholder:   '0',
  qdb_display_order: 1,
  qdb_is_required:   true,
  qdb_prefix:        'QAR',
}));
const fTotalLiabilities = await post('qdb_form_fields', fld(secBalance.qdb_form_sectionid, {
  qdb_schema_name:   'ma_total_liabilities',
  qdb_field_type:    FT.number,
  qdb_label:         'Total Liabilities',
  qdb_placeholder:   '0',
  qdb_display_order: 2,
  qdb_is_required:   true,
  qdb_prefix:        'QAR',
}));
const fNetEquity = await post('qdb_form_fields', fld(secBalance.qdb_form_sectionid, {
  qdb_schema_name:   'ma_net_equity',
  qdb_field_type:    FT.number,
  qdb_label:         'Net Equity',
  qdb_placeholder:   '0',
  qdb_display_order: 3,
  qdb_prefix:        'QAR',
}));
const fDebtEquityRatio = await post('qdb_form_fields', fld(secBalance.qdb_form_sectionid, {
  qdb_schema_name:   'ma_debt_equity_ratio',
  qdb_field_type:    FT.decimal,
  qdb_label:         'Debt-to-Equity Ratio',
  qdb_placeholder:   '0.00',
  qdb_display_order: 4,
  qdb_decimal_places: 2,
}));

// ── Tab 3: Operational Profile ────────────────────────────────────────────────

const fIndustrySector = await post('qdb_form_fields', fld(secBizInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_industry_sector',
  qdb_field_type:    FT.dropdown,
  qdb_label:         'Industry Sector',
  qdb_placeholder:   '— Select sector —',
  qdb_display_order: 1,
  qdb_is_required:   true,
}));
const fYearsInOperation = await post('qdb_form_fields', fld(secBizInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_years_in_operation',
  qdb_field_type:    FT.number,
  qdb_label:         'Years in Operation',
  qdb_placeholder:   '0',
  qdb_display_order: 2,
  qdb_is_required:   true,
}));
const fEmployeesCount = await post('qdb_form_fields', fld(secBizInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_employees_count',
  qdb_field_type:    FT.number,
  qdb_label:         'Number of Employees',
  qdb_placeholder:   '0',
  qdb_display_order: 3,
}));
const fBusinessActivity = await post('qdb_form_fields', fld(secBizInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_business_activity',
  qdb_field_type:    FT.text,
  qdb_label:         'Primary Business Activity',
  qdb_placeholder:   'Describe the core business activity',
  qdb_display_order: 4,
}));

const fPrimaryMarkets = await post('qdb_form_fields', fld(secMarket.qdb_form_sectionid, {
  qdb_schema_name:   'ma_primary_markets',
  qdb_field_type:    FT.multi_select,
  qdb_label:         'Primary Markets',
  qdb_display_order: 1,
  qdb_column_span:   CS.two,
}));
const fGeographicNotes = await post('qdb_form_fields', fld(secMarket.qdb_form_sectionid, {
  qdb_schema_name:   'ma_geographic_notes',
  qdb_field_type:    FT.textarea,
  qdb_label:         'Market Expansion Notes',
  qdb_placeholder:   'Describe target markets and expansion strategy',
  qdb_display_order: 2,
  qdb_column_span:   CS.two,
  qdb_max_rows:      4,
}));

// ── Tab 4: Deal Readiness ─────────────────────────────────────────────────────

const fDealValue = await post('qdb_form_fields', fld(secDealParams.qdb_form_sectionid, {
  qdb_schema_name:   'ma_deal_value',
  qdb_field_type:    FT.number,
  qdb_label:         'Estimated Deal Value',
  qdb_placeholder:   '0',
  qdb_display_order: 1,
  qdb_is_required:   true,
  qdb_prefix:        'QAR',
}));
const fFundingSource = await post('qdb_form_fields', fld(secDealParams.qdb_form_sectionid, {
  qdb_schema_name:       'ma_funding_source',
  qdb_field_type:        FT.radio,
  qdb_label:             'Funding Source',
  qdb_display_order:     2,
  qdb_is_required:       true,
  qdb_radio_render_style: RRS.list,
}));
const fExpectedTimeline = await post('qdb_form_fields', fld(secDealParams.qdb_form_sectionid, {
  qdb_schema_name:   'ma_expected_timeline',
  qdb_field_type:    FT.dropdown,
  qdb_label:         'Expected Timeline',
  qdb_placeholder:   '— Select timeline —',
  qdb_display_order: 3,
}));
const fAcquisitionRationale = await post('qdb_form_fields', fld(secDealParams.qdb_form_sectionid, {
  qdb_schema_name:   'ma_acquisition_rationale',
  qdb_field_type:    FT.textarea,
  qdb_label:         'Acquisition Rationale',
  qdb_placeholder:   'Explain the strategic rationale for this transaction',
  qdb_display_order: 4,
  qdb_is_required:   true,
  qdb_column_span:   CS.two,
  qdb_max_rows:      5,
}));

const fHasAuditedFinancials = await post('qdb_form_fields', fld(secDiligence.qdb_form_sectionid, {
  qdb_schema_name:             'ma_has_audited_financials',
  qdb_field_type:              FT.boolean,
  qdb_label:                   'Audited Financial Statements',
  qdb_display_order:           1,
  qdb_boolean_render_style:    BOOL.toggle,
  qdb_true_label:              'Available — last 3 years audited',
  qdb_false_label:             'Not yet available',
}));
const fHasValuationReport = await post('qdb_form_fields', fld(secDiligence.qdb_form_sectionid, {
  qdb_schema_name:             'ma_has_valuation_report',
  qdb_field_type:              FT.boolean,
  qdb_label:                   'Independent Valuation Report',
  qdb_display_order:           2,
  qdb_boolean_render_style:    BOOL.toggle,
  qdb_true_label:              'Available',
  qdb_false_label:             'Not yet available',
}));
const fHasBusinessPlan = await post('qdb_form_fields', fld(secDiligence.qdb_form_sectionid, {
  qdb_schema_name:             'ma_has_business_plan',
  qdb_field_type:              FT.boolean,
  qdb_label:                   'Post-Merger Business Plan',
  qdb_display_order:           3,
  qdb_boolean_render_style:    BOOL.toggle,
  qdb_true_label:              'Available',
  qdb_false_label:             'Not yet available',
}));
const fHasLegalReview = await post('qdb_form_fields', fld(secDiligence.qdb_form_sectionid, {
  qdb_schema_name:             'ma_has_legal_review',
  qdb_field_type:              FT.boolean,
  qdb_label:                   'Legal Structure Review',
  qdb_display_order:           4,
  qdb_boolean_render_style:    BOOL.toggle,
  qdb_true_label:              'Completed',
  qdb_false_label:             'Pending',
}));

// ── Tab 5: Legal & Corporate Structure ───────────────────────────────────────

const fLegalEntityType = await post('qdb_form_fields', fld(secEntityInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_legal_entity_type',
  qdb_field_type:    FT.dropdown,
  qdb_label:         'Legal Entity Type',
  qdb_placeholder:   '— Select entity type —',
  qdb_display_order: 1,
  qdb_is_required:   true,
}));
const fRegistrationCountry = await post('qdb_form_fields', fld(secEntityInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_registration_country',
  qdb_field_type:    FT.text,
  qdb_label:         'Country of Registration',
  qdb_placeholder:   'e.g. Qatar',
  qdb_display_order: 2,
  qdb_is_required:   true,
}));
const fCommercialRegNo = await post('qdb_form_fields', fld(secEntityInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_commercial_registration_no',
  qdb_field_type:    FT.text,
  qdb_label:         'Commercial Registration No.',
  qdb_placeholder:   'e.g. 12345678',
  qdb_display_order: 3,
}));
const fRegistrationDate = await post('qdb_form_fields', fld(secEntityInfo.qdb_form_sectionid, {
  qdb_schema_name:   'ma_registration_date',
  qdb_field_type:    FT.date,
  qdb_label:         'Registration Date',
  qdb_display_order: 4,
}));

const fOwnershipType = await post('qdb_form_fields', fld(secOwnership.qdb_form_sectionid, {
  qdb_schema_name:       'ma_ownership_type',
  qdb_field_type:        FT.radio,
  qdb_label:             'Proposed Ownership Structure',
  qdb_display_order:     1,
  qdb_column_span:       CS.two,
  qdb_radio_render_style: RRS.list,
}));
const fMajorShareholders = await post('qdb_form_fields', fld(secOwnership.qdb_form_sectionid, {
  qdb_schema_name:   'ma_major_shareholders',
  qdb_field_type:    FT.textarea,
  qdb_label:         'Major Shareholders & Ownership Percentages',
  qdb_placeholder:   'List name, nationality, and % stake for shareholders holding more than 10%',
  qdb_display_order: 2,
  qdb_column_span:   CS.two,
  qdb_max_rows:      5,
}));
const fForeignOwnershipPct = await post('qdb_form_fields', fld(secOwnership.qdb_form_sectionid, {
  qdb_schema_name:    'ma_foreign_ownership_pct',
  qdb_field_type:     FT.decimal,
  qdb_label:          'Foreign Ownership Percentage',
  qdb_placeholder:    '0.00',
  qdb_display_order:  3,
  qdb_suffix:         '%',
  qdb_decimal_places: 2,
}));
const fAdditionalNotes = await post('qdb_form_fields', fld(secOwnership.qdb_form_sectionid, {
  qdb_schema_name:   'ma_additional_notes',
  qdb_field_type:    FT.textarea,
  qdb_label:         'Additional Notes',
  qdb_placeholder:   'Any other information relevant to the legal or ownership structure',
  qdb_display_order: 4,
  qdb_column_span:   CS.two,
  qdb_max_rows:      4,
}));

console.log('  ✓ 26 fields created');

// ══════════════════════════════════════════════════════════════════════════════
// [5] OPTION VALUES
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[5] Option values…');

const opt = (fieldId, value, label, order, isDefault = false, notes = null) => {
  const body = {
    'qdb_form_field_id@odata.bind': `/qdb_form_fields(${fieldId})`,
    qdb_value:         value,
    qdb_label:         label,
    qdb_display_order: order,
    qdb_is_default:    isDefault,
    qdb_is_active:     true,
  };
  if (notes != null) body.qdb_notes = notes;
  return body;
};

// ── transaction_type (radio-cards) ────────────────────────────────────────────

const txId = fTxType.qdb_form_fieldid;
await post('qdb_form_option_values', opt(txId, 'merger', 'Merger', 1, false,
  'Note: Requires equal ownership and governance restructuring. Board-level approval from both entities must be submitted.',
));
await post('qdb_form_option_values', opt(txId, 'acquisition_full', 'Full Acquisition', 2, false,
  'Note: Complete ownership transfer — minimum 51% controlling stake. Full KYC documentation is required for all acquiring parties.',
));
await post('qdb_form_option_values', opt(txId, 'acquisition_partial', 'Partial Acquisition', 3, false,
  'Note: Minimum 25% stake acquisition is required to trigger QDB regulatory filing. Shareholder agreement must be attached.',
));
await post('qdb_form_option_values', opt(txId, 'joint_venture', 'Joint Venture', 4, false,
  'Note: A new entity must be incorporated under Qatar Commercial Companies Law No. 11 of 2015 before funds are disbursed.',
));

// ── industry_sector (dropdown) ────────────────────────────────────────────────

const indId = fIndustrySector.qdb_form_fieldid;
await post('qdb_form_option_values', opt(indId, 'technology',         'Technology & ICT',           1));
await post('qdb_form_option_values', opt(indId, 'healthcare',         'Healthcare & Life Sciences',  2));
await post('qdb_form_option_values', opt(indId, 'retail',             'Retail & Consumer Goods',     3));
await post('qdb_form_option_values', opt(indId, 'manufacturing',      'Manufacturing & Industry',    4));
await post('qdb_form_option_values', opt(indId, 'financial_services', 'Financial Services',          5));
await post('qdb_form_option_values', opt(indId, 'real_estate',        'Real Estate & Construction',  6));
await post('qdb_form_option_values', opt(indId, 'energy',             'Energy & Utilities',          7));
await post('qdb_form_option_values', opt(indId, 'hospitality',        'Hospitality & Tourism',       8));
await post('qdb_form_option_values', opt(indId, 'education',          'Education & Training',        9));
await post('qdb_form_option_values', opt(indId, 'other',              'Other',                      10));

// ── primary_markets (multi_select) ───────────────────────────────────────────

const mktId = fPrimaryMarkets.qdb_form_fieldid;
await post('qdb_form_option_values', opt(mktId, 'qatar',   'Qatar',        1, true));
await post('qdb_form_option_values', opt(mktId, 'gcc',     'GCC Region',   2));
await post('qdb_form_option_values', opt(mktId, 'mena',    'MENA Region',  3));
await post('qdb_form_option_values', opt(mktId, 'europe',  'Europe',       4));
await post('qdb_form_option_values', opt(mktId, 'asia',    'Asia Pacific', 5));
await post('qdb_form_option_values', opt(mktId, 'global',  'Global',       6));

// ── funding_source (radio-list) ───────────────────────────────────────────────

const fsId = fFundingSource.qdb_form_fieldid;
await post('qdb_form_option_values', opt(fsId, 'equity',       'Equity Financing',               1));
await post('qdb_form_option_values', opt(fsId, 'debt',         'Debt Financing',                 2));
await post('qdb_form_option_values', opt(fsId, 'hybrid',       'Hybrid (Equity + Debt)',         3));
await post('qdb_form_option_values', opt(fsId, 'qdb_facility', 'QDB Financing Facility',         4));

// ── expected_timeline (dropdown) ─────────────────────────────────────────────

const tlId = fExpectedTimeline.qdb_form_fieldid;
await post('qdb_form_option_values', opt(tlId, 'under_6m',  'Less than 6 months',  1));
await post('qdb_form_option_values', opt(tlId, '6_to_12m',  '6 to 12 months',      2));
await post('qdb_form_option_values', opt(tlId, '12_to_18m', '12 to 18 months',     3));
await post('qdb_form_option_values', opt(tlId, 'over_18m',  'More than 18 months', 4));

// ── legal_entity_type (dropdown) ─────────────────────────────────────────────

const letId = fLegalEntityType.qdb_form_fieldid;
await post('qdb_form_option_values', opt(letId, 'llc',            'Limited Liability Company (LLC)',          1));
await post('qdb_form_option_values', opt(letId, 'qsc',            'Qatari Shareholding Company (QSC)',        2));
await post('qdb_form_option_values', opt(letId, 'foreign_branch', 'Foreign Branch',                           3));
await post('qdb_form_option_values', opt(letId, 'holding_company','Holding Company',                          4));
await post('qdb_form_option_values', opt(letId, 'partnership',    'Partnership',                              5));

// ── ownership_type (radio-list) ───────────────────────────────────────────────

const owId = fOwnershipType.qdb_form_fieldid;
await post('qdb_form_option_values', opt(owId, 'sole',     'Sole Ownership (100%)',    1));
await post('qdb_form_option_values', opt(owId, 'majority', 'Majority Ownership (>50%)',2));
await post('qdb_form_option_values', opt(owId, 'minority', 'Minority Ownership (≤50%)',3));
await post('qdb_form_option_values', opt(owId, 'equal',    'Equal Partnership (50/50)',4));

console.log('  ✓ 38 option values created');

// ══════════════════════════════════════════════════════════════════════════════
// [6] FORM DESIGN — QDB Green theme via custom CSS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[6] Form Design (QDB Green theme)…');

const QDB_CUSTOM_CSS = `
/* ╔══════════════════════════════════════════════════╗
   ║  QDB / Reyada — Mergers & Acquisition Theme      ║
   ║  Primary:  #00A651 (QDB Green)                   ║
   ║  Notes callouts: amber (#FFF8E1 / #92400E)        ║
   ╚══════════════════════════════════════════════════╝ */

/* ── Fluent UI brand token overrides ─────────────────────────── */
:root {
  --colorBrandBackground:                 #00A651;
  --colorBrandBackground2:                #e6f7ef;
  --colorBrandBackgroundHover:            #008f45;
  --colorBrandBackgroundPressed:          #006f35;
  --colorBrandBackgroundSelected:         #00c262;
  --colorBrandForeground1:                #00A651;
  --colorBrandForeground2:                #008f45;
  --colorBrandStroke1:                    #00A651;
  --colorBrandStroke2:                    #c5ecd9;
  --colorCompoundBrandBackground:         #00A651;
  --colorCompoundBrandBackgroundHover:    #008f45;
  --colorCompoundBrandBackgroundPressed:  #006f35;
  --colorCompoundBrandForeground1:        #ffffff;
  --colorCompoundBrandStroke:             #00A651;
  --colorNeutralForegroundOnBrand:        #ffffff;
  --colorSubtleBackgroundSelected:        #e6f7ef;
  --colorSubtleBackgroundHover:           #f0faf5;

  /* Amber overrides for radio-card notes callouts */
  --colorStatusInformationBackground1:    #fff8e1;
  --colorStatusInformationBackground2:    #fff3cd;
  --colorStatusInformationForeground1:    #92400e;
  --colorStatusInformationBorderActive:   #f59e0b;
}

/* ── Form outer container ─────────────────────────────────────── */
main[aria-label] {
  background: #f5f7fa;
}

/* ── Form title ───────────────────────────────────────────────── */
main[aria-label] > header h1 {
  border-left: 4px solid #00A651;
  padding-left: 12px;
  color: #1a2332 !important;
}

/* ── Tab / step navigation bar ───────────────────────────────── */
nav[aria-label="Form sections"] {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 0 8px;
}

/* Active tab indicator */
.fui-Tab[aria-selected="true"] {
  color: #00A651 !important;
}
.fui-Tab[aria-selected="true"]::after {
  background-color: #00A651 !important;
}
.fui-Tab:hover {
  color: #008f45 !important;
  background-color: #f0faf5 !important;
}

/* ── Input focus ring ─────────────────────────────────────────── */
.fui-Input:focus-within::after,
.fui-Textarea:focus-within::after,
.fui-Select:focus-within::after,
.fui-Combobox:focus-within::after,
.fui-SpinButton:focus-within::after {
  border-color: #00A651 !important;
}

/* ── Primary buttons (Save & Continue / Submit) ──────────────── */
.fui-Button[data-appearance="primary"] {
  background-color: #00A651 !important;
  border-color: #00A651 !important;
  color: #ffffff !important;
}
.fui-Button[data-appearance="primary"]:hover {
  background-color: #008f45 !important;
  border-color: #008f45 !important;
}
.fui-Button[data-appearance="primary"]:active {
  background-color: #006f35 !important;
  border-color: #006f35 !important;
}

/* ── Checkboxes and radios (list style) ──────────────────────── */
.fui-Checkbox__indicator[data-checked="true"],
.fui-Radio__indicator[data-state="checked"] {
  background-color: #00A651 !important;
  border-color: #00A651 !important;
}

/* ── Toggle (boolean fields) ─────────────────────────────────── */
.fui-Switch__thumb[data-checked="true"],
.fui-Switch__track[data-checked="true"] {
  background-color: #00A651 !important;
}

/* ── Radio card selected state ───────────────────────────────── */
.fui-Card[aria-selected="true"],
.fui-Card[data-selected="true"] {
  border-color: #00A651 !important;
  box-shadow: 0 0 0 2px #00A651 !important;
}

/* ── Focus ring (global) ─────────────────────────────────────── */
:focus-visible {
  outline-color: #00A651 !important;
}
`.trim();

const design = await post('qdb_form_designs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_custom_css: QDB_CUSTOM_CSS,
  qdb_is_active:  true,
});
console.log(`  ✓ Form design (${design.qdb_form_designid}) — QDB Green CSS applied`);

// ══════════════════════════════════════════════════════════════════════════════
// Done
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   ✓ Seed complete                                   ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log(`║  Form ID : ${fid.substring(0, 36)}  ║`);
console.log('║  Code    : ma_application                           ║');
console.log('║  Tabs    : 5                                        ║');
console.log('║  Sections: 9                                        ║');
console.log('║  Fields  : 26                                       ║');
console.log('║  Options : 38                                       ║');
console.log('║  Design  : QDB Green (#00A651)                      ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
