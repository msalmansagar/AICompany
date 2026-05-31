import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition, OptionValue } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormDropdownField({ field, control }: Props) {
  const [open, setOpen] = useState(false);
  const isMulti = field.fieldType === 'multiselect';
  const options = [...field.optionValues].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selectedValues: string[] = isMulti
          ? Array.isArray(value) ? (value as string[]) : []
          : [];
        const singleSelected = isMulti ? undefined : options.find((o) => o.value === value);

        function toggleMultiOption(option: OptionValue): void {
          const next = selectedValues.includes(option.value)
            ? selectedValues.filter((v) => v !== option.value)
            : [...selectedValues, option.value];
          onChange(next);
        }

        function selectSingleOption(option: OptionValue): void {
          onChange(option.value);
          setOpen(false);
        }

        function buildTriggerLabel(): string {
          if (isMulti) {
            if (selectedValues.length === 0) return `Select ${field.displayLabel.toLowerCase()}`;
            if (selectedValues.length === 1) {
              return options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0];
            }
            return `${selectedValues.length} selected`;
          }
          return singleSelected ? singleSelected.label : `Select ${field.displayLabel.toLowerCase()}`;
        }

        const hasValue = isMulti ? selectedValues.length > 0 : Boolean(singleSelected);

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
            <Pressable
              style={[fieldStyles.input, styles.trigger, error && fieldStyles.inputError]}
              onPress={() => setOpen(true)}
            >
              <Text style={hasValue ? styles.selectedText : styles.placeholder}>
                {buildTriggerLabel()}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}

            <Modal visible={open} transparent animationType="slide">
              <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{field.displayLabel}</Text>
                  <Pressable onPress={() => setOpen(false)}>
                    <Text style={styles.closeButton}>Done</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => {
                    const isSelected = isMulti
                      ? selectedValues.includes(item.value)
                      : item.value === value;
                    return (
                      <Pressable
                        style={[styles.option, isSelected && styles.optionSelected]}
                        onPress={() =>
                          isMulti ? toggleMultiOption(item) : selectSingleOption(item)
                        }
                      >
                        {isMulti && (
                          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                            {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                          </View>
                        )}
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                          {item.label}
                        </Text>
                        {!isMulti && isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                    );
                  }}
                />
              </View>
            </Modal>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedText: { fontSize: 15, color: '#1a1a2e' },
  placeholder: { fontSize: 15, color: '#999' },
  chevron: { fontSize: 18, color: '#666', transform: [{ rotate: '90deg' }] },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  closeButton: { fontSize: 15, color: '#0078d4', fontWeight: '600' },
  option: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  optionSelected: { backgroundColor: '#f0f7ff' },
  optionText: { fontSize: 15, color: '#1a1a2e', flex: 1 },
  optionTextSelected: { color: '#0078d4', fontWeight: '600' },
  checkmark: { color: '#0078d4', fontSize: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0078d4', borderColor: '#0078d4' },
  checkboxTick: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
