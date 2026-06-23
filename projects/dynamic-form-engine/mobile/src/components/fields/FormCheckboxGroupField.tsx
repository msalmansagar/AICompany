import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormCheckboxGroupField({ field, control }: Props) {
  const options = [...field.optionValues].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

        function toggle(optionValue: string): void {
          const next = selected.includes(optionValue)
            ? selected.filter((v) => v !== optionValue)
            : [...selected, optionValue];
          onChange(next);
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
            <View style={styles.group}>
              {options.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    style={styles.row}
                    onPress={() => toggle(option.value)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={option.label}
                  >
                    <View style={[styles.box, checked && styles.boxChecked]}>
                      {checked && <Text style={styles.tick}>✓</Text>}
                    </View>
                    <Text style={[styles.label, checked && styles.labelChecked]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  boxChecked: { backgroundColor: '#0078d4', borderColor: '#0078d4' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  label: { fontSize: 15, color: '#1a1a2e', flex: 1 },
  labelChecked: { color: '#0078d4', fontWeight: '500' },
});
