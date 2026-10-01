/**
 * Read-only export of the stored configuration of one or more forms, straight from Dataverse:
 * form, tabs, sections, fields, options, lookup configs, grid columns, business rules and
 * validation rules, with record ids and choice labels. Writes Markdown to stdout or a file.
 *
 *   node --env-file=scripts/.env scripts/export-demo-config.mjs <formCode> [<formCode>…] [--out file.md]
 */
import { writeFileSync } from 'node:fs';

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL.replace(/\/$/, '');
const API = `${DATAVERSE_URL}/api/data/v9.2`;
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const formCodes = args.filter((_, index) => outIndex < 0 || (index !== outIndex && index !== outIndex + 1));

async function token() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: process.env.DV_CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(`https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'token failed');
  return json.access_token;
}

let H;
async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).value;
}

const inFilter = (column, ids) => ids.length ? `(${ids.map((id) => `${column} eq ${id}`).join(' or ')})` : '(false)';
const choice = (record, column) => record[column] == null ? '' : `${record[column]} ${record[`${column}${FORMATTED}`] ?? ''}`.trim();
const cell = (value) => (value == null || value === '' ? '—' : String(value).replace(/\|/g, '\\|').replace(/\n/g, ' '));
const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
].join('\n');
const code = (value) => (value ? `\`${value}\`` : '—');

async function exportForm(formCode) {
  const [form] = await get(`qdb_form_definitions?$select=qdb_form_definitionid,qdb_form_code,qdb_title,qdb_status,qdb_version,modifiedon&$filter=qdb_form_code eq '${formCode}'`);
  if (!form) return `## ${formCode}\n\nNot found.`;
  const formId = form.qdb_form_definitionid;
  const tabs = await get(`qdb_form_tabs?$select=qdb_form_tabid,qdb_label,qdb_display_order&$filter=_qdb_form_definition_id_value eq ${formId}&$orderby=qdb_display_order`);
  const sections = await get(`qdb_form_sections?$select=qdb_form_sectionid,qdb_label,qdb_display_order,_qdb_form_tab_id_value&$filter=${inFilter('_qdb_form_tab_id_value', tabs.map((t) => t.qdb_form_tabid))}&$orderby=qdb_display_order`);
  const fields = await get(`qdb_form_fields?$filter=${inFilter('_qdb_form_section_id_value', sections.map((s) => s.qdb_form_sectionid))}&$orderby=qdb_display_order`);
  const fieldIds = fields.map((f) => f.qdb_form_fieldid);
  const options = await get(`qdb_form_option_values?$select=qdb_value,qdb_label,qdb_display_order,_qdb_form_field_id_value&$filter=${inFilter('_qdb_form_field_id_value', fieldIds)}&$orderby=qdb_display_order`);
  const lookups = await get(`qdb_form_lookup_configs?$select=qdb_form_lookup_configid,qdb_entity_logical_name,qdb_display_attribute,qdb_value_attribute,qdb_filter_expression,_qdb_form_field_id_value&$filter=${inFilter('_qdb_form_field_id_value', fieldIds)}`);
  const columns = await get(`qdb_grid_column_configs?$select=qdb_grid_column_configid,qdb_column_label,qdb_column_attribute,qdb_column_field_type,qdb_display_order,qdb_is_visible,_qdb_form_field_id_value&$filter=${inFilter('_qdb_form_field_id_value', fieldIds)}&$orderby=qdb_display_order`);
  const businessRules = await get(`qdb_form_business_rules?$select=qdb_form_business_ruleid,qdb_name,qdb_conditions_json,qdb_action,qdb_action_value,_qdb_target_field_id_value,qdb_priority,qdb_is_active&$filter=_qdb_form_definition_id_value eq ${formId}&$orderby=createdon`);
  const validationRules = await get(`qdb_form_validation_rules?$select=qdb_form_validation_ruleid,qdb_rule_type,qdb_rule_json,qdb_error_message,qdb_priority,qdb_is_active,_qdb_form_field_id_value&$filter=${inFilter('_qdb_form_field_id_value', fieldIds)}&$orderby=qdb_priority`);

  const fieldCode = new Map(fields.map((f) => [f.qdb_form_fieldid, f.qdb_schema_name]));
  const sectionLabel = new Map(sections.map((s) => [s.qdb_form_sectionid, s.qdb_label]));
  const out = [];

  out.push(`## Form \`${form.qdb_form_code}\` — ${form.qdb_title}`);
  out.push(table(['Table', 'Record id', 'Values'], [
    ['qdb_form_definition', form.qdb_form_definitionid, `status ${choice(form, 'qdb_status')}; version ${form.qdb_version}; modified ${form.modifiedon}`],
    ...tabs.map((t) => ['qdb_form_tab', t.qdb_form_tabid, `"${t.qdb_label}", order ${t.qdb_display_order}`]),
    ...sections.map((s) => ['qdb_form_section', s.qdb_form_sectionid, `"${s.qdb_label}", order ${s.qdb_display_order}`]),
  ]));

  out.push(`### Fields (\`qdb_form_field\`)`);
  out.push(table(
    ['Record id', 'qdb_schema_name', 'qdb_label', 'qdb_field_type', 'Section', 'qdb_is_readonly', 'qdb_radio_render_style', 'qdb_file_capture_mode', 'qdb_allowed_file_extensions', 'Grid'],
    fields.map((f) => [
      f.qdb_form_fieldid, code(f.qdb_schema_name), f.qdb_label, choice(f, 'qdb_field_type'),
      sectionLabel.get(f._qdb_form_section_id_value), f.qdb_is_readonly ? 'Yes' : 'No',
      choice(f, 'qdb_radio_render_style'), choice(f, 'qdb_file_capture_mode'),
      f[`qdb_allowed_file_extensions${FORMATTED}`] ? `${f.qdb_allowed_file_extensions} (${f[`qdb_allowed_file_extensions${FORMATTED}`]})` : f.qdb_allowed_file_extensions,
      f.qdb_grid_mode != null ? `${choice(f, 'qdb_grid_mode')}; entity ${f.qdb_grid_entity_name}` : '',
    ]),
  ));

  if (options.length) {
    out.push(`### Options (\`qdb_form_option_value\`)`);
    out.push(table(['Field', 'qdb_display_order', 'qdb_value', 'qdb_label'],
      options.map((o) => [code(fieldCode.get(o._qdb_form_field_id_value)), o.qdb_display_order, code(o.qdb_value), o.qdb_label])));
  }
  if (lookups.length) {
    out.push(`### Lookup configs (\`qdb_form_lookup_config\`)`);
    out.push(table(['Record id', 'Field', 'qdb_entity_logical_name', 'qdb_display_attribute', 'qdb_value_attribute', 'qdb_filter_expression'],
      lookups.map((l) => [l.qdb_form_lookup_configid, code(fieldCode.get(l._qdb_form_field_id_value)), code(l.qdb_entity_logical_name), code(l.qdb_display_attribute), code(l.qdb_value_attribute), l.qdb_filter_expression])));
  }
  if (columns.length) {
    out.push(`### Grid columns (\`qdb_grid_column_config\`)`);
    out.push(table(['Record id', 'Grid field', 'qdb_column_label', 'qdb_column_attribute', 'qdb_column_field_type', 'qdb_display_order', 'qdb_is_visible'],
      columns.map((c) => [c.qdb_grid_column_configid, code(fieldCode.get(c._qdb_form_field_id_value)), c.qdb_column_label, code(c.qdb_column_attribute), c.qdb_column_field_type, c.qdb_display_order, c.qdb_is_visible ? 'Yes' : 'No'])));
  }
  if (businessRules.length) {
    out.push(`### Business rules (\`qdb_form_business_rule\`)`);
    for (const rule of businessRules) {
      out.push(`**${rule.qdb_name}** — id \`${rule.qdb_form_business_ruleid}\`; qdb_priority ${rule.qdb_priority}; qdb_is_active ${rule.qdb_is_active ? 'Yes' : 'No'}`
        + (rule.qdb_action != null ? `; qdb_action ${choice(rule, 'qdb_action')}; qdb_target_field_id ${fieldCode.get(rule._qdb_target_field_id_value) ?? rule._qdb_target_field_id_value}; qdb_action_value \`${rule.qdb_action_value}\`` : ''));
      out.push('qdb_conditions_json:\n\n```json\n' + JSON.stringify(JSON.parse(rule.qdb_conditions_json), null, 2) + '\n```');
    }
  }
  if (validationRules.length) {
    out.push(`### Validation rules (\`qdb_form_validation_rule\`)`);
    out.push(table(['Record id', 'Field', 'qdb_rule_type', 'qdb_rule_json', 'qdb_error_message', 'qdb_priority', 'qdb_is_active'],
      validationRules.map((v) => [v.qdb_form_validation_ruleid, code(fieldCode.get(v._qdb_form_field_id_value)), choice(v, 'qdb_rule_type'), code(v.qdb_rule_json), v.qdb_error_message, v.qdb_priority, v.qdb_is_active ? 'Yes' : 'No'])));
  }
  return out.join('\n\n');
}

async function run() {
  H = {
    Authorization: `Bearer ${await token()}`, Accept: 'application/json',
    Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
  };
  const sections = [];
  for (const formCode of formCodes) sections.push(await exportForm(formCode));
  const markdown = `Exported from ${DATAVERSE_URL} on ${new Date().toISOString()}.\n\n${sections.join('\n\n')}\n`;
  if (outFile) { writeFileSync(outFile, markdown); console.log(`wrote ${outFile} (${markdown.length} chars)`); }
  else process.stdout.write(markdown);
}

run().catch((error) => { console.error(error.message); process.exit(1); });
