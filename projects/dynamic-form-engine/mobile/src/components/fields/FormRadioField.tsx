import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormRadioField({ field, control }: Props) {
  const options = [...field.optionValues].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <View style={fieldStyles.container}>
          <Text style={fieldStyles.label}>
            {field.displayLabel}
            {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
          </Text>
          <View style={styles.options}>
            {options.map((option) => (
              <Pressable key={option.value} style={styles.option} onPress={() => onChange(option.value)}>
                <View style={[styles.circle, value === option.value && styles.circleSelected]}>
                  {value === option.value && <View style={styles.dot} />}
                </View>
                <Text style={styles.optionLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  circleSelected: { borderColor: '#0078d4' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0078d4' },
  optionLabel: { fontSize: 14, color: '#1a1a2e' },
});
