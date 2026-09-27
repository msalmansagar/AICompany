import { describe, expect, it } from 'vitest';
import { columnValue, computeAggregate, passesFilter } from './recordInputs';

// Test-with-a-real-record (EDP-DSN-002 step 7): the pure resolution helpers.

describe('columnValue', () => {
  it('should_read_plain_columns_and_lookup_value_columns', () => {
    const row = { amount: 12, _customerid_value: 'abc' };
    expect(columnValue(row, 'amount')).toBe(12);
    expect(columnValue(row, 'customerid')).toBe('abc');
    expect(columnValue(row, 'missing')).toBeNull();
  });
});

describe('computeAggregate', () => {
  const rows = [
    { amount: 10, status: 1 },
    { amount: 30, status: 1 },
    { amount: 100, status: 2 },
  ];

  it('should_count_sum_avg_min_max', () => {
    expect(computeAggregate(rows, 'Count', '')).toBe(3);
    expect(computeAggregate(rows, 'Sum', 'amount')).toBe(140);
    expect(computeAggregate(rows, 'Avg', 'amount')).toBeCloseTo(140 / 3);
    expect(computeAggregate(rows, 'Min', 'amount')).toBe(10);
    expect(computeAggregate(rows, 'Max', 'amount')).toBe(100);
  });

  it('should_apply_the_aggregate_filter_before_folding', () => {
    expect(computeAggregate(rows, 'Sum', 'amount', { field: 'status', operator: 'Equals', value: 1 })).toBe(40);
    expect(computeAggregate(rows, 'Count', '', { field: 'amount', operator: 'GreaterThan', value: 20 })).toBe(2);
  });

  it('should_return_null_not_zero_when_no_numeric_values_exist_except_sum', () => {
    expect(computeAggregate([], 'Sum', 'amount')).toBe(0);
    expect(computeAggregate([], 'Min', 'amount')).toBeNull();
  });
});

describe('passesFilter', () => {
  it('should_compare_numerically_when_both_sides_are_numeric', () => {
    expect(passesFilter('10', 'Equals', 10)).toBe(true);
    expect(passesFilter(5, 'LessThan', '6')).toBe(true);
  });

  it('should_fall_back_to_string_equality', () => {
    expect(passesFilter('open', 'Equals', 'open')).toBe(true);
    expect(passesFilter('open', 'NotEquals', 'closed')).toBe(true);
    expect(passesFilter('open', 'GreaterThan', 'a')).toBe(false); // ordering needs numbers
  });
});
