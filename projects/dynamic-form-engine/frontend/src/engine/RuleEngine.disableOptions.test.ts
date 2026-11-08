import { describe, it, expect } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { BusinessRule } from '@qdb/shared';

function disableRule(actionValue: string): BusinessRule {
  return {
    id: 'rule-1',
    name: 'Disable premium tiers for individuals',
    conditions: [{ fieldId: 'applicant_type', operator: 'equals', value: 'individual' }],
    conditionsLogic: 'AND',
    action: 'disableOptions',
    targetFieldId: 'field-tier',
    actionValue,
    priority: 1,
    isActive: true,
  };
}

describe('RuleEngine disableOptions', () => {
  const engine = new RuleEngine();

  it('should_list_the_disabled_option_values_when_the_condition_holds', async () => {
    const result = await engine.evaluate([disableRule('["gold","platinum"]')], { applicant_type: 'individual' });

    expect(result.disabledOptions['field-tier']).toEqual(['gold', 'platinum']);
  });

  it('should_accept_a_comma_separated_list', async () => {
    const result = await engine.evaluate([disableRule('gold, platinum')], { applicant_type: 'individual' });

    expect(result.disabledOptions['field-tier']).toEqual(['gold', 'platinum']);
  });

  it('should_stringify_numeric_option_values', async () => {
    const result = await engine.evaluate([disableRule('[100000001, 100000002]')], { applicant_type: 'individual' });

    expect(result.disabledOptions['field-tier']).toEqual(['100000001', '100000002']);
  });

  it('should_disable_nothing_when_the_condition_fails', async () => {
    const result = await engine.evaluate([disableRule('["gold"]')], { applicant_type: 'company' });

    expect(result.disabledOptions).toEqual({});
  });

  it('should_return_an_empty_map_when_no_rules_are_active', async () => {
    const result = await engine.evaluate([], {});

    expect(result.disabledOptions).toEqual({});
  });
});
