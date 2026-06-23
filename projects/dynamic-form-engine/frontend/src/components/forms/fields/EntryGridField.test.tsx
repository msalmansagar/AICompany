// RED — failing until EntryGridField is implemented correctly.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { EntryGridField } from './EntryGridField';
import type { FieldDefinition, GridFieldConfig } from '@qdb/shared';

// BC-009: operation warning threshold matches the constant in EntryGridField.
const OPERATION_WARNING_THRESHOLD = 400;

const mockUpdateFieldValue = vi.fn();

// fieldValues is mutated between tests to simulate different row states.
let mockFieldValues: Record<string, unknown> = { entryGrid: [] };

vi.mock('../../../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: mockFieldValues,
    updateFieldValue: mockUpdateFieldValue,
  }),
}));

function makeEntryGridField(
  gridConfigOverrides: Partial<GridFieldConfig> = {},
): FieldDefinition {
  return {
    id: 'entry-grid-field-1',
    sectionId: 'section-1',
    fieldType: 'interactive-grid',
    schemaName: 'entryGrid',
    label: 'Entry Grid',
    displayOrder: 1,
    columnSpan: 4,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    gridConfig: {
      gridMode: 'entry',
      targetEntity: 'qdb_test',
      maxRows: 200,
      minRows: 0,
      columnConfigs: [
        {
          columnId: 'col-name',
          displayOrder: 1,
          columnLabel: 'Name',
          targetAttribute: 'qdb_name',
          columnFieldType: 'text',
        },
      ],
      ...gridConfigOverrides,
    } as GridFieldConfig,
  } as unknown as FieldDefinition;
}

function renderEntryGrid(field: FieldDefinition, isReadonly = false) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <EntryGridField
        field={field}
        inputId="entry-grid-1"
        isRequired={false}
        isReadonly={isReadonly}
        errorId={undefined}
        appearance="outline"
        isTabActive={false}
      />
    </FluentProvider>,
  );
}

describe('EntryGridField', () => {
  beforeEach(() => {
    mockFieldValues = { entryGrid: [] };
    vi.clearAllMocks();
  });

  it('EntryGridField_rendersEmptyGrid_withAddRowButton', () => {
    // Arrange
    const field = makeEntryGridField();

    // Act
    renderEntryGrid(field);

    // Assert — empty state message and the "Add row" button are both present.
    expect(screen.getByText(/no entries yet/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /add new row/i })).toBeTruthy();
  });

  it('EntryGridField_clickingAddRow_appendsNewRow', () => {
    // Arrange
    const field = makeEntryGridField();

    // Act
    renderEntryGrid(field);
    const addButton = screen.getByRole('button', { name: /add new row/i });
    fireEvent.click(addButton);

    // Assert — updateFieldValue called with an array containing one empty row.
    expect(mockUpdateFieldValue).toHaveBeenCalledWith(
      'entryGrid',
      expect.arrayContaining([
        expect.objectContaining({ qdb_name: undefined }),
      ]),
    );
  });

  it('EntryGridField_clickingDelete_removesRow', () => {
    // Arrange — pre-populate one row via mockFieldValues.
    mockFieldValues = { entryGrid: [{ qdb_name: 'Alice' }] };
    const field = makeEntryGridField();

    // Act
    renderEntryGrid(field);
    const deleteButton = screen.getByRole('button', { name: /delete row 1/i });
    fireEvent.click(deleteButton);

    // Assert — updateFieldValue called with an empty array (row removed).
    expect(mockUpdateFieldValue).toHaveBeenCalledWith('entryGrid', []);
  });

  it('EntryGridField_showsInvalidationBanner_whenGridInvalidatedPropIsTrue', () => {
    // Arrange — field has gridInvalidated flag injected via extra prop.
    // The component reads gridInvalidated off the field config.
    const field = makeEntryGridField();
    const fieldWithFlag = {
      ...field,
      gridInvalidated: true,
    };

    // Act
    render(
      <FluentProvider theme={webLightTheme}>
        <EntryGridField
          field={fieldWithFlag as unknown as FieldDefinition}
          inputId="entry-grid-invalidated"
          isRequired={false}
          isReadonly={false}
          errorId="entry-grid-error"
          appearance="outline"
          isTabActive={false}
        />
      </FluentProvider>,
    );

    // Assert — aria-invalid is set on the wrapper (errorId was passed).
    const wrapper = screen.getByRole('table', { name: /entry grid entries/i })
      .closest('[aria-invalid]');
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveAttribute('aria-invalid', 'true');
  });

  it('EntryGridField_showsWarningBanner_whenApproaching450OpBatchCeiling_BC009', () => {
    // Arrange — populate enough rows so rows × columns >= OPERATION_WARNING_THRESHOLD.
    // Default config has 1 column. OPERATION_WARNING_THRESHOLD is 400.
    // 400 rows × 1 column = 400 operations — triggers the banner.
    const manyRows = Array.from({ length: OPERATION_WARNING_THRESHOLD }, (_, i) => ({
      qdb_name: `Row ${i}`,
    }));
    mockFieldValues = { entryGrid: manyRows };
    const field = makeEntryGridField();

    // Act
    renderEntryGrid(field);

    // Assert — warning MessageBar is visible.
    expect(screen.getByText(/approaching submission limit/i)).toBeTruthy();
  });

  it('EntryGridField_requiredValidationFails_whenRowsArrayIsEmpty_BC010', () => {
    // Arrange — empty rows array with isRequired = true (errorId signals a validation error).
    mockFieldValues = { entryGrid: [] };
    const field = makeEntryGridField();

    // Act
    render(
      <FluentProvider theme={webLightTheme}>
        <EntryGridField
          field={field}
          inputId="entry-grid-required"
          isRequired={true}
          isReadonly={false}
          errorId="entry-grid-required-error"
          appearance="outline"
          isTabActive={false}
        />
      </FluentProvider>,
    );

    // Assert — wrapper carries aria-required and aria-invalid attributes.
    const wrapper = screen.getByRole('table', { name: /entry grid entries/i })
      .closest('[aria-required]');
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveAttribute('aria-required', 'true');
    expect(wrapper).toHaveAttribute('aria-invalid', 'true');
  });
});
