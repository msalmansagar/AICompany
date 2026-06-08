import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

function buildBooleanRequiredRule(field: FieldDefinition): Record<string, (v: unknown) => true | string> {
  if (!isFieldRequired(field)) return {};
  const message = `${field.displayLabel} is required`;
  return {
    required: (v: unknown) => (v === undefined ? message : true),
  };
}

function ToggleMode({ field, value, onChange }: { field: FieldDefinition; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const trueLabel = field.trueLabel ?? 'Yes';
  const currentValue = value ?? false;

  return (
    <View style={styles.toggleRow}>
      <Switch
        value={currentValue}
        onValueChange={onChange}
        thumbColor={currentValue ? '#fff' : '#f4f3f4'}
        trackColor={{ false: '#e0e0e0', true: '#0078d4' }}
        accessibilityRole="switch"
        accessibilityLabel={`${field.displayLabel} toggle`}
        accessibilityValue={{ text: currentValue ? trueLabel : (field.falseLabel ?? 'No') }}
      />
      <Text style={styles.toggleLabel}>{trueLabel}</Text>
    </View>
  );
}

interface RadioModeProps {
  field: FieldDefinition;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}

function RadioMode({ field, value, onChange }: RadioModeProps) {
  const trueLabel = field.trueLabel ?? 'Yes';
  const falseLabel = field.falseLabel ?? 'No';

  return (
    <View style={styles.radioRow}>
      <Pressable
        style={[styles.radioOption, value === true && styles.radioOptionSelected]}
        onPress={() => onChange(true)}
        accessibilityRole="radio"
        accessibilityLabel={trueLabel}
        accessibilityState={{ checked: value === true }}
      >
        <Text style={[styles.radioText, value === true && styles.radioTextSelected]}>
          {trueLabel}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.radioOption, value === false && styles.radioOptionSelected]}
        onPress={() => onChange(false)}
        accessibilityRole="radio"
        accessibilityLabel={falseLabel}
        accessibilityState={{ checked: value === false }}
      >
        <Text style={[styles.radioText, value === false && styles.radioTextSelected]}>
          {falseLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function FormBooleanField({ field, control }: Props) {
  const renderStyle = field.boolRenderStyle ?? 'toggle';

  return (
    <Controller
      name={field.fieldKey}
      control={control}
      rules={{ validate: buildBooleanRequiredRule(field) }}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const boolValue = value as boolean | undefined;

        return (
          <View style={fieldStyles.container}>
            <Text style={fieldStyles.label}>
              {field.displayLabel}
              {isFieldRequired(field) && <Text style={fieldStyles.required}> *</Text>}
            </Text>

            {renderStyle === 'toggle' ? (
              <ToggleMode field={field} value={boolValue} onChange={onChange} />
            ) : (
              <RadioMode field={field} value={boolValue} onChange={onChange} />
            )}

            {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  toggleLabel: { fontSize: 14, color: '#1a1a2e' },
  radioRow: { flexDirection: 'row', gap: 12 },
  radioOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  radioOptionSelected: { borderColor: '#0078d4', backgroundColor: '#0078d4' },
  radioText: { fontSize: 14, fontWeight: '600', color: '#555' },
  radioTextSelected: { color: '#fff' },
});
