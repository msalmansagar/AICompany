// RED — failing until TextInputControl and FormContext mock are in place
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TextInputControl } from './TextInputControl';
import type { FieldDefinition } from '@dfe/shared';
import * as FormContextModule from '../../../contexts/FormContext';

const mockUpdateFieldValue = vi.hoisted(() => vi.fn());

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({
    fieldValues: { firstName: 'Alice' },
    updateFieldValue: mockUpdateFieldValue,
  })),
}));

function makeTextField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'text',
    schemaName: 'firstName',
    label: 'First name',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    ...overrides,
  };
}

function renderControl(props: React.ComponentProps<typeof TextInputControl>) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TextInputControl {...props} />
    </FluentProvider>,
  );
}

describe('TextInputControl', () => {
  it('renders_withCurrentFieldValue', () => {
    const field = makeTextField();

    renderControl({
      field,
      inputId: 'test-input',
      isRequired: false,
      isReadonly: false,
    });

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Alice');
  });

  it('renders_withEmptyValue_whenFieldValueIsNull', () => {
    vi.mocked(FormContextModule.useFormContext).mockReturnValueOnce({
      fieldValues: { firstName: null },
      updateFieldValue: mockUpdateFieldValue,
    } as unknown as ReturnType<typeof FormContextModule.useFormContext>);

    const field = makeTextField();

    renderControl({
      field,
      inputId: 'test-input',
      isRequired: false,
      isReadonly: false,
    });

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('');
  });

  it('callsUpdateFieldValue_whenUserTypes', () => {
    const field = makeTextField();

    renderControl({
      field,
      inputId: 'test-input',
      isRequired: false,
      isReadonly: false,
    });

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Bob' } });

    expect(mockUpdateFieldValue).toHaveBeenCalledWith('firstName', 'Bob');
  });

  it('isDisabled_whenIsReadonlyIsTrue', () => {
    const field = makeTextField({ isReadonly: true });

    renderControl({
      field,
      inputId: 'test-input',
      isRequired: false,
      isReadonly: true,
    });

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('hasAriaDescribedBy_whenErrorIdProvided', () => {
    const field = makeTextField();

    renderControl({
      field,
      inputId: 'test-input',
      isRequired: false,
      isReadonly: false,
      errorId: 'test-input-error',
    });

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'test-input-error');
  });
});
