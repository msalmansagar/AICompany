// RED — failing: FormEntryGridField renders columns from gridConfig, enforces maxRows warning
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { FormEntryGridField } from '../components/fields/FormEntryGridField';
import type { FieldDefinition } from '@qdb/shared';

function buildField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    fieldId: 'grid-1',
    fieldKey: 'items',
    fieldType: 'interactive-grid',
    displayLabel: 'Line Items',
    displayOrder: 1,
    isRequiredDefault: false,
    isReadonlyDefault: false,
    isVisibleDefault: true,
    validationRules: [],
    optionValues: [],
    gridConfig: {
      mode: 'entry',
      columns: [
        { columnAttribute: 'name', columnLabel: 'Name', isVisible: true, displayOrder: 1 },
        { columnAttribute: 'qty', columnLabel: 'Quantity', isVisible: true, displayOrder: 2 },
        { columnAttribute: 'hidden', columnLabel: 'Hidden', isVisible: false, displayOrder: 3 },
      ],
      maxRows: 10,
    },
    ...overrides,
  };
}

function Wrapper({ field }: { field: FieldDefinition }) {
  const { control } = useForm<Record<string, unknown>>();
  return <FormEntryGridField field={field} control={control} />;
}

describe('FormEntryGridField', () => {
  it('renders_visible_column_headers', () => {
    render(<Wrapper field={buildField()} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('renders_field_label', () => {
    render(<Wrapper field={buildField()} />);
    expect(screen.getByText('Line Items')).toBeTruthy();
  });

  it('add_row_button_is_present', () => {
    render(<Wrapper field={buildField()} />);
    expect(screen.getByLabelText('Add row')).toBeTruthy();
  });

  it('shows_empty_config_message_when_no_columns_defined', () => {
    const field = buildField({ gridConfig: { mode: 'entry', columns: [], maxRows: 10 } });
    render(<Wrapper field={field} />);
    expect(screen.getByText(/Grid not configured/i)).toBeTruthy();
  });

  it('add_row_adds_a_data_row', () => {
    render(<Wrapper field={buildField()} />);
    fireEvent.press(screen.getByLabelText('Add row'));
    // After adding a row, "Remove row 2" should exist
    expect(screen.getByLabelText('Remove row 2')).toBeTruthy();
  });

  it('remove_row_removes_a_data_row', () => {
    render(<Wrapper field={buildField()} />);
    fireEvent.press(screen.getByLabelText('Add row'));
    expect(screen.getByLabelText('Remove row 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove row 2'));
    expect(screen.queryByLabelText('Remove row 2')).toBeNull();
  });
});
