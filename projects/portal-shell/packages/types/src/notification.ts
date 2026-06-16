import { z } from 'zod';

// ---------------------------------------------------------------------------
// Notification domain types
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface PortalNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  linkUrl: string | null;
  isRead: boolean;
  /** ISO 8601 date string */
  createdOn: string;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

export const NotificationMarkReadSchema = z.object({
  id: z.string().uuid(),
});

export type NotificationMarkRead = z.infer<typeof NotificationMarkReadSchema>;
