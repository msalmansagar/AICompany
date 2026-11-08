import { describe, it, expect } from 'vitest';
import { ValidationEngine } from './ValidationEngine';
import { resolveRelativeDate } from '@qdb/shared';
import type { FieldDefinition, ValidationRule } from '@qdb/shared';

function dateField(rules: ValidationRule[]): FieldDefinition {
  return {
    id: 'field-start',
    sectionId: 'section-1',
    fieldType: 'date',
    schemaName: 'event_start_date',
    label: 'Event Start Date',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: rules,
    businessRules: [],
  };
}

function boundRule(operator: '>=' | '<=', targetRef: string, errorMessage: string): ValidationRule {
  return {
    id: `rule-${operator}`,
    fieldId: 'field-start',
    ruleType: 'crossField',
    errorMessage,
    isActive: true,
    priority: 1,
    crossFieldOperator: operator,
    crossFieldTargetRef: targetRef,
  };
}

function shiftDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(year!, month! - 1, day! + days);
  const mm = String(shifted.getMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getDate()).padStart(2, '0');
  return `${shifted.getFullYear()}-${mm}-${dd}`;
}

describe('ValidationEngine relative date bounds', () => {
  const engine = new ValidationEngine();
  const today = resolveRelativeDate('@today')!;
  const NOT_BEFORE_TODAY = 'Start date cannot be in the past';
  const WITHIN_TEN_YEARS = 'Start date must be within ten years';

  it('should_accept_today_for_a_not_before_today_bound', () => {
    const field = dateField([boundRule('>=', '@today', NOT_BEFORE_TODAY)]);

    const errors = engine.validateField(field, today, {});

    expect(errors).toHaveLength(0);
  });

  it('should_reject_yesterday_for_a_not_before_today_bound', () => {
    const field = dateField([boundRule('>=', '@today', NOT_BEFORE_TODAY)]);

    const errors = engine.validateField(field, shiftDays(today, -1), {});

    expect(errors).toContain(NOT_BEFORE_TODAY);
  });

  it('should_accept_the_last_day_of_the_month_ten_years_out', () => {
    const field = dateField([boundRule('<=', '@monthEnd+10y', WITHIN_TEN_YEARS)]);
    const monthEndTenYears = resolveRelativeDate('@monthEnd+10y')!;

    const errors = engine.validateField(field, monthEndTenYears, {});

    expect(errors).toHaveLength(0);
  });

  it('should_reject_the_day_after_the_month_end_ten_years_out', () => {
    const field = dateField([boundRule('<=', '@monthEnd+10y', WITHIN_TEN_YEARS)]);
    const monthEndTenYears = resolveRelativeDate('@monthEnd+10y')!;

    const errors = engine.validateField(field, shiftDays(monthEndTenYears, 1), {});

    expect(errors).toContain(WITHIN_TEN_YEARS);
  });

  it('should_still_compare_against_another_field_when_the_target_is_a_schema_name', () => {
    const field = dateField([boundRule('>=', 'event_start_date', 'End date cannot be before start date')]);

    const errors = engine.validateField(field, '2026-03-01', { event_start_date: '2026-03-02' });

    expect(errors).toContain('End date cannot be before start date');
  });

  it('should_pass_when_the_relative_token_is_not_one_the_engine_defines', () => {
    const field = dateField([boundRule('>=', '@someday', NOT_BEFORE_TODAY)]);

    const errors = engine.validateField(field, '2000-01-01', {});

    expect(errors).toHaveLength(0);
  });
});
