import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleService } from '@/services/BusinessRuleService';
import { FORM_BUSINESS_RULE_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { BusinessRuleDefinition } from '@/types/businessRule';

const FORM_ID = '00000000-0000-0000-0000-000000000002';

const DEFINITION: BusinessRuleDefinition = {
  version: '1.0',
  trigger_field_code: 'first_name',
  trigger_event: 'on_change',
  condition_group: { logical_operator: 'AND', conditions: [] },
  actions: [],
};

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

describe('BusinessRuleService priority boundary', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: BusinessRuleService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new BusinessRuleService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'br-1', entityType: 'qdb_form_business_rule' });
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
  });

  // Regression: Dataverse qdb_priority requires a minimum of 1; a 0-based
  // sortOrder of 0 previously produced qdb_priority=0 → 400 on the first rule.
  it('create_writesPriorityOne_forFirstRule', async () => {
    await service.createRule({
      formId: FORM_ID, name: 'Rule A', isActive: true, sortOrder: 0, definition: DEFINITION,
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
    expect(payload[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]).toBe(1);
  });

  it('create_writesPriorityTwo_forSecondRule', async () => {
    await service.createRule({
      formId: FORM_ID, name: 'Rule B', isActive: true, sortOrder: 1, definition: DEFINITION,
    });
    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
    expect(payload[FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]).toBe(2);
  });

  it('read_mapsPriorityOne_backToSortOrderZero', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValueOnce({
      entities: [{
        [FORM_BUSINESS_RULE_ATTRS.ID]: 'br-1',
        [FORM_BUSINESS_RULE_ATTRS.NAME]: 'Rule A',
        [FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]: true,
        [FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]: 1,
      }],
    });
    const [rule] = await service.listRulesForForm(FORM_ID);
    expect(rule.sortOrder).toBe(0);
  });
});
