// RED — failing: FormBooleanField renders toggle and radio modes, validates required
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { FormBooleanField } from '../components/fields/FormBooleanField';
import type { FieldDefinition } from '@qdb/shared';

function buildField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'f1',
    fieldKey: 'agree',
    fieldType: 'boolean',
    displayLabel: 'Do you agree?',
    displayOrder: 1,
    isRequiredDefault: false,
    isReadonlyDefault: false,
    isVisibleDefault: true,
    validationRules: [],
    optionValues: [],
    ...overrides,
  };
}

function Wrapper({ field }: { field: FieldDefinition }) {
  const { control } = useForm<Record<string, unknown>>();
  return <FormBooleanField field={field} control={control} />;
}

describe('FormBooleanField', () => {
  it('renders_toggle_mode_by_default', () => {
    render(<Wrapper field={buildField()} />);
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('renders_radio_mode_when_booleanRenderStyle_is_radio', () => {
    const field = buildField({ booleanRenderStyle: 'radio' });
    render(<Wrapper field={field} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
  });

  it('shows_custom_trueLabel_in_radio_mode', () => {
    const field = buildField({ booleanRenderStyle: 'radio', trueLabel: 'Agree', falseLabel: 'Disagree' });
    render(<Wrapper field={field} />);
    expect(screen.getByLabelText('Agree')).toBeTruthy();
    expect(screen.getByLabelText('Disagree')).toBeTruthy();
  });

  it('radio_mode_Yes_option_is_pressable', () => {
    const field = buildField({ booleanRenderStyle: 'radio' });
    render(<Wrapper field={field} />);
    const [yesBtn] = screen.getAllByRole('radio');
    expect(() => fireEvent.press(yesBtn)).not.toThrow();
  });

  it('shows_required_star_when_field_is_required', () => {
    const field = buildField({ isRequiredDefault: true });
    render(<Wrapper field={field} />);
    // The label and required star are nested Text nodes; use regex to match any node containing the label
    expect(screen.getByText(/Do you agree\?/)).toBeTruthy();
    // required asterisk rendered as separate nested Text node
    expect(screen.getByText(' *')).toBeTruthy();
  });

  it('displays_field_label', () => {
    render(<Wrapper field={buildField()} />);
    expect(screen.getByText('Do you agree?')).toBeTruthy();
  });
});
