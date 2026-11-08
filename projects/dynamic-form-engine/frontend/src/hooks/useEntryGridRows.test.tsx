import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { FieldDefinition, FormFieldValues } from '@qdb/shared';

const context = vi.hoisted(() => ({ values: {} as FormFieldValues }));

vi.mock('../contexts/FormContext', () => ({
  useFormContext: () => ({ fieldValues: context.values, updateFieldValue: vi.fn() }),
}));

import { useEntryGridRows } from './useEntryGridRows';

const GRID = {
  id: 'grid-1', schemaName: 'rb2_items', fieldType: 'interactive-grid',
  gridConfig: { gridMode: 'entry', maxRows: 10, minRows: 0, columnConfigs: [] },
} as unknown as FieldDefinition;

describe('useEntryGridRows', () => {
  // A new empty list per render made the table library reset and re-render forever, freezing
  // any form with an empty entry grid as soon as another field changed.
  it('useEntryGridRows_NoValueAcrossRenders_ReturnsTheSameEmptyList', () => {
    context.values = { rb2_items: null, rb2_quantity: null };
    const { result, rerender } = renderHook(() => useEntryGridRows(GRID));
    const firstRows = result.current.rows;

    context.values = { rb2_items: null, rb2_quantity: 4 };
    rerender();

    expect(result.current.rows).toBe(firstRows);
    expect(result.current.rows).toEqual([]);
  });

  it('useEntryGridRows_ArrayValue_ReturnsThatArray', () => {
    const rows = [{ rb2_desc: 'Pumps' }];
    context.values = { rb2_items: rows };

    const { result } = renderHook(() => useEntryGridRows(GRID));

    expect(result.current.rows).toBe(rows);
  });
});
