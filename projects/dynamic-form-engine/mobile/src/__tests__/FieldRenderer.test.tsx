// RED — failing: FieldRenderer dispatches 'boolean' and 'interactive-grid' field types
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { FieldRenderer } from '../components/fields/FieldRenderer';
import type { FieldDefinition } from '@qdb/shared';

jest.mock('../services/apiClient', () => ({
  apiGet: jest.fn().mockResolvedValue({ records: [], totalCount: 0 }),
  apiPost: jest.fn().mockResolvedValue(undefined),
}));

function buildField(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    fieldId: 'f1',
    fieldKey: 'myField',
    fieldType: 'text',
    displayLabel: 'My Field',
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
  return <FieldRenderer field={field} control={control} accessToken="tok" isTabActive={false} />;
}

describe('FieldRenderer', () => {
  it('renders_switch_for_boolean_toggle_field', () => {
    const field = buildField({ fieldType: 'boolean', booleanRenderStyle: 'toggle' });
    render(<Wrapper field={field} />);
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('renders_radio_buttons_for_boolean_radio_field', () => {
    const field = buildField({ fieldType: 'boolean', booleanRenderStyle: 'radio' });
    render(<Wrapper field={field} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders_interactive_grid_entry_mode', () => {
    const field = buildField({
      fieldType: 'interactive-grid',
      gridConfig: {
        mode: 'entry',
        columns: [{ columnAttribute: 'val', columnLabel: 'Value', isVisible: true, displayOrder: 1 }],
      },
    });
    render(<Wrapper field={field} />);
    expect(screen.getByText('My Field')).toBeTruthy();
  });

  it('renders_interactive_grid_selection_mode', () => {
    const field = buildField({
      fieldType: 'interactive-grid',
      gridConfig: {
        mode: 'selection',
        selectionMode: 'single',
        columns: [{ columnAttribute: 'name', columnLabel: 'Name', isVisible: true, displayOrder: 1 }],
      },
    });
    render(<Wrapper field={field} />);
    expect(screen.getByText('My Field')).toBeTruthy();
  });

  it('renders_info_card_for_info_card_type', () => {
    const field = buildField({
      fieldType: 'info-card',
      infoCardStyle: 'info',
      infoCardTitle: 'Notice',
      infoCardBody: 'Read before proceeding.',
    });
    render(<Wrapper field={field} />);
    expect(screen.getByText('Notice')).toBeTruthy();
    expect(screen.getByText('Read before proceeding.')).toBeTruthy();
  });

  it('renders_unsupported_message_for_unknown_type', () => {
    // cast to bypass TS for the test
    const field = buildField({ fieldType: 'unknown-type' as FieldDefinition['fieldType'] });
    render(<Wrapper field={field} />);
    expect(screen.getByText(/Unsupported field type/i)).toBeTruthy();
  });
});
