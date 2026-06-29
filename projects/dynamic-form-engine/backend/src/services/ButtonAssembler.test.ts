import { describe, it, expect } from 'vitest';
import { ButtonAssembler, type RawScopedButton } from './ButtonAssembler.js';

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
