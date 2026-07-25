// Selection Grid — Mode A.
// Records load lazily on tab activation via useSelectionGridData.
// Selection state persists across page navigation using a Set<string>.
// BC-010: required validation applies even if the tab was never visited.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Button,
  Checkbox,
  Input,
  Select,
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
  FilterRegular,
  ArrowSortRegular,
  ArrowSortUpRegular,
  ArrowSortDownRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import type { GridColumnConfig, GridRecord } from '@qdb/shared';

type ViewMode = 'table' | 'card';
import { useFormContext } from '../../../contexts/FormContext';
import { useSelectionGridData } from '../../../hooks/useSelectionGridData';
import { DynamicIcon } from '../DynamicIcon';
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
  // Numbered pager: page-number buttons flanked by prev/next arrows.
  numberedPager: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    flexWrap: 'wrap',
  },
  pageEllipsis: {
    padding: `0 ${tokens.spacingHorizontalXXS}`,
    color: tokens.colorNeutralForeground3,
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
  // DFE-GRIDSRC-001: row (list-style) info-card layout — full-width horizontal cards.
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  cardItemRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    boxSizing: 'border-box',
  },
  cardRowBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXXS,
  },
  cardRowField: {
    display: 'inline-flex',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  cardTitleInline: {
    marginBottom: 0,
    marginRight: tokens.spacingHorizontalS,
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
  },
  // Toolbar: view toggles only (search replaced by per-column filter row)
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  activeFilterBadge: {
    marginRight: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorBrandForeground1,
  },
  filterCell: {
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  filterInput: {
    width: '100%',
    minWidth: '80px',
  },
  filterSelect: {
    width: '100%',
    minWidth: '80px',
  },
  thSortable: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      color: tokens.colorBrandForeground1,
    },
  },
  sortIcon: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  sortIconActive: {
    color: tokens.colorBrandForeground1,
  },
});

// ── Cell value resolution ─────────────────────────────────────────────────────

// Resolves a record's display text for a configured column. Lookup columns are
// returned by the CRM Web API under `_{schema}_value` (raw GUID) and
// `_{schema}_value@OData.Community.Display.V1.FormattedValue` (friendly name),
// not under the bare schema name — so a plain key lookup renders lookups blank.
// Order: formatted lookup name → direct schema-name value (non-lookup, unchanged)
// → raw lookup GUID. Null/undefined-safe; returns '' when nothing resolves.
export function resolveRecordDisplayValue(
  values: Record<string, unknown>,
  attribute: string,
): string {
  // FetchXml-sourced grids (saved-view queries) return the formatted display value
  // under `attr@FormattedValue` — for both lookups AND option-sets. Check this before
  // the raw attribute so lookup/optionset columns show the name/label, not the GUID/code.
  const fetchXmlFormatted =
    values?.[`${attribute}@OData.Community.Display.V1.FormattedValue`];
  if (fetchXmlFormatted !== null && fetchXmlFormatted !== undefined) {
    return String(fetchXmlFormatted);
  }

  // OData Web API convention for a lookup's formatted value.
  const formattedLookup =
    values?.[`_${attribute}_value@OData.Community.Display.V1.FormattedValue`];
  if (formattedLookup !== null && formattedLookup !== undefined) {
    return String(formattedLookup);
  }

  const direct = values?.[attribute];
  if (direct !== null && direct !== undefined) {
    return String(direct);
  }

  const rawLookup = values?.[`_${attribute}_value`];
  if (rawLookup !== null && rawLookup !== undefined) {
    return String(rawLookup);
  }

  return '';
}

// DFE-GRIDSRC-001: parses a grid's static JSON data source into GridRecords.
// A JSON array of objects; each object's `id` (or its index) is the record id and
// the object is the values map. Never throws — invalid/non-array JSON → [].
function parseJsonGridRecords(jsonData: string | undefined): GridRecord[] {
  if (!jsonData || !jsonData.trim().startsWith('[')) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonData);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row))
    .map((row, index) => ({ id: row.id != null ? String(row.id) : `json-${index}`, values: row }));
}

// Builds the windowed page list for the numbered pager: always the first and last
// page, the current page with one neighbour on each side, and 'ellipsis' markers for
// the gaps. e.g. current 5 of 10 → [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10].
export function buildPageList(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) result.push('ellipsis');
    result.push(page);
    previous = page;
  }
  return result;
}

// ── Per-column filter cell ────────────────────────────────────────────────────

type FilterCellStyles = ReturnType<typeof useStyles>;

function renderColumnFilter(
  col: GridColumnConfig,
  filterInputs: Record<string, string>,
  onChange: (attribute: string, value: string) => void,
  isReadonly: boolean,
  styles: FilterCellStyles,
): React.ReactNode {
  const filterType = col.filterType ?? 'none';
  const currentValue = filterInputs[col.targetAttribute] ?? '';

  if (filterType === 'text' || filterType === 'lookup') {
    return (
      <Input
        className={styles.filterInput}
        size="small"
        placeholder="Filter…"
        value={currentValue}
        onChange={(_, d) => onChange(col.targetAttribute, d.value)}
        disabled={isReadonly}
        contentAfter={
          currentValue
            ? (
              <Button
                appearance="transparent"
                size="small"
                icon={<DismissRegular />}
                onClick={() => onChange(col.targetAttribute, '')}
                aria-label={`Clear filter for ${col.columnLabel}`}
              />
            )
            : undefined
        }
        aria-label={`Filter ${col.columnLabel}`}
      />
    );
  }

  if (filterType === 'optionset' && col.options && col.options.length > 0) {
    return (
      <Select
        className={styles.filterSelect}
        size="small"
        value={currentValue}
        onChange={(_, d) => onChange(col.targetAttribute, d.value)}
        disabled={isReadonly}
        aria-label={`Filter ${col.columnLabel}`}
      >
        <option value="">All</option>
        {col.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }

  return null;
}

// ── Component ──────────────────────────────────────────────────────────────────

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

  // DFE-GRIDSRC-001: data source (entity fetch vs static JSON), display mode, and
  // interactivity. Read-only display grids show no selection controls or value.
  const isJsonSource = gridConfig?.dataSource === 'json';
  const isSelectable = gridConfig?.selectable !== false;
  // viewOption controls which views are offered: 'both' shows the Table/Cards toggle,
  // 'table'/'card' lock to a single view and hide the toggle.
  const viewOption = gridConfig?.viewMode ?? 'both';
  const showViewToggle = viewOption === 'both';
  const defaultViewMode: ViewMode = viewOption === 'card'
    ? 'card'
    : viewOption === 'table'
      ? 'table'
      : gridConfig?.displayMode === 'infocard' ? 'card' : 'table';
  // DFE-GRIDSRC-001: 'row' arranges info cards as full-width horizontal list rows.
  const isRowLayout = gridConfig?.cardLayout === 'row';
  // Pager UI: 'numbered' page buttons vs default Previous/Next.
  const pagingStyle = gridConfig?.pagingStyle ?? 'prevnext';

  // Depends-on filtering: dependsOnFieldId is a comma-separated list of form-field
  // schema names. Each supplies a {schemaName} placeholder value to the filter template;
  // 'dependsOnValue' aliases the first field for single-field (legacy) templates.
  const dependsOnSchemas = useMemo(
    () => (gridConfig?.dependsOnFieldId ?? '').split(',').map((schema) => schema.trim()).filter(Boolean),
    [gridConfig?.dependsOnFieldId],
  );
  const dependsOnValues = useMemo(() => {
    const map: Record<string, string> = {};
    for (const schema of dependsOnSchemas) {
      const raw = fieldValues[schema];
      map[schema] = raw !== undefined && raw !== null ? String(raw) : '';
    }
    if (dependsOnSchemas.length > 0) {
      map.dependsOnValue = map[dependsOnSchemas[0]] ?? '';
    }
    return map;
  }, [dependsOnSchemas, fieldValues]);


  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);

  // Per-column filter state:
  //   columnFilterInputs — live values (updated on every keystroke / select change)
  //   columnFilters      — debounced values sent to the backend
  const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleColumnFilterChange = useCallback((attribute: string, value: string) => {
    setColumnFilterInputs((prev) => ({ ...prev, [attribute]: value }));
    clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      setColumnFilters((prev) => {
        const next = { ...prev, [attribute]: value };
        if (!value.trim()) delete next[attribute];
        return next;
      });
    }, 300);
  }, []);

  const clearAllFilters = useCallback(() => {
    clearTimeout(filterDebounceRef.current);
    setColumnFilterInputs({});
    setColumnFilters({});
  }, []);

  const activeFilterCount = Object.keys(columnFilters).length;

  // Sort state: column = null means no override (view default order).
  const [sortState, setSortState] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({
    column: null,
    direction: 'asc',
  });

  const handleSortColumn = useCallback((attribute: string) => {
    setSortState((prev) => {
      if (prev.column !== attribute) return { column: attribute, direction: 'asc' };
      if (prev.direction === 'asc') return { column: attribute, direction: 'desc' };
      return { column: null, direction: 'asc' };
    });
  }, []);

  // Selection state: Set<string> of selected record GUIDs.
  // Persists across page navigation within the same session.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const stored = fieldValues[field.schemaName];
    if (typeof stored === 'string') return new Set([stored]);
    if (Array.isArray(stored)) return new Set(stored as string[]);
    return new Set<string>();
  });

  const gridData = useSelectionGridData(
    field.id,
    gridConfig?.pageSize ?? 50,
    dependsOnValues,
    undefined,
    sortState.column ?? undefined,
    sortState.column ? sortState.direction : undefined,
    activeFilterCount > 0 ? columnFilters : undefined,
  );

  // DFE-GRIDSRC-001: JSON source parses static rows client-side (no fetch/pagination);
  // entity source uses the lazy fetch hook above.
  const jsonRecords = useMemo(
    () => (isJsonSource ? parseJsonGridRecords(gridConfig?.jsonData) : []),
    [isJsonSource, gridConfig?.jsonData],
  );
  const records = isJsonSource ? jsonRecords : gridData.records;

  // Track whether we have records from a previous load so we can show a
  // non-blocking spinner instead of replacing content with skeletons.
  const hasExistingRecords = records.length > 0;
  const isInitialLoad = !isJsonSource && (gridData.status === 'idle' || (gridData.status === 'loading' && !hasExistingRecords));
  const isRefetching = !isJsonSource && gridData.status === 'loading' && hasExistingRecords;

  // BC-010: register an initial empty value on mount so required validation
  // fires even when this tab is never activated by the user.
  useEffect(() => {
    if (isSelectable && fieldValues[field.schemaName] === undefined) {
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
    if (isTabActive && !isJsonSource) gridData.activate();
  }, [isTabActive]);

  // Keep a ref to the latest records so toggleSelectAll doesn't need records in
  // the columns memo dep array (which would recompute all column defs on every fetch).
  const recordsRef = useRef<GridRecord[]>(records);
  recordsRef.current = records;

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

  // Use the same pendingMultiSync pattern as toggleRow so FormContext is updated
  // in a deferred useEffect rather than synchronously in the event handler.
  // Calling updateFieldValue synchronously here triggers a full-form re-render
  // + rule-engine evaluation with every selected GUID, freezing the UI.
  const toggleSelectAll = useCallback((checked: boolean) => {
    if (isReadonly) return;
    pendingMultiSyncRef.current = true;
    setSelectedIds(
      checked
        ? new Set(recordsRef.current.map((r) => r.id))
        : new Set<string>(),
    );
  }, [isReadonly]);

  const sortedCols = useMemo(
    () => [...columnConfigs].sort((a, b) => a.displayOrder - b.displayOrder),
    [columnConfigs],
  );

  const columns = useMemo<ColumnDef<GridRecord>[]>(() => {
    const colDefs: ColumnDef<GridRecord>[] = [];

    // Multi-select: prepend a select-all checkbox column.
    // recordsRef used instead of gridData.records so this memo doesn't
    // invalidate on every fetch — column structure is independent of record data.
    // DFE-GRIDSRC-001: omitted for read-only display grids.
    if (selectionMode === 'multi' && isSelectable) {
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
          // span catches the click before it reaches <tr onClick=toggleRow>,
          // preventing the double-toggle (onChange + tr onClick both fire toggleRow).
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.has((row.original as GridRecord).id)}
              onChange={() => toggleRow((row.original as GridRecord).id)}
              aria-label={`Select row ${row.index + 1}`}
            />
          </span>
        ),
      });
    }

    for (const col of sortedCols) {
      colDefs.push({
        id: col.columnId,
        header: () => {
          const isActive = sortState.column === col.targetAttribute;
          const SortIcon = isActive
            ? (sortState.direction === 'asc' ? ArrowSortUpRegular : ArrowSortDownRegular)
            : ArrowSortRegular;
          return (
            <div
              className={styles.thSortable}
              onClick={() => handleSortColumn(col.targetAttribute)}
              role="button"
              tabIndex={0}
              aria-label={`Sort by ${col.columnLabel}${isActive ? `, currently ${sortState.direction}ending` : ''}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortColumn(col.targetAttribute); } }}
            >
              <span>{col.columnLabel}</span>
              <SortIcon className={`${styles.sortIcon} ${isActive ? styles.sortIconActive : ''}`} />
            </div>
          );
        },
        cell: ({ row }) => {
          const record = row.original as GridRecord;
          return (
            <span>
              {resolveRecordDisplayValue(record.values, col.targetAttribute)}
            </span>
          );
        },
      });
    }

    return colDefs;
  }, [sortedCols, selectionMode, isSelectable, selectedIds, toggleRow, toggleSelectAll, sortState, handleSortColumn, styles.thSortable, styles.sortIcon, styles.sortIconActive]);

  const table = useReactTable({
    data: records,
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

      {/* Toolbar: active filter count + view toggle. Rendered only when there's
          something to show — the toggle (view mode 'both') or an active filter. */}
      {(showViewToggle || activeFilterCount > 0) && (
        <div className={styles.toolbarRow}>
          {activeFilterCount > 0 && (
            <div className={styles.activeFilterBadge}>
              <FilterRegular />
              <Text size={200}>{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</Text>
              <Button
                appearance="transparent"
                size="small"
                icon={<DismissRegular />}
                onClick={clearAllFilters}
                aria-label="Clear all filters"
              />
            </div>
          )}
          {showViewToggle && (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Card view */}
      {viewMode === 'card' && (
        <div
          className={`${isRowLayout ? styles.cardList : styles.cardGrid} ${isRefetching ? styles.contentDimmed : ''}`}
          role={isSelectable ? 'listbox' : 'list'}
          aria-multiselectable={isSelectable && selectionMode === 'multi'}
          aria-label={`${field.label} card view`}
          aria-busy={isRefetching}
        >
          {records.length === 0 ? (
            <Text className={styles.emptyState}>No records found.</Text>
          ) : (
            records.map((record) => {
              // DFE-GRIDSRC-001: read-only display grids render non-interactive info cards.
              const interactive = isSelectable && !isReadonly;
              const isSelected = isSelectable && selectedIds.has(record.id);
              const heading = resolveRecordDisplayValue(record.values, sortedCols[0]?.targetAttribute ?? '')
                || record.id.slice(0, 8);
              const bodyCols = sortedCols.slice(1);
              return (
                <div
                  key={record.id}
                  className={`${styles.cardItem} ${isRowLayout ? styles.cardItemRow : ''} ${isSelected ? styles.cardItemSelected : ''}`}
                  onClick={interactive ? () => toggleRow(record.id) : undefined}
                  role={interactive ? 'option' : 'listitem'}
                  aria-selected={interactive ? isSelected : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onKeyDown={interactive ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow(record.id);
                    }
                  } : undefined}
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
                  {/* DFE-GRIDSRC-001: rich info card — optional icon, heading, then fields. */}
                  {gridConfig?.cardIconName && (
                    <span
                      aria-hidden="true"
                      style={isRowLayout
                        ? { display: 'inline-flex', color: tokens.colorBrandForeground1, flexShrink: 0 }
                        : { display: 'block', color: tokens.colorBrandForeground1, marginBottom: tokens.spacingVerticalXS }}
                    >
                      <DynamicIcon iconName={gridConfig.cardIconName} size={isRowLayout ? 20 : 24} />
                    </span>
                  )}
                  {isRowLayout ? (
                    <div className={styles.cardRowBody}>
                      <Text className={`${styles.cardTitle} ${styles.cardTitleInline}`}>{heading}</Text>
                      {bodyCols.map((col) => (
                        <span key={col.columnId} className={styles.cardRowField}>
                          <span className={styles.cardFieldLabel}>{col.columnLabel}:</span>
                          {' '}{resolveRecordDisplayValue(record.values, col.targetAttribute) || '—'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Text className={styles.cardTitle}>{heading}</Text>
                      <div className={styles.cardFieldRow}>
                        {bodyCols.map((col) => (
                          <div key={col.columnId}>
                            <Text className={styles.cardFieldLabel}>{col.columnLabel}</Text>
                            <Text className={styles.cardFieldValue} block>
                              {resolveRecordDisplayValue(record.values, col.targetAttribute) || '—'}
                            </Text>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
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
            <tr role="row" aria-label="Column filters">
              {selectionMode === 'multi' && isSelectable && (
                <td className={styles.filterCell} />
              )}
              {sortedCols.map((col) => (
                <td key={`filter-${col.columnId}`} className={styles.filterCell}>
                  {renderColumnFilter(col, columnFilterInputs, handleColumnFilterChange, isReadonly, styles)}
                </td>
              ))}
            </tr>
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
                // DFE-GRIDSRC-001: read-only display rows are not clickable/selectable.
                const interactive = isSelectable && !isReadonly;
                const isSelected = isSelectable && selectedIds.has(record.id);
                const rowClass = [interactive ? styles.rowClickable : '', isSelected ? styles.rowSelected : '']
                  .filter(Boolean)
                  .join(' ');

                return (
                  <tr
                    key={row.id}
                    className={rowClass || undefined}
                    aria-selected={interactive ? isSelected : undefined}
                    onClick={interactive ? () => toggleRow(record.id) : undefined}
                    role="row"
                    tabIndex={interactive ? 0 : undefined}
                    onKeyDown={interactive ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleRow(record.id);
                      }
                    } : undefined}
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

      {!isJsonSource && (gridData.page > 1 || gridData.hasNextPage) && (
        <div className={styles.paginationRow}>
          <Text className={styles.paginationInfo}>
            Page {gridData.page}
            {gridData.totalPages ? ` of ${gridData.totalPages}` : ''}
            {gridData.totalCount ? ` · ${gridData.totalCount} records` : ''}
            {gridData.isCapped && ' · row limit applied'}
          </Text>
          {pagingStyle === 'numbered' && gridData.totalPages ? (
            <div className={styles.numberedPager} role="navigation" aria-label="Grid pagination">
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronLeftRegular />}
                disabled={gridData.page <= 1}
                onClick={() => gridData.loadPage(gridData.page - 1)}
                aria-label="Previous page"
              />
              {buildPageList(gridData.page, gridData.totalPages).map((entry, index) =>
                entry === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className={styles.pageEllipsis} aria-hidden="true">…</span>
                ) : (
                  <Button
                    key={entry}
                    appearance={entry === gridData.page ? 'primary' : 'subtle'}
                    size="small"
                    onClick={() => gridData.loadPage(entry)}
                    aria-label={`Page ${entry}`}
                    aria-current={entry === gridData.page ? 'page' : undefined}
                  >
                    {entry}
                  </Button>
                ),
              )}
              <Button
                appearance="subtle"
                size="small"
                icon={<ChevronRightRegular />}
                disabled={!gridData.hasNextPage}
                onClick={() => gridData.loadPage(gridData.page + 1)}
                aria-label="Next page"
              />
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
