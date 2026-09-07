// 21 of the 31 rules in org5869857f are legacy-format: a flat conditions array in
// qdb_conditions_json, with the action and target in the structured columns.
//
// Loading one used to produce a BLANK rule — normaliseDefinition saw an array with no
// trigger_field_code and no actions, so it returned its defaults. The designer displayed that
// blank, and saving wrote it over the real rule. Both the conditions and the action were lost.
// Adding the action mirror made it worse: the structured columns are now overwritten too, so
// nothing survived at all.
//
// The rule is now rebuilt from those columns on load.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleService } from '@/services/BusinessRuleService';
import { FORM_BUSINESS_RULE_ATTRS, BUSINESS_RULE_ACTION_VALUE } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

const FORM_ID = '00000000-0000-0000-0000-0000000000f1';
const RULE_ID = '00000000-0000-0000-0000-0000000000r1';
const TRIGGER_FIELD_ID = '951a1bf1-2b64-f111-a826-7ced8d8fec2d';
const TARGET_FIELD_ID = '741640d2-a164-f111-a826-7c1e52512216';
const SECTION_ID = '964a06d6-cc5b-f111-a826-7ced8d8fec2d';
const TAB_ID = 'de426bc1-898a-f111-ab10-000d3abd8313';

const FIELD_ID_TO_CODE = new Map([
  [TRIGGER_FIELD_ID, 'qdb_employment_status'],
  [TARGET_FIELD_ID, 'qdb_job_title'],
]);

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

/** A legacy record shaped exactly like the ones in the org. */
function legacyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [FORM_BUSINESS_RULE_ATTRS.ID]: RULE_ID,
    [FORM_BUSINESS_RULE_ATTRS.FORM_ID_VALUE]: FORM_ID,
    [FORM_BUSINESS_RULE_ATTRS.NAME]: 'Hide Job Title when Unemployed',
    [FORM_BUSINESS_RULE_ATTRS.IS_ACTIVE]: true,
    [FORM_BUSINESS_RULE_ATTRS.SORT_ORDER]: 1,
    [FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION]:
      `[{"fieldId":"${TRIGGER_FIELD_ID}","operator":"equals","value":"unemployed"}]`,
    [FORM_BUSINESS_RULE_ATTRS.ACTION]: BUSINESS_RULE_ACTION_VALUE['hide_field'],
    [FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE]: TARGET_FIELD_ID,
    ...overrides,
  };
}

describe('BusinessRuleService — legacy rule import', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: BusinessRuleService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new BusinessRuleService(webApi);
  });

  async function loadOne(record: Record<string, unknown>, map = FIELD_ID_TO_CODE) {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [record] });
    const [rule] = await service.listRulesForForm(FORM_ID, map);
    return rule!;
  }

  it('recoversTheConditions_insteadOfReturningABlankRule', async () => {
    const rule = await loadOne(legacyRecord());

    expect(rule.definition.condition_group.conditions).toEqual([
      { field_code: 'qdb_employment_status', operator: 'equals', value: 'unemployed' },
    ]);
  });

  it('recoversTheAction', async () => {
    const rule = await loadOne(legacyRecord());

    expect(rule.definition.actions[0]?.action_type).toBe('hide_field');
  });

  it('resolvesTheTargetFieldId_toItsCode', async () => {
    const rule = await loadOne(legacyRecord());

    expect(rule.definition.actions[0]?.target_field_code).toBe('qdb_job_title');
  });

  // The plugin attaches a rule to the field that TRIGGERS it, not the one it acts on.
  it('setsTheTrigger_fromTheFirstCondition', async () => {
    const rule = await loadOne(legacyRecord());

    expect(rule.definition.trigger_field_code).toBe('qdb_employment_status');
  });

  it('recoversASectionTarget', async () => {
    const rule = await loadOne(legacyRecord({
      [FORM_BUSINESS_RULE_ATTRS.ACTION]: BUSINESS_RULE_ACTION_VALUE['hide_section'],
      [FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE]: null,
      [FORM_BUSINESS_RULE_ATTRS.TARGET_SECTION_ID_VALUE]: SECTION_ID,
    }));

    expect(rule.definition.actions[0]?.action_type).toBe('hide_section');
    expect(rule.definition.actions[0]?.target_section_id).toBe(SECTION_ID);
  });

  it('recoversATabTarget', async () => {
    const rule = await loadOne(legacyRecord({
      [FORM_BUSINESS_RULE_ATTRS.ACTION]: BUSINESS_RULE_ACTION_VALUE['hide_tab'],
      [FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE]: null,
      [FORM_BUSINESS_RULE_ATTRS.TARGET_TAB_ID_VALUE]: TAB_ID,
    }));

    expect(rule.definition.actions[0]?.target_tab_id).toBe(TAB_ID);
  });

  it('readsTheOrLogicCode', async () => {
    const rule = await loadOne(legacyRecord({ [FORM_BUSINESS_RULE_ATTRS.CONDITIONS_LOGIC]: 100000001 }));

    expect(rule.definition.condition_group.logical_operator).toBe('OR');
  });

  it('defaultsToAndLogic_whenTheCodeIsAbsent', async () => {
    const rule = await loadOne(legacyRecord());

    expect(rule.definition.condition_group.logical_operator).toBe('AND');
  });

  it('carriesTheActionValue_forASetValueRule', async () => {
    const rule = await loadOne(legacyRecord({
      [FORM_BUSINESS_RULE_ATTRS.ACTION]: BUSINESS_RULE_ACTION_VALUE['set_value'],
      [FORM_BUSINESS_RULE_ATTRS.ACTION_VALUE]: '300',
    }));

    expect(rule.definition.actions[0]?.value).toBe('300');
  });

  // Inventing a code would silently point the rule at the wrong field. Leaving the raw id
  // lets lint rule L005 report it as an unknown field code.
  it('keepsAnUnresolvableFieldId_ratherThanGuessing', async () => {
    const rule = await loadOne(legacyRecord(), new Map());

    expect(rule.definition.condition_group.conditions[0]?.field_code).toBe(TRIGGER_FIELD_ID);
  });

  // 12 of the org's legacy rules have no target at all — they already do nothing at runtime.
  it('importsARuleWithNoTarget_withoutInventingOne', async () => {
    const rule = await loadOne(legacyRecord({ [FORM_BUSINESS_RULE_ATTRS.TARGET_FIELD_ID_VALUE]: null }));

    expect(rule.definition.actions[0]?.target_field_code).toBeUndefined();
    expect(rule.definition.actions[0]?.target_tab_id).toBeUndefined();
  });

  // A designer-format rule must be left exactly as it is.
  it('leavesADesignerFormatRuleUntouched', async () => {
    const designerJson = {
      version: '1.0',
      trigger_field_code: 'qdb_partner',
      trigger_event: 'on_change',
      condition_group: {
        logical_operator: 'AND',
        conditions: [{ field_code: 'qdb_partner', operator: 'equals', value: 'QNB' }],
      },
      actions: [{ action_type: 'hide_tab', target_tab_id: TAB_ID }],
    };
    const rule = await loadOne(legacyRecord({
      [FORM_BUSINESS_RULE_ATTRS.RULE_DEFINITION]: JSON.stringify(designerJson),
    }));

    expect(rule.definition).toEqual(designerJson);
  });
});
