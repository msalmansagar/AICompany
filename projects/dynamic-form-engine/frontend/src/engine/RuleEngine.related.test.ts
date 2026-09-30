import { describe, it, expect } from 'vitest';
import { RuleEngine } from './RuleEngine';
import { relatedFactName } from '@qdb/shared';
import type { BusinessRule, RuleCondition } from '@qdb/shared';

function rule(condition: RuleCondition): BusinessRule {
  return {
    id: 'r1',
    name: 'Sponsor industry',
    conditions: [condition],
    conditionsLogic: 'AND',
    action: 'hideField',
    targetFieldId: 'field-bank-letter',
    priority: 1,
    isActive: true,
  };
}

const SPONSOR = { id: 'acc-1', displayName: 'Al Khalij Commercial Bank' };
const INDUSTRY = relatedFactName('rb2_sponsor', 'industrycode');
const EMPLOYEES = relatedFactName('rb2_sponsor', 'numberofemployees');

describe('RuleEngine related-record conditions', () => {
  const engine = new RuleEngine();

  it('should_match_a_related_option_value_whether_stored_as_number_or_string', async () => {
    const result = await engine.evaluate(
      [rule({ fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: '6' })],
      { rb2_sponsor: SPONSOR, [INDUSTRY]: 6 },
    );

    expect(result.fieldVisibility['field-bank-letter']).toBe(false);
  });

  it('should_not_match_when_the_related_value_differs', async () => {
    const result = await engine.evaluate(
      [rule({ fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: '6' })],
      { rb2_sponsor: SPONSOR, [INDUSTRY]: 7 },
    );

    expect(result.fieldVisibility).toEqual({});
  });

  it('should_compare_related_numbers', async () => {
    const result = await engine.evaluate(
      [rule({ fieldId: 'rb2_sponsor', relatedAttribute: 'numberofemployees', operator: 'greaterThan', value: 100 })],
      { rb2_sponsor: SPONSOR, [EMPLOYEES]: 250 },
    );

    expect(result.fieldVisibility['field-bank-letter']).toBe(false);
  });

  it('should_treat_an_unread_related_column_as_empty', async () => {
    const result = await engine.evaluate(
      [rule({ fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'isEmpty' })],
      { rb2_sponsor: null, [INDUSTRY]: null },
    );

    expect(result.fieldVisibility['field-bank-letter']).toBe(false);
  });

  it('should_not_confuse_the_lookup_value_with_its_related_column', async () => {
    const result = await engine.evaluate(
      [rule({ fieldId: 'rb2_sponsor', relatedAttribute: 'industrycode', operator: 'equals', value: 'Al Khalij Commercial Bank' })],
      { rb2_sponsor: SPONSOR, [INDUSTRY]: 6 },
    );

    expect(result.fieldVisibility).toEqual({});
  });
});
