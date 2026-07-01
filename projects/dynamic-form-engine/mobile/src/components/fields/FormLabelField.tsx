// FormLabelField (mobile) — DFE-FBE-001 read-only display field.
// Wave 1: renders static content (staticContent) with the field label as an optional heading.
// Wave 2 (C-001-gated): data-bound variant mirrors a source field's value read-only.
import { StyleSheet, Text, View } from 'react-native';
import type { FieldDefinition } from '@qdb/shared';

export function FormLabelField({ field }: { field: FieldDefinition }) {
  const content = field.staticContent ?? '';
  return (
    <View style={styles.root}>
      {field.displayLabel ? <Text style={styles.heading}>{field.displayLabel}</Text> : null}
      {content ? <Text style={styles.content}>{content}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 4 },
  heading: { fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  content: { color: '#333', lineHeight: 20 },
});
