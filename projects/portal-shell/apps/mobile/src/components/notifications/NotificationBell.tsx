import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { useUnreadNotificationCount } from '../../hooks/useNotifications';
import { t } from '../../i18n';

interface NotificationBellProps {
  onPress: () => void;
  testID?: string;
}

export function NotificationBell({ onPress, testID }: NotificationBellProps): React.JSX.Element {
  const unreadCount = useUnreadNotificationCount();
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={
        hasUnread
          ? t('notifications.unreadCount', { count: unreadCount })
          : t('notifications.title')
      }
      hitSlop={{ top: 8, bottom: 8, start: 8, end: 8 }}
    >
      <Ionicons
        name={hasUnread ? 'notifications' : 'notifications-outline'}
        size={24}
        color={Colors.textPrimary}
      />
      {hasUnread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    // Use end for RTL-safe positioning
    end: 4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});
