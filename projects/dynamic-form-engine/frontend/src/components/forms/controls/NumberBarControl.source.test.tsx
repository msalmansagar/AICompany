import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NumberBarControl } from './NumberBarControl';
import type { ControlProps } from '../FieldRenderer';
import type { BarSourceConfig, FieldDefinition, FormFieldValues } from '@qdb/shared';

// DFE-BARSRC-001: the bar takes min/max/value from the CRM record the user picked in a
// lookup, rather than from other fields on the form.

const mockFieldValues = vi.hoisted(() => ({ current: {} as FormFieldValues }));

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: vi.fn(() => ({
    formCode: 'demo',
    fieldValues: mockFieldValues.current,
    updateFieldValue: vi.fn(),
  })),
}));

const CONFIG: BarSourceConfig = {
  sourceFieldSchemaName: 'status',
  entityLogicalName: 'qdb_applicationstatus',
  minAttribute: 'qdb_demo_floor',
  maxAttribute: 'qdb_demo_limit',
  valueAttribute: 'qdb_demo_utilised',
};

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
    barSourceConfig: CONFIG,
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

/** The endpoint answers with whatever the picked record holds. */
function mockSource(values: { min: number; max: number; value: number }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: values }),
  });
}

describe('NumberBarControl — values read from a record', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fillsFromTheSelectedRecord', async () => {
    // The live demo record: 0 – 1,000,000 with 820,000 drawn.
    global.fetch = mockSource({ min: 0, max: 1_000_000, value: 820_000 }) as never;

    renderBar(makeField(), { status: { id: 'rec-1', displayName: 'Approved' } });

    await waitFor(() => expect(screen.getByText('82%')).toBeInTheDocument());
  });

  it('shiftsTheOriginByTheMinimum', async () => {
    // 500,000 – 1,500,000 with 750,000 drawn. Zero-based maths would say 50%; with the
    // configured floor it is a quarter of the way through the band.
    global.fetch = mockSource({ min: 500_000, max: 1_500_000, value: 750_000 }) as never;

    renderBar(makeField(), { status: { id: 'rec-2', displayName: 'Under Review' } });

    await waitFor(() => expect(screen.getByText('25%')).toBeInTheDocument());
  });

  it('readsTheRecordIdFromTheLookupSelectionShape', async () => {
    // The renderer stores a selection as { id, displayName }, not a bare GUID.
    const fetchMock = mockSource({ min: 0, max: 100, value: 50 });
    global.fetch = fetchMock as never;

    renderBar(makeField(), { status: { id: 'abc-123', displayName: 'Approved' } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('recordId=abc-123');
  });

  it('showsNothingUntilARecordIsPicked', async () => {
    const fetchMock = mockSource({ min: 0, max: 100, value: 50 });
    global.fetch = fetchMock as never;

    renderBar(makeField(), {});

    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('doesNotRefetchOnEveryRender', async () => {
    // The config arrives as a fresh object each render; depending on it by identity used to
    // re-fire the effect, set state, and loop until the page froze.
    const fetchMock = mockSource({ min: 0, max: 100, value: 50 });
    global.fetch = fetchMock as never;

    const { rerender } = renderBar(makeField(), { status: { id: 'rec-1', displayName: 'x' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // A re-render with an equal-but-new config object must not trigger another read.
    rerender(
      <FluentProvider theme={webLightTheme}>
        <NumberBarControl
          field={makeField({ barSourceConfig: { ...CONFIG } })}
          inputId="bar"
          isRequired={false}
          isReadonly
        />
      </FluentProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leavesTheFieldBasedBarUntouchedWhenThereIsNoConfig', async () => {
    const fetchMock = mockSource({ min: 0, max: 1, value: 1 });
    global.fetch = fetchMock as never;

    renderBar(
      makeField({ barSourceConfig: undefined, barMaxFieldSchemaName: 'limit' }),
      { utilisation: 30, limit: 120 },
    );

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
