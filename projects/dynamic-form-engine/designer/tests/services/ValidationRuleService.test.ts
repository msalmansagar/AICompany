import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidationRuleService } from '@/services/ValidationRuleService';
import { FORM_VALIDATION_RULE_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const FIELD_ID = '00000000-0000-0000-0000-000000000001';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

describe('ValidationRuleService priority boundary', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: ValidationRuleService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new ValidationRuleService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'rule-1', entityType: 'qdb_form_validation_rule' });
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
  });

  // Regression: Dataverse qdb_priority requires a minimum of 1; a 0-based
  // sortOrder of 0 previously produced qdb_priority=0 → 400 on the first rule.
  it('create_writesPriorityOne_forFirstRule', async () => {
    await service.createRule({
      fieldId: FIELD_ID, ruleType: 'required', ruleValue: null,
      errorMessage: 'Required', sortOrder: 0,
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
    expect(payload[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER]).toBe(1);
  });

  it('create_writesPriorityTwo_forSecondRule', async () => {
    await service.createRule({
      fieldId: FIELD_ID, ruleType: 'required', ruleValue: null,
      errorMessage: 'Required', sortOrder: 1,
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
    expect(payload[FORM_VALIDATION_RULE_ATTRS.SORT_ORDER]).toBe(2);
  });

  it('read_mapsPriorityOne_backToSortOrderZero', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [FORM_VALIDATION_RULE_ATTRS.ID]: 'rule-1',
        [FORM_VALIDATION_RULE_ATTRS.RULE_TYPE]: 100000001,
        [FORM_VALIDATION_RULE_ATTRS.SORT_ORDER]: 1,
      }],
    });
    const [rule] = await service.listRulesForField(FIELD_ID);
    expect(rule.sortOrder).toBe(0);
  });
});
