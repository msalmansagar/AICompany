/**
 * DFE-INFOLIST-001 — seeds a demo form showcasing configurable info-card list styles:
 *   • Bullet list (plain marker)
 *   • Roman-numbered list with circle markers (CEO Must-Have)
 *   • Arabic-numbered list (plain marker)
 *   • Legacy plain-text card (backward-compatibility check — no list type set)
 *
 * Attaches three sections to a fresh form so the styles render side by side.
 *
 * Run: node scripts/seed-infocard-list-demo.mjs
 */

const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'infocard-list-demo';

const FT  = { infoCard: 100000020 };
const COL = { one: 100000001, two: 100000002 };
const CS  = { one: 100000001, two: 100000002 };
const ICS = { info: 100000000, warning: 100000001, success: 100000002, error: 100000003 };

async function acquireToken() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET not set in environment.');
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`Token failed: ${j.error_description}`);
  console.log('✓ Token acquired');
  return j.access_token;
}

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

async function main() {
  const token = await acquireToken();

  // Remove any prior run of this demo so re-seeding stays idempotent.
  const existing = await get(
    token,
    `qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`,
  );
  for (const f of existing.value) {
    await fetch(`${API_BASE}/qdb_form_definitions(${f.qdb_form_definitionid})`, {
      method: 'DELETE', headers: hdrs(token),
    });
    console.log(`  ✓ Removed prior demo form ${f.qdb_form_definitionid}`);
  }

  const form = await post(token, 'qdb_form_definitions', {
    qdb_form_code:   FORM_CODE,
    qdb_title:       'Info-Card List Styles Demo',
    qdb_description: 'DFE-INFOLIST-001 — bullet, roman-with-circle, and numbered info-card lists.',
    qdb_status:      100000001,
    qdb_version:     1,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`  ✓ Form '${FORM_CODE}' (${fid})`);

  const tab = await post(token, 'qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'List Styles', qdb_display_order: 1, qdb_is_visible: true,
  });
  const tabId = tab.qdb_form_tabid;

  const section = await post(token, 'qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tabId})`,
    qdb_label: 'Configurable list styles', qdb_display_order: 1,
    qdb_columns: COL.one, qdb_is_visible: true,
  });
  const secId = section.qdb_form_sectionid;

  const fld = (body) => ({
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false,
    qdb_field_type: FT.infoCard, qdb_column_span: CS.two, ...body,
  });

  await post(token, 'qdb_form_fields', fld({
    qdb_schema_name: 'il_bullet', qdb_display_order: 1,
    qdb_label: 'Eligibility checklist',
    qdb_info_card_style: ICS.info,
    qdb_info_card_title: 'Before you start',
    qdb_info_card_body:
      'You must be a Qatari national\nYou must be over 21 years of age\nYou must hold an active bank account',
    qdb_info_card_list_type:   'bullet',
    qdb_info_card_list_marker: 'plain',
    qdb_info_card_icon: 'InfoRegular',
  }));
  console.log('  ✓ Bullet-list card');

  await post(token, 'qdb_form_fields', fld({
    qdb_schema_name: 'il_roman_circle', qdb_display_order: 2,
    qdb_label: 'Application steps (roman, circled)',
    qdb_info_card_style: ICS.success,
    qdb_info_card_title: 'How the process works',
    qdb_info_card_body:
      'Complete every required section\nUpload your supporting documents\nReview the summary\nSubmit for approval',
    qdb_info_card_list_type:   'numbered-roman',
    qdb_info_card_list_marker: 'circle',
    qdb_info_card_icon: 'CheckmarkCircleRegular',
  }));
  console.log('  ✓ Roman-numbered circled card');

  await post(token, 'qdb_form_fields', fld({
    qdb_schema_name: 'il_arabic', qdb_display_order: 3,
    qdb_label: 'Documents required (numbered)',
    qdb_info_card_style: ICS.warning,
    qdb_info_card_title: 'Have these ready',
    qdb_info_card_body:
      'Copy of your Qatari ID\nProof of income for the last 3 months\nRecent bank statement',
    qdb_info_card_list_type:   'numbered-arabic',
    qdb_info_card_list_marker: 'plain',
    qdb_info_card_icon: 'WarningRegular',
  }));
  console.log('  ✓ Arabic-numbered card');

  // Backward-compatibility card — no list type set; must render as plain text.
  await post(token, 'qdb_form_fields', fld({
    qdb_schema_name: 'il_legacy_plain', qdb_display_order: 4,
    qdb_label: 'Legacy plain card',
    qdb_info_card_style: ICS.info,
    qdb_info_card_title: 'Plain text (unchanged)',
    qdb_info_card_body: 'This card sets no list type and must render exactly as before.',
    qdb_info_card_icon: 'InfoRegular',
  }));
  console.log('  ✓ Legacy plain-text card');

  console.log(`\n✓ Done. Form code: ${FORM_CODE}  id: ${fid}`);
}

main().catch((err) => { console.error('✗', err.message); process.exit(1); });
