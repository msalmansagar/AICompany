import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric' | 'decimal-pad';
}

export function FormTextField({ field, control, keyboardType = 'default' }: Props) {
  const hasAffix = Boolean(field.prefix ?? field.suffix);
  const placeholder = field.placeholder ?? `Enter ${field.displayLabel.toLowerCase()}`;

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <View style={fieldStyles.container}>
          <Text style={fieldStyles.label}>
            {field.displayLabel}
            {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
          </Text>
          <View style={[styles.inputRow, error && styles.inputRowError]}>
            {field.prefix ? (
              <View style={styles.affixBox}>
                <Text style={styles.affixText}>{field.prefix}</Text>
              </View>
            ) : null}
            <TextInput
              style={[
                styles.input,
                hasAffix && styles.inputWithAffix,
              ]}
              value={typeof value === 'string' ? value : ''}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType={keyboardType}
              autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
              placeholder={placeholder}
              placeholderTextColor="#999"
            />
            {field.suffix ? (
              <View style={styles.affixBox}>
                <Text style={styles.affixText}>{field.suffix}</Text>
              </View>
            ) : null}
          </View>
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
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
  affixBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    justifyContent: 'center',
  },
  affixText: {
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
  inputWithAffix: {
    paddingHorizontal: 8,
  },
});
