import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { t } from '../../i18n';
import { isCurrentLocaleRtl } from '../../i18n';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  rightElement?: React.ReactNode;
  testID?: string;
}

export function Header({
  title,
  showBackButton = false,
  rightElement,
  testID,
}: HeaderProps): React.JSX.Element {
  const isRtl = isCurrentLocaleRtl();
  // In RTL, the logical "back" arrow should face right (forward in LTR)
  const backIcon = isRtl ? 'chevron-forward' : 'chevron-back';

  return (
    <View testID={testID} style={styles.container}>
      {showBackButton ? (
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={{ top: 10, bottom: 10, start: 10, end: 10 }}
        >
          <Ionicons name={backIcon} size={24} color={Colors.textPrimary} />
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}

      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>

      <View style={styles.rightSlot}>{rightElement ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 44,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  rightSlot: {
    width: 44,
    alignItems: 'flex-end',
  },
});
