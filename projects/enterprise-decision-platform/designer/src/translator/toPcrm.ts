import type { DecisionGraphType } from '@gorules/jdm-editor';

// GoRules-JDM -> Platform Canonical Rule Model translator.
// Handles a graph pipeline: input schema -> inputs; expression nodes -> variables
// (formulas); a decision table -> decisionTable logic (else a switch -> conditionSet).
// Function nodes (arbitrary JS) are not executable in the deterministic C# runtime and
// are reported as a warning. The JDM source is always saved for round-trip editing.

export interface PcrmMeta { name: string; targetEntity: string; }

export interface TranslationResult {
  pcrm: any;
  warnings: string[];
}

export function translate(graph: DecisionGraphType, meta: PcrmMeta): TranslationResult {
  const nodes: any[] = (graph as any).nodes ?? [];
  const warnings: string[] = [];

  const inputNode = nodes.find((n) => n.type === 'inputNode');
  const exprNodes = nodes.filter((n) => n.type === 'expressionNode');
  const table = nodes.find((n) => n.type === 'decisionTableNode');
  const switchNode = nodes.find((n) => n.type === 'switchNode');
  const fnNodes = nodes.filter((n) => n.type === 'functionNode');

  if (fnNodes.length) warnings.push(`${fnNodes.length} function node(s) render on the canvas but are not executable in the deterministic runtime (Horizon 2).`);

  const pcrm: any = {
    schemaVersion: '1.0',
    ruleId: meta.name.trim().toLowerCase().replace(/\s+/g, '-') || 'rule',
    name: meta.name,
    targetEntity: meta.targetEntity,
    inputs: deriveInputs(inputNode, table, nodes),
    variables: deriveVariables(exprNodes),
    outputs: [],
    logic: { type: 'conditionSet', rules: [], otherwise: {} },
  };

  if (table) {
    Object.assign(pcrm, { outputs: (table.content?.outputs ?? []).map((c: any) => ({ name: c.name || c.field, type: 'Text' })) });
    pcrm.logic = tableToLogic(table);
  } else if (switchNode) {
    pcrm.logic = switchToLogic(switchNode);
  } else {
    warnings.push('No decision table or switch node found — nothing executable to translate.');
  }

  return { pcrm, warnings };
}

// Back-compat convenience used by Save/Test.
export function toPcrm(graph: DecisionGraphType, meta: PcrmMeta): unknown {
  return translate(graph, meta).pcrm;
}

function deriveInputs(inputNode: any, table: any, allNodes: any[] = []): any[] {
  // Prefer the input node's schema (the declared request shape).
  const schema = inputNode?.content?.schema;
  if (schema) {
    try {
      const obj = JSON.parse(schema);
      const fromJsonSchema = inputsFromJsonSchema(obj, allNodes);
      if (fromJsonSchema) return fromJsonSchema;
      if (obj && typeof obj === 'object') {
        // Legacy form: a sample object, one key per input.
        return Object.keys(obj).map((k) => ({ name: k, type: guessType(obj[k]), binding: k }));
      }
    } catch { /* fall through */ }
  }
  // Fallback: derive from the decision table's input columns.
  const cols = table?.content?.inputs ?? [];
  return cols.map((c: any) => ({ name: c.field || c.name, type: 'Text', binding: c.field || c.name }));
}

// A designer-generated entity schema (see gorules/entitySchema.ts) declares every
// field of the target entity plus one N:1 hop. Emitting them all would make the
// runtime resolve hundreds of bindings per run, so only fields the graph actually
// references become PCRM inputs. Nested (related) fields translate to `via` inputs
// under their dotted canvas name, which is how the logic references them.
function inputsFromJsonSchema(schema: any, allNodes: any[]): any[] | null {
  if (!schema || schema.type !== 'object' || !schema.properties) return null;
  const candidates: any[] = [];
  for (const [name, p] of Object.entries<any>(schema.properties)) {
    if (p?.type === 'object' && p.properties) {
      const via = { relationship: p['x-edp-relationship'] ?? name, entity: p['x-edp-entity'] ?? '' };
      for (const [field, fp] of Object.entries<any>(p.properties)) {
        candidates.push({ name: `${name}.${field}`, type: schemaPropType(fp), binding: field, via });
      }
    } else {
      candidates.push({ name, type: schemaPropType(p), binding: name });
    }
  }
  if (!schema['x-edp-entity']) return candidates; // hand-written schema: the author declared exactly what they need
  const logicText = expressionTextOf(allNodes);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Lookarounds keep `creditlimit` from matching inside `customerid.creditlimit`.
  return candidates.filter((c) => new RegExp(`(?<![.\\w])${escape(c.name)}(?![.\\w])`).test(logicText));
}

// Only the strings that can actually reference an input — never structural JSON
// keys (a field named `name` must not match every node's "name" property).
function expressionTextOf(nodes: any[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const c = n.content ?? {};
    if (n.type === 'decisionTableNode') {
      for (const col of c.inputs ?? []) if (col.field) parts.push(String(col.field));
      for (const row of c.rules ?? []) for (const v of Object.values(row)) if (typeof v === 'string') parts.push(v);
    } else if (n.type === 'switchNode') {
      for (const s of c.statements ?? []) if (s.condition) parts.push(String(s.condition));
    } else if (n.type === 'expressionNode') {
      for (const e of c.expressions ?? []) if (e.value) parts.push(String(e.value));
    } else if (n.type === 'functionNode') {
      parts.push(typeof c === 'string' ? c : String(c.source ?? ''));
    }
  }
  return parts.join('\n');
}

function schemaPropType(p: any): string {
  if (typeof p?.['x-edp-type'] === 'string') return p['x-edp-type'];
  if (p?.type === 'number' || p?.type === 'integer') return 'Decimal';
  if (p?.type === 'boolean') return 'Boolean';
  if (p?.type === 'string' && p?.format === 'date-time') return 'DateTime';
  return 'Text';
}

function deriveVariables(exprNodes: any[]): any[] {
  const vars: any[] = [];
  for (const node of exprNodes) {
    for (const e of node.content?.expressions ?? []) {
      if (e.key && e.value) vars.push({ name: e.key, type: 'Text', formula: zenToEdpFormula(e.value) });
    }
  }
  return vars;
}

function tableToLogic(table: any): any {
  const content = table.content ?? {};
  const inCols: any[] = content.inputs ?? [];
  const outCols: any[] = content.outputs ?? [];
  const rules: any[] = content.rules ?? [];
  return {
    type: 'decisionTable',
    hitPolicy: mapHitPolicy(content.hitPolicy),
    tableInputs: inCols.map((c) => ({ field: c.field || c.name })),
    outputColumns: outCols.map((c) => c.name || c.field),
    rows: rules.map((row, idx) => ({
      priority: rules.length - idx,
      cells: inCols.map((c) => parseUnaryTest(row[c.id])),
      outputs: Object.fromEntries(outCols.map((c) => [c.name || c.field, coerce(row[c.id])])),
    })),
  };
}

function switchToLogic(switchNode: any): any {
  // Each switch statement -> a conditionSet rule that outputs the branch it took.
  const statements: any[] = switchNode.content?.statements ?? [];
  const rules = statements
    .filter((s) => !s.isDefault && s.condition)
    .map((s) => ({ when: conditionFromZen(s.condition), then: { branch: s.id } }));
  const def = statements.find((s) => s.isDefault);
  return { type: 'conditionSet', rules, otherwise: def ? { branch: def.id } : {} };
}

// --- ZEN helpers (best-effort MVP) ---------------------------------------------

function conditionFromZen(zen: string): any {
  // Support simple "field OP value" comparisons for switch conditions.
  const m = zen.match(/^\s*([A-Za-z_][\w.]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/);
  if (!m) return { op: 'and', conditions: [] };
  const opMap: Record<string, string> = { '==': 'Equals', '!=': 'NotEquals', '>=': 'GreaterThanOrEqual', '<=': 'LessThanOrEqual', '>': 'GreaterThan', '<': 'LessThan' };
  return { op: 'and', conditions: [{ field: m[1], operator: opMap[m[2]], value: coerce(m[3]) }] };
}

function zenToEdpFormula(zen: string): string {
  // The EDP FormulaEngine (NCalc) accepts the common arithmetic/function forms directly.
  return zen;
}

function mapHitPolicy(p?: string): string {
  switch ((p || 'first').toLowerCase()) {
    case 'collect': return 'All';
    case 'unique': return 'Unique';
    case 'priority': return 'Priority';
    default: return 'First';
  }
}

function parseUnaryTest(raw?: string): any {
  const s = (raw ?? '').trim();
  if (s === '' || s === '-') return { any: true };
  const range = s.match(/^\[\s*([^.\s]+)\s*\.\.\s*([^\]\s]+)\s*\]$/);
  if (range) return { operator: 'Between', value: coerce(range[1]), value2: coerce(range[2]) };
  const cmp = s.match(/^(>=|<=|>|<)\s*(.+)$/);
  if (cmp) {
    const op = { '>=': 'GreaterThanOrEqual', '<=': 'LessThanOrEqual', '>': 'GreaterThan', '<': 'LessThan' }[cmp[1]]!;
    return { operator: op, value: coerce(cmp[2]) };
  }
  const notEq = s.match(/^!=\s*(.+)$/);
  if (notEq) return { operator: 'NotEquals', value: coerce(notEq[1]) };
  const eq = s.match(/^==?\s*(.+)$/);
  if (eq) return { operator: 'Equals', value: coerce(eq[1]) };
  return { operator: 'Equals', value: coerce(s) };
}

function coerce(raw?: string): unknown {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  const quoted = s.match(/^'(.*)'$|^"(.*)"$/);
  if (quoted) return quoted[1] ?? quoted[2] ?? '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function guessType(v: unknown): string {
  if (typeof v === 'number') return 'Decimal';
  if (typeof v === 'boolean') return 'Boolean';
  return 'Text';
}
