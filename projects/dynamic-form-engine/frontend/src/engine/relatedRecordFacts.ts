import { collectRelatedAttributes, relatedFactName } from '@qdb/shared';
import type { BusinessRule, FieldDefinition, FormFieldValues, RelatedRecordQuery } from '@qdb/shared';
import { logger } from '../utils/logger';

export type RelatedRecordReader = (request: RelatedRecordQuery) => Promise<Record<string, unknown>>;

interface RelatedFactResolverOptions {
  rules: BusinessRule[];
  fields: FieldDefinition[];
  read: RelatedRecordReader;
}

/**
 * Builds the facts related-record conditions read (DFE-RULES-002 item 2).
 *
 * For each lookup some condition reaches through, the selected record's named columns are read
 * once and cached by record id. Every expected fact is always present — null when the lookup is
 * empty or the read fails — because the rule engine refuses a fact it has never seen, and one
 * missing fact would stop every rule on the form.
 */
export function createRelatedFactResolver({ rules, fields, read }: RelatedFactResolverOptions) {
  const attributesByField = collectRelatedAttributes(rules);
  const entityByField = new Map(fields.map((field) => [field.schemaName, field.lookupConfig?.entityLogicalName]));
  const cache = new Map<string, Promise<Record<string, unknown>>>();

  const readCached = (request: RelatedRecordQuery): Promise<Record<string, unknown>> => {
    const key = `${request.fieldSchemaName}|${request.recordId}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const pending = read(request).catch((error: unknown) => {
      cache.delete(key);
      logger.error('related_record_read_failed', { ...request, reason: error instanceof Error ? error.message : String(error) });
      return {};
    });
    cache.set(key, pending);
    return pending;
  };

  return async function resolve(values: FormFieldValues): Promise<Record<string, unknown>> {
    const facts: Record<string, unknown> = {};
    for (const [fieldSchemaName, attributes] of attributesByField) {
      const record = await readSelectedRecord(fieldSchemaName, attributes, values);
      for (const attribute of attributes) facts[relatedFactName(fieldSchemaName, attribute)] = record[attribute] ?? null;
    }
    return facts;
  };

  function readSelectedRecord(
    fieldSchemaName: string,
    attributes: string[],
    values: FormFieldValues,
  ): Promise<Record<string, unknown>> {
    const recordId = selectedRecordId(values[fieldSchemaName]);
    const entityLogicalName = entityByField.get(fieldSchemaName);
    if (!recordId || !entityLogicalName) return Promise.resolve({});
    return readCached({ fieldSchemaName, entityLogicalName, recordId, attributes });
  }
}

/** The record id a lookup value holds, or null when nothing is selected. */
function selectedRecordId(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id || null;
  }
  return null;
}
