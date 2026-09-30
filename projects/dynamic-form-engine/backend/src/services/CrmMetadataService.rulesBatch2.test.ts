import { describe, it, expect } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';

// DFE-RULES-002 (enhancement half): the designer's calculate_value and disable_options
// actions must survive publishing, and the qdb_rule_json column the designer writes for
// conditional-required and cross-field rules must be read rather than ignored.

const mockAuthService = { getAccessToken: () => Promise.resolve('t') } as never;
function service(): any {
  return new CrmMetadataService(mockAuthService, new LRUCache({ max: 1, ttl: 1 }) as never);
}

const SCHEMA_TO_GUID = new Map<string, string>([
  ['quantity', 'guid-quantity'],
  ['total', 'guid-total'],
  ['tier', 'guid-tier'],
]);

function designerRow(actions: Array<Record<string, unknown>>) {
  const def = {
    version: '1.0',
    trigger_field_code: 'quantity',
    trigger_event: 'on_change',
    condition_group: { logical_operator: 'AND', conditions: [{ field_code: 'quantity', operator: 'is_not_empty', value: null }] },
    actions,
  };
  return { qdb_form_business_ruleid: 'r1', qdb_name: 'R', qdb_conditions_json: JSON.stringify(def), qdb_priority: 10 };
}

describe('designer actions added for DFE-RULES-002', () => {
  it('should_publish_calculate_value_with_its_expression', () => {
    const row = designerRow([{ action_type: 'calculate_value', target_field_code: 'total', value: '{quantity} * 1.1' }]);

    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);

    expect(rules).toEqual([expect.objectContaining({
      action: 'calculateValue',
      targetFieldId: 'guid-total',
      actionValue: '{quantity} * 1.1',
    })]);
  });

  it('should_publish_disable_options_with_the_option_list', () => {
    const row = designerRow([{ action_type: 'disable_options', target_field_code: 'tier', value: '["gold","platinum"]' }]);

    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);

    expect(rules).toEqual([expect.objectContaining({
      action: 'disableOptions',
      targetFieldId: 'guid-tier',
      actionValue: '["gold","platinum"]',
    })]);
  });
});

function validationRow(overrides: Record<string, unknown> = {}) {
  return {
    qdb_form_validation_ruleid: 'v1',
    _qdb_form_field_id_value: 'guid-end',
    qdb_rule_type: 100000011,
    qdb_error_message: 'End date cannot be before start date',
    qdb_priority: 5,
    ...overrides,
  };
}

describe('validation rule JSON (qdb_rule_json)', () => {
  it('should_read_the_cross_field_operator_and_target', () => {
    const row = validationRow({
      qdb_rule_json: JSON.stringify({ schemaVersion: 2, type: 'cross_field', operator: '>=', targetFieldRef: 'start_date' }),
    });

    const rule = service().mergeRuleWithTemplate(row);

    expect(rule.ruleType).toBe('crossField');
    expect(rule.crossFieldOperator).toBe('>=');
    expect(rule.crossFieldTargetRef).toBe('start_date');
  });

  it('should_carry_a_relative_date_target_verbatim', () => {
    const row = validationRow({
      qdb_rule_json: JSON.stringify({ schemaVersion: 2, type: 'cross_field', operator: '<=', targetFieldRef: '@monthEnd+10y' }),
    });

    const rule = service().mergeRuleWithTemplate(row);

    expect(rule.crossFieldTargetRef).toBe('@monthEnd+10y');
  });

  it('should_read_conditional_required_conditions', () => {
    const conditions = [{ fieldRef: 'loan_type', operator: 'equals', value: 'secured' }];
    const row = validationRow({
      qdb_rule_type: 100000001,
      qdb_rule_json: JSON.stringify({ schemaVersion: 2, type: 'conditional_required', conditions }),
    });

    const rule = service().mergeRuleWithTemplate(row);

    expect(rule.conditions).toEqual(conditions);
  });

  it('should_publish_a_legacy_row_without_structured_fields', () => {
    const rule = service().mergeRuleWithTemplate(validationRow());

    expect(rule).not.toHaveProperty('conditions');
    expect(rule).not.toHaveProperty('crossFieldOperator');
  });

  it('should_ignore_a_corrupt_payload', () => {
    const rule = service().mergeRuleWithTemplate(validationRow({ qdb_rule_json: '{not json' }));

    expect(rule).not.toHaveProperty('crossFieldOperator');
  });
});

describe('grid column actions (DFE-RULES-002 item 1)', () => {
  const GRID_SCHEMA = new Map([['items', 'guid-grid'], ['quantity', 'guid-quantity']]);

  function columnRow(action: Record<string, unknown>) {
    return {
      qdb_form_business_ruleid: 'r-col', qdb_name: 'Column rule', qdb_priority: 10,
      qdb_conditions_json: JSON.stringify({
        version: '1.0', trigger_field_code: 'quantity', trigger_event: 'on_change',
        condition_group: { logical_operator: 'AND', conditions: [{ field_code: 'quantity', operator: 'is_not_empty', value: null }] },
        actions: [action],
      }),
    };
  }

  it('should_publish_the_grid_and_column_targets', () => {
    const row = columnRow({ action_type: 'hide_column', target_field_code: 'items', target_column_id: 'col-1' });

    const { rules } = service().convertDesignerRule(row, GRID_SCHEMA);

    expect(rules).toEqual([expect.objectContaining({ action: 'hideColumn', targetFieldId: 'guid-grid', targetColumnId: 'col-1' })]);
  });

  it.each([
    ['show_column', 'showColumn'], ['make_column_required', 'makeColumnRequired'],
    ['make_column_optional', 'makeColumnOptional'], ['make_column_readonly', 'makeColumnReadonly'],
    ['make_column_editable', 'makeColumnEditable'],
  ])('should_map_%s_to_%s', (designerAction, runtimeAction) => {
    const row = columnRow({ action_type: designerAction, target_field_code: 'items', target_column_id: 'col-1' });

    const { rules } = service().convertDesignerRule(row, GRID_SCHEMA);

    expect(rules[0].action).toBe(runtimeAction);
  });

  it('should_drop_a_column_action_without_a_column', () => {
    const row = columnRow({ action_type: 'hide_column', target_field_code: 'items' });

    const { rules } = service().convertDesignerRule(row, GRID_SCHEMA);

    expect(rules).toHaveLength(0);
  });
});

describe('radio render style (DFE-RULES-002 item 7)', () => {
  it.each([[100000000, 'list'], [100000001, 'cards'], [100000002, 'rating'], [undefined, 'list']])(
    'should_map_option_%s_to_%s',
    (code, style) => {
      expect(service().mapRadioRenderStyle(code)).toBe(style);
    },
  );
});

describe('related-record conditions (DFE-RULES-002 item 2)', () => {
  it('should_publish_the_related_column_of_a_lookup_condition', () => {
    const row = {
      qdb_form_business_ruleid: 'r-rel', qdb_name: 'Sponsor industry', qdb_priority: 10,
      qdb_conditions_json: JSON.stringify({
        version: '1.0', trigger_field_code: 'quantity', trigger_event: 'on_change',
        condition_group: { logical_operator: 'AND', conditions: [
          { field_code: 'quantity', operator: 'equals', value: '6', related_attribute: 'industrycode' },
        ] },
        actions: [{ action_type: 'hide_field', target_field_code: 'total' }],
      }),
    };

    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);

    expect(rules[0].conditions[0]).toMatchObject({ fieldId: 'quantity', relatedAttribute: 'industrycode' });
  });
});
