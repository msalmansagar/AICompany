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
          <TextInput
            style={[fieldStyles.input, error && fieldStyles.inputError]}
            value={typeof value === 'string' ? value : ''}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType={keyboardType}
            autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
            placeholderTextColor="#999"
          />
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({});
