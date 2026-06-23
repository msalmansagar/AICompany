import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { InfoCardItem } from '@qdb/shared';
import { logger } from '../../../logger';

interface Props {
  sectionTitle: string;
  items: InfoCardItem[];
  noteText?: string;
}

export function DownloadListSection({ sectionTitle, items, noteText }: Props) {
  const sorted = [...(items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  async function handleDownload(item: InfoCardItem): Promise<void> {
    if (item.downloadUrl == null || item.downloadUrl.length === 0) return;
    try {
      await Linking.openURL(item.downloadUrl);
    } catch (error) {
      logger.error({ message: 'Failed to open download URL', context: { itemId: item.itemId, error } });
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{sectionTitle}</Text>
      {sorted.map((item) => (
        <View key={item.itemId} style={styles.itemRow} accessibilityRole="text">
          <Text style={styles.itemTitle}>{item.itemTitle}</Text>
          {item.downloadUrl != null && item.downloadUrl.length > 0 && (
            <Pressable
              style={styles.downloadButton}
              onPress={() => void handleDownload(item)}
              accessibilityRole="button"
              accessibilityLabel={`Download ${item.itemTitle}`}
            >
              <Text style={styles.downloadText}>Download</Text>
            </Pressable>
          )}
        </View>
      ))}
      {noteText != null && noteText.length > 0 && (
        <Text style={styles.noteText}>{noteText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', marginBottom: 12 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemTitle: { flex: 1, fontSize: 14, color: '#1a1a2e', marginRight: 12 },
  downloadButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0078d4',
    backgroundColor: '#f0f7ff',
  },
  downloadText: { fontSize: 13, color: '#0078d4', fontWeight: '600' },
  noteText: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 10, lineHeight: 18 },
});
