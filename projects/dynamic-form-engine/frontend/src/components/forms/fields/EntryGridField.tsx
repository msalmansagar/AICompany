// Entry Grid — Mode B.
// Rows are pure client-side state stored in RHF via useEntryGridRows.
// BC-008: 300ms debounce on rule engine recomputation (enforced at DynamicFormRenderer level).
// BC-009: Warning banner when approaching 450-operation ceiling.
// BC-010: Required validation applies even if tab was never visited.

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Button,
  Input,
  Select,
  Switch,
  makeStyles,
  tokens,
  Text,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  AddCircleRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import type { GridColumnConfig, GridColumnOptionValue } from '@qdb/shared';
import { useEntryGridRows, type GridRow } from '../../../hooks/useEntryGridRows';
import type { ControlProps } from '../FieldRenderer';

// BC-009: warn when approaching 450 batch operations (rows × columns).
const OPERATION_WARNING_THRESHOLD = 400;

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  scrollContainer: {
    overflowX: 'auto',
    // FR-134: horizontal scroll on mobile.
    WebkitOverflowScrolling: 'touch',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '400px',
  },
  th: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    textAlign: 'left',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    verticalAlign: 'middle',
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  addButton: {
    alignSelf: 'flex-start',
    // FR-135: minimum 44px touch target.
    minHeight: '44px',
  },
  deleteButton: {
    // FR-135: minimum 44px touch target.
    minWidth: '44px',
    minHeight: '44px',
  },
  cellInput: {
    width: '100%',
  },
  warningBanner: {
    marginBottom: tokens.spacingVerticalXS,
  },
});

export function EntryGridField({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();

  const gridConfig = field.gridConfig;
  const columnConfigs = gridConfig?.columnConfigs ?? [];

  const { rows, addRow, updateCell, deleteRow, isAtMaxRows } =
    useEntryGridRows(field);

  // BC-009: compute current operation count. Warn when approaching threshold.
  const operationCount = rows.length * columnConfigs.length;
  const isApproachingLimit = operationCount >= OPERATION_WARNING_THRESHOLD;

  const sortedColumns = useMemo(
    () =>
      [...columnConfigs].sort((a, b) => a.displayOrder - b.displayOrder),
    [columnConfigs],
  );

  const columns = useMemo<ColumnDef<GridRow>[]>(() => {
    const colDefs: ColumnDef<GridRow>[] = sortedColumns.map((col) => ({
      id: col.columnId,
      header: col.columnLabel,
      cell: ({ row }) => (
        <EntryGridCell
          col={col}
          rowIndex={row.index}
          value={rows[row.index]?.[col.targetAttribute]}
          isReadonly={isReadonly}
          onCellChange={updateCell}
          tableId={inputId}
          headerId={`${inputId}-col-${col.columnId}`}
        />
      ),
    }));

    if (!isReadonly) {
      colDefs.push({
        id: '__delete__',
        header: '',
        cell: ({ row }) => (
          <Button
            className={styles.deleteButton}
            appearance="transparent"
            icon={<DeleteRegular />}
            onClick={() => deleteRow(row.index)}
            aria-label={`Delete row ${row.index + 1}`}
          />
        ),
      });
    }

    return colDefs;
  }, [sortedColumns, rows, isReadonly, updateCell, deleteRow, inputId]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      className={styles.wrapper}
      id={inputId}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      {isApproachingLimit && (
        <MessageBar intent="warning" className={styles.warningBanner}>
          <MessageBarBody>
            Approaching submission limit. You are close to the maximum number
            of entries allowed. Please review your data before continuing.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.scrollContainer}>
        <table
          className={styles.table}
          aria-label={`${field.label} entries`}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    id={`${inputId}-col-${header.id}`}
                    className={styles.th}
                    scope="col"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className={styles.emptyState}
                >
                  <Text>No entries yet. Click &quot;Add row&quot; to begin.</Text>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={styles.td}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isReadonly && (
        <Button
          className={styles.addButton}
          appearance="secondary"
          icon={<AddCircleRegular />}
          onClick={addRow}
          disabled={isAtMaxRows}
          aria-label={`Add new row to ${field.label}`}
        >
          Add row
        </Button>
      )}
    </div>
  );
}

// ─── Cell editor ─────────────────────────────────────────────────────────────

interface EntryGridCellProps {
  col: GridColumnConfig;
  rowIndex: number;
  value: unknown;
  isReadonly: boolean;
  onCellChange: (rowIndex: number, columnKey: string, value: unknown) => void;
  tableId: string;
  headerId: string;
}

function EntryGridCell({
  col,
  rowIndex,
  value,
  isReadonly,
  onCellChange,
  headerId,
}: EntryGridCellProps) {
  const cellId = `cell-${rowIndex}-${col.columnId}`;
  const stringValue =
    value !== null && value !== undefined ? String(value) : '';

  function handleChange(newValue: unknown) {
    onCellChange(rowIndex, col.targetAttribute, newValue);
  }

  switch (col.columnFieldType) {
    case 'number':
      return (
        <Input
          id={cellId}
          type="number"
          value={stringValue}
          onChange={(e) =>
            handleChange(
              e.target.value === '' ? undefined : parseFloat(e.target.value),
            )
          }
          readOnly={isReadonly}
          disabled={isReadonly}
          aria-labelledby={headerId}
          style={{ width: '100%' }}
        />
      );

    case 'date':
      return (
        <input
          id={cellId}
          type="date"
          value={stringValue.substring(0, 10)}
          onChange={(e) => handleChange(e.target.value || undefined)}
          readOnly={isReadonly}
          disabled={isReadonly}
          aria-labelledby={headerId}
          style={{ width: '100%' }}
        />
      );

    case 'boolean':
      return (
        <Switch
          id={cellId}
          checked={Boolean(value)}
          onChange={(_, d) => handleChange(d.checked)}
          disabled={isReadonly}
          aria-labelledby={headerId}
        />
      );

    case 'dropdown':
      return (
        <Select
          id={cellId}
          value={stringValue}
          onChange={(e) => handleChange(e.target.value || undefined)}
          disabled={isReadonly}
          aria-labelledby={headerId}
          style={{ width: '100%' }}
        >
          <option value="">-- Select --</option>
          {/* Options are loaded from col config — rendered as plain options */}
          {(col.options ?? []).map((opt: GridColumnOptionValue) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      );

    default:
      // text and any unknown types
      return (
        <Input
          id={cellId}
          type="text"
          value={stringValue}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={isReadonly}
          disabled={isReadonly}
          aria-labelledby={headerId}
          style={{ width: '100%' }}
        />
      );
  }
}
