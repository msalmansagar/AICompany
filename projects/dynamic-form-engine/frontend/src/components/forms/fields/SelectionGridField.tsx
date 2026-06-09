// Selection Grid — Mode A.
// Records load lazily on tab activation via useSelectionGridData.
// Selection state persists across page navigation using a Set<string>.
// BC-010: required validation applies even if the tab was never visited.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Button,
  Checkbox,
  makeStyles,
  tokens,
  Text,
  Spinner,
  Skeleton,
  SkeletonItem,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  ToggleButton,
  Badge,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ArrowClockwiseRegular,
  GridRegular,
  TableRegular,
  CheckmarkCircleRegular,
} from '@fluentui/react-icons';
import type { GridRecord } from '@qdb/shared';

type ViewMode = 'table' | 'card';
import { useFormContext } from '../../../contexts/FormContext';
import { useSelectionGridData } from '../../../hooks/useSelectionGridData';
import type { ControlProps } from '../FieldRenderer';

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
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  rowClickable: {
    cursor: 'pointer',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  emptyState: {
    padding: tokens.spacingVerticalL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  paginationInfo: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  paginationButtons: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  skeletonRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
  },
  cappedNotice: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingVerticalM,
  },
  // Card styling restored: background, padding, shadow, border, hover
  cardItem: {
    cursor: 'pointer',
    position: 'relative',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `2px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    boxShadow: tokens.shadow4,
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
  },
  cardItemSelected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: tokens.shadow8,
  },
  cardBadge: {
    position: 'absolute',
    top: tokens.spacingVerticalS,
    right: tokens.spacingHorizontalS,
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    display: 'block',
    marginBottom: tokens.spacingVerticalS,
  },
  cardFieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  cardFieldLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  cardFieldValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    wordBreak: 'break-word',
  },
  // Non-blocking loading overlay — shown when re-fetching with existing records
  refetchOverlay: {
    position: 'relative',
  },
  refetchSpinner: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  contentDimmed: {
    opacity: '0.5',
    pointerEvents: 'none',
  },
});

interface SelectionGridFieldProps extends ControlProps {
  isTabActive: boolean;
}

export function SelectionGridField({
  field,
  inputId,
  isRequired,
  isReadonly,
  errorId,
  isTabActive,
}: SelectionGridFieldProps) {
  const styles = useStyles();
  const { fieldValues, updateFieldValue } = useFormContext();

  const gridConfig = field.gridConfig;
  const selectionMode = gridConfig?.selectionMode ?? 'single';
  const columnConfigs = gridConfig?.columnConfigs ?? [];

  // Resolve the current value of the depends-on field (if configured) for dynamic filtering.
  const dependsOnFieldId = gridConfig?.dependsOnFieldId;
  const dependsOnRaw = dependsOnFieldId ? fieldValues[dependsOnFieldId] : undefined;
  const dependsOnValue = dependsOnRaw !== undefined && dependsOnRaw !== null
    ? String(dependsOnRaw)
    : undefined;


  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Selection state: Set<string> of selected record GUIDs.
  // Persists across page navigation within the same session.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const stored = fieldValues[field.schemaName];
    if (typeof stored === 'string') return new Set([stored]);
    if (Array.isArray(stored)) return new Set(stored as string[]);
    return new Set<string>();
  });

  const gridData = useSelectionGridData(field.id, 50, dependsOnValue);

  // Track whether we have records from a previous load so we can show a
  // non-blocking spinner instead of replacing content with skeletons.
  const hasExistingRecords = gridData.records.length > 0;
  const isInitialLoad = gridData.status === 'idle' || (gridData.status === 'loading' && !hasExistingRecords);
  const isRefetching = gridData.status === 'loading' && hasExistingRecords;

  // BC-010: register an initial empty value on mount so required validation
  // fires even when this tab is never activated by the user.
  useEffect(() => {
    if (fieldValues[field.schemaName] === undefined) {
      updateFieldValue(field.schemaName, selectionMode === 'multi' ? [] : null);
    }
  // Only run on mount — field identity does not change after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activate lazy load when the containing tab becomes active.
  // gridData.activate is ref-backed and intentionally stable — excluding it
  // from deps prevents double-loads when dependsOnValue triggers loadPage recreation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isTabActive) gridData.activate();
  }, [isTabActive]);

  // Keep a ref to the latest records so toggleSelectAll doesn't need records in
  // the columns memo dep array (which would recompute all column defs on every fetch).
  const recordsRef = useRef<GridRecord[]>(gridData.records);
  recordsRef.current = gridData.records;

  // Updates both local selection state and form context atomically — intentional dual-write.
  const syncSelectionToFormState = useCallback(
    (nextIds: Set<string>) => {
      setSelectedIds(nextIds);
      if (selectionMode === 'single') {
        const [first] = nextIds;
        updateFieldValue(field.schemaName, first ?? null);
      } else {
        updateFieldValue(field.schemaName, [...nextIds]);
      }
    },
    [field.schemaName, selectionMode, updateFieldValue],
  );

  // pendingMultiSync: signals the useEffect below to push the new selectedIds to
  // form context after the state update settles. Using a ref avoids calling
  // updateFieldValue inside a functional state updater (React strict mode calls
  // updaters twice — causing double context broadcasts per click).
  const pendingMultiSyncRef = useRef(false);

  const toggleRow = useCallback((recordId: string) => {
    if (isReadonly) return;
    if (selectionMode === 'single') {
      syncSelectionToFormState(new Set<string>([recordId]));
    } else {
      pendingMultiSyncRef.current = true;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(recordId)) next.delete(recordId);
        else next.add(recordId);
        return next;
      });
    }
  }, [isReadonly, selectionMode, syncSelectionToFormState]);

  // Sync multi-select to form context after selectedIds state settles.
  // Skips on mount (pendingMultiSyncRef starts false) and on filter-driven resets.
  useEffect(() => {
    if (!pendingMultiSyncRef.current) return;
    pendingMultiSyncRef.current = false;
    updateFieldValue(field.schemaName, [...selectedIds]);
  // selectedIds is the trigger; the rest are stable references.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const toggleSelectAll = useCallback((checked: boolean) => {
    if (isReadonly) return;
    const next = checked
      ? new Set(recordsRef.current.map((r) => r.id))
      : new Set<string>();
    syncSelectionToFormState(next);
  }, [isReadonly, syncSelectionToFormState]);

  const sortedCols = useMemo(
    () => [...columnConfigs].sort((a, b) => a.displayOrder - b.displayOrder),
    [columnConfigs],
  );

  const columns = useMemo<ColumnDef<GridRecord>[]>(() => {
    const colDefs: ColumnDef<GridRecord>[] = [];

    // Multi-select: prepend a select-all checkbox column.
    // recordsRef used instead of gridData.records so this memo doesn't
    // invalidate on every fetch — column structure is independent of record data.
    if (selectionMode === 'multi') {
      colDefs.push({
        id: '__select__',
        header: () => {
          const recs = recordsRef.current;
          const allSelected = recs.length > 0 && recs.every((r) => selectedIds.has(r.id));
          return (
            <Checkbox
              checked={allSelected}
              onChange={(_, d) => toggleSelectAll(d.checked === true)}
              aria-label="Select all rows on this page"
            />
          );
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has((row.original as GridRecord).id)}
            onChange={() => toggleRow((row.original as GridRecord).id)}
            aria-label={`Select row ${row.index + 1}`}
          />
        ),
      });
    }

    for (const col of sortedCols) {
      colDefs.push({
        id: col.columnId,
        header: col.columnLabel,
        cell: ({ row }) => {
          const record = row.original as GridRecord;
          const cellValue = record.values[col.targetAttribute];
          return (
            <span>
              {cellValue !== null && cellValue !== undefined ? String(cellValue) : ''}
            </span>
          );
        },
      });
    }

    return colDefs;
  }, [sortedCols, selectionMode, selectedIds, toggleRow, toggleSelectAll]);

  const table = useReactTable({
    data: gridData.records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: -1, // unknown total — Next/Prev driven by hasNextPage
  });

  // Only replace content with skeletons on the very first load (idle or no records yet).
  // Filter changes and page navigation use the non-blocking spinner overlay instead.
  if (isInitialLoad) {
    return (
      <div
        className={styles.skeletonRows}
        aria-busy="true"
        aria-label="Loading grid records"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i}>
            <SkeletonItem size={32} />
          </Skeleton>
        ))}
      </div>
    );
  }

  if (gridData.status === 'error') {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          {gridData.error ?? 'Failed to load records.'}
        </MessageBarBody>
        <MessageBarActions>
          <Button
            appearance="secondary"
            icon={<ArrowClockwiseRegular />}
            onClick={gridData.retry}
            aria-label="Retry loading grid records"
          >
            Retry
          </Button>
        </MessageBarActions>
      </MessageBar>
    );
  }

  return (
    <div
      className={styles.wrapper}
      id={inputId}
      aria-required={isRequired}
      aria-describedby={errorId}
      aria-invalid={!!errorId}
    >
      {/* Non-blocking refetch indicator — keeps existing records visible */}
      {isRefetching && (
        <div className={styles.refetchSpinner} role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text>Updating…</Text>
        </div>
      )}

      {gridData.isCapped && (
        <Text className={styles.cappedNotice} role="status">
          Row limit reached. Contact your administrator if you cannot find a record.
        </Text>
      )}

      {/* View mode toggle toolbar */}
      <div className={styles.toolbar}>
        <ToggleButton
          icon={<TableRegular />}
          checked={viewMode === 'table'}
          onClick={() => setViewMode('table')}
          size="small"
          aria-label="Table view"
          appearance={viewMode === 'table' ? 'primary' : 'subtle'}
        >
          Table
        </ToggleButton>
        <ToggleButton
          icon={<GridRegular />}
          checked={viewMode === 'card'}
          onClick={() => setViewMode('card')}
          size="small"
          aria-label="Card view"
          appearance={viewMode === 'card' ? 'primary' : 'subtle'}
        >
          Cards
        </ToggleButton>
      </div>

      {/* Card view */}
      {viewMode === 'card' && (
        <div
          className={`${styles.cardGrid} ${isRefetching ? styles.contentDimmed : ''}`}
          role="listbox"
          aria-multiselectable={selectionMode === 'multi'}
          aria-label={`${field.label} card view`}
          aria-busy={isRefetching}
        >
          {gridData.records.length === 0 ? (
            <Text className={styles.emptyState}>No records found.</Text>
          ) : (
            gridData.records.map((record) => {
              const isSelected = selectedIds.has(record.id);
              return (
                <div
                  key={record.id}
                  className={`${styles.cardItem} ${isSelected ? styles.cardItemSelected : ''}`}
                  onClick={() => toggleRow(record.id)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow(record.id);
                    }
                  }}
                >
                  {isSelected && (
                    <Badge
                      className={styles.cardBadge}
                      icon={<CheckmarkCircleRegular />}
                      color="brand"
                      appearance="filled"
                      size="small"
                      aria-label="Selected"
                    />
                  )}
                  <Text className={styles.cardTitle}>
                    {String(record.values[sortedCols[0]?.targetAttribute] ?? record.id.slice(0, 8))}
                  </Text>
                  <div className={styles.cardFieldRow}>
                    {sortedCols.slice(1).map((col) => (
                      <div key={col.columnId}>
                        <Text className={styles.cardFieldLabel}>{col.columnLabel}</Text>
                        <Text className={styles.cardFieldValue} block>
                          {String(
                            record.values[`${col.targetAttribute}@OData.Community.Display.V1.FormattedValue`]
                            ?? record.values[col.targetAttribute]
                            ?? '—'
                          )}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && <div className={`${styles.scrollContainer} ${isRefetching ? styles.contentDimmed : ''}`}>
        <table
          className={styles.table}
          role="grid"
          aria-label={`${field.label} selection grid`}
          aria-multiselectable={selectionMode === 'multi'}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={styles.th}
                    role="columnheader"
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
                  <Text>No records found.</Text>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const record = row.original as GridRecord;
                const isSelected = selectedIds.has(record.id);

                return (
                  <tr
                    key={row.id}
                    className={
                      isSelected
                        ? `${styles.rowClickable} ${styles.rowSelected}`
                        : styles.rowClickable
                    }
                    aria-selected={isSelected}
                    onClick={() => toggleRow(record.id)}
                    role="row"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleRow(record.id);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={styles.td}
                        role="gridcell"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>}

      {(gridData.page > 1 || gridData.hasNextPage) && (
        <div className={styles.paginationRow}>
          <Text className={styles.paginationInfo}>
            Page {gridData.page}
            {gridData.isCapped && ' (row limit reached)'}
          </Text>
          <div className={styles.paginationButtons}>
            <Button
              appearance="secondary"
              icon={<ChevronLeftRegular />}
              disabled={gridData.page <= 1}
              onClick={() => gridData.loadPage(gridData.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <Button
              appearance="secondary"
              iconPosition="after"
              icon={<ChevronRightRegular />}
              disabled={!gridData.hasNextPage}
              onClick={() => gridData.loadPage(gridData.page + 1)}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
