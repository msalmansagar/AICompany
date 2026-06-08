import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { InfoCardItem } from '@qdb/shared';
import { InfoCardIcon } from '../InfoCardIcon';

interface Props {
  sectionTitle: string;
  items: InfoCardItem[];
}

export function IconListSection({ sectionTitle, items }: Props) {
  const sorted = [...(items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{sectionTitle}</Text>
      {sorted.map((item) => (
        <View key={item.itemId} style={styles.itemRow} accessibilityRole="text">
          <View style={styles.iconContainer} accessibilityElementsHidden>
            <InfoCardIcon iconName={item.iconReference} size={18} color="#0078d4" />
          </View>
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>{item.itemTitle}</Text>
            {item.itemDescription != null && item.itemDescription.length > 0 && (
              <Text style={styles.itemDescription}>{item.itemDescription}</Text>
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
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: { fontSize: 16 },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginBottom: 2 },
  itemDescription: { fontSize: 13, color: '#555', lineHeight: 18 },
});
