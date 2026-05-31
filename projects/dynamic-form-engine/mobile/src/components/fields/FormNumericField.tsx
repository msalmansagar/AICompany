import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

function formatDecimal(raw: string, decimalPlaces: number): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toFixed(decimalPlaces);
}

function isDecimalField(field: FieldDefinition): boolean {
  return field.fieldType === 'decimal' || field.fieldType === 'currency';
}

export function FormNumericField({ field, control }: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const isDecimal = isDecimalField(field);
  const decimalPlaces = field.decimalPlaces ?? (field.fieldType === 'currency' ? 2 : 2);
  const currencySymbol = field.fieldType === 'currency' ? (field.currencySymbol ?? 'QAR') : null;

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => {
        const rawString = value !== null && value !== undefined ? String(value) : '';

        function handleChangeText(text: string): void {
          // Strip non-numeric characters (allow one decimal point for decimal/currency)
          const sanitised = isDecimal
            ? text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
            : text.replace(/[^0-9]/g, '');
          onChange(sanitised);
        }

        function handleBlur(): void {
          onBlur();
          setIsFocused(false);
          if (isDecimal && rawString !== '') {
            onChange(formatDecimal(rawString, decimalPlaces));
          }
        }

        function handleFocus(): void {
          setIsFocused(true);
        }

        const displayValue = !isFocused && isDecimal && rawString !== ''
          ? formatDecimal(rawString, decimalPlaces)
          : rawString;

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            <View style={[styles.inputRow, error && styles.inputRowError]}>
              {currencySymbol && (
                <View style={styles.prefixBox}>
                  <Text style={styles.prefixText}>{currencySymbol}</Text>
                </View>
              )}
              <TextInput
                style={[styles.input, currencySymbol ? styles.inputWithPrefix : null]}
                value={displayValue}
                onChangeText={handleChangeText}
                onBlur={handleBlur}
                onFocus={handleFocus}
                keyboardType={isDecimal ? 'decimal-pad' : 'number-pad'}
                placeholder={
                  isDecimal
                    ? `0.${'0'.repeat(decimalPlaces)}`
                    : `Enter ${field.displayLabel.toLowerCase()}`
                }
                placeholderTextColor="#999"
                textAlign={currencySymbol ? 'right' : 'left'}
              />
            </View>

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  inputRowError: {
    borderColor: '#d32f2f',
  },
  prefixBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  prefixText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a2e',
  },
  inputWithPrefix: {
    paddingLeft: 8,
  },
});
