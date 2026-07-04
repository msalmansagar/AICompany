import { describe, it, expect } from 'vitest';
import type { FieldDefinition } from '@qdb/shared';
import { formatReadOnlyValue } from './readOnlyFieldValue';

function field(overrides: Partial<FieldDefinition>): FieldDefinition {
  return { fieldType: 'text', ...overrides } as unknown as FieldDefinition;
}

describe('formatReadOnlyValue', () => {
  it('lookup_shows_the_display_name', () => {
    const result = formatReadOnlyValue(field({ fieldType: 'lookup' }), { id: 'g1', displayName: 'Ali Hassan' });
    expect(result).toBe('Ali Hassan');
  });

  it('multiLookup_joins_the_display_names', () => {
    const result = formatReadOnlyValue(field({ fieldType: 'multiLookup' }), [
      { id: 'g1', displayName: 'Ali' },
      { id: 'g2', displayName: 'Sara' },
    ]);
    expect(result).toBe('Ali, Sara');
  });

  it('multiLookup_empty_selection_is_blank', () => {
    expect(formatReadOnlyValue(field({ fieldType: 'multiLookup' }), [])).toBe('');
  });

  it('multiLookup_null_value_is_blank_and_does_not_throw', () => {
    expect(formatReadOnlyValue(field({ fieldType: 'multiLookup' }), null)).toBe('');
  });

  it('dropdown_shows_the_selected_option_label', () => {
    const dropdown = field({
      fieldType: 'dropdown',
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    } as Partial<FieldDefinition>);
    expect(formatReadOnlyValue(dropdown, 'b')).toBe('Option B');
  });

  it('checkbox_uses_true_false_labels', () => {
    const checkbox = field({ fieldType: 'checkbox', trueLabel: 'Yes', falseLabel: 'No' } as Partial<FieldDefinition>);
    expect(formatReadOnlyValue(checkbox, true)).toBe('Yes');
    expect(formatReadOnlyValue(checkbox, false)).toBe('No');
  });
});
