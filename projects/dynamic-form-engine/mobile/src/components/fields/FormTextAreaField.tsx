import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/form-engine-shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormTextAreaField({ field, control }: Props) {
  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <View style={fieldStyles.container}>
          <Text style={fieldStyles.label}>
            {field.displayLabel}
            {field.isRequiredDefault && <Text style={fieldStyles.required}> *</Text>}
          </Text>
          <TextInput
            style={[fieldStyles.input, styles.textArea, error && fieldStyles.inputError]}
            value={typeof value === 'string' ? value : ''}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
            placeholderTextColor="#999"
          />
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 100,
    paddingTop: 10,
  },
});
