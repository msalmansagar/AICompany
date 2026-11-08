import { describe, it, expect } from 'vitest';
import { RuleEngine } from './RuleEngine';
import type { BusinessRule, BusinessRuleAction } from '@qdb/shared';

function columnRule(action: BusinessRuleAction, overrides: Partial<BusinessRule> = {}): BusinessRule {
  return {
    id: `rule-${action}`,
    name: action,
    conditions: [{ fieldId: 'request_type', operator: 'equals', value: 'import' }],
    conditionsLogic: 'AND',
    action,
    targetFieldId: 'grid-items',
    targetColumnId: 'col-hs-code',
    priority: 1,
    isActive: true,
    ...overrides,
  };
}

describe('RuleEngine grid column actions', () => {
  const engine = new RuleEngine();

  it('should_hide_the_column_when_the_condition_holds', async () => {
    const result = await engine.evaluate([columnRule('hideColumn')], { request_type: 'import' });

    expect(result.gridColumnState).toEqual({ 'grid-items': { 'col-hs-code': { isVisible: false } } });
  });

  it('should_combine_several_actions_on_one_column', async () => {
    const result = await engine.evaluate([
      columnRule('showColumn'),
      columnRule('makeColumnRequired'),
      columnRule('makeColumnReadonly'),
    ], { request_type: 'import' });

    expect(result.gridColumnState['grid-items']!['col-hs-code']).toEqual({
      isVisible: true, isRequired: true, isReadonly: true,
    });
  });

  it('should_set_optional_and_editable_as_false_flags', async () => {
    const result = await engine.evaluate([
      columnRule('makeColumnOptional'),
      columnRule('makeColumnEditable'),
    ], { request_type: 'import' });

    expect(result.gridColumnState['grid-items']!['col-hs-code']).toEqual({ isRequired: false, isReadonly: false });
  });

  it('should_leave_the_column_untouched_when_the_condition_fails', async () => {
    const result = await engine.evaluate([columnRule('hideColumn')], { request_type: 'export' });

    expect(result.gridColumnState).toEqual({});
  });

  it('should_ignore_a_column_action_that_names_no_column', async () => {
    const result = await engine.evaluate(
      [columnRule('hideColumn', { targetColumnId: undefined })],
      { request_type: 'import' },
    );

    expect(result.gridColumnState).toEqual({});
  });
});
