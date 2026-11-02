// Declared fact: a named, typed input with no binding, via, or aggregate.
// Supplied by the caller (InputsJson) or an upstream rule-set member; never read from the record.
// FR-B1-01, FR-B1-03, FR-B1-10.

import { STRICT_COMPATIBLE_TYPES } from '../contract';
import type { AttributeMeta } from '../metadata/metadataService';

export interface DeclaredFact {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly nullable: boolean;
}

/** PCRM input shape for a declared fact — source marker, no binding (FR-B1-01). */
export interface PcrmDeclaredInput {
  readonly name: string;
  readonly type: string;
  readonly source: 'declared';
  readonly required: boolean;
  readonly nullable: boolean;
}

/** Convert a declared fact to its PCRM input shape. */
export function toPcrmDeclaredInput(fact: DeclaredFact): PcrmDeclaredInput {
  return { name: fact.name, type: fact.type, source: 'declared', required: fact.required, nullable: fact.nullable };
}

/**
 * A declared fact is an input with no binding, relationship or aggregate — the runtime's definition
 * (PcrmInput.IsDeclaredFact). A legacy unbound input with no "source" marker is one too (FR-B1-02).
 */
export function isDeclaredInput(input: Record<string, unknown>): boolean {
  return !input['binding'] && !input['via'] && !input['aggregate'];
}

/** Extract declared facts from saved PCRM inputs — round-trips what was saved. */
export function extractDeclaredFacts(pcrmInputs: unknown[]): DeclaredFact[] {
  if (!Array.isArray(pcrmInputs)) return [];
  return pcrmInputs
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .filter(isDeclaredInput)
    .map((i) => ({
      name: String(i['name'] ?? ''),
      type: String(i['type'] ?? 'Text'),
      required: Boolean(i['required'] ?? false),
      nullable: i['nullable'] !== false,
    }));
}

/**
 * Merge declared facts into the bound-input list.
 * An input is bound XOR declared (FR-B1-10): a declared fact whose name matches
 * an existing bound input wins; the bound input is dropped.
 */
export function mergeDeclaredFacts(boundInputs: unknown[], facts: DeclaredFact[]): unknown[] {
  if (facts.length === 0) return Array.isArray(boundInputs) ? boundInputs : [];
  const declaredNames = new Set(facts.map((f) => f.name));
  const filtered = (Array.isArray(boundInputs) ? boundInputs : []).filter((i) => {
    if (typeof i !== 'object' || i === null) return true;
    const name = (i as Record<string, unknown>)['name'];
    return typeof name !== 'string' || !declaredNames.has(name);
  });
  return [...filtered, ...facts.map(toPcrmDeclaredInput)];
}

/** Create a new declared fact with safe defaults. */
export function newDeclaredFact(name: string, type = 'Text'): DeclaredFact {
  return { name, type, required: false, nullable: true };
}

/** Types available for declared facts (non-null strict in Release 1; Lookup excluded via EDP066). */
export const DECLARED_FACT_TYPES = STRICT_COMPATIBLE_TYPES.map((t) => ({ name: t.name, label: t.label }));

/**
 * The empty test value for a declared type (FR-B1-08): Text starts as "", every other type as null,
 * so the designer never sends a quoted placeholder that a strict rule would reject as EDP062.
 */
export function emptyValueFor(type: string | undefined): string | null {
  return (type ?? 'Text') === 'Text' ? '' : null;
}

/**
 * The declared-fact values currently typed in the test-input JSON. "Fill from record" keeps them,
 * because the record never supplies a declared fact (FR-B1-08). Unparseable text keeps nothing.
 */
export function declaredFactValues(testInputsJson: string, facts: readonly DeclaredFact[]): Record<string, unknown> {
  let current: unknown;
  try { current = JSON.parse(testInputsJson); } catch { return {}; }
  if (typeof current !== 'object' || current === null) return {};
  const values = current as Record<string, unknown>;
  return Object.fromEntries(facts.filter((f) => f.name in values).map((f) => [f.name, values[f.name]]));
}

const ATTRIBUTE_TYPE_OF_FACT: Record<string, string> = {
  Text: 'String', Decimal: 'Decimal', Currency: 'Money', WholeNumber: 'Integer', Boolean: 'Boolean',
  Date: 'DateTime', DateTime: 'DateTime', Choice: 'Picklist', OptionSet: 'Picklist',
};

/** Declared facts as pickable fields for the table and condition editors (FR-B1-07). Collections are not scalar fields. */
export function factAttributes(facts: readonly DeclaredFact[]): AttributeMeta[] {
  return facts.filter((f) => f.name && ATTRIBUTE_TYPE_OF_FACT[f.type])
    .map((f) => ({ logicalName: f.name, displayName: `${f.name} (fact)`, type: ATTRIBUTE_TYPE_OF_FACT[f.type] ?? 'String' }));
}

const JSON_SHAPE_OF_FACT: Record<string, Record<string, string>> = {
  Decimal: { type: 'number' }, Currency: { type: 'number' }, WholeNumber: { type: 'integer' },
  Choice: { type: 'integer' }, OptionSet: { type: 'integer' }, Boolean: { type: 'boolean' },
  Date: { type: 'string', format: 'date' }, DateTime: { type: 'string', format: 'date-time' }, Collection: { type: 'array' },
};

/** The GoRules input-node schema with each declared fact added and marked x-edp-kind "declared" (FR-B1-07). */
export function withDeclaredFacts<T extends { properties?: Record<string, unknown> }>(schema: T, facts: readonly DeclaredFact[]): T {
  if (facts.length === 0) return schema;
  const declared = Object.fromEntries(facts.filter((f) => f.name).map((f) => [f.name, {
    ...(JSON_SHAPE_OF_FACT[f.type] ?? { type: 'string' }),
    description: `${f.name} (declared fact)`, 'x-edp-type': f.type, 'x-edp-kind': 'declared',
  }]));
  return { ...schema, properties: { ...(schema.properties ?? {}), ...declared } };
}
