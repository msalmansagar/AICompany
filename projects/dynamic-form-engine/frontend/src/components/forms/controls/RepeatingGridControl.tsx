import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import {
  Button,
  makeStyles,
  tokens,
  Text,
} from '@fluentui/react-components';
import {
  AddCircleRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import type { FieldDefinition } from '@qdb/shared';
import { useFormContext } from '../../../contexts/FormContext';
import type { ControlProps } from '../FieldRenderer';

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  tableWrapper: {
    overflowX: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    textAlign: 'left',
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  td: {
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    verticalAlign: 'top',
  },
  addButton: {
    alignSelf: 'flex-start',
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

type GridRow = Record<string, unknown>;

export function RepeatingGridControl({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
}: ControlProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();

  const rawValue = fieldValues[field.schemaName];
  const rows: GridRow[] = Array.isArray(rawValue) ? (rawValue as GridRow[]) : [];

  const childFields = field.childFields ?? [];
  const maxRows = field.maxRows ?? Infinity;

  function updateRows(newRows: GridRow[]) {
    updateFieldValue(field.schemaName, newRows);
  }

  function addRow() {
    const emptyRow: GridRow = {};

    for (const childField of childFields) {
      emptyRow[childField.schemaName] = childField.defaultValue ?? null;
    }

    updateRows([...rows, emptyRow]);
  }

  function deleteRow(rowIndex: number) {
    updateRows(rows.filter((_, i) => i !== rowIndex));
  }

  function updateCell(rowIndex: number, schemaName: string, value: unknown) {
    const updatedRows = rows.map((row, i) =>
      i === rowIndex ? { ...row, [schemaName]: value } : row,
    );
    updateRows(updatedRows);
  }

  const columns = useMemo<ColumnDef<GridRow>[]>(() => {
    const fieldColumns: ColumnDef<GridRow>[] = childFields.map((childField) => ({
      id: childField.id,
      header: () => (
        <span>
          {childField.label}
          {childField.isRequired && (
            <span style={{ color: tokens.colorPaletteRedForeground1 }}> *</span>
          )}
        </span>
      ),
      cell: ({ row }) => (
        <GridCellEditor
          childField={childField}
          rowIndex={row.index}
          rows={rows}
          isReadonly={isReadonly}
          onCellChange={updateCell}
        />
      ),
    }));

    if (!isReadonly) {
      fieldColumns.push({
        id: '__actions__',
        header: '',
        cell: ({ row }) => (
          <Button
            appearance="transparent"
            icon={<DeleteRegular />}
            onClick={() => deleteRow(row.index)}
            aria-label={`Delete row ${row.index + 1}`}
          />
        ),
      });
    }

    return fieldColumns;
  }, [childFields, rows, isReadonly]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const canAddRow = !isReadonly && rows.length < maxRows;

  return (
    <div
      className={styles.wrapper}
      id={inputId}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      <div className={styles.tableWrapper}>
        <table
          className={styles.table}
          aria-label={`${field.label} entries`}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={styles.th} scope="col">
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
                  <Text>No entries yet. Click "Add row" to begin.</Text>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={styles.td}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canAddRow && (
        <Button
          className={styles.addButton}
          appearance="secondary"
          icon={<AddCircleRegular />}
          onClick={addRow}
          aria-label={`Add row to ${field.label}`}
        >
          Add row
        </Button>
      )}
    </div>
  );
}

interface GridCellEditorProps {
  childField: FieldDefinition;
  rowIndex: number;
  rows: GridRow[];
  isReadonly: boolean;
  onCellChange: (rowIndex: number, schemaName: string, value: unknown) => void;
}

function GridCellEditor({
  childField,
  rowIndex,
  rows,
  isReadonly,
  onCellChange,
}: GridCellEditorProps) {
  // Create a synthetic field values proxy for each row cell
  const [localValue, setLocalValue] = useState<unknown>(
    rows[rowIndex]?.[childField.schemaName] ?? null,
  );

  function handleChange(value: unknown) {
    setLocalValue(value);
    onCellChange(rowIndex, childField.schemaName, value);
  }

  const cellInputId = `cell-${rowIndex}-${childField.id}`;

  const sharedProps = {
    field: childField,
    inputId: cellInputId,
    isRequired: false,
    isReadonly,
    errorId: undefined,
  };

  // Use inline handlers instead of FormContext for grid cells
  return (
    <InlineCellWrapper
      value={localValue}
      onChange={handleChange}
      childField={childField}
      sharedProps={sharedProps}
    />
  );
}

interface InlineCellWrapperProps {
  value: unknown;
  onChange: (value: unknown) => void;
  childField: FieldDefinition;
  sharedProps: ControlProps;
}

function InlineCellWrapper({ value, onChange, childField, sharedProps }: InlineCellWrapperProps) {
  const stringValue = value !== null && value !== undefined ? String(value) : '';

  switch (childField.fieldType) {
    case 'number':
    case 'currency':
    case 'decimal':
      return (
        <input
          id={sharedProps.inputId}
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          readOnly={sharedProps.isReadonly}
          disabled={sharedProps.isReadonly}
          style={{ width: '100%' }}
          aria-label={childField.label}
        />
      );

    case 'date':
      return (
        <input
          id={sharedProps.inputId}
          type="date"
          value={stringValue.substring(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
          readOnly={sharedProps.isReadonly}
          disabled={sharedProps.isReadonly}
          style={{ width: '100%' }}
          aria-label={childField.label}
        />
      );

    case 'checkbox':
      return (
        <input
          id={sharedProps.inputId}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={sharedProps.isReadonly}
          aria-label={childField.label}
        />
      );

    default:
      return (
        <input
          id={sharedProps.inputId}
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          readOnly={sharedProps.isReadonly}
          disabled={sharedProps.isReadonly}
          style={{ width: '100%' }}
          placeholder={childField.placeholder}
          aria-label={childField.label}
        />
      );
  }
}
