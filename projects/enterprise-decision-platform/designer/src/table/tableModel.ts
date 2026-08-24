// Model + PCRM serialization for the metadata-bound decision-table editor (ADR-D05).
// This authoring surface produces PCRM directly — no GoRules translation.

// field = CRM logical name (on the anchor, on `via.entity` when related, or the child field for `agg`).
export interface InputCol { field: string; label: string; type: string; via?: InputVia; agg?: InputAgg; }
// N:1 navigation: this column reads `field` on the related entity reached by the anchor's lookup.
export interface InputVia { relationship: string; entity: string; relLabel: string; }
// 1:N aggregation: this column folds a child collection into a scalar.
export type AggFn = 'Count' | 'Sum' | 'Avg' | 'Min' | 'Max';
export interface AggFilter { field: string; label: string; operator: string; value: string; }
export interface InputAgg { fn: AggFn; childEntity: string; childLookup: string; childLabel: string; filter?: AggFilter; }
export const AGG_FNS: AggFn[] = ['Count', 'Sum', 'Avg', 'Min', 'Max'];

/** Stable input name/symbol for a column — related/aggregate columns are namespaced. */
export function inputName(i: InputCol): string {
  if (i.agg) return `${i.agg.childEntity}_${i.agg.fn}${i.field ? '_' + i.field : ''}`.toLowerCase();
  return i.via ? `${i.via.relationship}_${i.field}` : i.field;
}
/** A column can be used in conditions once it has a field, or is a Count aggregate. */
export function colReady(i: InputCol): boolean { return !!i.field || (!!i.agg && i.agg.fn === 'Count'); }
export interface OutputCol { name: string; type: 'Text' | 'Number' | 'Boolean'; }
// valueLabel is display-only (a picked record's name); PCRM serialization never emits it.
export interface Cell { any?: boolean; operator?: string; value?: string; value2?: string; valueField?: string; value2Field?: string; valueLabel?: string; }
export interface Row { cells: Cell[]; outputs: Record<string, string>; reasonCodes?: string[]; }
export interface TableModel {
  editor: 'edp-table';
  hitPolicy: 'First' | 'Priority' | 'Unique' | 'All';
  inputs: InputCol[];
  outputs: OutputCol[];
  rows: Row[];
}

export const HIT_POLICIES: TableModel['hitPolicy'][] = ['First', 'Priority', 'Unique', 'All'];

export function emptyTable(): TableModel {
  return { editor: 'edp-table', hitPolicy: 'First', inputs: [], outputs: [{ name: 'result', type: 'Text' }], rows: [newRow(0, 1)] };
}
export function newRow(inputCount: number, outputCount: number): Row {
  return { cells: Array.from({ length: inputCount }, () => ({ any: true })), outputs: {} };
}

// CRM attribute type -> editor category
export function category(crmType: string): 'text' | 'number' | 'date' | 'boolean' | 'optionset' | 'lookup' {
  switch (crmType) {
    case 'Integer': case 'BigInt': case 'Decimal': case 'Double': case 'Money': return 'number';
    case 'DateTime': return 'date';
    case 'Boolean': return 'boolean';
    case 'Picklist': case 'State': case 'Status': return 'optionset';
    case 'Lookup': case 'Customer': case 'Owner': return 'lookup';
    default: return 'text';
  }
}

// PCRM output type from CRM category
export function pcrmType(crmType: string): string {
  const c = category(crmType);
  return c === 'number' ? 'Decimal' : c === 'date' ? 'DateTime' : c === 'boolean' ? 'Boolean' : c === 'optionset' ? 'OptionSet' : 'Text';
}

interface OpDef { op: string; label: string; arity: 0 | 1 | 2; }
const OP = (op: string, label: string, arity: 0 | 1 | 2): OpDef => ({ op, label, arity });
const ANY = OP('Any', '— any —', 0);

export function operatorsFor(cat: string): OpDef[] {
  switch (cat) {
    case 'number': return [ANY, OP('Equals', '=', 1), OP('NotEquals', '≠', 1), OP('GreaterThan', '>', 1), OP('GreaterThanOrEqual', '≥', 1), OP('LessThan', '<', 1), OP('LessThanOrEqual', '≤', 1), OP('Between', 'between', 2), OP('In', 'in (a,b,…)', 1), OP('IsNull', 'is empty', 0)];
    case 'date': return [ANY, OP('On', 'on', 1), OP('Before', 'before', 1), OP('After', 'after', 1), OP('OnOrBefore', 'on/before', 1), OP('OnOrAfter', 'on/after', 1), OP('Between', 'between', 2), OP('IsNull', 'is empty', 0)];
    case 'boolean': return [ANY, OP('Equals', '=', 1)];
    case 'lookup': return [ANY, OP('Equals', 'is', 1), OP('NotEquals', 'is not', 1), OP('IsEmpty', 'is empty', 0), OP('IsNotEmpty', 'has a value', 0)];
    case 'optionset': return [ANY, OP('Equals', '=', 1), OP('NotEquals', '≠', 1), OP('In', 'in (a,b,…)', 1), OP('IsNull', 'is empty', 0)];
    default: return [ANY, OP('Equals', '=', 1), OP('NotEquals', '≠', 1), OP('Contains', 'contains', 1), OP('StartsWith', 'starts with', 1), OP('EndsWith', 'ends with', 1), OP('In', 'in (a,b,…)', 1), OP('IsNull', 'is empty', 0)];
  }
}
export function arity(cat: string, op?: string): 0 | 1 | 2 {
  return operatorsFor(cat).find((o) => o.op === op)?.arity ?? 0;
}

// ---- serialization to PCRM ----
export function tableToPcrm(model: TableModel, meta: { name: string; targetEntity: string }): unknown {
  // A field-to-field operand references another column by its input name. If it names an
  // existing column it's already an input; only a bare anchor-field name needs adding.
  const referenced = new Set<string>();
  for (const r of model.rows) for (const c of r.cells) {
    if (c?.valueField) referenced.add(c.valueField);
    if (c?.value2Field) referenced.add(c.value2Field);
  }
  const inputCols = model.inputs.map((i) => {
    const col: any = { name: inputName(i), type: i.agg ? 'Decimal' : pcrmType(i.type), binding: i.field || undefined };
    if (i.via) col.via = { relationship: i.via.relationship, entity: i.via.entity };
    if (i.agg) {
      col.aggregate = { function: i.agg.fn, childEntity: i.agg.childEntity, childLookup: i.agg.childLookup };
      if (i.agg.filter?.field) col.aggregate.filter = { field: i.agg.filter.field, operator: i.agg.filter.operator, value: aggFilterValue(i.agg.filter.value) };
    }
    return col;
  });
  const extraInputs = [...referenced]
    .filter((f) => f && !model.inputs.some((i) => inputName(i) === f))
    .map((f) => ({ name: f, type: 'Text', binding: f }));

  return {
    schemaVersion: '1.0',
    ruleId: meta.name.trim().toLowerCase().replace(/\s+/g, '-') || 'rule',
    name: meta.name,
    targetEntity: meta.targetEntity,
    inputs: [...inputCols, ...extraInputs],
    variables: [],
    outputs: model.outputs.map((o) => ({ name: o.name, type: o.type })),
    logic: {
      type: 'decisionTable',
      hitPolicy: model.hitPolicy,
      tableInputs: model.inputs.map((i) => ({ field: inputName(i) })),
      outputColumns: model.outputs.map((o) => o.name),
      rows: model.rows.map((r, idx) => ({
        priority: model.rows.length - idx,
        cells: r.cells.map((c, ci) => cellToPcrm(c, model.inputs[ci])),
        outputs: Object.fromEntries(model.outputs.map((o) => [o.name, coerce(r.outputs[o.name], o.type === 'Number' ? 'number' : o.type === 'Boolean' ? 'boolean' : 'text')])),
        reasonCodes: (r.reasonCodes ?? []).map((c) => c.trim()).filter(Boolean),
      })),
    },
  };
}

function cellToPcrm(cell: Cell, input?: InputCol): any {
  if (!cell || cell.any || !cell.operator || cell.operator === 'Any') return { any: true };
  const cat = input ? category(input.type) : 'text';
  const out: any = { operator: cell.operator };
  if (cell.valueField) out.valueField = cell.valueField;
  else out.value = coerce(cell.value, cat);
  if (arity(cat, cell.operator) === 2) {
    if (cell.value2Field) out.value2Field = cell.value2Field;
    else out.value2 = coerce(cell.value2, cat);
  }
  return out;
}

// Aggregate filter value: numeric literal if it looks like a number, else a string.
function aggFilterValue(raw: string): unknown {
  const s = (raw ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
}

function coerce(raw: string | undefined, cat: string): unknown {
  const s = (raw ?? '').trim();
  if (s === '') return cat === 'boolean' ? false : null;
  if (cat === 'number' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (cat === 'boolean') return s === 'true' || s === 'Yes' || s === 'yes' || s === '1';
  return s; // text, date (ISO string), optionset (value or label), or comma-list for In
}
