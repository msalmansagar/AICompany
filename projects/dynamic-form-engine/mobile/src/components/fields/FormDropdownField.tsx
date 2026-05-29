import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition, OptionValue } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormDropdownField({ field, control }: Props) {
  const [open, setOpen] = useState(false);
  const options = [...field.optionValues].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selected = options.find((o) => o.value === value);

        function selectOption(option: OptionValue): void {
          onChange(option.value);
          setOpen(false);
        }

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
              <Text style={selected ? styles.selectedText : styles.placeholder}>
                {selected ? selected.label : `Select ${field.displayLabel.toLowerCase()}`}
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
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.option, item.value === value && styles.optionSelected]}
                      onPress={() => selectOption(item)}
                    >
                      <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                        {item.label}
                      </Text>
                      {item.value === value && <Text style={styles.checkmark}>✓</Text>}
                    </Pressable>
                  )}
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
  option: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  optionSelected: { backgroundColor: '#f0f7ff' },
  optionText: { fontSize: 15, color: '#1a1a2e' },
  optionTextSelected: { color: '#0078d4', fontWeight: '600' },
  checkmark: { color: '#0078d4', fontSize: 16 },
});
