import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Controller, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';
import { fieldStyles } from './fieldStyles';
import { buildValidationRules, isFieldRequired } from '../../utils/buildValidationRules';

interface Props {
  field: FieldDefinition;
  control: Control<Record<string, unknown>>;
}

export function FormRadioCardField({ field, control }: Props) {
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
          <View style={styles.cards}>
            {options.map((option) => {
              const selected = value === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.card, selected && styles.cardSelected]}
                  onPress={() => onChange(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={option.label}
                >
                  {option.iconName ? (
                    <Text style={styles.icon}>{option.iconName}</Text>
                  ) : null}
                  <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text style={[styles.cardDescription, selected && styles.cardDescriptionSelected]}>
                      {option.description}
                    </Text>
                  ) : null}
                  {option.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>{option.notes}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.radioIndicator, selected && styles.radioIndicatorSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {error && <Text style={fieldStyles.errorText}>{error.message}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  cards: { gap: 10 },
  card: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
    position: 'relative',
  },
  cardSelected: {
    borderColor: '#0078d4',
    backgroundColor: '#f0f7ff',
  },
  icon: { fontSize: 22, marginBottom: 6 },
  cardLabel: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  cardLabelSelected: { color: '#0078d4' },
  cardDescription: { fontSize: 13, color: '#666', marginTop: 3, lineHeight: 18 },
  cardDescriptionSelected: { color: '#004d90' },
  radioIndicator: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioIndicatorSelected: { borderColor: '#0078d4' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0078d4' },
  notesBox: {
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#0078d4',
    padding: 8,
    marginTop: 6,
  },
  notesText: { fontSize: 12, color: '#00537a', lineHeight: 17 },
});
