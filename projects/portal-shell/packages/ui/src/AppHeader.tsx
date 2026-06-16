'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Badge,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  NavigationRegular,
  AlertRegular,
  LinkRegular,
} from '@fluentui/react-icons';
import type { PortalConfig, UserProfile, LinkedEntity } from '@portal/types';
import { EntitySwitcher } from './EntitySwitcher';
import { UserAvatarMenu } from './UserAvatarMenu';
import { NotificationPanel } from './NotificationPanel';

interface AppHeaderProps {
  portalConfig: PortalConfig;
  user: UserProfile;
  activeEntity: LinkedEntity | null;
  onMenuToggle: () => void;
  onEntitySelect: (entity: LinkedEntity) => void;
  onSignOut: () => void;
  onProfileClick: () => void;
  onLanguageToggle: () => void;
  currentLocale: string;
}

const useStyles = makeStyles({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingInline: tokens.spacingHorizontalM,
    height: '64px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
    flexShrink: 0,
  },
  spacer: {
    flex: 1,
  },
  bellContainer: {
    position: 'relative',
    display: 'inline-flex',
  },
  unreadBadge: {
    position: 'absolute',
    top: '-4px',
    insetInlineEnd: '-4px',
  },
  supportLink: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    textDecoration: 'none',
    fontSize: tokens.fontSizeBase300,
    ':hover': {
      color: tokens.colorNeutralForeground1,
      textDecoration: 'underline',
    },
  },
});

async function fetchUnreadCount(): Promise<number> {
  const response = await fetch('/api/notifications/unread-count');
  if (!response.ok) return 0;
  const data = (await response.json()) as { count: number };
  return data.count;
}

export function AppHeader({
  portalConfig,
  user,
  activeEntity,
  onMenuToggle,
  onEntitySelect,
  onSignOut,
  onProfileClick,
  onLanguageToggle,
  currentLocale,
}: AppHeaderProps) {
  const styles = useStyles();
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: portalConfig.notificationPollIntervalSeconds * 1000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    enabled: portalConfig.headerShowNotifications,
  });

  const switchLanguageLabel = currentLocale === 'ar' ? 'English' : 'العربية';

  return (
    <>
      <header className={styles.header} role="banner">
        {/* Hamburger */}
        <Button
          appearance="subtle"
          icon={<NavigationRegular />}
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
        />

        {/* Entity switcher */}
        {portalConfig.headerShowEntitySwitcher && (
          <EntitySwitcher
            activeEntity={activeEntity}
            onEntitySelect={onEntitySelect}
            noEntitiesLabel="No organisations found"
            selectLabel="Select an organisation"
          />
        )}

        <div className={styles.spacer} aria-hidden="true" />

        {/* Support link */}
        {portalConfig.headerShowSupport && portalConfig.headerSupportUrl && (
          <a
            href={portalConfig.headerSupportUrl}
            className={styles.supportLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${portalConfig.headerSupportLabel} (opens in new tab)`}
          >
            <LinkRegular />
            <Text size={300}>{portalConfig.headerSupportLabel}</Text>
          </a>
        )}

        {/* Notification bell */}
        {portalConfig.headerShowNotifications && (
          <div className={styles.bellContainer}>
            <Button
              appearance="subtle"
              icon={<AlertRegular />}
              onClick={() => setNotificationPanelOpen(true)}
              aria-label={
                unreadCount > 0
                  ? `Notifications — ${unreadCount} unread`
                  : 'Open notifications'
              }
            />
            {unreadCount > 0 && (
              <Badge
                className={styles.unreadBadge}
                color="danger"
                size="extra-small"
                appearance="filled"
                aria-hidden="true"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </div>
        )}

        {/* User avatar menu */}
        <UserAvatarMenu
          user={user}
          onSignOut={onSignOut}
          onProfileClick={onProfileClick}
          onLanguageToggle={onLanguageToggle}
          currentLocale={currentLocale}
          switchLanguageLabel={switchLanguageLabel}
        />
      </header>

      {/* Notification slide-in panel */}
      <NotificationPanel
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        pollIntervalMs={portalConfig.notificationPollIntervalSeconds * 1000}
      />
    </>
  );
}
