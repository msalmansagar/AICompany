// RED â€” failing until FieldRenderer renders correctly with all sub-controls
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FieldRenderer } from './FieldRenderer';
import type { FieldDefinition } from '@qdb/shared';

vi.mock('../../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: {},
    updateFieldValue: vi.fn(),
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

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'text',
    schemaName: 'testField',
    label: 'Test field',
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

function renderField(props: React.ComponentProps<typeof FieldRenderer>) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <FieldRenderer {...props} />
    </FluentProvider>,
  );
}

describe('FieldRenderer', () => {
  it('renders_label_forVisibleTextField', () => {
    const field = makeField({ label: 'Full name' });

    renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

    expect(screen.getByText('Full name')).toBeTruthy();
  });

  it('rendersNothing_whenFieldIsNotVisible', () => {
    const field = makeField({ label: 'Hidden field' });

    const { container } = renderField({
      field,
      isVisible: false,
      isRequired: false,
      isReadonly: false,
    });

    // FluentProvider renders a wrapper div; FieldRenderer returns null,
    // so that wrapper div must have no children.
    expect((container.firstChild as HTMLElement).children.length).toBe(0);
  });

  it('renders_errorMessage_whenErrorProvided', () => {
    const field = makeField();

    renderField({
      field,
      isVisible: true,
      isRequired: true,
      isReadonly: false,
      error: 'This field is required',
    });

    expect(screen.getByText('This field is required')).toBeTruthy();
  });

  it('renders_tooltip_whenFieldHasTooltip', () => {
    const field = makeField({ tooltip: 'Helpful hint' });

    renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

    const tooltipTrigger = screen.getByLabelText('Helpful hint');
    expect(tooltipTrigger).toBeTruthy();
  });

  it('renders_checkboxControl_forCheckboxFieldType', () => {
    const field = makeField({ fieldType: 'checkbox', label: 'I agree' });

    renderField({ field, isVisible: true, isRequired: false, isReadonly: false });

    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('renders_errorWithAriaLiveAlert_whenErrorPresent', () => {
    const field = makeField();

    renderField({
      field,
      isVisible: true,
      isRequired: true,
      isReadonly: false,
      error: 'Validation failed',
    });

    const errorEl = screen.getByRole('alert');
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toBe('Validation failed');
  });
});
