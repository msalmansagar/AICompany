import { describe, it, expect } from 'vitest';
import {
  readFilterElement,
  formatReadableFilter,
  describeCondition,
  isGroup,
} from './fetchXmlReadable';
import type { FilterElement, ReadableGroup } from './fetchXmlReadable';

/**
 * A stand-in for the handful of DOM members this module reads, so the traversal is
 * tested for real rather than mocked away. Node has no DOMParser; the browser supplies
 * the XML-to-element step, and everything after it is exercised here.
 */
function el(
  tagName: string,
  attributes: Record<string, string> = {},
  children: FilterElement[] = []
): FilterElement {
  return {
    tagName,
    textContent: attributes['__text'] ?? '',
    getAttribute: (name) => attributes[name] ?? null,
    children,
  };
}

const condition = (attribute: string, operator: string, value?: string) =>
  el('condition', value === undefined ? { attribute, operator } : { attribute, operator, value });

describe('readFilterElement', () => {
  it('should_return_null_when_there_is_no_filter', () => {
    expect(readFilterElement(null)).toBeNull();
    expect(readFilterElement(el('fetch', {}, [el('entity')]))).toBeNull();
  });

  it('should_return_null_for_a_filter_holding_no_conditions', () => {
    expect(readFilterElement(el('filter', { type: 'and' }))).toBeNull();
  });

  it('should_find_the_filter_inside_a_whole_fetch_document', () => {
    const fetchEl = el('fetch', {}, [
      el('entity', { name: 'qdb_task' }, [
        el('attribute', { name: 'activityid' }),
        el('filter', { type: 'and' }, [condition('qdb_approvedamount', 'gt', '500000')]),
      ]),
    ]);
    const group = readFilterElement(fetchEl);
    expect(group?.items).toHaveLength(1);
  });

  it('should_carry_the_join_type_through', () => {
    const orFilter = el('filter', { type: 'or' }, [condition('a', 'eq', '1'), condition('b', 'eq', '2')]);
    expect(readFilterElement(orFilter)?.join).toBe('or');
  });

  it('should_default_to_and_when_no_join_is_stated', () => {
    expect(readFilterElement(el('filter', {}, [condition('a', 'eq', '1')]))?.join).toBe('and');
  });

  it('should_keep_a_nested_group_as_a_group', () => {
    const nested = el('filter', { type: 'and' }, [
      condition('a', 'eq', '1'),
      el('filter', { type: 'or' }, [condition('b', 'eq', '2'), condition('c', 'eq', '3')]),
    ]);
    const group = readFilterElement(nested)!;
    expect(group.items).toHaveLength(2);
    expect(isGroup(group.items[1]!)).toBe(true);
  });

  it('should_read_child_values_for_an_in_condition', () => {
    const inCondition = el('condition', { attribute: 'qdb_applicant_type', operator: 'in' }, [
      el('value', { __text: '751090000' }),
      el('value', { __text: '751090001' }),
    ]);
    const group = readFilterElement(el('filter', {}, [inCondition]))!;
    const first = group.items[0]!;
    expect(isGroup(first)).toBe(false);
    if (isGroup(first)) throw new Error('expected a condition');
    expect(first.values).toEqual(['751090000', '751090001']);
  });

  it('should_ignore_elements_that_are_neither_conditions_nor_filters', () => {
    const withNoise = el('filter', {}, [el('link-entity', { name: 'x' }), condition('a', 'eq', '1')]);
    expect(readFilterElement(withNoise)?.items).toHaveLength(1);
  });
});

describe('describeCondition', () => {
  it('should_read_an_operator_as_a_symbol_rather_than_a_fetchxml_keyword', () => {
    expect(describeCondition({ attribute: 'qdb_amount', operator: 'ge', values: ['100'] }))
      .toBe('qdb_amount ≥ 100');
  });

  it('should_read_a_value_free_operator_as_a_phrase', () => {
    expect(describeCondition({ attribute: 'qdb_owner', operator: 'null', values: [] }))
      .toBe('qdb_owner is empty');
  });

  it('should_join_a_between_range_with_and', () => {
    expect(describeCondition({ attribute: 'qdb_amount', operator: 'between', values: ['1', '9'] }))
      .toBe('qdb_amount is between 1 and 9');
  });

  it('should_comma_join_a_list_membership_test', () => {
    expect(describeCondition({ attribute: 'qdb_type', operator: 'in', values: ['A', 'B'] }))
      .toBe('qdb_type is any of A, B');
  });

  it('should_use_a_display_name_when_one_is_supplied', () => {
    const label = describeCondition(
      { attribute: 'qdb_approvedamount', operator: 'gt', values: ['500000'] },
      (a) => (a === 'qdb_approvedamount' ? 'Approved Amount' : a)
    );
    expect(label).toBe('Approved Amount > 500000');
  });

  it('should_fall_back_to_the_logical_name_when_the_lookup_finds_nothing', () => {
    const label = describeCondition({ attribute: 'qdb_x', operator: 'eq', values: ['1'] }, () => '');
    expect(label).toBe('qdb_x = 1');
  });

  it('should_pass_an_unknown_operator_through_unchanged', () => {
    expect(describeCondition({ attribute: 'a', operator: 'under', values: ['1'] }))
      .toBe('a under 1');
  });
});

describe('formatReadableFilter', () => {
  it('should_state_the_join_between_conditions_but_not_before_the_first', () => {
    const group: ReadableGroup = {
      join: 'and',
      items: [
        { attribute: 'qdb_amount', operator: 'gt', values: ['500000'] },
        { attribute: 'qdb_type', operator: 'eq', values: ['SME'] },
      ],
    };
    expect(formatReadableFilter(group)).toEqual([
      'qdb_amount > 500000',
      'AND qdb_type = SME',
    ]);
  });

  it('should_indent_and_bracket_a_nested_group', () => {
    const group: ReadableGroup = {
      join: 'and',
      items: [
        { attribute: 'a', operator: 'eq', values: ['1'] },
        { join: 'or', items: [
          { attribute: 'b', operator: 'eq', values: ['2'] },
          { attribute: 'c', operator: 'eq', values: ['3'] },
        ] },
      ],
    };
    expect(formatReadableFilter(group)).toEqual([
      'a = 1',
      'AND (',
      '  b = 2',
      '  OR c = 3',
      ')',
    ]);
  });

  // The one-line label this replaces printed both of these identically.
  it('should_distinguish_two_rules_a_comma_joined_label_would_flatten', () => {
    const andOfOr: ReadableGroup = {
      join: 'and',
      items: [
        { attribute: 'a', operator: 'eq', values: ['1'] },
        { join: 'or', items: [{ attribute: 'b', operator: 'eq', values: ['2'] }] },
      ],
    };
    const flatOr: ReadableGroup = {
      join: 'or',
      items: [
        { attribute: 'a', operator: 'eq', values: ['1'] },
        { attribute: 'b', operator: 'eq', values: ['2'] },
      ],
    };
    expect(formatReadableFilter(andOfOr)).not.toEqual(formatReadableFilter(flatOr));
  });
});
