import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormDateField({ field, control }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const dateValue = value instanceof Date ? value : undefined;

        function handleChange(_: unknown, selected?: Date): void {
          if (Platform.OS === 'android') setShowPicker(false);
          if (selected) onChange(selected);
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
            <Pressable
              style={[fieldStyles.input, styles.dateButton, error && fieldStyles.inputError]}
              onPress={() => setShowPicker(true)}
            >
              <Text style={dateValue ? styles.dateText : styles.datePlaceholder}>
                {dateValue ? dateValue.toLocaleDateString() : 'Select date'}
              </Text>
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={dateValue ?? new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={handleChange}
                maximumDate={new Date()}
              />
            )}
            {Platform.OS === 'ios' && showPicker && (
              <Pressable style={styles.doneButton} onPress={() => setShowPicker(false)}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  dateButton: {
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 15,
    color: '#1a1a2e',
  },
  datePlaceholder: {
    fontSize: 15,
    color: '#999',
  },
  doneButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  doneText: {
    color: '#0078d4',
    fontSize: 15,
    fontWeight: '600',
  },
});
