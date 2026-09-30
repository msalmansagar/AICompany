import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RatingControl } from './RatingControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const context = vi.hoisted(() => ({ values: {} as FormFieldValues, update: vi.fn(), disabled: {} as Record<string, string[]> }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: context.values,
    updateFieldValue: context.update,
    ruleState: { filteredOptions: {}, disabledOptions: context.disabled },
  }),
}));

function ratingField(): FieldDefinition {
  return {
    id: 'field-satisfaction',
    schemaName: 'satisfaction',
    label: 'Satisfaction',
    fieldType: 'dropdown',
    radioRenderStyle: 'rating',
    options: [
      { id: 'o3', fieldId: 'f', value: '100000003', label: 'Good', displayOrder: 3, isActive: true },
      { id: 'o1', fieldId: 'f', value: '100000001', label: 'Poor', displayOrder: 1, isActive: true },
      { id: 'o2', fieldId: 'f', value: '100000002', label: 'Fair', displayOrder: 2, isActive: true },
    ],
  } as unknown as FieldDefinition;
}

function renderRating(values: FormFieldValues, overrides: Partial<ControlProps> = {}) {
  context.values = values;
  render(
    <FluentProvider theme={webLightTheme}>
      <RatingControl field={ratingField()} inputId="sat" isRequired={false} isReadonly={false} {...overrides} />
    </FluentProvider>,
  );
}

describe('RatingControl', () => {
  beforeEach(() => {
    context.update.mockReset();
    context.disabled = {};
  });

  it('RatingControl_DisabledStar_IsAnnouncedAndIgnored', () => {
    context.disabled = { 'field-satisfaction': ['100000003'] };
    renderRating({ satisfaction: null });

    fireEvent.click(screen.getByLabelText('Good (unavailable)'));

    expect(context.update).not.toHaveBeenCalled();
  });

  it('RatingControl_ClickThirdStar_StoresThirdOptionInDisplayOrder', () => {
    renderRating({ satisfaction: null });

    fireEvent.click(screen.getByLabelText('Good'));

    expect(context.update).toHaveBeenCalledWith('satisfaction', '100000003');
  });

  it('RatingControl_StoredValue_ChecksTheMatchingStar', () => {
    renderRating({ satisfaction: '100000002' });

    expect(screen.getByLabelText('Fair')).toBeChecked();
  });

  it('RatingControl_OptionalWithValue_ClearEmptiesTheField', () => {
    renderRating({ satisfaction: '100000002' });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(context.update).toHaveBeenCalledWith('satisfaction', null);
  });

  it('RatingControl_Required_OffersNoClear', () => {
    renderRating({ satisfaction: '100000002' }, { isRequired: true });

    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('RatingControl_Readonly_RendersNoInputs', () => {
    renderRating({ satisfaction: '100000002' }, { isReadonly: true });

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});
