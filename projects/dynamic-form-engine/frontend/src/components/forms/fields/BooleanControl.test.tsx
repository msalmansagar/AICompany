// RED — failing until BooleanControl is implemented correctly.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BooleanControl } from './BooleanControl';
import type { FieldDefinition } from '@qdb/shared';

const mockUpdateFieldValue = vi.fn();

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: { boolField: undefined },
    updateFieldValue: mockUpdateFieldValue,
    ruleState: {
      fieldVisibility: {},
      sectionVisibility: {},
      tabVisibility: {},
      fieldRequired: {},
      fieldReadonly: {},
      fieldValues: {},
      filteredOptions: {},
    },
  }),
}));

function makeField(overrides: Partial<FieldDefinition> & { trueLabel?: string; falseLabel?: string; boolRenderStyle?: string } = {}): FieldDefinition & { trueLabel?: string; falseLabel?: string; boolRenderStyle?: string } {
  return {
    id: 'field-bool',
    sectionId: 'section-1',
    fieldType: 'boolean',
    schemaName: 'boolField',
    label: 'Accept terms',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    trueLabel: 'Yes',
    falseLabel: 'No',
    boolRenderStyle: 'toggle',
    ...overrides,
  } as FieldDefinition & { trueLabel?: string; falseLabel?: string; boolRenderStyle?: string };
}

const defaultControlProps = {
  inputId: 'input-bool',
  isRequired: false,
  isReadonly: false,
  errorId: undefined,
  appearance: 'outline' as const,
  isTabActive: false,
};

function renderControl(
  field: FieldDefinition,
) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <BooleanControl field={field} {...defaultControlProps} />
    </FluentProvider>,
  );
}

describe('BooleanControl', () => {
  it('renders_toggle_variant_withLabels', () => {
    const field = makeField({ boolRenderStyle: 'toggle' });

    renderControl(field as FieldDefinition);

    // Fluent UI Switch renders with role="switch"
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('renders_radio_variant_withTwoOptions', () => {
    const field = makeField({ boolRenderStyle: 'radio' });

    renderControl(field as FieldDefinition);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByLabelText('Yes')).toBeTruthy();
    expect(screen.getByLabelText('No')).toBeTruthy();
  });

  it('calls_updateFieldValue_withBooleanTrue_onToggle', () => {
    const field = makeField({ boolRenderStyle: 'toggle' });

    renderControl(field as FieldDefinition);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(mockUpdateFieldValue).toHaveBeenCalledWith('boolField', true);
  });

  it('calls_updateFieldValue_withBooleanTrue_onRadioSelect', () => {
    const field = makeField({ boolRenderStyle: 'radio' });

    renderControl(field as FieldDefinition);

    const yesRadio = screen.getByLabelText('Yes');
    fireEvent.click(yesRadio);

    expect(mockUpdateFieldValue).toHaveBeenCalledWith('boolField', true);
  });

  it('calls_updateFieldValue_withBooleanFalse_onNoRadioSelect', () => {
    const field = makeField({ boolRenderStyle: 'radio' });

    renderControl(field as FieldDefinition);

    const noRadio = screen.getByLabelText('No');
    fireEvent.click(noRadio);

    expect(mockUpdateFieldValue).toHaveBeenCalledWith('boolField', false);
  });

  it('renders_errorState_whenTrueLabelIsMissing_BR019', () => {
    const field = makeField({ trueLabel: undefined });

    renderControl(field as FieldDefinition);

    expect(screen.getByText(/configuration error/i)).toBeTruthy();
    // Should NOT render a switch or radio when misconfigured
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('renders_errorState_whenFalseLabelIsMissing_BR019', () => {
    const field = makeField({ falseLabel: '' });

    renderControl(field as FieldDefinition);

    expect(screen.getByText(/configuration error/i)).toBeTruthy();
  });

  it('is_disabled_whenIsReadonlyIsTrue', () => {
    const field = makeField({ boolRenderStyle: 'toggle' });

    render(
      <FluentProvider theme={webLightTheme}>
        <BooleanControl
          field={field as FieldDefinition}
          inputId="input-bool"
          isRequired={false}
          isReadonly={true}
          appearance="outline"
          isTabActive={false}
        />
      </FluentProvider>,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('disabled');
  });
});
