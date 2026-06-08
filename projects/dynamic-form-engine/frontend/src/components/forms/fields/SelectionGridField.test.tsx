// RED — failing until SelectionGridField is implemented correctly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SelectionGridField } from './SelectionGridField';
import type { FieldDefinition, GridFieldConfig } from '@qdb/shared';

const mockUpdateFieldValue = vi.fn();
const mockFieldValues: Record<string, unknown> = { gridSelect: null };

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: mockFieldValues,
    updateFieldValue: mockUpdateFieldValue,
  }),
}));

vi.mock('../../../services/gridDataService', () => ({
  fetchGridPage: vi.fn().mockResolvedValue({
    records: [
      { id: 'record-1', values: { name: 'Alice' } },
      { id: 'record-2', values: { name: 'Bob' } },
    ],
    totalCount: 2,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    isCapped: false,
  }),
}));

function makeSelectionField(): FieldDefinition {
  return {
    id: 'grid-select-1',
    sectionId: 'section-1',
    fieldType: 'interactive-grid',
    schemaName: 'gridSelect',
    label: 'Select a record',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    gridConfig: {
      gridMode: 'selection',
      targetEntity: 'qdb_test',
      selectionMode: 'single',
      maxRows: 200,
      columnConfigs: [
        {
          columnId: 'col-name',
          displayOrder: 1,
          columnLabel: 'Name',
          targetAttribute: 'name',
          columnFieldType: 'text',
        },
      ],
    } as GridFieldConfig,
  } as unknown as FieldDefinition;
}

function renderGrid(isTabActive = false) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <SelectionGridField
        field={makeSelectionField()}
        inputId="grid-1"
        isRequired={false}
        isReadonly={false}
        errorId={undefined}
        appearance="outline"
        isTabActive={isTabActive}
      />
    </FluentProvider>,
  );
}

describe('SelectionGridField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders_loadingSkeleton_whenTabIsActive_andDataLoading', async () => {
    renderGrid(true);

    // Skeleton renders while loading.
    expect(screen.getByLabelText(/loading grid records/i)).toBeTruthy();
  });

  it('renders_dataTable_afterLoad_whenTabIsActive', async () => {
    renderGrid(true);

    await waitFor(() => {
      expect(screen.getByRole('grid')).toBeTruthy();
    });
  });

  it('does_not_fetch_when_tabIsNotActive', async () => {
    const { fetchGridPage } = vi.mocked(
      await import('../../../services/gridDataService'),
    );

    renderGrid(false);

    // No fetch should have been issued — tab is not active.
    expect(fetchGridPage).not.toHaveBeenCalled();
  });

  it('renders_records_asTableRows_afterLoad', async () => {
    renderGrid(true);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
    });
  });

  it('shows_error_state_withRetryButton_whenFetchFails', async () => {
    const { fetchGridPage } = await import('../../../services/gridDataService');
    vi.mocked(fetchGridPage).mockRejectedValueOnce(new Error('Network error'));

    renderGrid(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
  });
});
