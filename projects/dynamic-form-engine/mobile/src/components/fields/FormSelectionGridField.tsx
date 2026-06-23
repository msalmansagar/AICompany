import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, useWatch, type Control } from 'react-hook-form';
import type { FieldDefinition, GridColumnConfig, GridRecord } from '@qdb/shared';
import { apiGet } from '../../services/apiClient';
import { fieldStyles } from './fieldStyles';
import { isFieldRequired } from '../../utils/buildValidationRules';
import { logger } from '../../logger';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  accessToken: string;
  isTabActive: boolean;
}

interface GridPageResponse {
  records: GridRecord[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  nextPageCookie?: string;
  isCapped: boolean;
  totalCount?: number;
  totalPages?: number;
}

type ViewMode = 'table' | 'card';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

function buildRequiredRule(field: FieldDefinition): Record<string, (v: unknown) => true | string> {
  if (!isFieldRequired(field)) return {};
  const message = `${field.displayLabel} is required`;
  return {
    required: (v: unknown) => {
      if (v === undefined || v === null) return message;
      if (Array.isArray(v) && v.length === 0) return message;
      if (typeof v === 'string' && v.length === 0) return message;
      return true;
    },
  };
}

export function FormSelectionGridField({ field, control, accessToken, isTabActive }: Props) {
  const gridConfig = field.gridConfig;
  const isMulti = gridConfig?.selectionMode === 'multi';
  const visibleColumns = (gridConfig?.columnConfigs ?? []).sort((a, b) => a.displayOrder - b.displayOrder);

  // ── dependsOnValue ───────────────────────────────────────────
  const dependsOnFieldKey = (gridConfig?.dependsOnFieldId ?? '__none__') as string;
  const rawDependsOn = useWatch({ control, name: dependsOnFieldKey });
  const dependsOnValue = gridConfig?.dependsOnFieldId
    ? (rawDependsOn != null ? String(rawDependsOn) : undefined)
    : undefined;

  // ── grid data state ──────────────────────────────────────────
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>();
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const cookieMapRef = useRef(new Map<number, string>());

  // ── search / sort / view / column filters ────────────────────
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<SortDir | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [columnFilterInputs, setColumnFilterInputs] = useState<Record<string, string>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const colFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleColumnFilterChange(attribute: string, value: string): void {
    setColumnFilterInputs((prev) => ({ ...prev, [attribute]: value }));
    clearTimeout(colFilterDebounceRef.current);
    colFilterDebounceRef.current = setTimeout(() => {
      setColumnFilters((prev) => {
        const next = { ...prev, [attribute]: value };
        if (!value.trim()) delete next[attribute];
        return next;
      });
    }, 300);
  }

  const activeFilterCount = Object.keys(columnFilters).length;

  // Debounce search input by 300 ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Stable ref holding the latest filter params so fetchRecords stays stable.
  const filterRef = useRef({ dependsOnValue, debouncedSearch, sortBy, sortDir, columnFilters });
  filterRef.current = { dependsOnValue, debouncedSearch, sortBy, sortDir, columnFilters };

  const fetchRecords = useCallback(async (requestedPage: number): Promise<void> => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError(undefined);

    const { dependsOnValue: dov, debouncedSearch: ds, sortBy: sb, sortDir: sd, columnFilters: cf } = filterRef.current;
    const pagingCookie = requestedPage > 1 ? cookieMapRef.current.get(requestedPage - 1) : undefined;

    const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) });
    if (dov) params.set('dependsOnValue', dov);
    if (ds) params.set('searchText', ds);
    if (sb) params.set('sortBy', sb);
    if (sd) params.set('sortDirection', sd);
    if (pagingCookie) params.set('pagingCookie', pagingCookie);
    if (Object.keys(cf).length > 0) params.set('columnFilters', JSON.stringify(cf));

    try {
      const resp = await apiGet<GridPageResponse>(
        `/api/grids/${field.fieldId}/records?${params.toString()}`,
        accessToken,
      );
      if (resp.nextPageCookie) cookieMapRef.current.set(requestedPage, resp.nextPageCookie);
      setRecords(resp.records);
      setPage(resp.page);
      setHasNextPage(resp.hasNextPage);
      setTotalCount(resp.totalCount);
      hasLoadedRef.current = true;
    } catch (error) {
      logger.error({ message: 'Grid fetch failed', context: { fieldId: field.fieldId, error } });
      setLoadError('Failed to load records. Tap to retry.');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [field.fieldId, accessToken]);

  // Lazy load on first tab activation.
  useEffect(() => {
    if (isTabActive && !hasLoadedRef.current && !isLoadingRef.current) {
      void fetchRecords(1);
    }
  }, [isTabActive, fetchRecords]);

  // Re-fetch page 1 when any filter changes.
  const filterKey = [dependsOnValue ?? '', debouncedSearch, sortBy ?? '', sortDir ?? '', JSON.stringify(columnFilters)].join('\0');
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current === filterKey) return;
    prevFilterKeyRef.current = filterKey;
    cookieMapRef.current.clear();
    hasLoadedRef.current = false;
    void fetchRecords(1);
  // fetchRecords is stable (field.fieldId + accessToken only).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  function handleSort(targetAttribute: string): void {
    if (sortBy === targetAttribute) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortBy(undefined); setSortDir(undefined); }
    } else {
      setSortBy(targetAttribute);
      setSortDir('asc');
    }
  }

  if (!gridConfig) {
    return (
      <View style={fieldStyles.container}>
        <Text style={fieldStyles.label}>{field.displayLabel}</Text>
        <Text style={styles.emptyConfig}>Grid not configured.</Text>
      </View>
    );
  }

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={{ validate: buildRequiredRule(field) }}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selectedSingle = typeof value === 'string' ? value : '';
        const selectedMulti: string[] = Array.isArray(value) ? (value as string[]) : [];

        const currentPageIds = records.map((r) => r.id);
        const allCurrentSelected =
          isMulti &&
          currentPageIds.length > 0 &&
          currentPageIds.every((id) => selectedMulti.includes(id));

        function isSelected(recordId: string): boolean {
          return isMulti ? selectedMulti.includes(recordId) : selectedSingle === recordId;
        }

        function handleSelect(recordId: string): void {
          if (isMulti) {
            const next = selectedMulti.includes(recordId)
              ? selectedMulti.filter((id) => id !== recordId)
              : [...selectedMulti, recordId];
            onChange(next);
          } else {
            onChange(recordId);
          }
        }

        function handleSelectAll(): void {
          if (allCurrentSelected) {
            onChange(selectedMulti.filter((id) => !currentPageIds.includes(id)));
          } else {
            const newIds = currentPageIds.filter((id) => !selectedMulti.includes(id));
            onChange([...selectedMulti, ...newIds]);
          }
        }

        return (
          <View style={fieldStyles.container}>
            {/* Header row: label + view toggle */}
            <View style={styles.headerRow}>
              <Text style={fieldStyles.label}>
                {field.displayLabel}
                {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
              </Text>
              <Pressable
                style={styles.viewToggle}
                onPress={() => setViewMode((m) => (m === 'table' ? 'card' : 'table'))}
                accessibilityRole="button"
                accessibilityLabel={viewMode === 'table' ? 'Switch to card view' : 'Switch to table view'}
              >
                <Text style={styles.viewToggleText}>{viewMode === 'table' ? '⊞ Cards' : '≡ Table'}</Text>
              </Pressable>
            </View>

            {/* Search input */}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search…"
                placeholderTextColor="#aaa"
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search records"
              />
              {searchText.length > 0 && (
                <Pressable style={styles.clearSearch} onPress={() => setSearchText('')}>
                  <Text style={styles.clearSearchText}>✕</Text>
                </Pressable>
              )}
            </View>

            {/* Loading */}
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0078d4" />
                <Text style={styles.loadingText}>Loading records…</Text>
              </View>
            )}

            {/* Error / retry */}
            {!isLoading && loadError !== undefined && (
              <Pressable
                style={styles.errorRow}
                onPress={() => { hasLoadedRef.current = false; void fetchRecords(page); }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading records"
              >
                <Text style={styles.errorRetryText}>{loadError}</Text>
              </Pressable>
            )}

            {/* Empty state */}
            {!isLoading && loadError === undefined && records.length === 0 && hasLoadedRef.current && (
              <Text style={styles.emptyConfig}>No records found.</Text>
            )}

            {/* Records */}
            {!isLoading && records.length > 0 && (
              <>
                {/* Select-all bar (multi only) */}
                {isMulti && (
                  <Pressable style={styles.selectAllBar} onPress={handleSelectAll} accessibilityRole="button">
                    <Text style={styles.selectAllText}>
                      {allCurrentSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    </Text>
                    {selectedMulti.length > 0 && (
                      <Text style={styles.selectedCountBadge}>{selectedMulti.length} selected</Text>
                    )}
                  </Pressable>
                )}

                {viewMode === 'table'
                  ? (
                    <TableView
                      records={records}
                      columns={visibleColumns}
                      isMulti={isMulti}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      isSelected={isSelected}
                      onSelect={handleSelect}
                      columnFilterInputs={columnFilterInputs}
                      onColumnFilterChange={handleColumnFilterChange}
                      activeFilterCount={activeFilterCount}
                    />
                  )
                  : (
                    <CardView
                      records={records}
                      columns={visibleColumns}
                      isMulti={isMulti}
                      isSelected={isSelected}
                      onSelect={handleSelect}
                    />
                  )
                }

                {/* Pagination */}
                <View style={styles.pagination}>
                  <Pressable
                    style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
                    onPress={() => { if (page > 1) void fetchRecords(page - 1); }}
                    disabled={page <= 1}
                    accessibilityRole="button"
                    accessibilityLabel="Previous page"
                  >
                    <Text style={[styles.pageButtonText, page <= 1 && styles.pageButtonTextDisabled]}>‹ Prev</Text>
                  </Pressable>

                  <Text style={styles.pageInfo}>
                    {totalCount !== undefined
                      ? `Page ${page} · ${totalCount} total`
                      : `Page ${page}`}
                  </Text>

                  <Pressable
                    style={[styles.pageButton, !hasNextPage && styles.pageButtonDisabled]}
                    onPress={() => { if (hasNextPage) void fetchRecords(page + 1); }}
                    disabled={!hasNextPage}
                    accessibilityRole="button"
                    accessibilityLabel="Next page"
                  >
                    <Text style={[styles.pageButtonText, !hasNextPage && styles.pageButtonTextDisabled]}>Next ›</Text>
                  </Pressable>
                </View>
              </>
            )}

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

// ── Table view ───────────────────────────────────────────────────

interface TableViewProps {
  records: GridRecord[];
  columns: GridColumnConfig[];
  isMulti: boolean;
  sortBy: string | undefined;
  sortDir: SortDir | undefined;
  onSort: (attr: string) => void;
  isSelected: (id: string) => boolean;
  onSelect: (id: string) => void;
  columnFilterInputs: Record<string, string>;
  onColumnFilterChange: (attribute: string, value: string) => void;
  activeFilterCount: number;
}

function TableView({ records, columns, isMulti, sortBy, sortDir, onSort, isSelected, onSelect, columnFilterInputs, onColumnFilterChange, activeFilterCount }: TableViewProps) {
  const filterableColumns = columns.filter(
    (col) => col.filterType === 'text' || col.filterType === 'lookup' || col.filterType === 'optionset',
  );
  const hasFilters = filterableColumns.length > 0;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Sortable column headers */}
        <View style={styles.tableHeaderRow}>
          <View style={styles.checkCell} />
          {columns.map((col) => {
            const isSorted = sortBy === col.targetAttribute;
            return (
              <Pressable
                key={col.targetAttribute}
                style={styles.tableHeaderCell}
                onPress={() => onSort(col.targetAttribute)}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${col.columnLabel}`}
              >
                <Text style={styles.headerText} numberOfLines={1}>{col.columnLabel}</Text>
                <Text style={styles.sortIndicator}>
                  {isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Per-column filter row */}
        {hasFilters && (
          <View style={styles.tableHeaderRow}>
            <View style={styles.checkCell} />
            {columns.map((col) => {
              const filterType = col.filterType ?? 'none';
              const currentValue = columnFilterInputs[col.targetAttribute] ?? '';

              if (filterType === 'text' || filterType === 'lookup') {
                return (
                  <View key={`filter-${col.targetAttribute}`} style={[styles.tableHeaderCell, styles.filterCell]}>
                    <TextInput
                      style={styles.filterInput}
                      value={currentValue}
                      onChangeText={(v) => onColumnFilterChange(col.targetAttribute, v)}
                      placeholder="Filter…"
                      placeholderTextColor="#bbb"
                      clearButtonMode="while-editing"
                      accessibilityLabel={`Filter ${col.columnLabel}`}
                    />
                  </View>
                );
              }

              if (filterType === 'optionset' && col.options && col.options.length > 0) {
                return (
                  <View key={`filter-${col.targetAttribute}`} style={[styles.tableHeaderCell, styles.filterCell]}>
                    <Pressable
                      style={styles.filterSelect}
                      onPress={() => {
                        // Cycle through options (empty → opt1 → opt2 → ... → empty)
                        const opts = col.options ?? [];
                        const idx = opts.findIndex((o) => o.value === currentValue);
                        const next = idx < opts.length - 1 ? opts[idx + 1] : { value: '' };
                        onColumnFilterChange(col.targetAttribute, next.value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter ${col.columnLabel}`}
                    >
                      <Text style={styles.filterSelectText} numberOfLines={1}>
                        {currentValue
                          ? (col.options?.find((o) => o.value === currentValue)?.label ?? currentValue)
                          : 'All'}
                      </Text>
                    </Pressable>
                  </View>
                );
              }

              return <View key={`filter-${col.targetAttribute}`} style={[styles.tableHeaderCell, styles.filterCell]} />;
            })}
          </View>
        )}

        {activeFilterCount > 0 && (
          <View style={styles.activeFilterBanner}>
            <Text style={styles.activeFilterText}>{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active</Text>
          </View>
        )}

        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TableRow
              record={item}
              columns={columns}
              selected={isSelected(item.id)}
              isMulti={isMulti}
              onPress={() => onSelect(item.id)}
            />
          )}
        />
      </View>
    </ScrollView>
  );
}

interface TableRowProps {
  record: GridRecord;
  columns: GridColumnConfig[];
  selected: boolean;
  isMulti: boolean;
  onPress: () => void;
}

function TableRow({ record, columns, selected, isMulti, onPress }: TableRowProps) {
  return (
    <Pressable
      style={[styles.tableDataRow, selected && styles.dataRowSelected]}
      onPress={onPress}
      accessibilityRole={isMulti ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
    >
      <View style={styles.checkCell}>
        {isMulti ? (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
        ) : (
          <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
            {selected && <View style={styles.radioDot} />}
          </View>
        )}
      </View>
      {columns.map((col) => (
        <View key={col.targetAttribute} style={styles.tableDataCell}>
          <Text style={styles.cellText} numberOfLines={1}>
            {String(record.values[col.targetAttribute] ?? '')}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

// ── Card view ────────────────────────────────────────────────────

interface CardViewProps {
  records: GridRecord[];
  columns: GridColumnConfig[];
  isMulti: boolean;
  isSelected: (id: string) => boolean;
  onSelect: (id: string) => void;
}

function CardView({ records, columns, isMulti, isSelected, onSelect }: CardViewProps) {
  return (
    <View style={styles.cardGrid}>
      {records.map((record) => {
        const selected = isSelected(record.id);
        return (
          <Pressable
            key={record.id}
            style={[styles.recordCard, selected && styles.recordCardSelected]}
            onPress={() => onSelect(record.id)}
            accessibilityRole={isMulti ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: selected }}
          >
            <View style={styles.cardSelIndicator}>
              {isMulti ? (
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
              ) : (
                <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              )}
            </View>
            {columns.map((col) => (
              <View key={col.targetAttribute} style={styles.cardField}>
                <Text style={styles.cardFieldLabel}>{col.columnLabel}</Text>
                <Text style={styles.cardFieldValue}>
                  {String(record.values[col.targetAttribute] ?? '—')}
                </Text>
              </View>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  viewToggle: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#0078d4' },
  viewToggleText: { fontSize: 12, color: '#0078d4', fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  searchInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#1a1a2e',
    backgroundColor: '#fff',
  },
  clearSearch: { position: 'absolute', right: 10, padding: 4 },
  clearSearchText: { fontSize: 13, color: '#999' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { fontSize: 13, color: '#888' },
  errorRow: { paddingVertical: 10 },
  errorRetryText: { fontSize: 13, color: '#d32f2f', textDecorationLine: 'underline' },
  emptyConfig: { fontSize: 13, color: '#999', fontStyle: 'italic', paddingVertical: 8 },
  selectAllBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  selectAllText: { fontSize: 13, color: '#0078d4', fontWeight: '500' },
  selectedCountBadge: { fontSize: 12, color: '#0078d4', backgroundColor: '#e8f2fb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  // Table styles
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f4f8',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterCell: {
    backgroundColor: '#fafafa',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  filterInput: {
    height: 30,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 12,
    color: '#1a1a2e',
    backgroundColor: '#fff',
    minWidth: 80,
  },
  filterSelect: {
    height: 30,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 4,
    paddingHorizontal: 6,
    justifyContent: 'center',
    backgroundColor: '#fff',
    minWidth: 80,
  },
  filterSelectText: {
    fontSize: 12,
    color: '#1a1a2e',
  },
  activeFilterBanner: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e8f2fb',
  },
  activeFilterText: {
    fontSize: 11,
    color: '#0078d4',
    fontWeight: '600',
  },
  tableHeaderCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  headerText: { fontSize: 12, fontWeight: '600', color: '#555', flex: 1 },
  sortIndicator: { fontSize: 10, color: '#888' },
  tableDataRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  dataRowSelected: { backgroundColor: '#f0f7ff' },
  checkCell: { width: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  tableDataCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e0e0e0', justifyContent: 'center' },
  cellText: { fontSize: 13, color: '#1a1a2e' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0078d4', borderColor: '#0078d4' },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  radioCircleSelected: { borderColor: '#0078d4' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0078d4' },
  // Pagination
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 4 },
  pageButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: '#0078d4' },
  pageButtonDisabled: { borderColor: '#ccc' },
  pageButtonText: { fontSize: 13, color: '#0078d4', fontWeight: '600' },
  pageButtonTextDisabled: { color: '#ccc' },
  pageInfo: { fontSize: 13, color: '#555' },
  // Card view
  cardGrid: { gap: 10 },
  recordCard: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-start',
  },
  recordCardSelected: { borderColor: '#0078d4', backgroundColor: '#f0f7ff' },
  cardSelIndicator: { alignSelf: 'center', marginRight: 4 },
  cardField: { minWidth: '40%', flex: 1 },
  cardFieldLabel: { fontSize: 11, color: '#888', marginBottom: 2, fontWeight: '500' },
  cardFieldValue: { fontSize: 14, color: '#1a1a2e', fontWeight: '400' },
});
