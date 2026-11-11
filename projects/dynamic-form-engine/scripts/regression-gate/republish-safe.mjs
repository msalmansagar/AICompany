/**
 * Regression gate step 3, safe variant: re-publishes ONLY the forms whose saved definition is
 * the version that is live, so no unpublished draft is pushed to customers. A form is safe when
 * its qdb_version equals the highest active cached version and it was not modified after that
 * cache row was created. The rest are listed and left untouched.
 *
 * Why: the gate README re-publishes every form, which would publish drafts that are ahead of
 * live (e.g. equipment-request v11 against live v7, found in CSE-ENG-001 B0).
 *
 *   node --env-file=projects/dynamic-form-engine/scripts/.env \
 *     projects/dynamic-form-engine/scripts/regression-gate/republish-safe.mjs [--apply]
 *
 * Plan mode (default) lists the safe and skipped forms. --apply publishes the safe ones; it is a
 * live write and needs the user's go-ahead.
 */
const T = process.env.DV_TENANT_ID, C = process.env.DV_CLIENT_ID, S = process.env.DV_CLIENT_SECRET, U = process.env.DV_DATAVERSE_URL;
const API = `${U}/api/data/v9.2`;
const isApply = process.argv.includes('--apply');

async function headers() {
  const r = await fetch(`https://login.microsoftonline.com/${T}/oauth2/v2.0/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: C, client_secret: S, scope: `${U}/.default` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description);
  return { Authorization: `Bearer ${j.access_token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
}

const rows = async (h, path) => {
  const r = await fetch(`${API}/${path}`, { headers: h });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).value;
};

/**
 * Splits active forms with a live cache into safe (definition == live) and drafts ahead of live.
 * `childEditedOn` maps a form code to the latest modifiedon of its tabs, sections, fields, options
 * and rules: editing those does not touch the definition row, so the definition alone is not proof
 * (found live: loan-application's newer fields and rules were published by a definition-only check).
 */
export function classifyForms(forms, caches, childEditedOn = new Map()) {
  const live = new Map();
  for (const c of caches) {
    const current = live.get(c.qdb_form_code);
    // modifiedon, not createdon: a re-publish updates the cache row in place, so createdon is the first publish.
    if (!current || c.qdb_published_version > current.version) live.set(c.qdb_form_code, { version: c.qdb_published_version, builtOn: c.modifiedon });
  }
  const safe = [], draftAhead = [];
  for (const form of forms) {
    const cached = live.get(form.qdb_form_code);
    if (!cached) continue;
    const childEdit = childEditedOn.get(form.qdb_form_code);
    const isSafe = form.qdb_version === cached.version && form.modifiedon <= cached.builtOn && (!childEdit || childEdit <= cached.builtOn);
    (isSafe ? safe : draftAhead).push({ code: form.qdb_form_code, version: form.qdb_version });
  }
  return { safe, draftAhead };
}

// The latest edit among a form's tabs, sections, fields, options and rules, per form code.
async function latestChildEdits(h, forms) {
  const codeById = new Map(forms.map((f) => [f.qdb_form_definitionid, f.qdb_form_code]));
  const tabs = await rows(h, 'qdb_form_tabs?$select=qdb_form_tabid,_qdb_form_definition_id_value,modifiedon');
  const formOfTab = new Map(tabs.map((t) => [t.qdb_form_tabid, t._qdb_form_definition_id_value]));
  const sections = await rows(h, 'qdb_form_sections?$select=qdb_form_sectionid,_qdb_form_tab_id_value,modifiedon');
  const formOfSection = new Map(sections.map((s) => [s.qdb_form_sectionid, formOfTab.get(s._qdb_form_tab_id_value)]));
  const fields = await rows(h, 'qdb_form_fields?$select=qdb_form_fieldid,_qdb_form_section_id_value,modifiedon');
  const formOfField = new Map(fields.map((f) => [f.qdb_form_fieldid, formOfSection.get(f._qdb_form_section_id_value)]));
  const options = await rows(h, 'qdb_form_option_values?$select=_qdb_form_field_id_value,modifiedon');
  const rules = await rows(h, 'qdb_form_business_rules?$select=_qdb_form_definition_id_value,modifiedon').catch(() => []);
  const latest = new Map();
  const note = (formId, modifiedOn) => {
    const code = codeById.get(formId);
    if (code && (!latest.has(code) || modifiedOn > latest.get(code))) latest.set(code, modifiedOn);
  };
  tabs.forEach((t) => note(t._qdb_form_definition_id_value, t.modifiedon));
  sections.forEach((s) => note(formOfTab.get(s._qdb_form_tab_id_value), s.modifiedon));
  fields.forEach((f) => note(formOfSection.get(f._qdb_form_section_id_value), f.modifiedon));
  options.forEach((o) => note(formOfField.get(o._qdb_form_field_id_value), o.modifiedon));
  rules.forEach((r) => note(r._qdb_form_definition_id_value, r.modifiedon));
  return latest;
}

async function publish(h, { code, version }) {
  const job = await fetch(`${API}/qdb_publish_jobs`, {
    method: 'POST', headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ qdb_form_code: code, qdb_target_version: version, qdb_status: 1, qdb_trigger_reason: 1 }),
  });
  if (!job.ok) return `job create ${job.status}: ${(await job.text()).slice(0, 140)}`;
  const publishJobId = (await job.json()).qdb_publish_jobid;
  const r = await fetch(`${API}/qdb_PublishForm`, { method: 'POST', headers: h, body: JSON.stringify({ FormCode: code, TargetVersion: version, PublishJobId: publishJobId }) });
  return r.ok ? null : `${r.status}: ${(await r.text()).slice(0, 160)}`;
}

async function main() {
  const h = await headers();
  const forms = await rows(h, 'qdb_form_definitions?$select=qdb_form_definitionid,qdb_form_code,qdb_version,modifiedon&$filter=statecode eq 0');
  const caches = await rows(h, 'qdb_form_render_caches?$select=qdb_form_code,qdb_published_version,modifiedon&$filter=qdb_is_active eq true and qdb_status eq 2');
  const { safe, draftAhead } = classifyForms(forms, caches, await latestChildEdits(h, forms));
  console.log(`${isApply ? 'APPLY' : 'PLAN (no changes)'}: ${safe.length} safe to re-publish, ${draftAhead.length} skipped (draft ahead of live).`);
  console.log(`Skipped: ${draftAhead.map((f) => f.code).join(', ') || '(none)'}`);
  let failed = 0;
  for (const form of safe.sort((a, b) => a.code.localeCompare(b.code))) {
    if (!isApply) { console.log(`  would publish ${form.code} v${form.version}`); continue; }
    const error = await publish(h, form);
    console.log(error ? `  ✗ ${form.code} v${form.version} → ${error}` : `  ✓ ${form.code} v${form.version}`);
    if (error) failed += 1;
  }
  if (failed > 0) { console.log(`\n${failed} publish(es) failed.`); process.exit(1); }
}

main().catch((error) => { console.error('\nFAILED:', error); process.exit(1); });
