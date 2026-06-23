// RED — failing until useEntryGridRows is implemented.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryGridRows } from './useEntryGridRows';
import type { FieldDefinition, GridFieldConfig } from '@qdb/shared';

const mockUpdateFieldValue = vi.fn();

vi.mock('../contexts/FormContext', () => ({
  useFormContext: () => ({
    fieldValues: { gridField: [] },
    updateFieldValue: mockUpdateFieldValue,
  }),
}));

function makeGridField(gridConfig: Partial<GridFieldConfig> = {}): FieldDefinition {
  return {
    id: 'grid-field-1',
    sectionId: 'section-1',
    fieldType: 'interactive-grid',
    schemaName: 'gridField',
    label: 'Grid',
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
      maxRows: 5,
      minRows: 0,
      columnConfigs: [
        {
          columnId: 'col-1',
          displayOrder: 1,
          columnLabel: 'Name',
          targetAttribute: 'qdb_name',
          columnFieldType: 'text',
        },
      ],
      ...gridConfig,
    } as GridFieldConfig,
  } as unknown as FieldDefinition;
}

describe('useEntryGridRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns_emptyRows_initially', () => {
    const field = makeGridField();

    const { result } = renderHook(() => useEntryGridRows(field));

    expect(result.current.rows).toHaveLength(0);
  });

  it('addRow_appends_emptyRow', () => {
    const field = makeGridField();

    const { result } = renderHook(() => useEntryGridRows(field));

    act(() => result.current.addRow());

    expect(mockUpdateFieldValue).toHaveBeenCalledWith(
      'gridField',
      expect.arrayContaining([
        expect.objectContaining({ qdb_name: undefined }),
      ]),
    );
  });

  it('isAtMaxRows_isTrue_whenRowsReachMaxRows', () => {
    const field = makeGridField({ maxRows: 0 });

    const { result } = renderHook(() => useEntryGridRows(field));

    // 0 rows, maxRows = 0 => isAtMaxRows is true.
    expect(result.current.isAtMaxRows).toBe(true);
  });

  it('isAtMaxRows_isFalse_whenBelowMaxRows', () => {
    const field = makeGridField({ maxRows: 5 });

    const { result } = renderHook(() => useEntryGridRows(field));

    expect(result.current.isAtMaxRows).toBe(false);
  });

  it('updateCell_updatesCorrectCellValue', () => {
    const field = makeGridField();

    vi.mocked(vi.fn()).mockImplementation(() => ({
      fieldValues: { gridField: [{ qdb_name: '' }] },
      updateFieldValue: mockUpdateFieldValue,
    }));

    const { result } = renderHook(() => useEntryGridRows(field));

    act(() => result.current.updateCell(0, 'qdb_name', 'Alice'));

    expect(mockUpdateFieldValue).toHaveBeenCalledWith(
      'gridField',
      expect.arrayContaining([
        expect.objectContaining({ qdb_name: 'Alice' }),
      ]),
    );
  });

  it('deleteRow_removesCorrectRow', () => {
    const field = makeGridField();

    const { result } = renderHook(() => useEntryGridRows(field));

    act(() => result.current.deleteRow(0));

    expect(mockUpdateFieldValue).toHaveBeenCalledWith('gridField', []);
  });
});
