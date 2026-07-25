// DFE-CBTN-001 — ScopedButtonDesignService unit tests.
//
// Coverage:
//   - create() serialises visibleWhen/enabledWhen as JSON in the Dataverse payload
//   - create() omits the columns when undefined
//   - update() serialises when present, writes empty string to clear when null
//   - listByPlacement (mapRecord) parses JSON back into ButtonConditionSet
//   - mapRecord leaves visibleWhen/enabledWhen undefined for invalid / empty raw values
//   - validateButtonConditionSet rejects empty conditions array
//   - validateButtonConditionSet rejects missing fieldId
//   - validateButtonConditionSet rejects missing operator
//   - validateButtonConditionSet rejects missing value for operators that need one
//   - validateButtonConditionSet accepts isEmpty/isNotEmpty without a value
//   - validateButtonConditionSet passes a well-formed condition set

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScopedButtonDesignService,
  validateButtonConditionSet,
} from '@/services/ScopedButtonDesignService';
import { SCOPED_BUTTON_ATTRS } from '@/constants/buttonAttributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { ButtonConditionSet } from '@qdb/shared';

// ── Mock builder ───────────────────────────────────────────────────────────────

function buildMockWebApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
    updateRecordConditional: vi.fn(),
  } as unknown as IWebApiAdapter;
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const VALID_SET: ButtonConditionSet = {
  conditions: [{ fieldId: 'field-1', operator: 'equals', value: 'Submitted' }],
  logic: 'AND',
};

const MULTI_CONDITION_SET: ButtonConditionSet = {
  conditions: [
    { fieldId: 'field-1', operator: 'equals', value: 'Active' },
    { fieldId: 'field-2', operator: 'greaterThan', value: '0' },
  ],
  logic: 'OR',
};

const PLACEMENT_INPUT = {
  formDefinitionId: 'form-abc',
  placementScope: 'tab' as const,
  placementId: 'tab-xyz',
  label: 'Next',
  displayOrder: 0,
  isPrimary: true,
  isVisible: true,
  actionType: 'navigate' as const,
  actionConfigJson: '{"target":"nextStep"}',
};

// ── Suite: validateButtonConditionSet ─────────────────────────────────────────

describe('validateButtonConditionSet', () => {
  it('rejects_emptyConditionsArray', () => {
    const result = validateButtonConditionSet({ conditions: [], logic: 'AND' });
    expect(result).not.toBeNull();
    expect(result?.message).toContain('at least one condition');
  });

  it('rejects_conditionMissingFieldId', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: '', operator: 'equals', value: 'x' }],
      logic: 'AND',
    });
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/field is required/i);
  });

  it('rejects_conditionWithBlankFieldId', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: '   ', operator: 'equals', value: 'x' }],
      logic: 'AND',
    });
    expect(result).not.toBeNull();
  });

  it('rejects_conditionMissingValue_forEqualsOperator', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: 'f-1', operator: 'equals', value: '' }],
      logic: 'AND',
    });
    expect(result).not.toBeNull();
    expect(result?.message).toMatch(/value is required/i);
  });

  it('rejects_conditionMissingValue_forContainsOperator', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: 'f-1', operator: 'contains', value: undefined }],
      logic: 'AND',
    });
    expect(result).not.toBeNull();
  });

  it('accepts_isEmpty_withoutValue', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: 'f-1', operator: 'isEmpty' }],
      logic: 'AND',
    });
    expect(result).toBeNull();
  });

  it('accepts_isNotEmpty_withoutValue', () => {
    const result = validateButtonConditionSet({
      conditions: [{ fieldId: 'f-1', operator: 'isNotEmpty' }],
      logic: 'AND',
    });
    expect(result).toBeNull();
  });

  it('passes_wellFormedSingleCondition', () => {
    expect(validateButtonConditionSet(VALID_SET)).toBeNull();
  });

  it('passes_wellFormedMultiCondition', () => {
    expect(validateButtonConditionSet(MULTI_CONDITION_SET)).toBeNull();
  });

  it('rejects_secondConditionMissingValue', () => {
    const result = validateButtonConditionSet({
      conditions: [
        { fieldId: 'f-1', operator: 'equals', value: 'ok' },
        { fieldId: 'f-2', operator: 'greaterThan', value: '' },
      ],
      logic: 'AND',
    });
    expect(result).not.toBeNull();
    expect(result?.message).toContain('Condition 2');
  });
});

// ── Suite: create() ────────────────────────────────────────────────────────────

describe('ScopedButtonDesignService create()', () => {
  let webApi: IWebApiAdapter;
  let service: ScopedButtonDesignService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new ScopedButtonDesignService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'btn-1', entityType: 'qdb_form_scoped_button' });
  });

  it('create_serialisesVisibleWhen_intoJsonPayload', async () => {
    await service.create({ ...PLACEMENT_INPUT, visibleWhen: VALID_SET });

    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]).toBe(JSON.stringify(VALID_SET));
  });

  it('create_serialisesEnabledWhen_intoJsonPayload', async () => {
    await service.create({ ...PLACEMENT_INPUT, enabledWhen: MULTI_CONDITION_SET });

    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(payload[SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON]).toBe(JSON.stringify(MULTI_CONDITION_SET));
  });

  it('create_omitsVisibleConditionsJson_whenVisibleWhenUndefined', async () => {
    await service.create({ ...PLACEMENT_INPUT });

    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON in payload).toBe(false);
  });

  it('create_omitsEnabledConditionsJson_whenEnabledWhenUndefined', async () => {
    await service.create({ ...PLACEMENT_INPUT });

    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1];
    expect(SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON in payload).toBe(false);
  });

  it('create_throwsValidationError_forInvalidVisibleWhen', async () => {
    await expect(
      service.create({ ...PLACEMENT_INPUT, visibleWhen: { conditions: [], logic: 'AND' } }),
    ).rejects.toThrow(/at least one condition/i);
  });

  it('create_throwsValidationError_forMissingFieldId', async () => {
    await expect(
      service.create({
        ...PLACEMENT_INPUT,
        visibleWhen: { conditions: [{ fieldId: '', operator: 'equals', value: 'x' }], logic: 'AND' },
      }),
    ).rejects.toThrow(/field is required/i);
  });
});

// ── Suite: update() ────────────────────────────────────────────────────────────

describe('ScopedButtonDesignService update()', () => {
  let webApi: IWebApiAdapter;
  let service: ScopedButtonDesignService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new ScopedButtonDesignService(webApi);
    vi.mocked(webApi.updateRecord).mockResolvedValue(undefined);
  });

  it('update_serialisesVisibleWhen_intoJsonPayload', async () => {
    await service.update('btn-1', { visibleWhen: VALID_SET });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2];
    expect(payload[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]).toBe(JSON.stringify(VALID_SET));
  });

  it('update_writesEmptyString_whenVisibleWhenIsNull', async () => {
    await service.update('btn-1', { visibleWhen: null });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2];
    expect(payload[SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]).toBe('');
  });

  it('update_writesEmptyString_whenEnabledWhenIsNull', async () => {
    await service.update('btn-1', { enabledWhen: null });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2];
    expect(payload[SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON]).toBe('');
  });

  it('update_omitsConditionColumns_whenBothAreUndefined', async () => {
    await service.update('btn-1', { label: 'New label' });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2];
    expect(SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON in payload).toBe(false);
    expect(SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON in payload).toBe(false);
  });

  it('update_throwsValidationError_forInvalidConditionSet', async () => {
    await expect(
      service.update('btn-1', { enabledWhen: { conditions: [], logic: 'OR' } }),
    ).rejects.toThrow(/at least one condition/i);
  });
});

// ── Suite: listByPlacement / mapRecord ────────────────────────────────────────

describe('ScopedButtonDesignService listByPlacement (round-trip)', () => {
  let webApi: IWebApiAdapter;
  let service: ScopedButtonDesignService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new ScopedButtonDesignService(webApi);
  });

  function mockEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      [SCOPED_BUTTON_ATTRS.ID]: 'btn-1',
      [SCOPED_BUTTON_ATTRS.LABEL]: 'Next',
      [SCOPED_BUTTON_ATTRS.PLACEMENT_SCOPE]: 'tab',
      [SCOPED_BUTTON_ATTRS.DISPLAY_ORDER]: 0,
      [SCOPED_BUTTON_ATTRS.IS_PRIMARY]: false,
      [SCOPED_BUTTON_ATTRS.IS_VISIBLE]: true,
      [SCOPED_BUTTON_ATTRS.ACTION_TYPE]: 'navigate',
      [SCOPED_BUTTON_ATTRS.ACTION_CONFIG_JSON]: '{}',
      ...overrides,
    };
  }

  it('roundtrip_visibleWhen_parsedFromJson', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({
        [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: JSON.stringify(VALID_SET),
      })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toEqual(VALID_SET);
  });

  it('roundtrip_enabledWhen_parsedFromJson', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({
        [SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON]: JSON.stringify(MULTI_CONDITION_SET),
      })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.enabledWhen).toEqual(MULTI_CONDITION_SET);
  });

  it('mapRecord_leavesVisibleWhenUndefined_whenColumnAbsent', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity()],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toBeUndefined();
  });

  it('mapRecord_leavesVisibleWhenUndefined_whenColumnEmpty', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({ [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: '' })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toBeUndefined();
  });

  it('mapRecord_leavesVisibleWhenUndefined_forInvalidJson', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({ [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: 'not-json{{{' })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toBeUndefined();
  });

  it('mapRecord_leavesVisibleWhenUndefined_forJsonMissingConditionsArray', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({
        [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: JSON.stringify({ logic: 'AND' }),
      })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toBeUndefined();
  });

  it('mapRecord_leavesVisibleWhenUndefined_forJsonWithInvalidLogic', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({
        [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: JSON.stringify({ conditions: [], logic: 'MAYBE' }),
      })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toBeUndefined();
  });

  it('roundtrip_bothConditionSets_simultaneously', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [mockEntity({
        [SCOPED_BUTTON_ATTRS.VISIBLE_CONDITIONS_JSON]: JSON.stringify(VALID_SET),
        [SCOPED_BUTTON_ATTRS.ENABLED_CONDITIONS_JSON]: JSON.stringify(MULTI_CONDITION_SET),
      })],
    });

    const [btn] = await service.listByPlacement('tab', 'tab-xyz');
    expect(btn.visibleWhen).toEqual(VALID_SET);
    expect(btn.enabledWhen).toEqual(MULTI_CONDITION_SET);
  });
});
