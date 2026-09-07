import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DropdownControl } from './DropdownControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({
    formCode: 'demo',
    fieldValues: mockFieldValues.current,
    updateFieldValue: vi.fn(),
    ruleState: { filteredOptions: {} },
  })),
}));

vi.mock('../../../api/optionsApi', () => ({
  optionsApi: { getOptions: vi.fn(() => Promise.resolve({ data: [] })) },
}));

function makeDropdownField(): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'dropdown',
    schemaName: 'service_type',
    label: 'Service type',
    placeholder: '— Any —',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    options: [
      { id: 'o1', fieldId: 'field-1', value: '1', label: 'Consulting', displayOrder: 1, isActive: true },
      { id: 'o2', fieldId: 'field-1', value: '2', label: 'Technology', displayOrder: 2, isActive: true },
    ],
  } as unknown as FieldDefinition;
}

function renderDropdown(fieldValues: FormFieldValues) {
  mockFieldValues.current = fieldValues;
  const props: ControlProps = {
    field: makeDropdownField(),
    inputId: 'service-type',
    isRequired: false,
    isReadonly: false,
  };
  return render(
    <FluentProvider theme={webLightTheme}>
      <DropdownControl {...props} />
    </FluentProvider>,
  );
}

describe('DropdownControl', () => {
  it('showsSelectedLabel_whenMountedWithExistingValue', () => {
    renderDropdown({ service_type: '1' });

    expect(screen.getByRole('combobox')).toHaveValue('Consulting');
  });

  it('showsEmptyText_whenNoValueSelected', () => {
    renderDropdown({ service_type: null });

    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('showsEmptyText_whenValueHasNoMatchingOption', () => {
    renderDropdown({ service_type: '99' });

    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});
