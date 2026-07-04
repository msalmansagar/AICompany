// FormLabelField (mobile) — DFE-FBE-001 read-only display field.
// Static content, or (Wave 2 minimal) a data-bound mirror of another field's current value.
import { StyleSheet, Text, View } from 'react-native';
import { useWatch, type Control } from 'react-hook-form';
import type { FieldDefinition } from '@qdb/shared';

interface Props {
  field: FieldDefinition;
  control?: Control<Record<string, unknown>>;
}

export function FormLabelField({ field, control }: Props) {
  if (field.sourceFieldSchemaName && control) {
    return <BoundLabel field={field} control={control} sourceKey={field.sourceFieldSchemaName} />;
  }
  const content = field.staticContent ?? '';
  return (
    <View style={styles.root}>
      {field.displayLabel ? <Text style={styles.heading}>{field.displayLabel}</Text> : null}
      {content ? <Text style={styles.content}>{content}</Text> : null}
    </View>
  );
}

function BoundLabel({ field, control, sourceKey }: { field: FieldDefinition; control: Control<Record<string, unknown>>; sourceKey: string }) {
  const value = useWatch({ control, name: sourceKey });
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <View style={styles.root}>
      {field.displayLabel ? <Text style={styles.heading}>{field.displayLabel}</Text> : null}
      <Text style={styles.boundValue}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 4 },
  heading: { fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  content: { color: '#333', lineHeight: 20 },
  boundValue: { color: '#1a1a2e', lineHeight: 20 },
});
