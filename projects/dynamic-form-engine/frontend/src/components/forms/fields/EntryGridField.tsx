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
import type { GridColumnConfig, GridColumnOptionValue, LookupResult } from '@qdb/shared';
import { useEntryGridRows, type GridRow } from '../../../hooks/useEntryGridRows';
import { useLookupSearch } from '../../../hooks/useLookupSearch';
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

    case 'lookup':
      return (
        <GridLookupCell
          value={value}
          isReadonly={isReadonly}
          entityName={col.lookupTargetEntity ?? ''}
          displayAttribute={col.lookupDisplayAttribute ?? 'name'}
          valueAttribute={col.lookupValueAttribute}
          cellId={cellId}
          headerId={headerId}
          onChange={handleChange}
        />
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

// ─── Lookup cell (DFE) — editable entity-sourced lookup inside an entry grid ──
// Reuses the standalone lookup's search hook + endpoint. The cell value is a
// { id, displayName } object (JSON-serialised with the row on submit).
interface GridLookupValue {
  id: string;
  displayName: string;
}

interface GridLookupCellProps {
  value: unknown;
  isReadonly: boolean;
  entityName: string;
  displayAttribute: string;
  // Target-entity attribute stored as the record ID; undefined ⇒ primary key.
  valueAttribute?: string;
  cellId: string;
  headerId: string;
  onChange: (value: unknown) => void;
}

function isGridLookupValue(value: unknown): value is GridLookupValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as GridLookupValue).id === 'string'
  );
}

function GridLookupCell({
  value,
  isReadonly,
  entityName,
  displayAttribute,
  valueAttribute,
  cellId,
  headerId,
  onChange,
}: GridLookupCellProps) {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { results, isSearching, search, loadInitial, clearResults } = useLookupSearch({
    entityName,
    displayAttribute: displayAttribute || 'name',
    valueAttribute,
    maxResults: 10,
  });

  const selected = isGridLookupValue(value) ? value : null;
  const displayValue = inputText || selected?.displayName || '';
  const minChars = 2;

  function openList(): void {
    if (isReadonly) return;
    setIsOpen(true);
    if (!inputText) loadInitial();
  }

  function handleInput(query: string): void {
    setInputText(query);
    setIsOpen(true);
    if (query.length >= minChars) search(query);
    else if (!query) loadInitial();
  }

  function handlePick(result: LookupResult): void {
    onChange({ id: result.id, displayName: result.displayName } satisfies GridLookupValue);
    setInputText('');
    clearResults();
    setIsOpen(false);
  }

  function handleClear(e: React.MouseEvent): void {
    e.stopPropagation();
    onChange(undefined);
    setInputText('');
  }

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOpen(false);
      }}
    >
      <Input
        id={cellId}
        value={displayValue}
        onChange={(e) => handleInput(e.target.value)}
        input={{ onFocus: openList }}
        disabled={isReadonly}
        placeholder="Search…"
        aria-labelledby={headerId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{ width: '100%' }}
        contentAfter={
          selected ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              aria-label="Clear selection"
              tabIndex={-1}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: tokens.colorNeutralForeground3 }}
            >
              ✕
            </button>
          ) : undefined
        }
      />
      {isOpen && !isReadonly && (
        <div
          role="listbox"
          style={{
            position: 'absolute', zIndex: 9999, top: '100%', left: 0, right: 0,
            backgroundColor: tokens.colorNeutralBackground1,
            border: `1px solid ${tokens.colorNeutralStroke1}`,
            borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow16,
            maxHeight: '220px', overflowY: 'auto', marginTop: '2px',
          }}
        >
          {isSearching && (
            <div style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Spinner size="tiny" /> Searching…
            </div>
          )}
          {!isSearching && results.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: '12px', color: tokens.colorNeutralForeground3 }}>No results</div>
          )}
          {!isSearching &&
            results.map((result) => (
              <button
                key={result.id}
                role="option"
                aria-selected={result.id === selected?.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(result)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                  border: 'none', cursor: 'pointer', fontSize: '13px',
                  backgroundColor: result.id === selected?.id ? tokens.colorBrandBackground2 : 'transparent',
                }}
              >
                {result.displayName}
              </button>
            ))}
        </div>
      )}
    </div>
  );
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
