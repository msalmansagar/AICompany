// A designer-authored rule kept its action and target only inside qdb_conditions_json. The
// structured columns were left at whatever Dataverse defaulted them to — on a seeded hide_tab
// rule, qdb_action read 100000001 (showField) with no target. The runtime was right, because
// the designer path ignores those columns; everything else that reads the record was not.
//
// They are now written from the definition, so the record says what the rule does and a tab
// target is a real lookup rather than a GUID buried in a string.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleService } from '@/services/BusinessRuleService';
import { FORM_BUSINESS_RULE_ATTRS, BUSINESS_RULE_ACTION_VALUE } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { BusinessRuleDefinition, RuleAction } from '@/types/businessRule';

const FORM_ID = '00000000-0000-0000-0000-0000000000f1';
const RULE_ID = '00000000-0000-0000-0000-0000000000r1';
const TAB_ID = '11111111-1111-1111-1111-111111111111';
const SECTION_ID = '22222222-2222-2222-2222-222222222222';
const FIELD_ID = '33333333-3333-3333-3333-333333333333';

const TAB_BIND = `${FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID}@odata.bind`;
const SECTION_BIND = `${FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID}@odata.bind`;
const FIELD_BIND = `${FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID}@odata.bind`;

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

function definitionWith(actions: RuleAction[]): BusinessRuleDefinition {
  return {
    version: '1.0',
    trigger_field_code: 'qdb_partner',
    trigger_event: 'on_change',
    condition_group: {
      logical_operator: 'AND',
      conditions: [{ field_code: 'qdb_partner', operator: 'equals', value: 'x' }],
    },
    actions,
  };
}

describe('BusinessRuleService — structured action mirror', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: BusinessRuleService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new BusinessRuleService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: RULE_ID, entityType: 'qdb_form_business_rule' });
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
  });

  async function createPayload(actions: RuleAction[], fieldCodeToId?: Map<string, string>) {
    await service.createRule({
      formId: FORM_ID, name: 'Rule', isActive: true, sortOrder: 0,
      definition: definitionWith(actions), fieldCodeToId,
    });
    return vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
  }

  it('writesHideTab_withTheTabAsARealLookup', async () => {
    const payload = await createPayload([{ action_type: 'hide_tab', target_tab_id: TAB_ID }]);

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBe(BUSINESS_RULE_ACTION_VALUE['hide_tab']);
    expect(payload[TAB_BIND]).toBe(`/qdb_form_tabs(${TAB_ID})`);
  });

  it('leavesTheOtherTargets_nullForATabAction', async () => {
    const payload = await createPayload([{ action_type: 'hide_tab', target_tab_id: TAB_ID }]);

    expect(payload[FIELD_BIND]).toBeNull();
    expect(payload[SECTION_BIND]).toBeNull();
  });

  it('writesHideSection_withTheSectionAsARealLookup', async () => {
    const payload = await createPayload([{ action_type: 'hide_section', target_section_id: SECTION_ID }]);

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBe(BUSINESS_RULE_ACTION_VALUE['hide_section']);
    expect(payload[SECTION_BIND]).toBe(`/qdb_form_sections(${SECTION_ID})`);
  });

  // Field actions name a code; the column is a lookup, so it needs the map.
  it('resolvesAFieldTargetCode_toItsRecordId', async () => {
    const payload = await createPayload(
      [{ action_type: 'hide_field', target_field_code: 'qdb_employer' }],
      new Map([['qdb_employer', FIELD_ID]]),
    );

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBe(BUSINESS_RULE_ACTION_VALUE['hide_field']);
    expect(payload[FIELD_BIND]).toBe(`/qdb_form_fields(${FIELD_ID})`);
  });

  // An action with no target beats an action pointing at the wrong record.
  it('stillWritesTheAction_whenTheFieldCodeCannotBeResolved', async () => {
    const payload = await createPayload([{ action_type: 'hide_field', target_field_code: 'qdb_unknown' }]);

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBe(BUSINESS_RULE_ACTION_VALUE['hide_field']);
    expect(payload[FIELD_BIND]).toBeNull();
  });

  // The columns hold ONE action; the designer format holds many. Mirroring only the first
  // would state something the rule does not do.
  it('clearsEveryColumn_whenTheRuleHasMoreThanOneAction', async () => {
    const payload = await createPayload([
      { action_type: 'hide_tab', target_tab_id: TAB_ID },
      { action_type: 'hide_field', target_field_code: 'qdb_employer' },
    ]);

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBeNull();
    expect(payload[TAB_BIND]).toBeNull();
    expect(payload[FIELD_BIND]).toBeNull();
  });

  it('clearsEveryColumn_forAnActionTheColumnsCannotExpress', async () => {
    const payload = await createPayload([{ action_type: 'show_message', value: 'hello' }]);

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBeNull();
  });

  // The mirror is derived, so it must be rewritten whenever the definition is — otherwise
  // the columns keep describing the rule's previous action.
  it('rewritesTheMirror_whenTheDefinitionChanges', async () => {
    await service.updateRule(RULE_ID, {
      definition: definitionWith([{ action_type: 'show_tab', target_tab_id: TAB_ID }]),
    });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2] as Record<string, unknown>;

    expect(payload[FORM_BUSINESS_RULE_ATTRS.ACTION]).toBe(BUSINESS_RULE_ACTION_VALUE['show_tab']);
    expect(payload[TAB_BIND]).toBe(`/qdb_form_tabs(${TAB_ID})`);
  });

  it('leavesTheMirrorAlone_whenOnlyTheNameChanges', async () => {
    await service.updateRule(RULE_ID, { name: 'Renamed' });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2] as Record<string, unknown>;

    expect(payload).not.toHaveProperty(FORM_BUSINESS_RULE_ATTRS.ACTION);
    expect(payload).not.toHaveProperty(TAB_BIND);
  });
});
