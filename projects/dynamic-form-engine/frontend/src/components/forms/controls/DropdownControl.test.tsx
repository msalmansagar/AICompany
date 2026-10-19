import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DropdownControl } from './DropdownControl';
import { optionsApi } from '../../../api/optionsApi';
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

// A field pointing at a live CRM option set. The plugin still publishes its static
// qdb_form_option_value rows alongside, so both are present in the published JSON.
function makeOptionSourceField(): FieldDefinition {
  return {
    ...makeDropdownField(),
    optionSourceEntity: 'qdb_servicerequest',
    optionSourceAttribute: 'qdb_keychallengesinoperationstoday',
  } as FieldDefinition;
}

const LIVE_OPTIONS = [
  { value: '100000000', label: 'Cash flow', displayOrder: 0, isDefault: false, isActive: true },
  { value: '100000001', label: 'Hiring', displayOrder: 1, isDefault: false, isActive: true },
];

function renderDropdown(fieldValues: FormFieldValues, field: FieldDefinition = makeDropdownField()) {
  mockFieldValues.current = fieldValues;
  const props: ControlProps = {
    field,
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

describe('DropdownControl with a CRM option source', () => {
  beforeEach(() => {
    vi.mocked(optionsApi.getOptions).mockReset();
    vi.mocked(optionsApi.getOptions).mockResolvedValue({ data: LIVE_OPTIONS } as never);
  });

  it('getOptions_optionSourceWithStaticRows_fetchesTheLiveOptionSet', () => {
    renderDropdown({ service_type: null }, makeOptionSourceField());

    expect(optionsApi.getOptions).toHaveBeenCalledWith('field-1', 'demo');
  });

  it('render_optionSourceWithStaticRows_showsTheLiveLabel', async () => {
    renderDropdown({ service_type: '100000001' }, makeOptionSourceField());

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('Hiring'));
  });

  it('render_optionSourceWithStaticRows_ignoresTheStaticRows', async () => {
    renderDropdown({ service_type: '1' }, makeOptionSourceField());
    await waitFor(() => expect(optionsApi.getOptions).toHaveBeenCalled());

    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('getOptions_staticRowsWithoutSource_isNotCalled', () => {
    renderDropdown({ service_type: null });

    expect(optionsApi.getOptions).not.toHaveBeenCalled();
  });
});
