import React from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import { AlertOffRegular } from '@fluentui/react-icons';
import { serverGet } from '../../../../lib/api-client';
import type { PortalNotification, NotificationType } from '@portal/types';

interface NotificationsPageProps {
  params: Promise<{ locale: string }>;
}

const TYPE_COLORS: Record<NotificationType, string> = {
  info: '#0078d4',
  success: '#107C10',
  warning: '#C19C00',
  error: '#C50F1F',
};

function formatDate(dateString: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-QA' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({ params }: NotificationsPageProps) {
  const { locale } = await params;

  let notifications: PortalNotification[] = [];
  try {
    const data = await serverGet<{ items: PortalNotification[] }>('/api/notifications?limit=100');
    notifications = data.items;
  } catch {
    // Non-fatal
  }

  const title = locale === 'ar' ? 'الإشعارات' : 'Notifications';
  const noNotificationsLabel = locale === 'ar' ? 'لا توجد إشعارات حتى الآن' : 'No notifications yet';

  return (
    <section aria-labelledby="notifications-heading">
      <h1 id="notifications-heading" className="text-2xl font-semibold mb-6">
        {title}
      </h1>

      {notifications.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-4 min-h-64"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          <AlertOffRegular fontSize={48} />
          <Text size={400}>{noNotificationsLabel}</Text>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <a
              key={notification.id}
              href={notification.linkUrl ?? '#'}
              className="block no-underline"
              aria-label={`${notification.title} — ${notification.isRead ? 'Read' : 'Unread'}`}
            >
              <div
                className="flex gap-4 p-4 rounded-lg"
                style={{
                  backgroundColor: notification.isRead
                    ? tokens.colorNeutralBackground1
                    : tokens.colorBrandBackground2,
                  borderInlineStart: notification.isRead
                    ? '3px solid transparent'
                    : `3px solid ${tokens.colorBrandStroke1}`,
                  border: `1px solid ${tokens.colorNeutralStroke2}`,
                  borderInlineStartWidth: '3px',
                }}
              >
                <div
                  style={{ color: TYPE_COLORS[notification.type], flexShrink: 0, marginTop: '2px' }}
                  aria-hidden="true"
                >
                  ●
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <Text weight="semibold" size={300}>
                    {notification.title}
                  </Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                    {notification.body}
                  </Text>
                </div>
                <Text
                  size={100}
                  style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }}
                >
                  {formatDate(notification.createdOn, locale)}
                </Text>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
