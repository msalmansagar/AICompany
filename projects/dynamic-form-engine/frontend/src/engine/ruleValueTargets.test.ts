import { describe, it, expect } from 'vitest';
import { mapRuleValuesToSchemaNames } from './ruleValueTargets';
import type { FieldDefinition } from '@qdb/shared';

const FIELDS = [
  { id: 'a9d4-total', schemaName: 'rb2_total' },
  { id: 'a9d4-qty', schemaName: 'rb2_quantity' },
] as FieldDefinition[];

describe('mapRuleValuesToSchemaNames', () => {
  it('should_rekey_a_value_targeted_by_field_id_to_the_schema_name', () => {
    expect(mapRuleValuesToSchemaNames({ 'a9d4-total': 502 }, FIELDS)).toEqual({ rb2_total: 502 });
  });

  it('should_keep_a_key_that_is_already_a_schema_name', () => {
    expect(mapRuleValuesToSchemaNames({ rb2_quantity: 4 }, FIELDS)).toEqual({ rb2_quantity: 4 });
  });

  it('should_keep_a_cleared_value_as_null', () => {
    expect(mapRuleValuesToSchemaNames({ 'a9d4-total': null }, FIELDS)).toEqual({ rb2_total: null });
  });

  it('should_keep_a_key_that_names_no_field', () => {
    expect(mapRuleValuesToSchemaNames({ unknown: 1 }, FIELDS)).toEqual({ unknown: 1 });
  });
});
