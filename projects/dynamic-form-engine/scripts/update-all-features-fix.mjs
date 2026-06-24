/**
 * Fix remaining items from update-all-features:
 *   1. Info-card section noteText (title matching was wrong)
 *   2. Lookup config dependsOnField (OData bind, not string attribute)
 *
 * Run: node scripts/update-all-features-fix.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;
const FORM_CODE     = 'dfe-all-features';

const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials', client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET, scope: `${DV}/.default`,
});
const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
).then(r => r.json()).then(j => { if (!j.access_token) throw new Error(j.error_description); return j.access_token; });

const H = {
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  Accept: 'application/json', 'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) throw new Error(`GET ${path}: ${j.error?.message ?? r.status}`);
  return j;
}
async function patch(entity, id, body) {
  const r = await fetch(`${BASE}/${entity}(${id})`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`PATCH ${entity}(${id}): ${j.error?.message ?? r.status}`); }
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   Fix Remaining Features — dfe-all-features          ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
console.log('✓ Token acquired');

// ── Fetch form + tabs + fields ─────────────────────────────────────────────
const formRes = await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
const fid = formRes.value[0].qdb_form_definitionid;
const tabsRes = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_form_tabid&$top=10`);
const tabIds = new Set(tabsRes.value.map(t => t.qdb_form_tabid));

const fieldsRes = await get(`qdb_form_fields?$filter=statecode eq 0&$select=qdb_form_fieldid,qdb_schema_name&$expand=qdb_form_section_id($select=_qdb_form_tab_id_value)&$top=200`);
const formFields = fieldsRes.value.filter(f => tabIds.has(f.qdb_form_section_id?._qdb_form_tab_id_value));
const fieldMap = Object.fromEntries(formFields.map(f => [f.qdb_schema_name, f.qdb_form_fieldid]));
console.log(`✓ Form: ${fid}, Fields: ${formFields.length}`);

// ═══════════════════════════════════════════════════════════════════════════
// [1] INFO-CARD SECTION noteText — fetch with name field to match correctly
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[1] Patching info-card sections with noteText…');

const screensRes = await get(`qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${fid}' and statecode eq 0&$select=qdb_info_card_screenid`);
const screenIds  = screensRes.value.map(s => s.qdb_info_card_screenid);

if (screenIds.length) {
  const filter   = screenIds.map(id => `_qdb_info_card_screen_id_value eq '${id}'`).join(' or ');
  // Fetch both the name and the section_title so we can show both in the log
  const sectRes  = await get(`qdb_info_card_sections?$filter=(${filter}) and statecode eq 0&$select=qdb_info_card_sectionid,qdb_info_card_sectionname,qdb_section_title`);
  const sections = sectRes.value;
  console.log('  Found sections:', sections.map(s => `'${s.qdb_info_card_sectionname}' / '${s.qdb_section_title}'`).join(', '));

  // Match by qdb_info_card_sectionname (the auto-name field set in the seed)
  const notesByName = {
    'Form Steps':         'All 5 sections must be completed before submitting. You can save progress at any time.',
    'Requirements':       'Ensure your CV is in PDF or DOCX format and does not exceed 5 MB.',
    'Document Templates': 'Download and complete the templates before uploading them in the Financial & Docs section.',
  };

  for (const sec of sections) {
    const note = notesByName[sec.qdb_info_card_sectionname];
    if (note) {
      await patch('qdb_info_card_sections', sec.qdb_info_card_sectionid, { qdb_note_text: note });
      console.log(`  ✓ '${sec.qdb_info_card_sectionname}': noteText set`);
    } else {
      console.log(`  ⚠ No note configured for '${sec.qdb_info_card_sectionname}' — skipping`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// [2] LOOKUP CONFIG dependsOnField — use OData bind not string attribute
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] Patching lookup config dependsOnField via OData bind…');

const linkedFormFieldId  = fieldMap['cs_linked_form_code'];
const filterStatusFieldId = fieldMap['cs_filter_status'];

if (linkedFormFieldId && filterStatusFieldId) {
  const lcRes = await get(`qdb_form_lookup_configs?$filter=_qdb_form_field_id_value eq '${linkedFormFieldId}' and statecode eq 0&$select=qdb_form_lookup_configid&$top=1`);
  if (lcRes.value?.length) {
    const lcId = lcRes.value[0].qdb_form_lookup_configid;
    await patch('qdb_form_lookup_configs', lcId, {
      'qdb_depends_on_field_id@odata.bind': `/qdb_form_fields(${filterStatusFieldId})`,
      qdb_depends_on_filter_template:       'qdb_status eq {dependsOnValue}',
    });
    console.log(`  ✓ Lookup config (${lcId}): qdb_depends_on_field_id → cs_filter_status (${filterStatusFieldId})`);
    console.log(`  ✓ qdb_depends_on_filter_template: 'qdb_status eq {dependsOnValue}'`);
  } else {
    console.log('  ⚠ Lookup config not found for cs_linked_form_code');
  }
} else {
  console.log(`  ⚠ Missing fields: cs_linked_form_code=${linkedFormFieldId}, cs_filter_status=${filterStatusFieldId}`);
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  FIX COMPLETE                                        ║');
console.log('║  ✓ Info-card section noteText (3 sections)           ║');
console.log('║  ✓ Lookup config dependsOnField (OData bind)         ║');
console.log('╚══════════════════════════════════════════════════════╝\n');
