// Manages row state for Entry Grid (Mode B).
// Row add is purely client-side — no Dataverse call occurs (NFR-020).

import { useCallback } from 'react';
import { useFormContext } from '../contexts/FormContext';
import type { FieldDefinition } from '@qdb/shared';

export type GridRow = Record<string, unknown>;

export interface EntryGridRowsState {
  rows: GridRow[];
  addRow: () => void;
  updateCell: (rowIndex: number, columnKey: string, value: unknown) => void;
  deleteRow: (rowIndex: number) => void;
  isAtMaxRows: boolean;
  isAtMinRows: boolean;
}

export function useEntryGridRows(field: FieldDefinition): EntryGridRowsState {
  const { fieldValues, updateFieldValue } = useFormContext();

  const gridConfig = field.gridConfig;
  const maxRows = gridConfig?.maxRows ?? 200;
  const minRows = gridConfig?.minRows ?? 0;

  const rawValue = fieldValues[field.schemaName];
  const rows: GridRow[] = Array.isArray(rawValue) ? (rawValue as GridRow[]) : [];

  const commitRows = useCallback(
    (newRows: GridRow[]) => {
      updateFieldValue(field.schemaName, newRows);
    },
    [field.schemaName, updateFieldValue],
  );

  const addRow = useCallback(() => {
    if (rows.length >= maxRows) return;

    const emptyRow: GridRow = {};
    const columnConfigs = gridConfig?.columnConfigs ?? [];

    for (const col of columnConfigs) {
      emptyRow[col.targetAttribute] = undefined;
    }

    commitRows([...rows, emptyRow]);
  }, [rows, maxRows, gridConfig, commitRows]);

  const updateCell = useCallback(
    (rowIndex: number, columnKey: string, value: unknown) => {
      const updatedRows = rows.map((row, i) =>
        i === rowIndex ? { ...row, [columnKey]: value } : row,
      );
      commitRows(updatedRows);
    },
    [rows, commitRows],
  );

  const deleteRow = useCallback(
    (rowIndex: number) => {
      commitRows(rows.filter((_, i) => i !== rowIndex));
    },
    [rows, commitRows],
  );

  const isAtMaxRows = rows.length >= maxRows;
  const isAtMinRows = rows.length <= minRows;

  return {
    rows,
    addRow,
    updateCell,
    deleteRow,
    isAtMaxRows,
    isAtMinRows,
  };
}
