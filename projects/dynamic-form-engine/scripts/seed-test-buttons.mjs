// seed-test-buttons.mjs — DFE-BTN-001 test data.
// Seeds a wizard button set on the 'loan-application' form so the feature can be
// tested end-to-end (designer authoring + portal rendering/navigation).
// Idempotent: deletes the form's existing scoped buttons first, then recreates.
//
// Run: node --env-file=scripts/.env scripts/seed-test-buttons.mjs

const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const FORM_CODE = 'loan-application';

const tok = (await (await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
})).json()).access_token;
const base = `${U}/api/data/v9.2`;
const h = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const get = async (p) => (await (await fetch(`${base}/${p}`, { headers: h })).json()).value || [];

// Resolve lookup nav property names.
const rels = await get(`EntityDefinitions(LogicalName='qdb_form_scoped_button')/ManyToOneRelationships?$select=ReferencingEntityNavigationPropertyName,ReferencedEntity`);
const nav = (e) => rels.find((r) => r.ReferencedEntity === e).ReferencingEntityNavigationPropertyName;
const FORM_NAV = nav('qdb_form_definition'), TAB_NAV = nav('qdb_form_tab'), SEC_NAV = nav('qdb_form_section');

// Find the form + ordered tabs + a section on the first tab.
const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`))[0];
if (!form) throw new Error(`form ${FORM_CODE} not found`);
const formId = form.qdb_form_definitionid;
const tabs = await get(`qdb_form_tabs?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_tabid,qdb_label,qdb_display_order&$orderby=qdb_display_order asc`);
const firstSection = (await get(`qdb_form_sections?$filter=_qdb_form_tab_id_value eq ${tabs[0].qdb_form_tabid}&$select=qdb_form_sectionid,qdb_label&$top=1`))[0];
console.log(`form ${FORM_CODE} (${formId}) — ${tabs.length} tabs`);

// Clear existing scoped buttons for this form (idempotent re-seed).
const existing = await get(`qdb_form_scoped_buttons?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_scoped_buttonid`);
for (const b of existing) {
  await fetch(`${base}/qdb_form_scoped_buttons(${b.qdb_form_scoped_buttonid})`, { method: 'DELETE', headers: h });
}
console.log(`cleared ${existing.length} existing scoped button(s)`);

async function create(fields) {
  const res = await fetch(`${base}/qdb_form_scoped_buttons`, { method: 'POST', headers: h, body: JSON.stringify(fields) });
  if (!res.ok) throw new Error(`create failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.headers.get('OData-EntityId');
}
const tabBind = (i) => ({ [`${FORM_NAV}@odata.bind`]: `/qdb_form_definitions(${formId})`, [`${TAB_NAV}@odata.bind`]: `/qdb_form_tabs(${tabs[i].qdb_form_tabid})` });
const base_ = (label, order, primary, type, cfg) => ({
  qdb_label: label, qdb_placement_scope: 'tab', qdb_display_order: order, qdb_is_primary: primary,
  qdb_is_visible: true, qdb_confirm_required: false, qdb_is_active: true, qdb_action_type: type, qdb_action_config_json: cfg,
});

// First tab: Next →
await create({ ...base_('Next →', 1, true, 'navigate', '{"target":"nextStep"}'), ...tabBind(0) });
// Middle tabs: ← Previous + Next →
for (let i = 1; i < tabs.length - 1; i++) {
  await create({ ...base_('← Previous', 0, false, 'navigate', '{"target":"previousStep"}'), ...tabBind(i) });
  await create({ ...base_('Next →', 1, true, 'navigate', '{"target":"nextStep"}'), ...tabBind(i) });
}
// Last tab: ← Previous + Submit Application
const last = tabs.length - 1;
await create({ ...base_('← Previous', 0, false, 'navigate', '{"target":"previousStep"}'), ...tabBind(last) });
await create({ ...base_('Submit Application', 1, true, 'finalSubmit', '{"extraParams":[{"key":"channel","source":"static","staticValue":"portal"},{"key":"submittedBy","source":"runtimeContext","contextKey":"userId"}]}'), ...tabBind(last) });

// One section-level button on the first tab's first section.
if (firstSection) {
  await create({
    qdb_label: 'Save & continue later', qdb_placement_scope: 'section', qdb_display_order: 0, qdb_is_primary: false,
    qdb_is_visible: true, qdb_confirm_required: false, qdb_is_active: true, qdb_action_type: 'saveDraft', qdb_action_config_json: '{}',
    [`${FORM_NAV}@odata.bind`]: `/qdb_form_definitions(${formId})`,
    [`${SEC_NAV}@odata.bind`]: `/qdb_form_sections(${firstSection.qdb_form_sectionid})`,
  });
  console.log(`+ section button on "${firstSection.qdb_label}"`);
}

const finalCount = (await get(`qdb_form_scoped_buttons?$filter=_qdb_form_definition_id_value eq ${formId}&$select=qdb_form_scoped_buttonid`)).length;
console.log(`\nDONE — seeded ${finalCount} scoped buttons on ${FORM_CODE}. Re-publish the form to refresh the render cache.`);
