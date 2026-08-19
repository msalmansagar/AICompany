// Model + PCRM serialization for the Condition-builder authoring surface (Expression Trees).
// Produces a `conditionSet` PCRM — the runtime already executes AND / OR / nested groups / NOT.
import { category, pcrmType, type OutputCol } from '../table/tableModel';

/** A single test: field <op> value(s). field is a CRM logical name. */
export interface Clause { field: string; fieldType: string; operator: string; value?: string; value2?: string; }
/** Quantification over a collection: do some / all / none of its elements satisfy `where`? */
export interface Quantifier { kind: 'some' | 'all' | 'none'; collection: string; where: Group; }
/** A boolean group over clauses, quantifiers and nested groups. */
// `quantifiers` is OPTIONAL so rules saved before F1 still load — their stored shape has no such
// property, and a required field would reject every existing rule in the org.
export interface Group { op: 'and' | 'or'; negate?: boolean; clauses: Clause[]; groups: Group[]; quantifiers?: Quantifier[]; }
export type OutcomeMap = Record<string, string>;

export interface ConditionModel {
  editor: 'edp-conditions';
  when: Group;            // the boolean expression
  then: OutcomeMap;       // outputs when WHEN is true
  otherwise: OutcomeMap;  // outputs when WHEN is false (empty = no else branch)
  outputs: OutputCol[];
}

export function emptyGroup(op: 'and' | 'or' = 'and'): Group { return { op, clauses: [], groups: [], quantifiers: [] }; }
export function emptyQuantifier(): Quantifier { return { kind: 'all', collection: '', where: emptyGroup('and') }; }

/** A quantifier is usable once it names a collection and its body has something to test. */
export function quantifierReady(q: Quantifier): boolean {
  return !!q.collection.trim() && (q.where.clauses.some(clauseReady) || q.where.groups.length > 0 || (q.where.quantifiers ?? []).length > 0);
}
export function emptyConditions(): ConditionModel {
  return { editor: 'edp-conditions', when: emptyGroup('and'), then: {}, otherwise: {}, outputs: [{ name: 'result', type: 'Text' }] };
}

/** A clause is usable once it has a field and an operator. */
export function clauseReady(c: Clause): boolean { return !!c.field && !!c.operator; }

function coerce(raw: string | undefined, cat: string): unknown {
  const s = (raw ?? '').trim();
  if (s === '') return cat === 'boolean' ? false : null;
  if (cat === 'number' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (cat === 'boolean') return s === 'true' || s === 'Yes' || s === 'yes' || s === '1';
  return s; // text / date / optionset / comma-list for In
}

/**
 * Distinct field logical names referenced anywhere in the tree, with their CRM type.
 *
 * Quantifier BODIES are deliberately skipped: inside one, a field names a property of the
 * collection's elements, not an attribute of the anchor entity. Declaring those as inputs would
 * bind them to the wrong record — and the runtime validator suppresses symbol checking there for
 * the same reason.
 */
function collectFields(g: Group, into: Map<string, string>): void {
  for (const c of g.clauses) if (clauseReady(c) && !into.has(c.field)) into.set(c.field, c.fieldType);
  for (const child of g.groups) collectFields(child, into);
}

/** Collections quantified over anywhere in the tree, including inside other quantifiers. */
function collectCollections(g: Group, into: Set<string>): void {
  for (const q of g.quantifiers ?? []) {
    if (quantifierReady(q)) into.add(q.collection.trim());
    collectCollections(q.where, into);
  }
  for (const child of g.groups) collectCollections(child, into);
}

function clauseToPcrm(c: Clause): any {
  const cat = category(c.fieldType);
  const out: any = { field: c.field, operator: c.operator, value: coerce(c.value, cat) };
  if (c.value2 !== undefined && c.value2 !== '') out.value2 = coerce(c.value2, cat);
  return out;
}

function quantifierToPcrm(q: Quantifier): any {
  return { kind: q.kind, collection: q.collection.trim(), where: groupToPcrm(q.where) };
}

function groupToPcrm(g: Group): any {
  return {
    op: g.op,
    negate: !!g.negate,
    conditions: g.clauses.filter(clauseReady).map(clauseToPcrm),
    quantifiers: (g.quantifiers ?? []).filter(quantifierReady).map(quantifierToPcrm),
    groups: g.groups.map(groupToPcrm),
  };
}

function outcomeToPcrm(map: OutcomeMap, outputs: OutputCol[]): Record<string, unknown> {
  return Object.fromEntries(outputs.map((o) => [o.name, coerce(map[o.name], o.type === 'Number' ? 'number' : o.type === 'Boolean' ? 'boolean' : 'text')]));
}

export function conditionsToPcrm(model: ConditionModel, meta: { name: string; targetEntity: string }): unknown {
  const fields = new Map<string, string>();
  collectFields(model.when, fields);
  const collections = new Set<string>();
  collectCollections(model.when, collections);
  const hasElse = Object.values(model.otherwise).some((v) => v !== undefined && v !== '');

  return {
    schemaVersion: '1.0',
    ruleId: meta.name.trim().toLowerCase().replace(/\s+/g, '-') || 'rule',
    name: meta.name,
    targetEntity: meta.targetEntity,
    inputs: [
      ...[...fields].map(([field, type]) => ({ name: field, type: pcrmType(type), binding: field })),
      // A quantified collection is supplied by the caller or by an F2 retrieval, so it is declared
      // WITHOUT a binding — there is no anchor attribute to read it from.
      ...[...collections].map((name) => ({ name, type: 'Text' })),
    ],
    variables: [],
    outputs: model.outputs.map((o) => ({ name: o.name, type: o.type })),
    logic: {
      type: 'conditionSet',
      rules: [{ when: groupToPcrm(model.when), then: outcomeToPcrm(model.then, model.outputs) }],
      ...(hasElse ? { otherwise: outcomeToPcrm(model.otherwise, model.outputs) } : {}),
    },
  };
}
