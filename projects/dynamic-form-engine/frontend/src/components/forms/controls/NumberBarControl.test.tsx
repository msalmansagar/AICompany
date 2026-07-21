import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NumberBarControl } from './NumberBarControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({ fieldValues: mockFieldValues.current, updateFieldValue: vi.fn() })),
}));

function makeBarField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'currency',
    schemaName: 'utilized',
    label: 'Utilized',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    numberDisplayStyle: 'bar',
    barMaxFieldSchemaName: 'limit',
    ...overrides,
  };
}

function renderBar(field: FieldDefinition, fieldValues: FormFieldValues) {
  mockFieldValues.current = fieldValues;
  const props: ControlProps = { field, inputId: 'bar', isRequired: false, isReadonly: false };
  return render(
    <FluentProvider theme={webLightTheme}>
      <NumberBarControl {...props} />
    </FluentProvider>,
  );
}

describe('NumberBarControl', () => {
  it('rendersPercentage_whenValueBelowMax', () => {
    renderBar(makeBarField(), { utilized: 25, limit: 100 });

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
  });

  it('clampsToHundred_whenValueExceedsMax', () => {
    renderBar(makeBarField(), { utilized: 150, limit: 100 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clampsToZero_whenValueIsNegative', () => {
    renderBar(makeBarField(), { utilized: -40, limit: 100 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('roundsPercentageToNearestInteger', () => {
    renderBar(makeBarField(), { utilized: 1, limit: 3 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
  });

  it('showsZeroAndDash_whenMaxFieldNotConfigured', () => {
    renderBar(makeBarField({ barMaxFieldSchemaName: undefined }), { utilized: 50 });

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveTextContent('—');
  });

  it('showsZeroAndDash_whenMaxValueIsZero', () => {
    renderBar(makeBarField(), { utilized: 50, limit: 0 });

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveTextContent('—');
  });

  it('treatsMissingValueAsZero', () => {
    renderBar(makeBarField(), { limit: 100 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('parsesStringValues', () => {
    renderBar(makeBarField(), { utilized: '30', limit: '120' });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('exposesProgressbarAccessibilityBounds', () => {
    renderBar(makeBarField(), { utilized: 50, limit: 100 });

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-label', 'Utilized utilization');
  });

  it('formatsDecimalValues_whenNoCurrencyCode', () => {
    renderBar(
      makeBarField({ fieldType: 'decimal', currencyCode: undefined, decimalPlaces: 1 }),
      { utilized: 2.5, limit: 10 },
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveTextContent('2.5');
  });

  // DFE-NUMBAR — value read live from a referenced field.

  it('readsValueFromReferencedField_whenBarValueFieldSet', () => {
    // Own value (utilized) is 5, but the bar reads 'spent' (60) ÷ limit (100).
    renderBar(
      makeBarField({ barValueFieldSchemaName: 'spent' }),
      { utilized: 5, spent: 60, limit: 100 },
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
  });

  it('fallsBackToOwnValue_whenBarValueFieldAbsent', () => {
    renderBar(makeBarField({ barValueFieldSchemaName: undefined }), { utilized: 40, limit: 100 });

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('readsBothValueAndMaxFromReferencedFields', () => {
    renderBar(
      makeBarField({ barValueFieldSchemaName: 'spent', barMaxFieldSchemaName: 'budget' }),
      { utilized: 0, spent: 30, budget: 60 },
    );

    // 30 / 60 = 50%
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });
});
