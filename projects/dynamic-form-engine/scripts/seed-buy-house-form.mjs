/**
 * Seeds the complete "Buy House" form in Dataverse.
 * Run: node scripts/seed-buy-house-form.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token: ${j.error_description}`);
  return j.access_token;
}

function h(token) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', Prefer: 'return=representation' };
}

async function post(token, entity, body) {
  const res = await fetch(`${API_BASE}/${entity}`, { method: 'POST', headers: h(token), body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`POST ${entity} → ${res.status}: ${j.error?.message}`);
  return j;
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: h(token) });
  const j = await res.json();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${j.error?.message}`);
  return j;
}

// Picklist codes from CrmMetadataService
const FT  = { text: 100000001, number: 100000003, decimal: 100000012, phone: 100000014 };
const BA  = { submit: 100000001, saveDraft: 100000002, cancel: 100000003 };
const COL = { two: 100000002 };
const CS  = { one: 100000001, two: 100000002 };
const IST = { steps: 100000000, iconList: 100000001, downloadList: 100000002 };

async function main() {
  console.log('\n=== Seeding "Buy House" form ===\n');
  const t = await acquireToken();
  console.log('✓ Token acquired');

  // Guard
  const check = await get(t, `qdb_form_definitions?$filter=qdb_form_code eq 'buy-house' and statecode eq 0&$select=qdb_form_definitionid&$top=1`);
  if (check.value?.length) {
    console.log(`\n⚠  Already exists (${check.value[0].qdb_form_definitionid}). Delete first to re-seed.\n`);
    process.exit(0);
  }

  // ── 1. Form Definition  (primary name = qdb_form_code) ────────────────────
  console.log('\n[1] Form definition…');
  const form = await post(t, 'qdb_form_definitions', {
    qdb_form_code:               'buy-house',
    qdb_title:                   'Buy House',
    qdb_description:             'Purchase a ready-built property',
    qdb_status:                  100000001,
    qdb_version:                 1,
    qdb_allow_save_draft:        true,
    qdb_confirmation_message:    'Your Buy House application has been submitted. We will review it and contact you shortly.',
    qdb_allow_infocard_skip:     false,
    qdb_infocard_start_label:    'Start',
    qdb_infocard_continue_label: 'Continue',
    qdb_infocard_back_label:     'Back',
  });
  const fid = form.qdb_form_definitionid;
  console.log(`  ✓ Form: ${fid}`);

  // ── 2. Tabs  (primary name = qdb_label) ───────────────────────────────────
  console.log('\n[2] Tabs…');
  const tabDef  = tab => ({ 'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`, qdb_is_visible: true, ...tab });
  const tabDetails   = await post(t, 'qdb_form_tabs', tabDef({ qdb_label: 'Details',    qdb_display_order: 1 }));
  console.log(`  ✓ Details   (${tabDetails.qdb_form_tabid})`);
  const tabEsign     = await post(t, 'qdb_form_tabs', tabDef({ qdb_label: 'E-sign',     qdb_display_order: 2 }));
  console.log(`  ✓ E-sign    (${tabEsign.qdb_form_tabid})`);
  const tabTitleDeed = await post(t, 'qdb_form_tabs', tabDef({ qdb_label: 'Title deed', qdb_display_order: 3 }));
  console.log(`  ✓ Title deed (${tabTitleDeed.qdb_form_tabid})`);

  // ── 3. Sections  (primary name = qdb_label) ───────────────────────────────
  console.log('\n[3] Sections…');
  const secDef = (tabId, extra) => ({
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_display_order: 1, qdb_columns: COL.two,
    qdb_is_collapsible: false, qdb_is_collapsed_by_default: false, qdb_is_visible: true,
    ...extra,
  });

  const secSeller = await post(t, 'qdb_form_sections', secDef(tabDetails.qdb_form_tabid, {
    qdb_label: 'Seller & Property',
    qdb_description: "Enter the seller's details and property information",
  }));
  console.log(`  ✓ Seller & Property (${secSeller.qdb_form_sectionid})`);

  await post(t, 'qdb_form_sections', secDef(tabEsign.qdb_form_tabid, {
    qdb_label: 'E-sign Documents',
    qdb_description: 'Review and digitally sign the required documents via the QDI application.',
  }));
  console.log(`  ✓ E-sign Documents`);

  await post(t, 'qdb_form_sections', secDef(tabTitleDeed.qdb_form_tabid, {
    qdb_label: 'Title Deed',
    qdb_description: 'Upload the MOJ-issued title deed to proceed with final approval and payment.',
  }));
  console.log(`  ✓ Title Deed`);

  // ── 4. Fields  (primary name = qdb_schema_name) ───────────────────────────
  console.log('\n[4] Fields…');
  const sb = `/qdb_form_sections(${secSeller.qdb_form_sectionid})`;
  const fld = (body) => ({
    'qdb_form_section_id@odata.bind': sb,
    qdb_is_required: true, qdb_is_readonly: false, qdb_is_hidden: false,
    ...body,
  });

  const fields = [
    { qdb_schema_name: 'qdb_sellers_full_name',   qdb_field_type: FT.text,    qdb_label: "Seller's Full Name",   qdb_placeholder: 'Full name as on QID',                        qdb_display_order: 1, qdb_column_span: CS.two },
    { qdb_schema_name: 'qdb_sellers_mobile',      qdb_field_type: FT.phone,   qdb_label: "Seller's Mobile Number", qdb_placeholder: '8 Digit Qatar Mobile Number',            qdb_display_order: 2, qdb_column_span: CS.one },
    { qdb_schema_name: 'qdb_sellers_iban',        qdb_field_type: FT.text,    qdb_label: "Seller's IBAN Number", qdb_placeholder: '29-character Qatar IBAN (e.g. QA58DOHA…)', qdb_display_order: 3, qdb_column_span: CS.two },
    { qdb_schema_name: 'qdb_title_deed_number',   qdb_field_type: FT.text,    qdb_label: 'Title deed number',    qdb_placeholder: 'e.g. 1234/2026',                           qdb_display_order: 4, qdb_column_span: CS.one },
    { qdb_schema_name: 'qdb_built_up_area',       qdb_field_type: FT.decimal, qdb_label: 'Built-up area (sqm)',  qdb_placeholder: 'e.g. 450',  qdb_decimal_places: 2,          qdb_display_order: 5, qdb_column_span: CS.one },
    { qdb_schema_name: 'qdb_pincode',             qdb_field_type: FT.text,    qdb_label: 'Pincode',             qdb_placeholder: '8 digit pin code',                          qdb_display_order: 6, qdb_column_span: CS.one },
  ];

  for (const f of fields) {
    await post(t, 'qdb_form_fields', fld(f));
    console.log(`  ✓ ${f.qdb_label}`);
  }

  // ── 5. Buttons  (primary name = qdb_label) ────────────────────────────────
  console.log('\n[5] Buttons…');
  const btn = (body) => ({
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_is_visible: true, qdb_is_active: true, qdb_confirmation_required: false,
    ...body,
  });

  await post(t, 'qdb_form_buttons', btn({ qdb_label: 'Back',               qdb_action: BA.cancel,    qdb_display_order: 1, qdb_is_primary: false }));
  console.log('  ✓ Back');
  await post(t, 'qdb_form_buttons', btn({ qdb_label: 'Save & Continue',    qdb_action: BA.saveDraft, qdb_display_order: 2, qdb_is_primary: false }));
  console.log('  ✓ Save & Continue');
  await post(t, 'qdb_form_buttons', btn({
    qdb_label: 'Submit Application', qdb_action: BA.submit, qdb_display_order: 3, qdb_is_primary: true,
    qdb_confirmation_required: true,
    qdb_confirmation_message: 'Are you sure you want to submit your Buy House application? This cannot be undone.',
  }));
  console.log('  ✓ Submit Application');

  // ── 6. Info-Card Screen 1: Application Process ────────────────────────────
  console.log('\n[6] Info-Card Screen 1: Application Process…');
  const s1 = await post(t, 'qdb_info_card_screens', {
    qdb_info_card_screenname: 'Application Process',
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_display_order: 1,
    qdb_heading:      'Application Process',
    qdb_sub_heading:  "Here's what to expect",
    qdb_icon_url:     'https://cdn-icons-png.flaticon.com/512/1698/1698535.png',
    qdb_icon_alt_text:'House illustration',
  });
  console.log(`  ✓ Screen: ${s1.qdb_info_card_screenid}`);

  const secSteps = await post(t, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Application Steps',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s1.qdb_info_card_screenid})`,
    qdb_display_order: 1, qdb_section_type: IST.steps,
  });

  for (const [i, step] of [
    { title: 'Application Details',                description: 'Provide required information and documents for review',                                                         icon: 'DocumentTextRegular' },
    { title: 'Digitally Sign Mandatory Documents', description: 'Please visit QDI application to e-sign the generated documents',                                               icon: 'SignatureRegular'    },
    { title: 'Title Deed',                         description: 'Please visit the MOJ-issued title deed for review to proceed with final approval and payment',                 icon: 'DocumentRegular'     },
  ].entries()) {
    await post(t, 'qdb_info_card_items', {
      qdb_info_card_itemname: step.title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${secSteps.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1, qdb_item_title: step.title,
      qdb_item_description: step.description, qdb_icon_reference: step.icon,
    });
    console.log(`  ✓ Step ${i + 1}: ${step.title}`);
  }

  // ── 7. Info-Card Screen 2: What You'll Need ───────────────────────────────
  console.log("\n[7] Info-Card Screen 2: What You'll Need…");
  const s2 = await post(t, 'qdb_info_card_screens', {
    qdb_info_card_screenname: "What You'll Need",
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_display_order: 2,
    qdb_heading:     "What You'll Need",
    qdb_sub_heading: 'Before you start, make sure you have the required documents and information ready.',
  });
  console.log(`  ✓ Screen: ${s2.qdb_info_card_screenid}`);

  // Section A: Details to Enter
  const secDetailItems = await post(t, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Details to Enter',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s2.qdb_info_card_screenid})`,
    qdb_display_order: 1, qdb_section_title: 'Details to Enter', qdb_section_type: IST.iconList,
  });

  for (const [i, item] of [
    { title: 'Seller Info',   description: 'Name, Mobile, IBAN Number',       icon: 'PersonRegular' },
    { title: 'Property Info', description: 'Title deed number, built-up area', icon: 'HomeRegular'   },
  ].entries()) {
    await post(t, 'qdb_info_card_items', {
      qdb_info_card_itemname: item.title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${secDetailItems.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1, qdb_item_title: item.title,
      qdb_item_description: item.description, qdb_icon_reference: item.icon,
    });
    console.log(`  ✓ ${item.title}`);
  }

  // Section B: Documents to Upload
  const secDocs = await post(t, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Documents to Upload',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s2.qdb_info_card_screenid})`,
    qdb_display_order: 2, qdb_section_title: 'Documents to Upload', qdb_section_type: IST.iconList,
  });

  for (const [i, item] of [
    { title: 'Your QID & Seller\'s QID', icon: 'ContactCardRegular'  },
    { title: 'Completion Certificate',   icon: 'CertificateRegular'  },
    { title: 'A01 Drawings',             icon: 'DrawImageRegular'    },
    { title: 'IBAN Letter',              icon: 'BuildingBankRegular' },
  ].entries()) {
    await post(t, 'qdb_info_card_items', {
      qdb_info_card_itemname: item.title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${secDocs.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1, qdb_item_title: item.title, qdb_icon_reference: item.icon,
    });
    console.log(`  ✓ ${item.title}`);
  }

  // Section C: Forms to Download & Fill
  const secDownload = await post(t, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Forms to Download & Fill',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${s2.qdb_info_card_screenid})`,
    qdb_display_order: 3, qdb_section_title: 'Forms to Download & Fill',
    qdb_section_type: IST.downloadList,
    qdb_note_text: 'Bank Guarantee Form — Download, get it signed by your salary bank, and upload it.',
  });

  for (const [i, item] of [
    { title: 'Pledge & Commitment Letter', url: 'https://www.qdb.qa/documents/pledge-commitment-letter.pdf' },
    { title: 'Bank Guarantee Form',        url: 'https://www.qdb.qa/documents/bank-guarantee-form.pdf'      },
  ].entries()) {
    await post(t, 'qdb_info_card_items', {
      qdb_info_card_itemname: item.title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${secDownload.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1, qdb_item_title: item.title, qdb_download_url: item.url,
    });
    console.log(`  ✓ ${item.title}`);
  }

  console.log(`\n=== Done ✓ ===`);
  console.log(`\n  Form code : buy-house`);
  console.log(`  Form ID   : ${fid}`);
  console.log('\n  Open the portal → Buy House form.');
  console.log('  Expect: 2 info-card screens → 3 tabs (Details, E-sign, Title deed)\n');
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1); });
