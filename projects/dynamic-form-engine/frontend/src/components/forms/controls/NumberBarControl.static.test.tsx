import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NumberBarControl } from './NumberBarControl';
import type { ControlProps } from '../FieldRenderer';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

// DFE-BARSRC-001: barSource picks where the BOUNDS come from. 'static' carries them as
// literals in the published JSON — no lookup, no record read, nothing async.

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({ fieldValues: mockFieldValues.current, updateFieldValue: vi.fn() })),
}));

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'field-1',
    sectionId: 'section-1',
    fieldType: 'currency',
    schemaName: 'utilisation',
    label: 'Facility utilisation',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: true,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    numberDisplayStyle: 'bar',
    ...overrides,
  } as FieldDefinition;
}

function renderBar(field: FieldDefinition, fieldValues: FormFieldValues) {
  mockFieldValues.current = fieldValues;
  const props: ControlProps = { field, inputId: 'bar', isRequired: false, isReadonly: true };
  return render(
    <FluentProvider theme={webLightTheme}>
      <NumberBarControl {...props} />
    </FluentProvider>,
  );
}

describe('NumberBarControl — static bounds', () => {
  it('fillsFromLiteralBounds', () => {
    renderBar(
      makeField({ barSource: 'static', barMin: 0, barMax: 1_000_000 }),
      { utilisation: 820_000 },
    );

    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  it('shiftsTheOriginByTheMinimum', () => {
    // 500,000–1,500,000 at 750,000. Zero-based maths would call this 50%.
    renderBar(
      makeField({ barSource: 'static', barMin: 500_000, barMax: 1_500_000 }),
      { utilisation: 750_000 },
    );

    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('readsTheAmountFromAnotherFieldWhenNamed', () => {
    // The amount is a separate decision from the bounds — it applies in every mode.
    renderBar(
      makeField({
        barSource: 'static', barMin: 0, barMax: 200,
        barValueFieldSchemaName: 'drawn',
      }),
      { utilisation: 999, drawn: 50 },
    );

    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('treatsAnAbsentMinimumAsZero', () => {
    renderBar(makeField({ barSource: 'static', barMax: 400 }), { utilisation: 100 });

    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('rendersEmptyWhenTheStaticMaximumIsMissing', () => {
    // Nothing to fill towards — show an empty bar rather than dividing by zero.
    renderBar(makeField({ barSource: 'static' }), { utilisation: 100 });

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('clampsAValueAboveTheMaximum', () => {
    renderBar(
      makeField({ barSource: 'static', barMin: 0, barMax: 100 }),
      { utilisation: 250 },
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('leavesFormFieldBarsUntouched', () => {
    // No barSource at all — every bar that predates this column behaves exactly as before.
    renderBar(
      makeField({ barMaxFieldSchemaName: 'limit', barValueFieldSchemaName: 'drawn' }),
      { drawn: 30, limit: 120 },
    );

    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});
