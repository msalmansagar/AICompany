/**
 * provision-file-extensions-multiselect.mjs
 *
 * Provisions `qdb_allowed_file_extensions` MultiSelect Optionset on
 * `qdb_form_field`, then updates the main form to replace the old
 * `qdb_allowed_mime_types` memo cell with the new multiselect cell.
 *
 * Safe to re-run — attribute creation is guarded; form patch is idempotent
 * because it rewrites the entire Upload Config section rows.
 *
 * Run: node scripts/provision-file-extensions-multiselect.mjs
 */

import { randomUUID } from 'crypto';

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_ID       = '585f5778-d19e-43dd-9d0d-e968cbafe6b4';
const ENTITY        = 'qdb_form_field';

// ── Auth ──────────────────────────────────────────────────────────────────────
console.log('[auth] Acquiring token…');
const tok = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         `${DV}/.default`,
    }),
  },
)
  .then((r) => r.json())
  .then((j) => {
    if (!j.access_token) throw new Error(j.error_description ?? 'token fetch failed');
    return j.access_token;
  });

const H = {
  Authorization:    `Bearer ${tok}`,
  'OData-MaxVersion': '4.0',
  'OData-Version':    '4.0',
  Accept:           'application/json',
  'Content-Type':   'application/json',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [
    { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 },
  ],
});

async function attrExists(schema) {
  const r = await fetch(
    `${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes(LogicalName='${schema}')?$select=LogicalName`,
    { headers: H },
  );
  return r.ok;
}

async function publishEntity() {
  const xml = `<importexportxml><entities><entity>${ENTITY}</entity></entities></importexportxml>`;
  const r = await fetch(`${BASE}/PublishXml`, {
    method: 'POST', headers: H, body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`PublishXml: ${t}`); }
}

const uid = () => `{${randomUUID().toUpperCase()}}`;

// ── ClassIDs ──────────────────────────────────────────────────────────────────
const CLS = {
  picklist:    '{3EF39988-22BB-4F0B-BBBE-64B5A3748AEE}',
  int:         '{C6D124CA-7EDA-4A60-AEA9-7FB8D318B68F}',
  multiselect: '{4AA28AB7-9C13-4F57-A73D-AD894D048B5F}',
};

// ── Option definitions ────────────────────────────────────────────────────────
const FILE_EXTENSION_OPTIONS = [
  [100000000, 'PDF'],
  [100000001, 'JPEG'],
  [100000002, 'PNG'],
  [100000003, 'GIF'],
  [100000004, 'WEBP'],
  [100000005, 'DOCX'],
  [100000006, 'DOC'],
  [100000007, 'XLSX'],
  [100000008, 'XLS'],
  [100000009, 'PPTX'],
  [100000010, 'TXT'],
  [100000011, 'CSV'],
  [100000012, 'ZIP'],
  [100000013, 'MP4'],
  [100000014, 'MP3'],
];

// ══════════════════════════════════════════════════════════════════════════════
// [1] Provision qdb_allowed_file_extensions MultiSelect Optionset
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[1] Provisioning qdb_allowed_file_extensions MultiSelect…');

const ATTR_SCHEMA = 'qdb_allowed_file_extensions';

if (await attrExists(ATTR_SCHEMA)) {
  console.log(`  ↷ ${ATTR_SCHEMA} already exists — skipping create`);
} else {
  const createRes = await fetch(
    `${BASE}/EntityDefinitions(LogicalName='${ENTITY}')/Attributes`,
    {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        '@odata.type': 'Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata',
        SchemaName:    ATTR_SCHEMA,
        LogicalName:   ATTR_SCHEMA,
        RequiredLevel: { Value: 'None' },
        DisplayName:   lbl('Allowed File Extensions'),
        Description:   lbl('Select the file types permitted for upload on this field'),
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
          IsGlobal:      false,
          OptionSetType: 'Picklist',
          Options:       FILE_EXTENSION_OPTIONS.map(([v, l]) => ({ Value: v, Label: lbl(l) })),
        },
      }),
    },
  );

  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Create ${ATTR_SCHEMA}: ${t}`);
  }
  console.log(`  ✓ ${ATTR_SCHEMA} created`);
}

await publishEntity();
console.log('  ✓ Entity published');

// ══════════════════════════════════════════════════════════════════════════════
// [2] Update the qdb_form_field main form — patch Upload Config section
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[2] Fetching current form XML…');

const formRes = await fetch(`${BASE}/systemforms(${FORM_ID})?$select=formxml`, { headers: H });
if (!formRes.ok) {
  const t = await formRes.text();
  throw new Error(`Fetch form XML: ${t}`);
}
const { formxml: currentXml } = await formRes.json();

// Build the new Upload Config rows — replaces qdb_allowed_mime_types with
// qdb_allowed_file_extensions; keeps the other three fields intact.
function cell(label, fieldName, classid) {
  return (
    `<row><cell id="${uid()}" locklevel="0">` +
    `<labels><label description="${label}" languagecode="1033" /></labels>` +
    `<control id="${fieldName}" classid="${classid}" datafieldname="${fieldName}" disabled="false" />` +
    `</cell></row>`
  );
}

const newUploadRows = [
  cell('Document Type',           'qdb_document_type',            CLS.picklist),
  cell('Allowed File Extensions', 'qdb_allowed_file_extensions',  CLS.multiselect),
  cell('Max File Size (MB)',       'qdb_max_file_size_mb',         CLS.int),
  cell('Max Files',               'qdb_max_files',                CLS.int),
].join('');

// The form XML from setup-formfield-form.mjs names the section:
//   <section ... name="section_upload_config" ...>
// We locate the section's <rows> block and replace it entirely.
// Strategy: replace everything between the rows open-tag and close-tag that
// belongs to this section.  We match a minimal region by targeting the
// section_upload_config boundary precisely.
const UPLOAD_SECTION_RE =
  /(<section[^>]*name="section_upload_config"[^>]*>[\s\S]*?<rows>)([\s\S]*?)(<\/rows>[\s\S]*?<\/section>)/;

if (!UPLOAD_SECTION_RE.test(currentXml)) {
  throw new Error(
    'section_upload_config not found in form XML — ' +
    'run setup-formfield-form.mjs first to build the form structure',
  );
}

const patchedXml = currentXml.replace(
  UPLOAD_SECTION_RE,
  (_, openPart, _oldRows, closePart) => `${openPart}${newUploadRows}${closePart}`,
);

console.log('  ✓ Upload Config section rows rebuilt');

// ── Patch form ────────────────────────────────────────────────────────────────
console.log('\n[3] Patching form XML back to Dataverse…');

const patchRes = await fetch(`${BASE}/systemforms(${FORM_ID})`, {
  method:  'PATCH',
  headers: H,
  body:    JSON.stringify({ formxml: patchedXml }),
});

if (!patchRes.ok) {
  const t = await patchRes.text();
  throw new Error(`Patch form XML: ${t}`);
}
console.log('  ✓ Form XML patched');

// ── Publish ───────────────────────────────────────────────────────────────────
console.log('\n[4] Publishing…');
await publishEntity();
console.log('  ✓ Published');

console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  provision-file-extensions-multiselect — COMPLETE                    ║
╠══════════════════════════════════════════════════════════════════════╣
║  [1] qdb_allowed_file_extensions MultiSelect provisioned (15 opts)   ║
║  [2] Upload Config section rebuilt:                                  ║
║        Document Type         → picklist                              ║
║        Allowed File Exts     → multiselect (NEW)                     ║
║        Max File Size (MB)    → int                                   ║
║        Max Files             → int                                   ║
║  [3] Form XML patched                                                ║
║  [4] Entity published                                                ║
╠══════════════════════════════════════════════════════════════════════╣
║  NOTE: qdb_allowed_mime_types memo kept in Dataverse as fallback.    ║
╚══════════════════════════════════════════════════════════════════════╝
`);
