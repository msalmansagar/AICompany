/**
 * Reconfigure the `outside-filter-demo` form to showcase all three grid capabilities:
 *
 *   1. Multiple stacking filter criteria
 *        - Static baseline (Layer 1)  → qdb_grid_filter_expression on Section 1's grid
 *        - Depends-on outside field (Layer 2) → already configured by the seed
 *        - Per-column in-grid filters (Layer 3) → turned ON below (search + clear inside the grid)
 *   2. In-grid search + clear → the per-column filter row (text / optionset / lookup)
 *   3. Paging → seeds enough active contacts (>50) so the 50-per-page cursor pager appears
 *
 * Idempotent: re-running skips contact seeding once the org already has >55 active contacts,
 * and PATCHes are naturally idempotent.
 *
 * Run: node --env-file=scripts/.env scripts/reconfigure-outside-filter-demo.mjs
 */

const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;

const token = async () => {
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description); return j.access_token;
};

const tok = await token();
const H = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async p => { const r = await fetch(`${API}/${p}`, { headers: H }); const j = await r.json(); if (!r.ok) throw new Error(`GET ${p}: ${j.error?.message}`); return j; };
const post = async (e, b) => { const r = await fetch(`${API}/${e}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(b) }); const j = await r.json(); if (!r.ok) throw new Error(`POST ${e}: ${j.error?.message}`); return j; };
const patch = async (e, b) => { const r = await fetch(`${API}/${e}`, { method: 'PATCH', headers: H, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`PATCH ${e}: ${(await r.text()).slice(0, 200)}`); };

console.log('✓ Token\n');

// ── Resolve the three demo accounts (companies) ───────────────────────────────
const accounts = (await get(
  `accounts?$filter=name eq 'Qatar National Bank' or name eq 'QDB Enterprise Solutions' or name eq 'Al Khalij Commercial Bank'&$select=accountid,name`,
)).value;
if (accounts.length < 3) throw new Error('Demo accounts missing — run seed-grid-filter-demo.mjs first.');
console.log(`Companies: ${accounts.map(a => a.name).join(', ')}`);

// ── 1. Seed contacts so paging (>50 rows) is visible ──────────────────────────
const activeCount = (await get(`contacts?$select=contactid&$filter=statecode eq 0&$top=200&$count=true`))['@odata.count'];
console.log(`\nActive contacts currently: ${activeCount}`);

if (activeCount > 55) {
  console.log('  ↷ Already >55 — skipping contact seeding.');
} else {
  const firsts = ['Ahmed', 'Fatima', 'Mohammed', 'Aisha', 'Omar', 'Noura', 'Yusuf', 'Layla', 'Khalid', 'Mariam', 'Hassan', 'Sara', 'Ali', 'Huda', 'Ibrahim', 'Reem', 'Tariq', 'Amina', 'Saeed', 'Dana'];
  const lasts = ['Al-Thani', 'Al-Kuwari', 'Al-Naimi', 'Al-Sulaiti', 'Al-Marri', 'Al-Emadi', 'Al-Mansoori', 'Al-Dosari'];
  const target = 60 - activeCount;
  console.log(`  Seeding ${target} contacts…`);
  for (let i = 0; i < target; i++) {
    const first = firsts[i % firsts.length];
    const last = lasts[Math.floor(i / firsts.length) % lasts.length];
    const gender = (i % 2) + 1;                 // 1 = male, 2 = female
    const company = accounts[i % accounts.length];
    await post('contacts', {
      firstname: first,
      lastname: `${last} ${i + 1}`,             // suffix keeps fullname unique + demo-taggable
      gendercode: gender,
      description: 'DFE outside-filter-demo seed',
      'parentcustomerid_account@odata.bind': `/accounts(${company.accountid})`,
    });
  }
  const newCount = (await get(`contacts?$select=contactid&$filter=statecode eq 0&$top=200&$count=true`))['@odata.count'];
  console.log(`  ✓ Active contacts now: ${newCount}`);
}

// ── Resolve the three demo grid fields + their columns ────────────────────────
const grids = (await get(
  `qdb_form_fields?$filter=qdb_field_type eq 100000021 and (qdb_schema_name eq 'demo_name_results' or qdb_schema_name eq 'demo_type_results' or qdb_schema_name eq 'demo_company_results')&$select=qdb_form_fieldid,qdb_schema_name`,
)).value;
const gridBySchema = Object.fromEntries(grids.map(g => [g.qdb_schema_name, g.qdb_form_fieldid]));

const findColumn = async (fieldId, attribute) => {
  const cols = (await get(`qdb_grid_column_configs?$filter=_qdb_form_field_id_value eq ${fieldId} and qdb_column_attribute eq '${attribute}'&$select=qdb_grid_column_configid`)).value;
  return cols[0]?.qdb_grid_column_configid;
};

// ── 2. Turn ON per-column in-grid filters (Layer 3: search + clear) ───────────
console.log('\nEnabling in-grid column filters…');

// Section 1 (name search) + Section 2 (gender): make the Company column filterable (lookup → account.name)
for (const schema of ['demo_name_results', 'demo_type_results']) {
  const colId = await findColumn(gridBySchema[schema], 'parentcustomerid');
  await patch(`qdb_grid_column_configs(${colId})`, {
    qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'lookup', lookupTargetEntity: 'account', lookupDisplayAttribute: 'name' }),
  });
  console.log(`  ✓ ${schema}: Company column → lookup filter (search by company name)`);
}

// Section 3 (company picker): make the Service Type column filterable (optionset)
{
  const colId = await findColumn(gridBySchema['demo_company_results'], 'gendercode');
  await patch(`qdb_grid_column_configs(${colId})`, {
    qdb_column_options_json: JSON.stringify({ v: 2, filterType: 'optionset', options: [{ value: '1', label: 'Consulting' }, { value: '2', label: 'Technology' }] }),
  });
  console.log('  ✓ demo_company_results: Service Type column → optionset filter');
}
// (Full Name columns are already text-filterable by default — no change needed.)

// ── 3. Static baseline (Layer 1) + explicit max rows ──────────────────────────
console.log('\nSetting static baseline + max rows…');
// Section 1 baseline: always restrict to active records, stacked with the outside field + column filters.
await patch(`qdb_form_fields(${gridBySchema['demo_name_results']})`, {
  qdb_grid_filter_expression: 'statecode eq 0',
  qdb_grid_max_rows: 200,
});
console.log("  ✓ demo_name_results: baseline `statecode eq 0` + maxRows 200");
for (const schema of ['demo_type_results', 'demo_company_results']) {
  await patch(`qdb_form_fields(${gridBySchema[schema]})`, { qdb_grid_max_rows: 200 });
  console.log(`  ✓ ${schema}: maxRows 200`);
}

console.log('\n=== Reconfigure complete. ===');
console.log('Section 1: type in the name box (Layer 2) + filter the Company column (Layer 3), all on top of the `statecode eq 0` baseline (Layer 1); >50 rows → Prev/Next paging.');
console.log('Section 2: gender dropdown (Layer 2) + Company column filter (Layer 3).');
console.log('Section 3: company picker (Layer 2) + Service Type column filter (Layer 3).');
