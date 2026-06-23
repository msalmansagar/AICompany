/**
 * Patches the doc_template_demo form to use a real Dataverse document template.
 *
 * The initial seed used a placeholder documentName ("Bank Statement") and a
 * fake GUID in qdb_upload_document_setting. This script replaces both with real
 * values sourced from the Dataverse documenttemplates entity:
 *
 *   Template: Invoice  (documenttype 2 = Excel)
 *   GUID:     ea22f936-1033-41dc-9349-cfcffbeee4c8
 *
 * Fields updated on demo_bank_statement (qdb_form_field):
 *   qdb_download_document_setting — documentName: "Invoice"
 *     → CrmDocumentService fetches /documenttemplates by this name
 *   qdb_upload_document_setting   — qdb_templateguid@odata.bind: real GUID
 *     → future EDMS service will use this when storing the uploaded file
 *
 * Run:  node scripts/patch-doc-template-demo-upload-setting.mjs
 * Safe: re-running overwrites with the same values — idempotent.
 */

const TENANT_ID       = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID       = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET   = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DV              = 'https://org5869857f.crm4.dynamics.com';
const BASE            = `${DV}/api/data/v9.2`;
const FORM_CODE       = 'doc_template_demo';
const FIELD_SCHEMA    = 'demo_bank_statement';

// Real Invoice template — confirmed present in Dataverse (documenttype 2 = Excel).
const INVOICE_TEMPLATE_ID   = 'ea22f936-1033-41dc-9349-cfcffbeee4c8';
const INVOICE_TEMPLATE_NAME = 'Invoice';

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
const { access_token } = await tokenRes.json();
if (!access_token) throw new Error('Token request failed');

const H = {
  Authorization:      `Bearer ${access_token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version':    '4.0',
  Accept:             'application/json',
  'Content-Type':     'application/json',
};

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}

async function patch(path, body) {
  const r = await fetch(`${BASE}/${path}`, {
    method:  'PATCH',
    headers: H,
    body:    JSON.stringify(body),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`PATCH ${path}: ${j.error?.message ?? r.status}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n=== Patching doc_template_demo — real Invoice template ===\n');
console.log('✓ Token acquired');

// 1. Find the form
const formRes = await get(
  `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0` +
  `&$select=qdb_form_definitionid&$top=1`,
);
const formRecord = formRes.value?.[0];
if (!formRecord) throw new Error(`Form '${FORM_CODE}' not found. Run seed-doc-template-demo.mjs first.`);
const formId = formRecord.qdb_form_definitionid;
console.log(`\n[1] Form found: ${formId}`);

// 2. Find the target field by schema name across all sections under this form
//    FetchXml-style deep filter not available via simple OData; traverse tabs→sections→fields.
const tabsRes = await get(
  `qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid`,
);
const tabIds = tabsRes.value.map(t => t.qdb_form_tabid);
if (!tabIds.length) throw new Error('No tabs found on form.');

let targetFieldId = null;
for (const tabId of tabIds) {
  const sectRes = await get(
    `qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tabId}&$select=qdb_form_sectionid`,
  );
  for (const sec of sectRes.value) {
    const fieldRes = await get(
      `qdb_form_fields?$filter=_qdb_form_section_id_value eq ${sec.qdb_form_sectionid}` +
      ` and qdb_schema_name eq '${FIELD_SCHEMA}'&$select=qdb_form_fieldid,qdb_schema_name&$top=1`,
    );
    if (fieldRes.value?.[0]) {
      targetFieldId = fieldRes.value[0].qdb_form_fieldid;
      break;
    }
  }
  if (targetFieldId) break;
}

if (!targetFieldId) {
  throw new Error(`Field '${FIELD_SCHEMA}' not found in form '${FORM_CODE}'.`);
}
console.log(`[2] Field found: ${targetFieldId} (${FIELD_SCHEMA})`);

// 3. Build the two JSON settings using the real Invoice template

const downloadDocumentSetting = JSON.stringify({
  downloadSetting: {
    attributeConfig: [
      {
        attributeName:  'documentName',
        attributeValue: INVOICE_TEMPLATE_NAME,   // "Invoice" — exact name in documenttemplates
        type:           'string',
      },
    ],
  },
});

// qdb_templateguid is the lookup on qdb_edms that points to the document template.
// The OData bind uses /documenttemplates (not /qdb_documenttemplates) because
// documenttemplates is a standard Dataverse entity, not a custom qdb_* one.
//
// {submissionId} and {annotationId} are template variables resolved at runtime by
// CrmSubmissionService.buildEdmsPayload — they are not literal GUIDs.
const uploadDocumentSetting = JSON.stringify({
  entityName:      'qdb_edms',
  attributeConfig: [
    {
      attributeName:  'qdb_templateguid@odata.bind',
      attributeValue: `/documenttemplates(${INVOICE_TEMPLATE_ID})`,
      type:           'lookup',
    },
    {
      attributeName:  'qdb_submissionid@odata.bind',
      attributeValue: '/qdb_form_submission_logs({submissionId})',
      type:           'lookup',
    },
    {
      attributeName:  'qdb_annotationid@odata.bind',
      attributeValue: '/annotations({annotationId})',
      type:           'lookup',
    },
  ],
});

console.log('\n[3] New settings:');
console.log('  downloadDocumentSetting:', downloadDocumentSetting);
console.log('  uploadDocumentSetting  :', uploadDocumentSetting);

// 4. Patch the field
await patch(
  `qdb_form_fields(${targetFieldId})`,
  {
    qdb_download_document_setting: downloadDocumentSetting,
    qdb_upload_document_setting:   uploadDocumentSetting,
    // Keep label accurate now that template name changed
    qdb_label:              'Invoice (Completed)',
    qdb_file_download_label: 'Download Invoice Template',
  },
);

console.log('\n[4] Field patched ✓');
console.log('\n=== Done ===');
console.log('\nField demo_bank_statement on doc_template_demo now has:');
console.log(`  qdb_download_document_setting → documentName: "${INVOICE_TEMPLATE_NAME}"`);
console.log(`  qdb_upload_document_setting   → 3 bindings:`);
console.log(`    qdb_templateguid@odata.bind  = /documenttemplates(${INVOICE_TEMPLATE_ID})`);
console.log(`    qdb_submissionid@odata.bind  = /qdb_form_submission_logs({submissionId})`);
console.log(`    qdb_annotationid@odata.bind  = /annotations({annotationId})`);
console.log('\nOn submission, CrmSubmissionService.processFileUploadSettings will:');
console.log('  1. Detect the file field has uploadDocumentSetting');
console.log('  2. Substitute {submissionId} and {annotationId} with real runtime IDs');
console.log('  3. POST to /qdb_edmss to create the EDMS record with all three bindings');
