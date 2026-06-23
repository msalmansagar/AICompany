'use client';

import React, { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
  Button,
  Text,
  Divider,
  Spinner,
  makeStyles,
  tokens,
  mergeClasses,
} from '@fluentui/react-components';
import {
  DismissRegular,
  InfoRegular,
  CheckmarkCircleRegular,
  WarningRegular,
  ErrorCircleRegular,
  AlertOffRegular,
} from '@fluentui/react-icons';
import type { PortalNotification, NotificationType } from '@portal/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pollIntervalMs: number;
  markAllReadLabel?: string;
  noNotificationsLabel?: string;
  loadingLabel?: string;
}

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: 0,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  notificationItem: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    paddingInline: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalM,
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
    borderInlineStart: '3px solid transparent',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground2,
    },
  },
  notificationItemUnread: {
    borderInlineStartColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  iconWrapper: {
    flexShrink: 0,
    paddingBlockStart: '2px',
  },
  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  bodyText: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    fontSize: tokens.fontSizeBase200,
  },
  timestamp: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    flexShrink: 0,
    paddingBlockStart: '2px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    flex: 1,
    color: tokens.colorNeutralForeground3,
    paddingBlock: tokens.spacingVerticalXXL,
  },
  loadingState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
});

const TYPE_ICONS: Record<NotificationType, React.ReactElement> = {
  info: <InfoRegular style={{ color: '#0078d4' }} />,
  success: <CheckmarkCircleRegular style={{ color: '#107C10' }} />,
  warning: <WarningRegular style={{ color: '#C19C00' }} />,
  error: <ErrorCircleRegular style={{ color: '#C50F1F' }} />,
};

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

async function fetchNotifications(): Promise<PortalNotification[]> {
  const response = await fetch('/api/notifications?limit=50');
  if (!response.ok) throw new Error('Failed to fetch notifications');
  const data = (await response.json()) as { items: PortalNotification[] };
  return data.items;
}

async function markNotificationRead(id: string): Promise<void> {
  const response = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  if (!response.ok) throw new Error('Failed to mark notification as read');
}

async function markAllNotificationsRead(): Promise<void> {
  const response = await fetch('/api/notifications/mark-all-read', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to mark all notifications as read');
}

export function NotificationPanel({
  isOpen,
  onClose,
  pollIntervalMs,
  markAllReadLabel = 'Mark all as read',
  noNotificationsLabel = 'No notifications yet',
  loadingLabel = 'Loading notifications',
}: NotificationPanelProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: pollIntervalMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
    enabled: isOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = useCallback(
    (notification: PortalNotification) => {
      if (!notification.isRead) {
        markReadMutation.mutate(notification.id);
      }
      if (notification.linkUrl) {
        window.location.href = notification.linkUrl;
      }
    },
    [markReadMutation]
  );

  const hasUnread = notifications?.some((n) => !n.isRead) ?? false;

  return (
    <Drawer
      type="overlay"
      position="end"
      open={isOpen}
      onOpenChange={(_, { open }) => !open && onClose()}
      size="small"
      aria-label="Notifications panel"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onClose}
              aria-label="Close notifications"
            />
          }
        >
          Notifications
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody className={styles.body}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => markAllReadMutation.mutate()}
            disabled={!hasUnread || markAllReadMutation.isPending}
          >
            {markAllReadLabel}
          </Button>
        </div>

        {/* Content */}
        {isLoading && (
          <div className={styles.loadingState}>
            <Spinner label={loadingLabel} />
          </div>
        )}

        {!isLoading && (!notifications || notifications.length === 0) && (
          <div className={styles.emptyState}>
            <AlertOffRegular fontSize={40} />
            <Text>{noNotificationsLabel}</Text>
          </div>
        )}

        {!isLoading && notifications && notifications.length > 0 && (
          <div className={styles.list} role="list" aria-label="Notifications">
            {notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <div
                  className={mergeClasses(
                    styles.notificationItem,
                    !notification.isRead && styles.notificationItemUnread
                  )}
                  role="listitem"
                  onClick={() => handleNotificationClick(notification)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNotificationClick(notification);
                    }
                  }}
                  aria-label={`${notification.title}. ${notification.isRead ? 'Read' : 'Unread'}`}
                >
                  <span className={styles.iconWrapper}>
                    {TYPE_ICONS[notification.type]}
                  </span>
                  <div className={styles.content}>
                    <Text className={styles.title}>{notification.title}</Text>
                    <Text className={styles.bodyText}>{notification.body}</Text>
                  </div>
                  <span className={styles.timestamp}>
                    {formatRelativeTime(notification.createdOn)}
                  </span>
                </div>
                {index < notifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}
