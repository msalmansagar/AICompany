/**
 * provision-reporting-definitions.mts
 * Provisions DCP's Report Engine definitions from `reporting/definitions/*.json` — idempotently,
 * by `qdb_reportcode`. Definitions are configuration records in the Engine's own tables; this
 * script changes no Engine code and no schema.
 *
 * Idempotency: the definition record is found by code and updated in place (its GUID is stable, which
 * is what DCP resolves at run time); its child records — datasource, entity mapping, columns, filters,
 * parameters, layout, security — are replaced from the file, so the org matches the repository after
 * every run. Version travels in `qdb_currentversionnumber` and in the description.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --import tsx --env-file="<path>/.env" \
 *     crm/scripts/provision-reporting-definitions.mts [--only DCP-RPT-001] [--validate]
 *
 * `--validate` runs each provisioned definition through `qdb_RunReport` with no parameters and prints
 * its row count and columns, so authoring mistakes surface here rather than in a screen.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const AUTHORISED_ORG = 'org5869857f';
const DEFINITIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'reporting', 'definitions');

// Option values, as the Engine's own schema declares them (read back by label by the plugin).
const STATUS_PUBLISHED = 100000001;
const CATEGORY: Record<string, number> = { Operational: 100000000, Regulatory: 100000001, Management: 100000002 };
const SOURCE_TYPE_FETCHXML = 100000001;
const COMPOSITION_JOINED = 100000000;
const AGGREGATE: Record<string, number> = { None: 100000000, Sum: 100000001, Count: 100000002, Avg: 100000003, Min: 100000004, Max: 100000005 };
const DATA_TYPE: Record<string, number> = { String: 100000000, Integer: 100000001, Decimal: 100000002, DateTime: 100000003, Boolean: 100000004, Lookup: 100000005, Money: 100000006 };
const OPERATOR: Record<string, number> = { Equals: 100000000, NotEquals: 100000001, Contains: 100000002, BeginsWith: 100000003, EndsWith: 100000004, GreaterThan: 100000005, LessThan: 100000006, Between: 100000007, In: 100000008, NotIn: 100000009, IsNull: 100000010, IsNotNull: 100000011, LastXDays: 100000012, ThisMonth: 100000013, ThisYear: 100000014 };
const VALUE_TYPE: Record<string, number> = { Text: 100000000, Number: 100000001, Date: 100000002, Lookup: 100000003, Choice: 100000004, Boolean: 100000005, Context: 100000006 };
const PARAM_TYPE: Record<string, number> = { Text: 100000000, Number: 100000001, Date: 100000002, Lookup: 100000003, Choice: 100000004, MultiChoice: 100000005, Boolean: 100000006 };
const PRINCIPAL_TYPE: Record<string, number> = { User: 100000000, Team: 100000001, SecurityRole: 100000002, BusinessUnit: 100000003 };

interface ColumnSpec { name: string; attribute: string; alias: string; dataType: keyof typeof DATA_TYPE; aggregate?: keyof typeof AGGREGATE; groupOrder?: number; sortOrder: number; visible?: boolean }
interface FilterSpec { name: string; field: string; operator: keyof typeof OPERATOR; value?: string; valueType?: keyof typeof VALUE_TYPE; runtimePrompt?: boolean; sequence?: number }
interface ParameterSpec { name: string; label: string; type: keyof typeof PARAM_TYPE; required?: boolean; defaultValue?: string }
interface SecuritySpec { principalType: keyof typeof PRINCIPAL_TYPE; principal: string; canExecute: boolean }
interface DefinitionSpec {
  code: string; name: string; description: string; version: number; mainEntity: string; category: keyof typeof CATEGORY; rowLimit: number; grain: string;
  mode: 'generated' | 'fetchxml'; fetchXml?: string;
  entity: { logicalName: string; alias: string };
  columns: ColumnSpec[]; filters: FilterSpec[]; parameters: ParameterSpec[]; security?: SecuritySpec[]; layout?: Record<string, unknown>;
}

interface Config { apiBase: string; orgUrl: string }
type Row = Record<string, unknown>;

class Dataverse {
  constructor(private readonly apiBase: string, private readonly token: string) {}
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra };
  }
  async get(path: string): Promise<{ value: Row[] }> {
    const response = await fetch(`${this.apiBase}/${path}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${await response.text()}`);
    return (await response.json()) as { value: Row[] };
  }
  async create(set: string, body: Row): Promise<string> {
    const response = await fetch(`${this.apiBase}/${set}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`POST ${set} → ${response.status}: ${await response.text()}`);
    const id = /\(([0-9a-f-]{36})\)/i.exec(response.headers.get('OData-EntityId') ?? '')?.[1];
    if (!id) throw new Error(`POST ${set} returned no OData-EntityId`);
    return id;
  }
  async update(set: string, id: string, body: Row): Promise<void> {
    const response = await fetch(`${this.apiBase}/${set}(${id})`, { method: 'PATCH', headers: this.headers({ 'If-Match': '*' }), body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`PATCH ${set}(${id}) → ${response.status}: ${await response.text()}`);
  }
  async remove(set: string, id: string): Promise<void> {
    const response = await fetch(`${this.apiBase}/${set}(${id})`, { method: 'DELETE', headers: this.headers() });
    if (!response.ok && response.status !== 404) throw new Error(`DELETE ${set}(${id}) → ${response.status}: ${await response.text()}`);
  }
  async action(name: string, body: Row): Promise<Row> {
    const response = await fetch(`${this.apiBase}/${name}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    return (await response.json().catch(() => ({}))) as Row;
  }
}

function loadDefinitions(only: string | undefined): DefinitionSpec[] {
  return readdirSync(DEFINITIONS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(readFileSync(join(DEFINITIONS_DIR, file), 'utf8')) as DefinitionSpec)
    .filter(spec => !only || spec.code === only)
    .sort((a, b) => a.code.localeCompare(b.code));
}

const bind = (set: string, id: string) => `/${set}(${id})`;

async function upsertDefinition(dv: Dataverse, spec: DefinitionSpec): Promise<string> {
  const existing = await dv.get(`qdb_reportdefinitions?$select=qdb_reportdefinitionid&$filter=qdb_reportcode eq '${spec.code}'`);
  const body: Row = {
    qdb_name: spec.name, qdb_reportcode: spec.code, qdb_description: `${spec.description} [v${spec.version}]`,
    qdb_mainentitylogicalname: spec.mainEntity, qdb_category: CATEGORY[spec.category], qdb_rowlimit: spec.rowLimit,
    qdb_status: STATUS_PUBLISHED, qdb_ispublished: true, qdb_currentversionnumber: spec.version, qdb_isgoverned: false,
  };
  const found = existing.value[0]?.['qdb_reportdefinitionid'];
  if (typeof found === 'string') { await dv.update('qdb_reportdefinitions', found, body); return found; }
  return dv.create('qdb_reportdefinitions', body);
}

/** Children are replaced from the file; the definition itself keeps its id. */
async function clearChildren(dv: Dataverse, definitionId: string): Promise<void> {
  for (const [set, key] of [['qdb_reportfilters', 'qdb_reportfilterid'], ['qdb_reportparameters', 'qdb_reportparameterid'], ['qdb_reportlayouts', 'qdb_reportlayoutid'], ['qdb_reportsecurities', 'qdb_reportsecurityid']] as const) {
    for (const row of (await dv.get(`${set}?$select=${key}&$filter=_qdb_reportdefinitionid_value eq ${definitionId}`)).value) await dv.remove(set, String(row[key]));
  }
  for (const source of (await dv.get(`qdb_reportdatasources?$select=qdb_reportdatasourceid&$filter=_qdb_reportdefinitionid_value eq ${definitionId}`)).value) {
    const sourceId = String(source['qdb_reportdatasourceid']);
    for (const mapping of (await dv.get(`qdb_reportentitymappings?$select=qdb_reportentitymappingid&$filter=_qdb_reportdatasourceid_value eq ${sourceId}`)).value) {
      const mappingId = String(mapping['qdb_reportentitymappingid']);
      for (const column of (await dv.get(`qdb_reportcolumns?$select=qdb_reportcolumnid&$filter=_qdb_reportentitymappingid_value eq ${mappingId}`)).value) await dv.remove('qdb_reportcolumns', String(column['qdb_reportcolumnid']));
      await dv.remove('qdb_reportentitymappings', mappingId);
    }
    await dv.remove('qdb_reportdatasources', sourceId);
  }
}

async function writeChildren(dv: Dataverse, definitionId: string, spec: DefinitionSpec): Promise<void> {
  const definitionBind = { 'Qdb_reportdefinitionid@odata.bind': bind('qdb_reportdefinitions', definitionId) };
  const sourceId = await dv.create('qdb_reportdatasources', {
    qdb_name: spec.name, qdb_isprimary: true, qdb_executionorder: 1, qdb_sourcealias: spec.entity.alias, qdb_compositionmode: COMPOSITION_JOINED,
    qdb_isenabled: true, qdb_rowlimit: Math.min(spec.rowLimit, 5000),
    ...(spec.mode === 'fetchxml' ? { qdb_sourcetype: SOURCE_TYPE_FETCHXML, qdb_querypayload: spec.fetchXml } : {}),
    ...definitionBind,
  });
  const mappingId = await dv.create('qdb_reportentitymappings', {
    qdb_name: spec.entity.logicalName, qdb_entitylogicalname: spec.entity.logicalName, qdb_entityalias: spec.entity.alias, qdb_depth: 0,
    'Qdb_reportdatasourceid@odata.bind': bind('qdb_reportdatasources', sourceId),
  });
  for (const column of spec.columns) {
    await dv.create('qdb_reportcolumns', {
      qdb_name: column.name, qdb_columnlogicalname: column.attribute, qdb_outputalias: column.alias, qdb_datatype: DATA_TYPE[column.dataType],
      qdb_aggregatefunction: AGGREGATE[column.aggregate ?? 'None'], qdb_sortorder: column.sortOrder, qdb_isvisible: column.visible ?? true,
      ...(column.groupOrder !== undefined ? { qdb_grouporder: column.groupOrder } : {}),
      'Qdb_reportentitymappingid@odata.bind': bind('qdb_reportentitymappings', mappingId),
    });
  }
  let sequence = 0;
  for (const filter of spec.filters) {
    sequence += 1;
    await dv.create('qdb_reportfilters', {
      qdb_name: filter.name, qdb_fieldalias: filter.field, qdb_operator: OPERATOR[filter.operator], qdb_sequence: filter.sequence ?? sequence,
      qdb_isruntimeprompt: filter.runtimePrompt ?? false,
      ...(filter.value !== undefined ? { qdb_value: filter.value } : {}),
      ...(filter.valueType ? { qdb_valuetype: VALUE_TYPE[filter.valueType] } : {}),
      ...definitionBind,
    });
  }
  let order = 0;
  for (const parameter of spec.parameters) {
    order += 1;
    await dv.create('qdb_reportparameters', {
      qdb_name: parameter.name, qdb_parametername: parameter.name, qdb_label: parameter.label, qdb_paramtype: PARAM_TYPE[parameter.type],
      qdb_isrequired: parameter.required ?? false, qdb_displayorder: order,
      ...(parameter.defaultValue !== undefined ? { qdb_defaultvalue: parameter.defaultValue } : {}),
      ...definitionBind,
    });
  }
  if (spec.layout) await dv.create('qdb_reportlayouts', { qdb_name: 'Layout', qdb_layoutjson: JSON.stringify(spec.layout), ...definitionBind });
  for (const rule of spec.security ?? []) {
    await dv.create('qdb_reportsecurities', {
      qdb_name: `${rule.principalType}: ${rule.principal}`, qdb_principaltype: PRINCIPAL_TYPE[rule.principalType], qdb_principalidtext: rule.principal,
      qdb_canexecute: rule.canExecute, qdb_canexport: false, qdb_canedit: false, qdb_canapprove: false, ...definitionBind,
    });
  }
}

async function validate(dv: Dataverse, spec: DefinitionSpec, definitionId: string): Promise<void> {
  const output = await dv.action('qdb_RunReport', { reportId: definitionId, parametersJson: '{}', format: 'RUN' });
  const errorCode = String(output['errorCode'] ?? '');
  if (errorCode) { console.log(`  VALIDATE ${spec.code}: REFUSED ${errorCode} — ${String(output['errorMessage'] ?? '')}`); return; }
  const result = JSON.parse(String(output['resultJson'] ?? '{}')) as { rowCount?: number; columns?: { alias: string }[]; rows?: { cells: Record<string, { value: unknown; text: string | null }> }[] };
  console.log(`  VALIDATE ${spec.code}: rows=${result.rowCount} columns=${(result.columns ?? []).map(c => c.alias).join(',')}`);
  for (const row of (result.rows ?? []).slice(0, 12)) console.log('     ', Object.entries(row.cells).map(([alias, cell]) => `${alias}=${cell.text ?? cell.value ?? '∅'}`).join(' | '));
}

async function main(): Promise<void> {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
  const shouldValidate = process.argv.includes('--validate');
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) { console.error(`Refusing: ${cfg.orgUrl} is not the authorised sandbox.`); process.exit(1); }
  const dv = new Dataverse(cfg.apiBase, await acquireToken(cfg as never));
  const specs = loadDefinitions(only);
  console.log(`=== Provisioning ${specs.length} DCP reporting definition(s) on ${cfg.orgUrl} ===`);
  for (const spec of specs) {
    const definitionId = await upsertDefinition(dv, spec);
    await clearChildren(dv, definitionId);
    await writeChildren(dv, definitionId, spec);
    console.log(`  ${spec.code} v${spec.version} → ${definitionId} (${spec.columns.length} columns, ${spec.filters.length} filters, ${spec.parameters.length} parameters)`);
    if (shouldValidate) await validate(dv, spec, definitionId);
  }
  console.log('=== Done — definitions only; no Engine code, no schema, no production change ===');
}

main().catch(error => { console.error(error); process.exit(1); });
