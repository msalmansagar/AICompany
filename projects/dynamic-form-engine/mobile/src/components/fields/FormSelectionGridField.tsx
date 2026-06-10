import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition, GridRecord } from '@qdb/shared';
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

interface GridRecordPage {
  records: GridRecord[];
  totalCount: number;
}

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
  const [records, setRecords] = useState<GridRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [hasFetched, setHasFetched] = useState(false);

  const gridConfig = field.gridConfig;
  const isMulti = gridConfig?.selectionMode === 'multi';
  // Backend pre-filters columns to visible only; sort by displayOrder.
  const visibleColumns = (gridConfig?.columnConfigs ?? [])
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const fetchRecords = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(undefined);
    try {
      const page = await apiGet<GridRecordPage>(
        `/api/grids/${field.fieldId}/records?page=1&pageSize=${PAGE_SIZE}`,
        accessToken,
      );
      setRecords(page.records);
    } catch (error) {
      logger.error({ message: 'Failed to fetch grid records', context: { fieldId: field.fieldId, error } });
      setLoadError('Failed to load records. Tap to retry.');
    } finally {
      setIsLoading(false);
    }
  }, [field.fieldId, accessToken]);

  useEffect(() => {
    if (isTabActive && !hasFetched) {
      setHasFetched(true);
      void fetchRecords();
    }
  }, [isTabActive, hasFetched, fetchRecords]);

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
        const selectedMulti = Array.isArray(value) ? (value as string[]) : [];

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

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#0078d4" />
                <Text style={styles.loadingText}>Loading records...</Text>
              </View>
            )}

            {!isLoading && loadError !== undefined && (
              <Pressable
                style={styles.errorRow}
                onPress={() => { setHasFetched(false); }}
                accessibilityRole="button"
                accessibilityLabel="Retry loading records"
              >
                <Text style={styles.errorRetryText}>{loadError}</Text>
              </Pressable>
            )}

            {!isLoading && loadError === undefined && records.length === 0 && hasFetched && (
              <Text style={styles.emptyConfig}>No records found.</Text>
            )}

            {!isLoading && records.length > 0 && (
              <>
                <GridHeader columns={visibleColumns.map((c) => c.columnLabel)} isMulti={isMulti} />
                <FlatList
                  data={records}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <GridRow
                      record={item}
                      columns={visibleColumns}
                      selected={isSelected(item.id)}
                      isMulti={isMulti}
                      onPress={() => handleSelect(item.id)}
                    />
                  )}
                />
              </>
            )}

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

interface GridHeaderProps {
  columns: string[];
  isMulti: boolean;
}

function GridHeader({ columns, isMulti }: GridHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={[styles.checkCell, styles.headerCell]}>
        <Text style={styles.headerText}>{isMulti ? '' : ''}</Text>
      </View>
      {columns.map((label) => (
        <View key={label} style={[styles.dataCell, styles.headerCell]}>
          <Text style={styles.headerText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

interface GridColumnConfig {
  targetAttribute: string;
  columnLabel: string;
}

interface GridRowProps {
  record: GridRecord;
  columns: GridColumnConfig[];
  selected: boolean;
  isMulti: boolean;
  onPress: () => void;
}

function GridRow({ record, columns, selected, isMulti, onPress }: GridRowProps) {
  return (
    <Pressable
      style={[styles.dataRow, selected && styles.dataRowSelected]}
      onPress={onPress}
      accessibilityRole={isMulti ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`Select record ${record.id}`}
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
        <View key={col.targetAttribute} style={styles.dataCell}>
          <Text style={styles.cellText} numberOfLines={1}>
            {String(record.values[col.targetAttribute] ?? '')}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emptyConfig: { fontSize: 13, color: '#999', fontStyle: 'italic', paddingVertical: 8 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { fontSize: 13, color: '#888' },
  errorRow: { paddingVertical: 10 },
  errorRetryText: { fontSize: 13, color: '#d32f2f', textDecorationLine: 'underline' },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f4f8',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dataRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  dataRowSelected: { backgroundColor: '#f0f7ff' },
  headerCell: { paddingVertical: 10 },
  checkCell: { width: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  dataCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#e0e0e0', justifyContent: 'center' },
  headerText: { fontSize: 12, fontWeight: '600', color: '#555' },
  cellText: { fontSize: 13, color: '#1a1a2e' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0078d4', borderColor: '#0078d4' },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  radioCircleSelected: { borderColor: '#0078d4' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0078d4' },
});
