// DFE-RULES-002: the value input for calculate_value and disable_options actions. A
// calculation is typed as an expression; disabling options picks from the target field's
// own options so a maker never types a stored option value by hand.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ActionValueEditor, parseDisabledOptionValues } from '@/screens/rules/ActionValueEditor';
import type { RuleAction } from '@/types/businessRule';

const TIER_OPTIONS = [
  { value: '100000000', label: 'Silver' },
  { value: '100000001', label: 'Gold' },
  { value: '100000002', label: 'Platinum' },
];

function renderEditor(action: RuleAction, onChange = vi.fn()) {
  render(
    <FluentProvider theme={webLightTheme}>
      <ActionValueEditor action={action} targetOptions={TIER_OPTIONS} onChange={onChange} />
    </FluentProvider>,
  );
  return onChange;
}

describe('ActionValueEditor', () => {
  it('rendersNothing_forAnActionWithoutAValue', () => {
    renderEditor({ action_type: 'hide_field', target_field_code: 'tier' });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('offersAnExpressionInput_forCalculateValue', () => {
    const onChange = renderEditor({ action_type: 'calculate_value', target_field_code: 'total', value: '' });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{quantity} * 1.1' } });

    expect(onChange).toHaveBeenCalledWith({ value: '{quantity} * 1.1' });
  });

  it('listsTheTargetFieldsOptions_forDisableOptions', () => {
    renderEditor({ action_type: 'disable_options', target_field_code: 'tier', value: '' });

    expect(screen.getByLabelText('Gold')).toBeInTheDocument();
    expect(screen.getByLabelText('Platinum')).toBeInTheDocument();
  });

  it('storesTheCheckedOptions_asAJsonArray', () => {
    const onChange = renderEditor({ action_type: 'disable_options', target_field_code: 'tier', value: '["100000001"]' });

    fireEvent.click(screen.getByLabelText('Platinum'));

    expect(onChange).toHaveBeenCalledWith({ value: '["100000001","100000002"]' });
  });

  it('showsTheCheckedOptions_fromTheStoredValue', () => {
    renderEditor({ action_type: 'disable_options', target_field_code: 'tier', value: '["100000001"]' });

    expect(screen.getByLabelText('Gold')).toBeChecked();
    expect(screen.getByLabelText('Silver')).not.toBeChecked();
  });

  it('fallsBackToATextInput_whenTheTargetHasNoOptions', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <ActionValueEditor
          action={{ action_type: 'disable_options', target_field_code: 'sponsor', value: '' }}
          targetOptions={[]}
          onChange={vi.fn()}
        />
      </FluentProvider>,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('parseDisabledOptionValues', () => {
  it('readsAJsonArray', () => {
    expect(parseDisabledOptionValues('["a","b"]')).toEqual(['a', 'b']);
  });

  it('readsACommaSeparatedList', () => {
    expect(parseDisabledOptionValues('a, b')).toEqual(['a', 'b']);
  });

  it('readsNothingFromAnEmptyValue', () => {
    expect(parseDisabledOptionValues(undefined)).toEqual([]);
  });
});
