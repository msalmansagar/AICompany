// Entry Grid — Mode B.
// Rows are pure client-side state stored in RHF via useEntryGridRows.
// BC-008: 300ms debounce on rule engine recomputation (enforced at DynamicFormRenderer level).
// BC-009: Warning banner when approaching 450-operation ceiling.
// BC-010: Required validation applies even if tab was never visited.

import { useMemo, useRef, useState } from 'react';
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
  Spinner,
  Link,
  makeStyles,
  tokens,
  Text,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  AddCircleRegular,
  DeleteRegular,
  ArrowUploadRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import type { GridColumnConfig, GridColumnOptionValue } from '@qdb/shared';
import { useEntryGridRows, type GridRow } from '../../../hooks/useEntryGridRows';
import { filesApi, type UploadedFileReference } from '../../../api/filesApi';
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
          uploadFieldId={field.schemaName}
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
  }, [sortedColumns, rows, isReadonly, updateCell, deleteRow, inputId, field.schemaName]);

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
  // Grid field schema name — passed to the upload API for 'file' columns.
  uploadFieldId: string;
}

function EntryGridCell({
  col,
  rowIndex,
  value,
  isReadonly,
  onCellChange,
  headerId,
  uploadFieldId,
}: EntryGridCellProps) {
  const cellId = `cell-${rowIndex}-${col.columnId}`;
  const stringValue =
    value !== null && value !== undefined ? String(value) : '';

  function handleChange(newValue: unknown) {
    onCellChange(rowIndex, col.targetAttribute, newValue);
  }

  switch (col.columnFieldType) {
    case 'file':
      return (
        <GridFileCell
          value={value}
          isReadonly={isReadonly}
          uploadFieldId={uploadFieldId}
          cellId={cellId}
          headerId={headerId}
          onChange={handleChange}
        />
      );

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

// ─── File / document cell ────────────────────────────────────────────────────

interface GridFileCellProps {
  value: unknown;
  isReadonly: boolean;
  uploadFieldId: string;
  cellId: string;
  headerId: string;
  onChange: (value: unknown) => void;
}

function isFileReference(value: unknown): value is UploadedFileReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fileId' in value &&
    'fileName' in value
  );
}

// A single-document upload cell. Stores the UploadedFileReference as the cell value.
function GridFileCell({ value, isReadonly, uploadFieldId, cellId, headerId, onChange }: GridFileCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileReference = isFileReference(value) ? value : undefined;

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const response = await filesApi.upload(uploadFieldId, file);
      const uploaded = (response as unknown as { data: UploadedFileReference }).data;
      onChange(uploaded);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  if (fileReference) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, minWidth: 0 }}>
        <Link
          href={fileReference.previewUrl ?? fileReference.url}
          target="_blank"
          rel="noopener noreferrer"
          title={fileReference.fileName}
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {fileReference.fileName}
        </Link>
        {!isReadonly && (
          <Button
            appearance="transparent"
            size="small"
            icon={<DismissRegular />}
            aria-label="Remove document"
            onClick={() => onChange(undefined)}
          />
        )}
      </div>
    );
  }

  if (isReadonly) {
    return <Text>—</Text>;
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={cellId}
        type="file"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
        aria-labelledby={headerId}
      />
      <Button
        appearance="secondary"
        size="small"
        icon={isUploading ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? 'Uploading…' : 'Upload'}
      </Button>
      {uploadError && (
        <Text style={{ color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200, display: 'block' }}>
          {uploadError}
        </Text>
      )}
    </div>
  );
}
