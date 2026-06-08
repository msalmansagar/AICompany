import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition, GridColumnConfig } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

type GridRow = Record<string, string>;

function buildEmptyRow(columns: GridColumnConfig[]): GridRow {
  return Object.fromEntries(columns.map((c) => [c.columnAttribute, '']));
}

function buildRequiredRule(field: FieldDefinition): Record<string, (v: unknown) => true | string> {
  if (!isFieldRequired(field)) return {};
  const message = `${field.displayLabel} is required`;
  return {
    required: (v: unknown) => {
      if (!Array.isArray(v) || v.length === 0) return message;
      return true;
    },
  };
}

export function FormEntryGridField({ field, control }: Props) {
  const gridConfig = field.gridConfig;
  const maxRows = gridConfig?.maxRows ?? 200;
  const visibleColumns = (gridConfig?.columns ?? [])
    .filter((c) => c.isVisible)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  if (visibleColumns.length === 0) {
    return (
      <View style={fieldStyles.container}>
        <Text style={fieldStyles.label}>{field.displayLabel}</Text>
        <Text style={styles.emptyConfig}>Grid not configured — no columns defined.</Text>
      </View>
    );
  }

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      defaultValue={[buildEmptyRow(visibleColumns)]}
      rules={{ validate: buildRequiredRule(field) }}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const rows: GridRow[] = Array.isArray(value) && value.length > 0
          ? (value as GridRow[])
          : [buildEmptyRow(visibleColumns)];

        const isNearLimit = rows.length >= maxRows - 50;

        const updateCell = useCallback(
          (rowIndex: number, colAttr: string, text: string): void => {
            const next = rows.map((row, i) =>
              i === rowIndex ? { ...row, [colAttr]: text } : row,
            );
            onChange(next);
          },
          [rows, onChange],
        );

        const addRow = useCallback((): void => {
          if (rows.length >= maxRows) return;
          onChange([...rows, buildEmptyRow(visibleColumns)]);
        }, [rows, onChange]);

        const removeRow = useCallback(
          (rowIndex: number): void => {
            if (rows.length <= 1) {
              onChange([buildEmptyRow(visibleColumns)]);
              return;
            }
            onChange(rows.filter((_, i) => i !== rowIndex));
          },
          [rows, onChange],
        );

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            {isNearLimit && (
              <Text style={styles.limitWarning}>
                Approaching maximum row limit ({maxRows}). {maxRows - rows.length} rows remaining.
              </Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.headerRow}>
                  {visibleColumns.map((col) => (
                    <View key={col.columnAttribute} style={[styles.cell, styles.headerCell]}>
                      <Text style={styles.headerText} numberOfLines={1}>{col.columnLabel}</Text>
                    </View>
                  ))}
                  <View style={[styles.cell, styles.actionCell, styles.headerCell]} />
                </View>

                {rows.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.dataRow}>
                    {visibleColumns.map((col) => (
                      <View key={col.columnAttribute} style={styles.cell}>
                        <TextInput
                          style={styles.cellInput}
                          value={row[col.columnAttribute] ?? ''}
                          onChangeText={(text) => updateCell(rowIndex, col.columnAttribute, text)}
                          placeholder={col.columnLabel}
                          placeholderTextColor="#bbb"
                          accessibilityLabel={`${col.columnLabel} row ${rowIndex + 1}`}
                        />
                      </View>
                    ))}
                    <View style={[styles.cell, styles.actionCell]}>
                      <Pressable
                        style={styles.removeRowButton}
                        onPress={() => removeRow(rowIndex)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove row ${rowIndex + 1}`}
                      >
                        <Text style={styles.removeRowText}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Text style={styles.rowCount}>{rows.length} row{rows.length !== 1 ? 's' : ''}</Text>
              {rows.length < maxRows && (
                <Pressable
                  style={styles.addRowButton}
                  onPress={addRow}
                  accessibilityRole="button"
                  accessibilityLabel="Add row"
                >
                  <Text style={styles.addRowText}>+ Add Row</Text>
                </Pressable>
              )}
            </View>

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const CELL_WIDTH = 140;

const styles = StyleSheet.create({
  emptyConfig: { fontSize: 13, color: '#999', fontStyle: 'italic', paddingVertical: 8 },
  limitWarning: {
    fontSize: 12,
    color: '#e65100',
    backgroundColor: '#fff3e0',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
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
  cell: {
    width: CELL_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  headerCell: { paddingVertical: 8 },
  actionCell: { width: 40, alignItems: 'center', borderRightWidth: 0 },
  headerText: { fontSize: 12, fontWeight: '600', color: '#555' },
  cellInput: { fontSize: 14, color: '#1a1a2e', padding: 0, minHeight: 28 },
  removeRowButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeRowText: { fontSize: 10, color: '#d32f2f', fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  rowCount: { fontSize: 12, color: '#888' },
  addRowButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0078d4',
    backgroundColor: '#f0f7ff',
  },
  addRowText: { fontSize: 13, color: '#0078d4', fontWeight: '600' },
});
