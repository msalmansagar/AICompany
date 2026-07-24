/**
 * Demo for the two new features:
 *   1. DFE-NUMBAR bar VALUE + MAX both from referenced fields — the utilization bar reads
 *      its fill from qdb_vd_drawn and its max from qdb_vd_limit (both live/editable),
 *      instead of a hard-coded Default Value. Change either number → the bar recomputes.
 *   2. DFE-SUMMARY-DL — a file field on a form with a Summary step, so an uploaded document
 *      can be downloaded from the summary.
 *
 * Run: node --env-file=scripts/.env scripts/seed-numbar-summary-demo.mjs
 */
const T = process.env.DV_TENANT_ID;
const C = process.env.DV_CLIENT_ID;
const S = process.env.DV_CLIENT_SECRET;
const U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;

const FORM_CODE = 'numbar-value-ref-demo';
const FT = { number: 100000003, currency: 100000011, file: 100000015 };
const NDS = { bar: 100000002 };
const COL = { one: 100000001 };
const CS = { two: 100000002 };

async function token() {
  if (!S) throw new Error('DV_CLIENT_SECRET not set.');
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token: ${j.error_description}`);
  return j.access_token;
}
function client(tok) {
  const h = {
    Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'return=representation',
  };
  return {
    get: async (p) => { const r = await fetch(`${API}/${p}`, { headers: h }); const j = await r.json(); if (!r.ok) throw new Error(`GET ${p} → ${r.status}: ${j.error?.message}`); return j; },
    post: async (e, b) => { const r = await fetch(`${API}/${e}`, { method: 'POST', headers: h, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(`POST ${e} → ${r.status}: ${j.error?.message}`); return j; },
    del: async (p) => { await fetch(`${API}/${p}`, { method: 'DELETE', headers: h }); },
  };
}

async function main() {
  const db = client(await token());
  console.log('✓ Token acquired');

  const prior = await db.get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`);
  for (const f of prior.value) { await db.del(`qdb_form_definitions(${f.qdb_form_definitionid})`); console.log(`  ✓ removed prior form ${f.qdb_form_definitionid}`); }

  const form = await db.post('qdb_form_definitions', {
    qdb_form_code: FORM_CODE,
    qdb_title: 'Utilization Bar + Summary Download Demo',
    qdb_description: 'Bar reads value+max from live fields; upload a document and download it from the summary.',
    qdb_status: 100000001,
    qdb_version: 1,
    qdb_show_summary_step: true,
  });
  const fid = form.qdb_form_definitionid;
  console.log(`[Form] ${FORM_CODE} → ${fid}`);

  const tab = await db.post('qdb_form_tabs', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${fid})`,
    qdb_label: 'Facility', qdb_display_order: 1, qdb_is_visible: true,
  });
  const section = await db.post('qdb_form_sections', {
    'qdb_form_tab_id@odata.bind': `/qdb_form_tabs(${tab.qdb_form_tabid})`,
    qdb_label: 'Credit facility', qdb_display_order: 1, qdb_columns: COL.one, qdb_is_visible: true,
  });
  const secId = section.qdb_form_sectionid;

  const field = (body) => db.post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${secId})`,
    qdb_is_required: false, qdb_is_readonly: false, qdb_is_hidden: false, qdb_column_span: CS.two, ...body,
  });

  await field({ qdb_schema_name: 'qdb_vd_limit', qdb_field_type: FT.number, qdb_label: 'Facility Limit (editable)', qdb_display_order: 1, qdb_default_value: '100000' });
  await field({ qdb_schema_name: 'qdb_vd_drawn', qdb_field_type: FT.number, qdb_label: 'Amount Drawn (editable)', qdb_display_order: 2, qdb_default_value: '82000' });
  // The bar: value from qdb_vd_drawn, max from qdb_vd_limit — NO hard-coded value of its own.
  await field({
    qdb_schema_name: 'qdb_vd_util', qdb_field_type: FT.currency, qdb_label: 'Utilization (bar — value & max from fields)',
    qdb_display_order: 3, qdb_is_readonly: true, qdb_currency_code: 'QAR',
    qdb_number_display_style: NDS.bar,
    qdb_bar_value_field_schema: 'qdb_vd_drawn',
    qdb_bar_max_field_schema: 'qdb_vd_limit',
  });
  console.log('  ✓ number fields + currency bar (value=qdb_vd_drawn ÷ max=qdb_vd_limit)');

  await field({ qdb_schema_name: 'qdb_vd_doc', qdb_field_type: FT.file, qdb_label: 'Supporting Document (download from summary)', qdb_display_order: 4 });
  console.log('  ✓ file field for summary-download demo');

  console.log(`\n=== Done. Open form code: ${FORM_CODE} (id ${fid}) ===`);
}

main().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
