import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
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

// DFE-INFOLIST-001 — configurable body list (no external package).
function toRoman(n: number): string {
  const table: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let remaining = n;
  for (const [value, symbol] of table) {
    while (remaining >= value) { out += symbol; remaining -= value; }
  }
  return out || String(n);
}

function splitListItems(body: string | undefined): string[] {
  if (!body) return [];
  return body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function markerText(listType: NonNullable<FieldDefinition['infoCardListType']>, index: number): string {
  if (listType === 'bullet') return '•';
  if (listType === 'numbered-roman') return toRoman(index + 1);
  return `${index + 1}`;
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
  const listItems = field.infoCardListType ? splitListItems(field.infoCardBody) : [];
  const listMarker = field.infoCardListMarker ?? 'plain';

  const handleDownload = useCallback(() => {
    if (field.infoCardDownloadUrl) {
      void Linking.openURL(field.infoCardDownloadUrl);
    }
  }, [field.infoCardDownloadUrl]);

  return (
    <View
      style={[styles.container, { borderLeftColor: borderColor }]}
      accessibilityRole="none"
      accessibilityLabel={field.infoCardTitle ?? field.displayLabel}
    >
      <View style={styles.iconColumn}>
        <CardIcon iconName={field.infoCardIcon} cardStyle={cardStyle} />
      </View>
      <View style={styles.textColumn}>
        {field.infoCardTitle ? (
          <Text style={styles.title}>{field.infoCardTitle}</Text>
        ) : null}
        {field.infoCardListType && listItems.length > 0 ? (
          <View style={styles.listWrap}>
            {listItems.map((item, index) => (
              <View key={index} style={styles.listItem}>
                {listMarker !== 'none' ? (
                  listMarker === 'circle' ? (
                    <View style={styles.markerCircle}>
                      <Text style={styles.markerCircleText}>{markerText(field.infoCardListType!, index)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.marker}>{markerText(field.infoCardListType!, index)}</Text>
                  )
                ) : null}
                <Text style={[styles.body, styles.listItemText]}>{item}</Text>
              </View>
            ))}
          </View>
        ) : field.infoCardBody ? (
          <Text style={styles.body}>{field.infoCardBody}</Text>
        ) : null}
        {field.infoCardDownloadUrl ? (
          <TouchableOpacity
            onPress={handleDownload}
            style={styles.downloadRow}
            accessibilityRole="link"
            accessibilityLabel={field.infoCardDownloadLabel ?? 'Download'}
          >
            {field.infoCardDownloadIcon ? (
              <InfoCardIcon iconName={field.infoCardDownloadIcon} size={18} color={borderColor} />
            ) : (
              <Text style={[styles.downloadText, { color: borderColor }]}>
                {'⬇  '}{field.infoCardDownloadLabel || 'Download'}
              </Text>
            )}
          </TouchableOpacity>
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
  listWrap: {
    marginTop: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  listItemText: {
    flex: 1,
  },
  marker: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    minWidth: 20,
    marginRight: 8,
  },
  markerCircle: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#c8c8c8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  markerCircleText: {
    fontSize: 11,
    color: '#555',
  },
  downloadRow: {
    marginTop: 6,
  },
  downloadText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
