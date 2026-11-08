// ─────────────────────────────────────────────────────────────
// Related-record conditions (DFE-RULES-002 item 2).
//
// A condition on a lookup field may name a column of the record the lookup has selected —
// "Sponsor → Industry equals Banking". The runtime reads that column into a fact named by
// relatedFactName, and a condition with relatedAttribute reads that fact instead of the
// lookup's own value.
//
// collectRelatedAttributes is also the backend's allowlist: the portal serves only the
// columns a form's own published rules name, never an arbitrary column of the record.
// ─────────────────────────────────────────────────────────────

import type { BusinessRule } from '../types/form.types.js';

/** Cannot occur in a Dataverse schema name, so a related fact never collides with a field. */
const RELATED_FACT_SEPARATOR = '->';

/**
 * A Dataverse logical name. A related column that is not one is never read: it would be spliced
 * into a $select, where a comma or an OData option could widen what is fetched.
 */
const LOGICAL_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function isLogicalName(name: string): boolean {
  return LOGICAL_NAME_PATTERN.test(name);
}

/** One related-record read: which lookup, which record of which entity, which columns. */
export interface RelatedRecordQuery {
  fieldSchemaName: string;
  entityLogicalName: string;
  recordId: string;
  attributes: string[];
}

export function relatedFactName(fieldId: string, attribute: string): string {
  return `${fieldId}${RELATED_FACT_SEPARATOR}${attribute}`;
}

/** Each lookup field's related columns that some rule condition reads, deduplicated. */
export function collectRelatedAttributes(rules: BusinessRule[]): Map<string, string[]> {
  const attributesByField = new Map<string, Set<string>>();
  for (const condition of rules.flatMap((rule) => rule.conditions ?? [])) {
    if (!condition.relatedAttribute || !isLogicalName(condition.relatedAttribute)) continue;
    const attributes = attributesByField.get(condition.fieldId) ?? new Set<string>();
    attributes.add(condition.relatedAttribute);
    attributesByField.set(condition.fieldId, attributes);
  }
  return new Map([...attributesByField].map(([fieldId, attributes]) => [fieldId, [...attributes].sort()]));
}
