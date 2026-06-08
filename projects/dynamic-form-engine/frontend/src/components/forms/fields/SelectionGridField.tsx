// Selection Grid — Mode A.
// Records load lazily on tab activation via useSelectionGridData.
// Selection state persists across page navigation using a Set<string>.
// BC-010: required validation applies even if the tab was never visited.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Skeleton,
  SkeletonItem,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
} from '@fluentui/react-components';
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ArrowClockwiseRegular,
} from '@fluentui/react-icons';
import type { GridRecord } from '@qdb/shared';
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

  // Selection state: Set<string> of selected record GUIDs.
  // Persists across page navigation within the same session.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const stored = fieldValues[field.schemaName];
    if (typeof stored === 'string') return new Set([stored]);
    if (Array.isArray(stored)) return new Set(stored as string[]);
    return new Set<string>();
  });

  const gridData = useSelectionGridData(field.id);

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
  useEffect(() => {
    if (isTabActive) {
      gridData.activate();
    }
    // gridData.activate is stable (useCallback) — safe to include.
  }, [isTabActive, gridData.activate]);

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

  function toggleRow(recordId: string) {
    if (isReadonly) return;

    if (selectionMode === 'single') {
      const next = new Set<string>([recordId]);
      syncSelectionToFormState(next);
    } else {
      const next = new Set(selectedIds);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      syncSelectionToFormState(next);
    }
  }

  function toggleSelectAll(checked: boolean) {
    if (isReadonly) return;

    if (checked) {
      const next = new Set(gridData.records.map((r) => r.id));
      syncSelectionToFormState(next);
    } else {
      syncSelectionToFormState(new Set<string>());
    }
  }

  const columns = useMemo<ColumnDef<GridRecord>[]>(() => {
    const colDefs: ColumnDef<GridRecord>[] = [];

    // Multi-select: prepend a select-all checkbox column.
    if (selectionMode === 'multi') {
      colDefs.push({
        id: '__select__',
        header: () => {
          const allSelected =
            gridData.records.length > 0 &&
            gridData.records.every((r) => selectedIds.has(r.id));
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

    // Data columns driven by gridColumnConfig.
    const sortedCols = [...columnConfigs].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    for (const col of sortedCols) {
      colDefs.push({
        id: col.columnId,
        header: col.columnLabel,
        cell: ({ row }) => {
          const record = row.original as GridRecord;
          const cellValue = record.values[col.targetAttribute];
          return (
            <span>
              {cellValue !== null && cellValue !== undefined
                ? String(cellValue)
                : ''}
            </span>
          );
        },
      });
    }

    return colDefs;
  }, [columnConfigs, selectionMode, selectedIds, gridData.records]);

  const table = useReactTable({
    data: gridData.records,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: gridData.totalPages,
  });

  if (gridData.status === 'idle' || gridData.status === 'loading') {
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
      {gridData.isCapped && (
        <Text className={styles.cappedNotice} role="status">
          Showing the first {gridData.totalCount} records. Contact your
          administrator if you cannot find a record.
        </Text>
      )}

      <div className={styles.scrollContainer}>
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
      </div>

      {gridData.totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Text className={styles.paginationInfo}>
            Page {gridData.page} of {gridData.totalPages} ({gridData.totalCount}{' '}
            total)
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
              disabled={gridData.page >= gridData.totalPages}
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
