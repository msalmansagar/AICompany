/**
 * Does a hidden field reach the published JSON?
 *
 * Adds two hidden fields to `rule-visibility-demo`, identical except for one thing:
 *
 *   rvd_other_reason   hidden, and a rule SHOWS it when applicant type = Individual
 *                      → referenced, so the publisher must keep it
 *   rvd_orphan_note    hidden, referenced by nothing
 *                      → the publisher strips it
 *
 * Same form, same visibility, opposite outcomes — which is the whole rule: a hidden field
 * survives publish only when something provably reads it. "Hidden by default, shown by a
 * rule" is a normal pattern, and the target used not to be collected, so the show action
 * pointed at a field that no longer existed in CRM.
 *
 * Run: node --env-file=scripts/.env scripts/augment-demo-hidden-field-rule.mjs
 * Idempotent: guards on the field schema names.
 */
const TENANT_ID = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API = `${DATAVERSE_URL}/api/data/v9.2`;

const FORM_CODE = 'rule-visibility-demo';
const FIELD_TYPE_TEXT = 100000001;
const COLUMN_SPAN_TWO = 100000002;
const ACTION_SHOW_FIELD = 100000001;
const LOGIC_AND = 100000001;

let H;

async function token() {
  if (!CLIENT_SECRET) throw new Error('DV_CLIENT_SECRET env var is required.');
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description ?? 'token failed');
  return j.access_token;
}

async function get(path) {
  const r = await fetch(`${API}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function post(entitySet, body) {
  const r = await fetch(`${API}/${entitySet}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${entitySet} → ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function run() {
  const accessToken = await token();
  H = { Authorization: `Bearer ${accessToken}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

  const already = await get("qdb_form_fields?$filter=qdb_schema_name eq 'rvd_other_reason'&$select=qdb_form_fieldid");
  if (already.value.length > 0) { console.log('Already seeded — nothing to do.'); return; }

  const form = (await get(`qdb_form_definitions?$filter=qdb_form_code eq '${FORM_CODE}'&$select=qdb_form_definitionid`)).value[0];
  if (!form) throw new Error(`Form '${FORM_CODE}' not found — run seed-rule-visibility-demo.mjs first.`);
  const formId = form.qdb_form_definitionid;

  const trigger = (await get("qdb_form_fields?$filter=qdb_schema_name eq 'rvd_applicant_type'&$select=qdb_form_fieldid,_qdb_form_section_id_value")).value[0];
  const sectionId = trigger._qdb_form_section_id_value;

  console.log(`Adding hidden fields to '${FORM_CODE}'\n${'─'.repeat(66)}`);

  const makeHiddenField = (schema, label, order) => post('qdb_form_fields', {
    'qdb_form_section_id@odata.bind': `/qdb_form_sections(${sectionId})`,
    qdb_schema_name: schema, qdb_label: label,
    qdb_field_type: FIELD_TYPE_TEXT, qdb_display_order: order,
    qdb_column_span: COLUMN_SPAN_TWO,
    qdb_is_required: false, qdb_is_readonly: false,
    qdb_is_hidden: true,          // ← hidden by default in BOTH cases
  });

  const shown = await makeHiddenField('rvd_other_reason', 'Reason for applying as an individual', 3);
  console.log('  rvd_other_reason   hidden = true   (a rule will show it)');

  await makeHiddenField('rvd_orphan_note', 'Internal note (nothing references this)', 4);
  console.log('  rvd_orphan_note    hidden = true   (nothing references it — the control)');

  await post('qdb_form_business_rules', {
    'qdb_form_definition_id@odata.bind': `/qdb_form_definitions(${formId})`,
    qdb_name: 'Show the reason field when the applicant is an individual',
    qdb_description: 'Hidden by default, revealed by the rule — the target must survive publish.',
    qdb_conditions_json: JSON.stringify([
      { fieldId: trigger.qdb_form_fieldid, operator: 'equals', value: 'individual' },
    ]),
    qdb_conditions_logic: LOGIC_AND,
    qdb_action: ACTION_SHOW_FIELD,
    'qdb_target_field_id@odata.bind': `/qdb_form_fields(${shown.qdb_form_fieldid})`,
    qdb_priority: 120, qdb_is_active: true,
  });
  console.log('  rule — showField → rvd_other_reason');

  console.log(`${'─'.repeat(66)}`);
  console.log('Republish, then compare the two in the JSON:');
  console.log('  rvd_other_reason  → PRESENT (referenced by the rule target)');
  console.log('  rvd_orphan_note   → ABSENT  (hidden and unreferenced)');
}

run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1); });
