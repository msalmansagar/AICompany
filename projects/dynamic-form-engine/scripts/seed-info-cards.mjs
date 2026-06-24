/**
 * Seeds Info-Card screens, sections, and items based on the HL Phase 2 Figma design.
 * Attaches to the first active qdb_form_definition found in Dataverse.
 *
 * Run: node scripts/seed-info-cards.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`Token failed: ${j.error_description}`);
  console.log('✓ Token acquired');
  return j.access_token;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hdrs(token, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
    Accept: 'application/json', 'Content-Type': 'application/json',
    ...extra,
  };
}

async function get(token, path) {
  const res = await fetch(`${API_BASE}/${path}`, { headers: hdrs(token) });
  const j = await res.json();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(j.error)}`);
  return j;
}

async function post(token, entity, body) {
  const res = await fetch(`${API_BASE}/${entity}`, {
    method: 'POST', headers: hdrs(token, { Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`POST ${entity} → ${res.status}: ${JSON.stringify(j.error)}`);
  return j;
}

function ok(msg)  { console.log(`  ✓ ${msg}`); }
function log(msg) { console.log(msg); }

// ── Get first active form definition ─────────────────────────────────────────

async function getFirstForm(token) {
  const res = await get(token,
    `qdb_form_definitions?$filter=statecode eq 0&$select=qdb_form_definitionid,qdb_title,qdb_form_code&$top=5&$orderby=createdon asc`
  );
  if (!res.value?.length) throw new Error('No active form definitions found in Dataverse');
  const forms = res.value;
  log('\nAvailable forms:');
  forms.forEach((f, i) => log(`  [${i}] ${f.qdb_title} (${f.qdb_form_code})`));
  // Use first one
  const form = forms[0];
  log(`\n→ Attaching info-cards to: "${form.qdb_title}" (${form.qdb_form_definitionid})`);
  return form;
}

// ── Check if info-cards already exist for this form ──────────────────────────

async function hasExistingInfoCards(token, formId) {
  const res = await get(token,
    `qdb_info_card_screens?$filter=_qdb_form_definition_id_value eq '${formId}'&$select=qdb_info_card_screenid&$top=1`
  );
  return (res.value?.length ?? 0) > 0;
}

// ── Seed data ─────────────────────────────────────────────────────────────────

async function seedInfoCards(token, formId) {

  // ── Screen 1: Application Process ─────────────────────────────────────────
  log('\n[Screen 1] Application Process');
  const screen1 = await post(token, 'qdb_info_card_screens', {
    qdb_info_card_screenname: 'Application Process',
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_display_order: 1,
    qdb_heading: 'Application Process',
    qdb_sub_heading: "Here's what to expect",
    qdb_icon_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135768.png',
    qdb_icon_alt_text: 'Application process illustration',
  });
  ok(`Created screen: ${screen1.qdb_info_card_screenid}`);

  // Section 1 on Screen 1: numbered-steps
  log('  [Section] Steps');
  const sec1 = await post(token, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Application Steps',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${screen1.qdb_info_card_screenid})`,
    qdb_display_order: 1,
    qdb_section_type: 100000000, // numbered-steps
  });
  ok(`Created section: ${sec1.qdb_info_card_sectionid}`);

  const steps = [
    { title: 'Application Details',                description: 'Provide required information and documents for review' },
    { title: 'Digitally Sign Mandatory Documents', description: 'Please visit QDB application to e-sign the generated documents' },
    { title: 'Title Deed',                         description: 'Upload the MoJ-issued title deed for review to proceed with final approval and payment' },
  ];
  for (let i = 0; i < steps.length; i++) {
    await post(token, 'qdb_info_card_items', {
      qdb_info_card_itemname: steps[i].title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${sec1.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1,
      qdb_item_title: steps[i].title,
      qdb_item_description: steps[i].description,
    });
    ok(`  Item ${i + 1}: ${steps[i].title}`);
  }

  // ── Screen 2: What You'll Need ─────────────────────────────────────────────
  log('\n[Screen 2] What You\'ll Need');
  const screen2 = await post(token, 'qdb_info_card_screens', {
    qdb_info_card_screenname: "What You'll Need",
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_display_order: 2,
    qdb_heading: "What You'll Need",
    qdb_sub_heading: 'Before you start, make sure you have the required documents and information ready',
    qdb_icon_url: 'https://cdn-icons-png.flaticon.com/512/2910/2910790.png',
    qdb_icon_alt_text: 'Documents checklist illustration',
  });
  ok(`Created screen: ${screen2.qdb_info_card_screenid}`);

  // Section 1: Details to Enter (icon-list)
  log('  [Section 1] Details to Enter');
  const sec2a = await post(token, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Details to Enter',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${screen2.qdb_info_card_screenid})`,
    qdb_display_order: 1,
    qdb_section_title: 'Details to Enter',
    qdb_section_type: 100000001, // icon-list
  });
  ok(`Created section: ${sec2a.qdb_info_card_sectionid}`);

  const detailItems = [
    { title: 'Seller Info',    description: 'Full name, Mobile number',    icon: 'Person' },
    { title: 'Property Info',  description: 'Title deed number, built-up area', icon: 'Home' },
  ];
  for (let i = 0; i < detailItems.length; i++) {
    await post(token, 'qdb_info_card_items', {
      qdb_info_card_itemname: detailItems[i].title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${sec2a.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1,
      qdb_item_title: detailItems[i].title,
      qdb_item_description: detailItems[i].description,
      qdb_icon_reference: detailItems[i].icon,
    });
    ok(`  Item ${i + 1}: ${detailItems[i].title}`);
  }

  // Section 2: Documents to Upload (icon-list)
  log('  [Section 2] Documents to Upload');
  const sec2b = await post(token, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Documents to Upload',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${screen2.qdb_info_card_screenid})`,
    qdb_display_order: 2,
    qdb_section_title: 'Documents to Upload',
    qdb_section_type: 100000001, // icon-list
  });
  ok(`Created section: ${sec2b.qdb_info_card_sectionid}`);

  const docItems = [
    { title: 'Your QID & Seller\'s QID', icon: 'ContactCard' },
    { title: 'Completion Certificate',   icon: 'Certificate' },
    { title: 'All Drawings',             icon: 'Design' },
    { title: 'IBAN Letter',              icon: 'Bank' },
  ];
  for (let i = 0; i < docItems.length; i++) {
    await post(token, 'qdb_info_card_items', {
      qdb_info_card_itemname: docItems[i].title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${sec2b.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1,
      qdb_item_title: docItems[i].title,
      qdb_icon_reference: docItems[i].icon,
    });
    ok(`  Item ${i + 1}: ${docItems[i].title}`);
  }

  // Section 3: Forms to Download & Fill (download-list)
  log('  [Section 3] Forms to Download & Fill');
  const sec2c = await post(token, 'qdb_info_card_sections', {
    qdb_info_card_sectionname: 'Forms to Download & Fill',
    'qdb_info_card_screen_id@odata.bind': `/qdb_info_card_screens(${screen2.qdb_info_card_screenid})`,
    qdb_display_order: 3,
    qdb_section_title: 'Forms to Download & Fill',
    qdb_section_type: 100000002, // download-list
    qdb_note_text: 'Bank Guarantee Form — download, get it signed by your salary bank, and upload it',
  });
  ok(`Created section: ${sec2c.qdb_info_card_sectionid}`);

  const downloadItems = [
    { title: 'Pledge & Commitment Letter', url: 'https://www.qdb.qa/documents/pledge-commitment-letter.pdf' },
    { title: 'Bank Guarantee Form',        url: 'https://www.qdb.qa/documents/bank-guarantee-form.pdf' },
  ];
  for (let i = 0; i < downloadItems.length; i++) {
    await post(token, 'qdb_info_card_items', {
      qdb_info_card_itemname: downloadItems[i].title,
      'qdb_info_card_section_id@odata.bind': `/qdb_info_card_sections(${sec2c.qdb_info_card_sectionid})`,
      qdb_display_order: i + 1,
      qdb_item_title: downloadItems[i].title,
      qdb_download_url: downloadItems[i].url,
    });
    ok(`  Item ${i + 1}: ${downloadItems[i].title}`);
  }

  // ── Enable skip on the form ────────────────────────────────────────────────
  log('\n[Update] Enabling qdb_allow_infocard_skip on form definition...');
  await fetch(`${API_BASE}/qdb_form_definitions(${formId})`, {
    method: 'PATCH',
    headers: hdrs(token),
    body: JSON.stringify({ qdb_allow_infocard_skip: true }),
  });
  ok('Allow info card skip = true');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Seeding Info-Card Screens (HL Phase 2 design) ===\n');
  const token = await acquireToken();
  const form = await getFirstForm(token);
  const formId = form.qdb_form_definitionid;

  if (await hasExistingInfoCards(token, formId)) {
    console.log('\n⚠ Info-card screens already exist for this form.');
    console.log('  Delete them in Dataverse first, or choose a different form.');
    process.exit(0);
  }

  await seedInfoCards(token, formId);
  console.log('\n=== Seeding complete ✓ ===');
  console.log(`\nOpen the portal and navigate to form: "${form.qdb_title}"`);
  console.log('You should see 2 info-card screens before the first tab.\n');
}

main().catch(err => {
  console.error('\n✗ Fatal:', err.message);
  process.exit(1);
});
