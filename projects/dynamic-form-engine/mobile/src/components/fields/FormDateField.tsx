import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

type AndroidPickerStep = 'date' | 'time' | 'idle';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormDateField({ field, control }: Props) {
  const isDateTime = field.fieldType === 'datetime';
  const [showPicker, setShowPicker] = useState(false);
  const [androidStep, setAndroidStep] = useState<AndroidPickerStep>('idle');
  const [pendingDate, setPendingDate] = useState<Date | undefined>(undefined);

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const dateValue = value instanceof Date ? value : undefined;

        function formatDisplayValue(date: Date): string {
          if (isDateTime) {
            return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
          return date.toLocaleDateString();
        }

        function handleAndroidChange(_: unknown, selected?: Date): void {
          if (!selected) {
            setAndroidStep('idle');
            return;
          }
          if (androidStep === 'date' && isDateTime) {
            setPendingDate(selected);
            setAndroidStep('time');
          } else if (androidStep === 'time' && pendingDate) {
            const combined = new Date(pendingDate);
            combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            onChange(combined);
            setPendingDate(undefined);
            setAndroidStep('idle');
          } else {
            onChange(selected);
            setAndroidStep('idle');
          }
        }

        function handleIosChange(_: unknown, selected?: Date): void {
          if (selected) onChange(selected);
        }

        function openPicker(): void {
          if (Platform.OS === 'android') {
            setAndroidStep('date');
          } else {
            setShowPicker(true);
          }
        }

        const showAndroidDatePicker = Platform.OS === 'android' && androidStep === 'date';
        const showAndroidTimePicker = Platform.OS === 'android' && androidStep === 'time';

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
            <Pressable
              style={[fieldStyles.input, styles.dateButton, error && fieldStyles.inputError]}
              onPress={openPicker}
            >
              <Text style={dateValue ? styles.dateText : styles.datePlaceholder}>
                {dateValue ? formatDisplayValue(dateValue) : isDateTime ? 'Select date & time' : 'Select date'}
              </Text>
            </Pressable>

            {showAndroidDatePicker && (
              <DateTimePicker
                value={pendingDate ?? dateValue ?? new Date()}
                mode="date"
                display="default"
                onChange={handleAndroidChange}
              />
            )}

            {showAndroidTimePicker && (
              <DateTimePicker
                value={pendingDate ?? new Date()}
                mode="time"
                display="default"
                onChange={handleAndroidChange}
              />
            )}

            {Platform.OS === 'ios' && showPicker && (
              <>
                <DateTimePicker
                  value={dateValue ?? new Date()}
                  mode={isDateTime ? 'datetime' : 'date'}
                  display="inline"
                  onChange={handleIosChange}
                />
                <Pressable style={styles.doneButton} onPress={() => setShowPicker(false)}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </>
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
