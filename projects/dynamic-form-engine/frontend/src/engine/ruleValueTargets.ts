import type { FieldDefinition } from '@qdb/shared';

/**
 * Re-keys the values rules set (setValue / clearValue / calculateValue) from each target
 * field's id to its schema name.
 *
 * A published rule names its target by field id, but the form holds values by schema name.
 * Writing the rule's result under the id put the value in a key no control reads, so a
 * calculated total never appeared and was submitted under a GUID. A key that is already a
 * schema name, or names no field on the form, is kept as it is.
 */
export function mapRuleValuesToSchemaNames(
  ruleValues: Record<string, unknown>,
  fields: FieldDefinition[],
): Record<string, unknown> {
  const schemaNameById = new Map(fields.map((field) => [field.id, field.schemaName]));
  return Object.fromEntries(
    Object.entries(ruleValues).map(([key, value]) => [schemaNameById.get(key) ?? key, value]),
  );
}
