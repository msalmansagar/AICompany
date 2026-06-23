import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InfoCardItem } from '@qdb/shared';

interface Props {
  sectionTitle: string;
  items: InfoCardItem[];
}

export function NumberedStepsSection({ sectionTitle, items }: Props) {
  const sorted = [...(items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{sectionTitle}</Text>
      {sorted.map((item, index) => (
        <View key={item.itemId} style={styles.stepRow} accessibilityRole="text">
          <View style={styles.stepBadge} accessibilityLabel={`Step ${index + 1}`}>
            <Text style={styles.stepNumber}>{index + 1}</Text>
          </View>
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>{item.itemTitle}</Text>
            {item.itemDescription != null && item.itemDescription.length > 0 && (
              <Text style={styles.stepDescription}>{item.itemDescription}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0078d4',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumber: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  stepDescription: { fontSize: 13, color: '#555', lineHeight: 18 },
});
