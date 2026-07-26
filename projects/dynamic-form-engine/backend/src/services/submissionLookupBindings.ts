// Works out, for one submission, which mappings write a lookup and how each must be bound.
//
// Resolution needs metadata, so it happens once up front; the payload builders stay
// synchronous and take the resulting map. A mapping with no entry is written exactly as
// before, which keeps every non-lookup mapping on its existing path.
import type { FieldDefinition, FormDefinition, SubmissionMapping } from '@qdb/shared';
import type { LookupBinding, LookupBindingResolver } from './LookupBindingResolver.js';

/** Bindings keyed by the mapping's target attribute. */
export type LookupBindingMap = Map<string, LookupBinding>;

/**
 * The record id a lookup field holds. The renderer stores a selection as
 * { id, displayName }, while an API caller may send the bare GUID — both have to bind.
 * Returns null for anything else, so the caller falls back to a plain assignment.
 */
export function readLookupRecordId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

/** Every field on the form, by id — payload builders need the type, not just the schema name. */
export function indexFieldsById(formDefinition: FormDefinition): Map<string, FieldDefinition> {
  const fields = new Map<string, FieldDefinition>();
  for (const tab of formDefinition.tabs) {
    for (const field of [...(tab.headerFields ?? []), ...(tab.footerFields ?? [])]) {
      fields.set(field.id, field);
    }
    for (const section of tab.sections) {
      for (const field of section.fields) fields.set(field.id, field);
    }
  }
  return fields;
}

/**
 * Resolves a binding for every mapping whose source field is a single lookup.
 * Multi-value lookups are left alone — writing several references is an association, not
 * an attribute write, and is out of scope here.
 */
export async function resolveLookupBindings(
  mappings: SubmissionMapping[],
  fieldsById: Map<string, FieldDefinition>,
  resolver: LookupBindingResolver,
): Promise<LookupBindingMap> {
  const bindings: LookupBindingMap = new Map();

  for (const mapping of mappings) {
    const field = fieldsById.get(mapping.fieldId);
    const referencedEntity = field?.lookupConfig?.entityLogicalName;
    if (field?.fieldType !== 'lookup' || !referencedEntity) continue;
    if (bindings.has(mapping.targetAttributeLogicalName)) continue;

    const binding = await resolver.resolve(
      mapping.targetEntityLogicalName,
      mapping.targetAttributeLogicalName,
      referencedEntity,
    );
    if (binding) bindings.set(mapping.targetAttributeLogicalName, binding);
  }

  return bindings;
}
