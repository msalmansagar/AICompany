import { describe, it, expect } from 'vitest';
import { resolveDateBounds } from './dateBounds';
import type { ValidationRule } from '@qdb/shared';

const NOW = new Date(2026, 8, 29);

function rule(overrides: Partial<ValidationRule>): ValidationRule {
  return {
    id: 'r1',
    fieldId: 'f1',
    ruleType: 'crossField',
    errorMessage: 'out of range',
    isActive: true,
    priority: 1,
    ...overrides,
  };
}

describe('resolveDateBounds', () => {
  it('should_set_min_from_a_not_before_today_rule', () => {
    const bounds = resolveDateBounds([rule({ crossFieldOperator: '>=', crossFieldTargetRef: '@today' })], NOW);

    expect(bounds).toEqual({ min: '2026-09-29' });
  });

  it('should_set_max_from_a_month_end_ten_years_rule', () => {
    const bounds = resolveDateBounds([rule({ crossFieldOperator: '<=', crossFieldTargetRef: '@monthEnd+10y' })], NOW);

    expect(bounds).toEqual({ max: '2036-09-30' });
  });

  it('should_step_a_strict_bound_by_one_day', () => {
    const bounds = resolveDateBounds([
      rule({ id: 'a', crossFieldOperator: '>', crossFieldTargetRef: '@today' }),
      rule({ id: 'b', crossFieldOperator: '<', crossFieldTargetRef: '@today+1m' }),
    ], NOW);

    expect(bounds).toEqual({ min: '2026-09-30', max: '2026-10-28' });
  });

  it('should_ignore_a_bound_on_another_field', () => {
    const bounds = resolveDateBounds([rule({ crossFieldOperator: '>=', crossFieldTargetRef: 'start_date' })], NOW);

    expect(bounds).toEqual({});
  });

  it('should_ignore_an_inactive_rule', () => {
    const bounds = resolveDateBounds([rule({ isActive: false, crossFieldOperator: '>=', crossFieldTargetRef: '@today' })], NOW);

    expect(bounds).toEqual({});
  });
});
