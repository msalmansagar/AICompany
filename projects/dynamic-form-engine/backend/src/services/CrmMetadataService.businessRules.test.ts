import { describe, it, expect } from 'vitest';
import { LRUCache } from 'lru-cache';
import { CrmMetadataService } from './CrmMetadataService.js';

// DFE-BRJSON-FIX — the designer serialises a whole rule (BusinessRuleDefinition, schema codes,
// nested actions) into qdb_conditions_json, while legacy/seed rows use a flat conditions array
// plus the structured qdb_action / qdb_target_field columns. fetchBusinessRules must read both.

const mockAuthService = { getAccessToken: () => Promise.resolve('t') } as never;
function service(): any {
  return new CrmMetadataService(mockAuthService, new LRUCache({ max: 1, ttl: 1 }) as never);
}

const SCHEMA_TO_GUID = new Map<string, string>([
  ['empStatus', 'guid-trigger'],
  ['employer', 'guid-target'],
]);
const GUID_TO_SCHEMA = new Map<string, string>([
  ['guid-trigger', 'empStatus'],
  ['guid-target', 'employer'],
]);

function designerRow(overrides: Record<string, unknown> = {}) {
  const def = {
    version: '1.0',
    trigger_field_code: 'empStatus',
    trigger_event: 'on_change',
    condition_group: { logical_operator: 'AND', conditions: [{ field_code: 'empStatus', operator: 'equals', value: 'unemployed' }] },
    actions: [{ action_type: 'hide_field', target_field_code: 'employer' }],
    ...overrides,
  };
  return { qdb_form_business_ruleid: 'r1', qdb_name: 'R', qdb_conditions_json: JSON.stringify(def), qdb_priority: 10 };
}

describe('business-rule conversion — designer format', () => {
  it('converts a designer rule into a runtime rule with resolved GUID target', () => {
    const { triggerGuid, rules } = service().convertDesignerRule(designerRow(), SCHEMA_TO_GUID);
    expect(triggerGuid).toBe('guid-trigger');
    expect(rules).toHaveLength(1);
    expect(rules[0].action).toBe('hideField');
    expect(rules[0].targetFieldId).toBe('guid-target'); // resolved from target_field_code
    expect(rules[0].conditions).toEqual([{ fieldId: 'empStatus', operator: 'equals', value: 'unemployed' }]);
    expect(rules[0].conditionsLogic).toBe('AND');
  });

  it('maps snake_case operators and actions to the runtime vocab', () => {
    const row = designerRow({
      condition_group: { logical_operator: 'OR', conditions: [{ field_code: 'empStatus', operator: 'not_equals', value: 'x' }] },
      actions: [{ action_type: 'set_required', target_field_code: 'employer' }],
    });
    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);
    expect(rules[0].conditions[0].operator).toBe('notEquals');
    expect(rules[0].action).toBe('makeRequired');
    expect(rules[0].conditionsLogic).toBe('OR');
  });

  it('emits one runtime rule per action', () => {
    const row = designerRow({ actions: [
      { action_type: 'hide_field', target_field_code: 'employer' },
      { action_type: 'set_required', target_field_code: 'employer' },
    ] });
    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);
    expect(rules.map((r: { action: string }) => r.action)).toEqual(['hideField', 'makeRequired']);
  });

  it('skips actions with no runtime equivalent (e.g. show_message)', () => {
    const row = designerRow({ actions: [{ action_type: 'show_message', target_field_code: 'employer', value: 'hi' }] });
    const { rules } = service().convertDesignerRule(row, SCHEMA_TO_GUID);
    expect(rules).toHaveLength(0);
  });

  it('returns null for the legacy flat-array format (falls through to legacy path)', () => {
    const row = { qdb_form_business_ruleid: 'r2', qdb_name: 'L', qdb_conditions_json: JSON.stringify([{ fieldId: 'guid-trigger', operator: 'equals', value: 'y' }]) };
    expect(service().convertDesignerRule(row, SCHEMA_TO_GUID)).toBeNull();
  });
});

describe('business-rule conversion — legacy format', () => {
  it('reads action + target from structured columns and resolves the trigger GUID', () => {
    const row = {
      qdb_form_business_ruleid: 'r3', qdb_name: 'Legacy',
      qdb_conditions_json: JSON.stringify([{ fieldId: 'guid-trigger', operator: 'equals', value: 'unemployed' }]),
      qdb_action: 100000002, // hideField
      _qdb_target_field_id_value: 'guid-target',
      qdb_priority: 5,
    };
    const { triggerGuid, rules } = service().convertLegacyRule(row, GUID_TO_SCHEMA);
    expect(triggerGuid).toBe('guid-trigger');
    expect(rules[0].action).toBe('hideField');
    expect(rules[0].targetFieldId).toBe('guid-target');
    expect(rules[0].conditions[0].fieldId).toBe('empStatus'); // GUID resolved to schema
  });
});
