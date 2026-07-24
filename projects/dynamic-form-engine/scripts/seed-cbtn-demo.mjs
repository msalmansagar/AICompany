// seed-cbtn-demo.mjs — DFE-CBTN-001 live demo data.
// Adds two tab-level scoped buttons to the 'tabzone-grid-demo' form whose
// visibility / enablement is driven by the Branch field (qdb_branch):
//   • "Approve"           — visibleWhen  qdb_branch equals "Doha"
//   • "Submit for Review" — enabledWhen  qdb_branch isNotEmpty
// Idempotent: deletes the form's existing scoped buttons first, then recreates.
//
// Run: node --env-file=scripts/.env scripts/seed-cbtn-demo.mjs

const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const FORM_CODE = 'tabzone-grid-demo';
const CONDITION_FIELD = 'qdb_branch'; // schema name = runtime fieldValues key

const tok = (await (await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
})).json()).access_token;
const base = `${U}/api/data/v9.2`;
const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async (p) => (await (await fetch(`${base}/${p}`, { headers: h })).json()).value || [];

const rels = await get(`EntityDefinitions(LogicalName='qdb_form_scoped_button')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`);
const nav = (e) => rels.find((r) => r.ReferencedEntity === e).ReferencingEntityNavigationPropertyName;
const FORM_NAV = nav('qdb_form_definition'), TAB_NAV = nav('qdb_form_tab');

const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`))[0];
if (!form) throw new Error(`form ${FORM_CODE} not found`);
const formId = form.qdb_form_definitionid;
const tabs = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid&$orderby=qdb_display_order asc`);
const firstTab = tabs[0].qdb_form_tabid;
console.log(`form ${FORM_CODE} (${formId}) — first tab ${firstTab}`);

const existing = await get(`qdb_form_scoped_buttons?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_scoped_buttonid`);
for (const b of existing) {
  await fetch(`${base}/qdb_form_scoped_buttons(${b.qdb_form_scoped_buttonid})`, { method: 'DELETE', headers: h });
}
console.log(`cleared ${existing.length} existing scoped button(s)`);

async function create(fields) {
  const res = await fetch(`${base}/qdb_form_scoped_buttons`, { method: 'POST', headers: h, body: JSON.stringify(fields) });
  if (!res.ok) throw new Error(`create failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
const tabBind = { [`${FORM_NAV}@odata.bind`]: `/qdb_form_definitions(${formId})`, [`${TAB_NAV}@odata.bind`]: `/qdb_form_tabs(${firstTab})` };
const button = (label, order, extra) => ({
  qdb_label: label, qdb_placement_scope: 'tab', qdb_display_order: order, qdb_is_primary: false,
  qdb_is_visible: true, qdb_confirm_required: false, qdb_is_active: true,
  qdb_action_type: 'saveDraft', qdb_action_config_json: '{}', ...tabBind, ...extra,
});

const visibleWhen = JSON.stringify({ conditions: [{ fieldId: CONDITION_FIELD, operator: 'equals', value: 'Doha' }], logic: 'AND' });
const enabledWhen = JSON.stringify({ conditions: [{ fieldId: CONDITION_FIELD, operator: 'isNotEmpty' }], logic: 'AND' });

await create(button('Approve', 1, { qdb_visible_conditions_json: visibleWhen }));
await create(button('Submit for Review', 2, { qdb_enabled_conditions_json: enabledWhen }));

console.log('\nDONE — seeded 2 conditional buttons on the first tab:');
console.log('  • "Approve"           visible when Branch = "Doha"');
console.log('  • "Submit for Review" enabled when Branch is not empty');
