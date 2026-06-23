import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RequestTimelineEntry } from '@portal/types';
import { Colors } from '../../constants/Colors';

interface StatusTimelineProps {
  entries: RequestTimelineEntry[];
  testID?: string;
}

interface TimelineItemProps {
  entry: RequestTimelineEntry;
  isLatest: boolean;
  isLast: boolean;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TimelineItem({ entry, isLatest, isLast }: TimelineItemProps): React.JSX.Element {
  return (
    <View style={styles.item} accessibilityRole="text">
      {/* Vertical connector line */}
      <View style={styles.connectorColumn}>
        <View style={[styles.dot, isLatest && styles.dotActive]} />
        {!isLast && <View style={styles.line} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.statusLabel, isLatest && styles.statusLabelActive]}>
          {entry.status}
        </Text>
        {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
        <Text style={styles.meta}>
          {entry.changedBy} · {formatDateTime(entry.changedOn)}
        </Text>
      </View>
    </View>
  );
}

export function StatusTimeline({ entries, testID }: StatusTimelineProps): React.JSX.Element {
  // Most-recent first
  const sorted = [...entries].sort(
    (a, b) => new Date(b.changedOn).getTime() - new Date(a.changedOn).getTime(),
  );

  return (
    <View testID={testID} style={styles.container}>
      {sorted.map((entry, index) => (
        <TimelineItem
          key={entry.id}
          entry={entry}
          isLatest={index === 0}
          isLast={index === sorted.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
  },
  connectorColumn: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.grey60,
    backgroundColor: Colors.white,
    marginTop: 3,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.grey40,
    marginTop: 4,
    marginBottom: 0,
  },
  content: {
    flex: 1,
    paddingBottom: 20,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  statusLabelActive: {
    color: Colors.primary,
  },
  note: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 4,
  },
  meta: {
    fontSize: 12,
    color: Colors.textDisabled,
  },
});
