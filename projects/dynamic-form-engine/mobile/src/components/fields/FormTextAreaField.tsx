import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

export function FormTextAreaField({ field, control }: Props) {
  const isRichText = field.fieldType === 'richtext';

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => {
        const rawValue = typeof value === 'string' ? value : '';
        const displayValue = isRichText ? stripHtml(rawValue) : rawValue;

        function handleChange(text: string): void {
          onChange(isRichText ? `<p>${text}</p>` : text);
        }

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
            <TextInput
              style={[fieldStyles.input, styles.textArea, error && fieldStyles.inputError]}
              value={displayValue}
              onChangeText={handleChange}
              onBlur={onBlur}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder={field.placeholder ?? `Enter ${field.displayLabel.toLowerCase()}`}
              placeholderTextColor="#999"
            />
            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 100,
    paddingTop: 10,
  },
});
