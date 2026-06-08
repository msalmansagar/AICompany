import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { FieldDefinition } from '@qdb/shared';
import { InfoCardIcon } from '../info-card/InfoCardIcon';

type InfoCardStyle = 'info' | 'warning' | 'success' | 'error';

interface Props {
  field: FieldDefinition;
}

const BORDER_COLORS: Record<InfoCardStyle, string> = {
  info:    '#0078d4',
  warning: '#c4880c',
  success: '#107c10',
  error:   '#c50f1f',
};

const FALLBACK_ICONS: Record<InfoCardStyle, string> = {
  info:    'ℹ',
  warning: '⚠',
  success: '✓',
  error:   '✗',
};

function resolveStyle(raw: string | undefined): InfoCardStyle {
  const valid: InfoCardStyle[] = ['info', 'warning', 'success', 'error'];
  return valid.includes(raw as InfoCardStyle) ? (raw as InfoCardStyle) : 'info';
}

function CardIcon({ iconName, cardStyle }: { iconName: string | undefined; cardStyle: InfoCardStyle }) {
  const color = BORDER_COLORS[cardStyle];

  if (iconName) {
    return <InfoCardIcon iconName={iconName} size={20} color={color} />;
  }

  return (
    <Text style={[styles.fallbackIcon, { color }]} accessibilityElementsHidden>
      {FALLBACK_ICONS[cardStyle]}
    </Text>
  );
}

export function FormInfoCardField({ field }: Props) {
  const cardStyle = resolveStyle(field.infoCardStyle);
  const borderColor = BORDER_COLORS[cardStyle];

  return (
    <View
      style={[styles.container, { borderLeftColor: borderColor }]}
      accessibilityRole="note"
      accessibilityLabel={field.infoCardTitle ?? field.displayLabel}
    >
      <View style={styles.iconColumn}>
        <CardIcon iconName={field.infoCardIcon} cardStyle={cardStyle} />
      </View>
      <View style={styles.textColumn}>
        {field.infoCardTitle ? (
          <Text style={styles.title}>{field.infoCardTitle}</Text>
        ) : null}
        {field.infoCardBody ? (
          <Text style={styles.body}>{field.infoCardBody}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderRadius: 6,
    backgroundColor: '#f8f8f8',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  iconColumn: {
    marginRight: 10,
    paddingTop: 1,
  },
  textColumn: {
    flex: 1,
  },
  fallbackIcon: {
    fontSize: 16,
    lineHeight: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 2,
  },
  body: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
});
