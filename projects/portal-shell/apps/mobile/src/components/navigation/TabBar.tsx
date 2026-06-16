import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { t } from '../../i18n';
import { useUnreadNotificationCount } from '../../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type IoniconsName = keyof typeof Ionicons.glyphMap;

interface TabConfig {
  routeName: string;
  labelKey: string;
  activeIcon: IoniconsName;
  inactiveIcon: IoniconsName;
  showBadge?: boolean;
}

const TAB_CONFIGS: TabConfig[] = [
  {
    routeName: 'dashboard',
    labelKey: 'navigation.dashboard',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
  },
  {
    routeName: 'services/index',
    labelKey: 'navigation.services',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
  },
  {
    routeName: 'my-requests/index',
    labelKey: 'navigation.myRequests',
    activeIcon: 'document-text',
    inactiveIcon: 'document-text-outline',
    showBadge: true,
  },
  {
    routeName: 'profile',
    labelKey: 'navigation.profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const unreadCount = useUnreadNotificationCount();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key] ?? {};
        const isActive = state.index === index;
        const config = TAB_CONFIGS[index];

        if (!config) return null;

        const iconName = isActive ? config.activeIcon : config.inactiveIcon;
        const label = t(config.labelKey);
        const showBadge = config.showBadge && unreadCount > 0;

        const onPress = (): void => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            style={styles.tab}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name={iconName}
                size={24}
                color={isActive ? Colors.primary : Colors.grey80}
              />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                { color: isActive ? Colors.primary : Colors.grey80 },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    // Use paddingTop for the visible content area
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  iconContainer: {
    position: 'relative',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    // Use end instead of right for RTL support
    end: -8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
