import { describe, it, expect } from 'vitest';
import {
  resolveFieldDefaultValue,
  parseMultiSelectDefault,
  serialiseMultiSelectDefault,
  parseBooleanDefault,
} from '@qdb/shared';

describe('resolveFieldDefaultValue', () => {
  it('should_return_null_when_no_default_is_set', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'text' })).toBeNull();
  });

  it('should_return_null_when_the_default_is_an_empty_string', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'text', defaultValue: '' })).toBeNull();
  });

  it('should_pass_text_defaults_through_unchanged', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'text', defaultValue: 'Doha' })).toBe('Doha');
  });

  it('should_pass_a_dropdown_default_through_as_the_option_value', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'dropdown', defaultValue: 'qa' })).toBe('qa');
  });

  it('should_return_a_list_when_a_multiselect_default_is_a_json_array', () => {
    const resolved = resolveFieldDefaultValue({
      fieldType: 'multiselect',
      defaultValue: '["a","b"]',
    });
    expect(resolved).toEqual(['a', 'b']);
  });

  it('should_return_a_list_when_a_multiselect_default_is_comma_separated', () => {
    const resolved = resolveFieldDefaultValue({
      fieldType: 'multiselect',
      defaultValue: 'a, b',
    });
    expect(resolved).toEqual(['a', 'b']);
  });

  it('should_return_null_when_a_multiselect_default_names_nothing', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'multiselect', defaultValue: ' , ' })).toBeNull();
  });

  it('should_return_false_when_a_checkbox_default_is_the_string_false', () => {
    // The designer stores 'false', which is a truthy string — an unchecked default used
    // to render checked because nothing coerced it.
    expect(resolveFieldDefaultValue({ fieldType: 'checkbox', defaultValue: 'false' })).toBe(false);
  });

  it('should_return_true_when_a_checkbox_default_is_the_string_true', () => {
    expect(resolveFieldDefaultValue({ fieldType: 'checkbox', defaultValue: 'true' })).toBe(true);
  });
});

describe('parseMultiSelectDefault', () => {
  it('should_return_an_empty_list_for_no_value', () => {
    expect(parseMultiSelectDefault(null)).toEqual([]);
  });

  it('should_trim_and_drop_blank_entries', () => {
    expect(parseMultiSelectDefault('["a"," b ",""]')).toEqual(['a', 'b']);
  });

  it('should_accept_a_list_it_is_given', () => {
    expect(parseMultiSelectDefault(['x', 'y'])).toEqual(['x', 'y']);
  });
});

describe('serialiseMultiSelectDefault', () => {
  it('should_store_selected_values_as_a_json_array', () => {
    expect(serialiseMultiSelectDefault(['a', 'b'])).toBe('["a","b"]');
  });

  it('should_store_null_when_nothing_is_selected', () => {
    expect(serialiseMultiSelectDefault([])).toBeNull();
  });

  it('should_round_trip_through_the_parser', () => {
    const stored = serialiseMultiSelectDefault(['one', 'two']);
    expect(parseMultiSelectDefault(stored)).toEqual(['one', 'two']);
  });
});

describe('parseBooleanDefault', () => {
  it('should_read_yes_as_true', () => {
    expect(parseBooleanDefault('Yes')).toBe(true);
  });

  it('should_return_null_when_the_text_names_neither_state', () => {
    expect(parseBooleanDefault('maybe')).toBeNull();
  });
});
