import React from 'react';
import { Field, Select } from '@fluentui/react-components';
import type { RuleAction } from '@/types/businessRule';

/** An entry grid a column rule can target, with the columns it offers. */
export interface GridColumnTarget {
  gridCode: string;
  gridLabel: string;
  columns: Array<{ id: string; label: string }>;
}

interface GridColumnTargetPickerProps {
  action: RuleAction;
  grids: GridColumnTarget[];
  onChange: (patch: Partial<RuleAction>) => void;
}

/**
 * Picks the grid, then one of its columns, for a grid-column action.
 *
 * The grid is stored by field code like every field target; the column by record id, since a
 * column has no code. Changing the grid clears the column, so a rule can never pair a grid
 * with another grid's column.
 */
export function GridColumnTargetPicker({ action, grids, onChange }: GridColumnTargetPickerProps): React.ReactElement {
  const selectedGrid = grids.find(grid => grid.gridCode === action.target_field_code);

  return (
    <>
      <Field label="Target Grid" style={{ flex: 1 }}>
        <Select
          value={action.target_field_code ?? ''}
          onChange={(_, d) => onChange({
            target_field_code: d.value, target_column_id: undefined, target_tab_id: undefined, target_section_id: undefined,
          })}
          aria-label="Target Grid"
        >
          <option value="">{grids.length === 0 ? 'No entry grids on this form' : 'Select a grid…'}</option>
          {grids.map(grid => (
            <option key={grid.gridCode} value={grid.gridCode}>{grid.gridLabel}</option>
          ))}
        </Select>
      </Field>
      <Field label="Target Column" style={{ flex: 1 }}>
        <Select
          value={action.target_column_id ?? ''}
          disabled={!selectedGrid}
          onChange={(_, d) => onChange({ target_column_id: d.value })}
          aria-label="Target Column"
        >
          <option value="">Select a column…</option>
          {selectedGrid?.columns.map(column => (
            <option key={column.id} value={column.id}>{column.label}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}
