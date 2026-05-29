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

export function FormCheckboxField({ field, control }: Props) {
  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={buildValidationRules(field)}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <View style={fieldStyles.container}>
          <Pressable style={styles.row} onPress={() => onChange(!value)}>
            <View style={[styles.box, !!value && styles.boxChecked]}>
              {!!value && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={styles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>
          </Pressable>
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: { width: 22, height: 22, borderWidth: 2, borderColor: '#e0e0e0', borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  boxChecked: { backgroundColor: '#0078d4', borderColor: '#0078d4' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  label: { flex: 1, fontSize: 14, color: '#1a1a2e', lineHeight: 22 },
});
