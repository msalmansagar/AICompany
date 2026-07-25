/**
 * DFE-LKPCOL-001 demo setup:
 *   - adds a qdb_account_name_ar (Arabic name) column to account + seeds Arabic names,
 *   - configures the repro-4points "Company" lookup with two display columns, the first
 *     of which pulls from name (English) / qdb_account_name_ar (Arabic).
 *
 * Run: node --env-file=scripts/.env scripts/seed-lookup-columns-demo.mjs
 */
const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;
const SOLUTION = 'QdbDynamicFormEngine';

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description); return j.access_token;
}
const AR_NAMES = {
  'Qatar National Bank': 'بنك قطر الوطني',
  'QDB Enterprise Solutions': 'حلول قطر للتنمية للمؤسسات',
  'Al Khalij Commercial Bank': 'بنك الخليج التجاري',
  'Mohammad Salman': 'محمد سلمان',
  'Mukesh': 'موكيش',
};

async function main() {
  const tok = await token();
  const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
  const metaH = { ...h, 'MSCRM.SolutionUniqueName': SOLUTION };
  console.log('✓ Token');

  // 1. Arabic name column on account (idempotent)
  const exists = await fetch(`${API}/EntityDefinitions(LogicalName='account')/Attributes(LogicalName='qdb_account_name_ar')?$select=LogicalName`, { headers: metaH });
  if (exists.ok) console.log('  ↷ qdb_account_name_ar exists');
  else {
    const r = await fetch(`${API}/EntityDefinitions(LogicalName='account')/Attributes`, { method: 'POST', headers: metaH, body: JSON.stringify({
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', SchemaName: 'qdb_account_name_ar', LogicalName: 'qdb_account_name_ar', MaxLength: 200, FormatName: { Value: 'Text' }, RequiredLevel: { Value: 'None' },
      DisplayName: { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Account Name (Arabic)', LanguageCode: 1033 }] },
    }) });
    if (!r.ok) throw new Error('add column: ' + (await r.json()).error?.message);
    console.log('  ✓ qdb_account_name_ar created');
  }

  // 2. Seed Arabic names
  const accts = (await (await fetch(`${API}/accounts?$select=accountid,name&$filter=accountnumber ne null`, { headers: h })).json()).value;
  for (const a of accts) {
    const ar = AR_NAMES[a.name];
    if (!ar) continue;
    await fetch(`${API}/accounts(${a.accountid})`, { method: 'PATCH', headers: h, body: JSON.stringify({ qdb_account_name_ar: ar }) });
    console.log(`  ✓ ${a.name} → ${ar}`);
  }

  // 3. Configure the repro-4points Company lookup with display columns
  const form = (await (await fetch(`${API}/qdb_form_definitions?$filter=qdb_form_code eq 'repro-4points'&$select=qdb_form_definitionid`, { headers: h })).json()).value[0];
  const company = (await (await fetch(`${API}/qdb_form_fields?$filter=qdb_schema_name eq 'qdb_r4_company'&$select=qdb_form_fieldid`, { headers: h })).json()).value[0];
  const cfg = (await (await fetch(`${API}/qdb_form_lookup_configs?$filter=_qdb_form_field_id_value eq ${company.qdb_form_fieldid}&$select=qdb_form_lookup_configid`, { headers: h })).json()).value[0];
  const columns = JSON.stringify([
    { attribute: 'name', arabicAttribute: 'qdb_account_name_ar', header: 'Name' },
    { attribute: 'accountnumber', header: 'Account #' },
  ]);
  await fetch(`${API}/qdb_form_lookup_configs(${cfg.qdb_form_lookup_configid})`, { method: 'PATCH', headers: h, body: JSON.stringify({ qdb_display_columns_json: columns }) });
  console.log('  ✓ Company lookup → display columns [Name (name/qdb_account_name_ar), Account #]');
  console.log(`\n=== Done. Form: repro-4points, field: Company. ===`);
}
main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
