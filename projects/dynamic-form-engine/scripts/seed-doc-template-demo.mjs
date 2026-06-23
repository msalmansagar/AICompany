/**
 * Seed: Document Template Download Demo form
 *
 * Creates a single-tab form that exercises every new column added by
 * add-file-download-document-fields.mjs:
 *
 *   • Info-card field with qdb_info_card_download_icon (icon wins over label)
 *   • File-upload field with:
 *       - qdb_file_download_label  / qdb_file_download_icon
 *       - qdb_download_document_setting  (CRM Document Template fetch)
 *       - qdb_upload_document_setting    (EDMS upload config)
 *
 * Run:  node scripts/seed-doc-template-demo.mjs
 * Safe: skips creation if the form code already exists.
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'doc_template_demo';

// ── Auth ──────────────────────────────────────────────────────────────────────

const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         `${DV}/.default`,
    }),
  },
);
const tokenJson = await tokenRes.json();
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

const FT = {
  text:      100000001,
  file:      100000015,
  infoCard:  100000020,
};
const COL = { one: 100000001, two: 100000002 };
const CS  = { one: 100000001, two: 100000002 };
const ICS = { info: 100000000, warning: 100000001 };
const ST  = { draft: 100000000 };

// ── Banner ────────────────────────────────────────────────────────────────────

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   Document Template Download Demo — Seed Script         ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Guard ─────────────────────────────────────────────────────────────────────

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

console.log('\n[1] Form definition…');
const form = await post('qdb_form_definitions', {
  qdb_form_code:            FORM_CODE,
  qdb_title:                'Document Submission — Template Demo',
  qdb_description:          'Demonstrates the document template download feature. Download the template, fill it in, then upload the completed file.',
  qdb_status:               ST.draft,
  qdb_version:              1,
  qdb_allow_save_draft:     false,
  qdb_show_summary_step:    false,
  qdb_confirmation_message: 'Your document has been submitted successfully.',
});
const fid = form.qdb_form_definitionid;
console.log(`  ✓ Form '${FORM_CODE}' → ${fid}`);

// ══════════════════════════════════════════════════════════════════════════════
// [2] TAB
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[2] Tab…');
const tab = await post('qdb_form_tabs', {
  'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
  qdb_label:         'Document Upload',
  qdb_display_order: 1,
  qdb_is_visible:    true,
});
const tabId = tab.qdb_form_tabid;
console.log(`  ✓ Tab → ${tabId}`);

// ══════════════════════════════════════════════════════════════════════════════
// [3] SECTIONS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[3] Sections…');

const sec = (label, desc, order, cols = COL.one) => post('qdb_form_sections', {
  'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
  qdb_label:                   label,
  qdb_description:             desc,
  qdb_display_order:           order,
  qdb_columns:                 cols,
  qdb_is_collapsible:          false,
  qdb_is_collapsed_by_default: false,
  qdb_is_visible:              true,
});

const secInstructions = await sec(
  'Instructions',
  'Read the instructions below before downloading the template.',
  1,
);
const secUpload = await sec(
  'Upload Document',
  'Download the pre-filled template, complete it, then upload the signed copy.',
  2,
);
console.log('  ✓ 2 sections created');

// ══════════════════════════════════════════════════════════════════════════════
// [4] FIELDS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n[4] Fields…');

const fld = (secId, body) => ({
  'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
  qdb_is_required:  false,
  qdb_is_readonly:  false,
  qdb_is_hidden:    false,
  qdb_column_span:  CS.one,
  ...body,
});

// ── [4a] Info-card: icon-wins demonstration ───────────────────────────────────
// qdb_info_card_download_icon is set — the icon is rendered instead of the label.
// qdb_info_card_download_label is also set to show the fallback behaviour clearly.

const infoCard = await post('qdb_form_fields', fld(secInstructions.qdb_form_sectionid, {
  qdb_schema_name:              'demo_instructions_card',
  qdb_field_type:               FT.infoCard,
  qdb_label:                    'Instructions',
  qdb_display_order:            1,
  qdb_column_span:              CS.two,
  qdb_info_card_style:          ICS.info,
  qdb_info_card_title:          'How to complete this submission',
  qdb_info_card_body:           '1. Click the download button below to get the Bank Statement template.\n2. Fill in all required fields in the template.\n3. Sign and scan the completed document.\n4. Upload the scanned copy using the file upload field.',
  // Download link on the info card — icon is defined so it overrides the label.
  qdb_info_card_download_url:   'https://org5869857f.crm4.dynamics.com',  // navigational placeholder; real download goes through the backend
  qdb_info_card_download_label: 'Download Bank Statement Template',
  qdb_info_card_download_icon:  'ArrowDownloadRegular',
}));
console.log(`  ✓ Info-card (demo_instructions_card) → ${infoCard.qdb_form_fieldid}`);

// ── [4b] Text: applicant reference ───────────────────────────────────────────

const refField = await post('qdb_form_fields', fld(secUpload.qdb_form_sectionid, {
  qdb_schema_name:   'demo_reference_number',
  qdb_field_type:    FT.text,
  qdb_label:         'Reference Number',
  qdb_placeholder:   'e.g. REF-2026-0001',
  qdb_display_order: 1,
  qdb_is_required:   true,
  qdb_tooltip:       'Enter your application reference number as provided in your welcome email.',
}));
console.log(`  ✓ Text (demo_reference_number) → ${refField.qdb_form_fieldid}`);

// ── [4c] File upload: full document template download + upload config ──────────
//
// qdb_download_document_setting — triggers CRM Document Template fetch by name.
//   documentName must match the `name` field of a qdb_documenttemplate record.
//
// qdb_upload_document_setting   — used by the submission service to map the
//   uploaded file into the EDMS (qdb_edms) entity via a lookup bind.
//
// qdb_file_download_icon is set → icon renders instead of qdb_file_download_label.

const downloadSetting = JSON.stringify({
  downloadSetting: {
    attributeConfig: [
      {
        attributeName:  'documentName',
        attributeValue: 'Bank Statement',
        type:           'string',
      },
    ],
  },
});

const uploadSetting = JSON.stringify({
  entityName:      'qdb_edms',
  attributeConfig: [
    {
      attributeName:  'qdb_form_submission_id@odata.bind',
      attributeValue: '/qdb_form_submission_logs({submissionId})',
      type:           'lookup',
    },
    {
      attributeName:  'qdb_document_type',
      attributeValue: 'bank_statement',
      type:           'string',
    },
  ],
});

const fileField = await post('qdb_form_fields', fld(secUpload.qdb_form_sectionid, {
  qdb_schema_name:              'demo_bank_statement',
  qdb_field_type:               FT.file,
  qdb_label:                    'Bank Statement (Signed)',
  qdb_display_order:            2,
  qdb_is_required:              true,
  qdb_column_span:              CS.two,
  qdb_tooltip:                  'Upload the completed and signed bank statement template. Accepted formats: PDF, DOCX.',
  // Download section — icon overrides label
  qdb_file_download_label:      'Download Bank Statement Template',
  qdb_file_download_icon:       'ArrowDownloadRegular',
  // CRM Document Template fetch config
  qdb_download_document_setting: downloadSetting,
  // EDMS upload binding config
  qdb_upload_document_setting:   uploadSetting,
}));
console.log(`  ✓ File upload (demo_bank_statement) → ${fileField.qdb_form_fieldid}`);

// ══════════════════════════════════════════════════════════════════════════════
// Done
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   ✓ Seed complete                                       ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`║  Form ID   : ${fid.substring(0, 36)}  ║`);
console.log('║  Form code : doc_template_demo                          ║');
console.log('║  Tab       : Document Upload                            ║');
console.log('║  Sections  : 2 (Instructions, Upload Document)          ║');
console.log('║  Fields    : 3                                          ║');
console.log('║                                                         ║');
console.log('║  New columns exercised:                                 ║');
console.log('║    qdb_info_card_download_icon   → ArrowDownloadRegular ║');
console.log('║    qdb_file_download_label       → set (fallback)       ║');
console.log('║    qdb_file_download_icon        → ArrowDownloadRegular ║');
console.log('║    qdb_download_document_setting → Bank Statement       ║');
console.log('║    qdb_upload_document_setting   → qdb_edms bind        ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
