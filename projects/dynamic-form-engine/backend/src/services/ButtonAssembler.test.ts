import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock — replaces pino logger with silent spy functions for all tests in this file.
vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ButtonAssembler, type RawScopedButton } from './ButtonAssembler.js';
import { logger } from '../utils/logger.js';

function rawButton(overrides: Partial<RawScopedButton> = {}): RawScopedButton {
  return {
    qdb_form_scoped_buttonid: 'btn-1',
    qdb_placement_scope: 'tab',
    _qdb_tab_id_value: 'tab-1',
    qdb_label: 'Next',
    qdb_display_order: 0,
    qdb_action_type: 'navigate',
    qdb_action_config_json: JSON.stringify({ target: 'nextStep' }),
    statecode: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ButtonAssembler.mapRawButton', () => {
  it('maps_a_tab_scoped_navigate_button', () => {
    const button = ButtonAssembler.mapRawButton(rawButton());
    expect(button).not.toBeNull();
    expect(button?.placementScope).toBe('tab');
    expect(button?.placementId).toBe('tab-1');
    expect(button?.action).toEqual({ type: 'navigate', target: 'nextStep' });
  });

  it('maps_a_section_scoped_button_using_the_section_id', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_placement_scope: 'section', _qdb_section_id_value: 'sec-9', _qdb_tab_id_value: null }),
    );
    expect(button?.placementScope).toBe('section');
    expect(button?.placementId).toBe('sec-9');
  });

  it('parses_a_finalSubmit_action_with_extraParams', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({
        qdb_action_type: 'finalSubmit',
        qdb_action_config_json: JSON.stringify({
          extraParams: [{ key: 'channel', source: 'static', staticValue: 'portal' }],
        }),
      }),
    );
    expect(button?.action.type).toBe('finalSubmit');
    expect(button?.action).toMatchObject({ extraParams: [{ key: 'channel' }] });
  });

  it('defaults_finalSubmit_extraParams_to_empty_array_when_absent', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_action_type: 'finalSubmit', qdb_action_config_json: '{}' }),
    );
    expect(button?.action).toEqual({ type: 'finalSubmit', extraParams: [] });
  });

  it('maps_saveDraft_with_no_config_json', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_action_type: 'saveDraft', qdb_action_config_json: null }),
    );
    expect(button?.action).toEqual({ type: 'saveDraft' });
  });

  it('drops_an_inactive_record', () => {
    expect(ButtonAssembler.mapRawButton(rawButton({ statecode: 1 }))).toBeNull();
  });

  it('drops_a_record_with_no_placement_id', () => {
    expect(
      ButtonAssembler.mapRawButton(rawButton({ _qdb_tab_id_value: null, _qdb_section_id_value: null })),
    ).toBeNull();
  });

  it('drops_a_record_with_an_unknown_action_type', () => {
    expect(ButtonAssembler.mapRawButton(rawButton({ qdb_action_type: 'explode' }))).toBeNull();
  });

  it('drops_a_record_with_malformed_action_json', () => {
    expect(
      ButtonAssembler.mapRawButton(rawButton({ qdb_action_config_json: '{not valid json' })),
    ).toBeNull();
  });

  it('drops_a_navigate_tab_button_missing_targetTabId (M2 validation)', () => {
    expect(
      ButtonAssembler.mapRawButton(
        rawButton({ qdb_action_type: 'navigate', qdb_action_config_json: JSON.stringify({ target: 'tab' }) }),
      ),
    ).toBeNull();
  });

  it('drops_a_navigate_button_with_an_invalid_target', () => {
    expect(
      ButtonAssembler.mapRawButton(
        rawButton({ qdb_action_type: 'navigate', qdb_action_config_json: JSON.stringify({ target: 'teleport' }) }),
      ),
    ).toBeNull();
  });

  it('drops_a_callApi_button_missing_endpointKey', () => {
    expect(
      ButtonAssembler.mapRawButton(
        rawButton({ qdb_action_type: 'callApi', qdb_action_config_json: JSON.stringify({ method: 'POST' }) }),
      ),
    ).toBeNull();
  });

  it('keeps_a_valid_callApi_button', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({
        qdb_action_type: 'callApi',
        qdb_action_config_json: JSON.stringify({ endpointKey: 'check-eligibility', method: 'POST' }),
      }),
    );
    expect(button?.action.type).toBe('callApi');
  });
});

describe('ButtonAssembler.assemble', () => {
  it('indexes_buttons_by_placement_and_sorts_by_display_order', () => {
    const index = ButtonAssembler.assemble([
      rawButton({ qdb_form_scoped_buttonid: 'b2', qdb_display_order: 2 }),
      rawButton({ qdb_form_scoped_buttonid: 'b1', qdb_display_order: 1 }),
      rawButton({
        qdb_form_scoped_buttonid: 'b3',
        qdb_placement_scope: 'section',
        _qdb_section_id_value: 'sec-1',
        _qdb_tab_id_value: null,
      }),
    ]);
    expect(index.byTabId.get('tab-1')?.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(index.bySectionId.get('sec-1')?.map((b) => b.id)).toEqual(['b3']);
  });

  it('returns_empty_indexes_for_no_records', () => {
    const index = ButtonAssembler.assemble([]);
    expect(index.byTabId.size).toBe(0);
    expect(index.bySectionId.size).toBe(0);
  });
});

// ── DFE-CBTN-001: condition-set column parsing ─────────────────────────────────

const validConditionSet = {
  logic: 'AND',
  conditions: [{ fieldId: 'field_status', operator: 'equals', value: 'active' }],
};

describe('ButtonAssembler — condition-set columns (DFE-CBTN-001)', () => {
  it('visibleWhen_valid_json_is_parsed_onto_the_button', () => {
    // RED — failing before parseConditionSet exists
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: JSON.stringify(validConditionSet) }),
    );
    expect(button?.visibleWhen).toEqual(validConditionSet);
    expect(button?.enabledWhen).toBeUndefined();
  });

  it('enabledWhen_valid_json_is_parsed_onto_the_button', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_enabled_conditions_json: JSON.stringify(validConditionSet) }),
    );
    expect(button?.enabledWhen).toEqual(validConditionSet);
    expect(button?.visibleWhen).toBeUndefined();
  });

  it('both_visibleWhen_and_enabledWhen_present_are_both_parsed', () => {
    const enableSet = { logic: 'OR' as const, conditions: [{ fieldId: 'f2', operator: 'isNotEmpty' }] };
    const button = ButtonAssembler.mapRawButton(
      rawButton({
        qdb_visible_conditions_json: JSON.stringify(validConditionSet),
        qdb_enabled_conditions_json: JSON.stringify(enableSet),
      }),
    );
    expect(button?.visibleWhen).toEqual(validConditionSet);
    expect(button?.enabledWhen).toEqual(enableSet);
  });

  it('visibleWhen_malformed_json_is_dropped_and_warn_is_logged', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: '{not valid json' }),
    );
    expect(button).not.toBeNull();
    expect(button?.visibleWhen).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ buttonId: 'btn-1', column: 'qdb_visible_conditions_json' }),
      expect.any(String),
    );
  });

  it('enabledWhen_wrong_shape_missing_conditions_is_dropped_and_warn_is_logged', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_enabled_conditions_json: JSON.stringify({ logic: 'AND' }) }),
    );
    expect(button?.enabledWhen).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ buttonId: 'btn-1', column: 'qdb_enabled_conditions_json' }),
      expect.any(String),
    );
  });

  it('visibleWhen_wrong_shape_invalid_logic_is_dropped_and_warn_is_logged', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({
        qdb_visible_conditions_json: JSON.stringify({ logic: 'MAYBE', conditions: [] }),
      }),
    );
    expect(button?.visibleWhen).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ buttonId: 'btn-1', column: 'qdb_visible_conditions_json' }),
      expect.any(String),
    );
  });

  it('condition_item_missing_fieldId_is_dropped_and_warn_is_logged', () => {
    const badSet = { logic: 'AND', conditions: [{ operator: 'equals' }] };
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: JSON.stringify(badSet) }),
    );
    expect(button?.visibleWhen).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ column: 'qdb_visible_conditions_json' }),
      expect.any(String),
    );
  });

  it('condition_item_missing_operator_is_dropped_and_warn_is_logged', () => {
    const badSet = { logic: 'OR', conditions: [{ fieldId: 'f1' }] };
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: JSON.stringify(badSet) }),
    );
    expect(button?.visibleWhen).toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('empty_string_visibleWhen_treated_as_absent_no_warn_logged', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: '' }),
    );
    expect(button?.visibleWhen).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ column: 'qdb_visible_conditions_json' }),
      expect.any(String),
    );
  });

  it('null_enabledWhen_treated_as_absent_no_warn_logged', () => {
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_enabled_conditions_json: null }),
    );
    expect(button?.enabledWhen).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ column: 'qdb_enabled_conditions_json' }),
      expect.any(String),
    );
  });

  it('legacy_button_without_condition_columns_maps_identically_to_before', () => {
    // A raw button with neither new column must produce a ScopedButton with no
    // visibleWhen or enabledWhen properties (not even undefined — absent from object).
    const button = ButtonAssembler.mapRawButton(rawButton());
    expect(button).not.toBeNull();
    expect(button).not.toHaveProperty('visibleWhen');
    expect(button).not.toHaveProperty('enabledWhen');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('empty_conditions_array_with_valid_logic_is_accepted', () => {
    const emptySet = { logic: 'AND' as const, conditions: [] };
    const button = ButtonAssembler.mapRawButton(
      rawButton({ qdb_visible_conditions_json: JSON.stringify(emptySet) }),
    );
    expect(button?.visibleWhen).toEqual(emptySet);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
