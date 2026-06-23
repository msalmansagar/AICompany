import type { DataverseClient } from '@portal/dataverse-client';
import type { PortalNotification, NotificationType } from '@portal/types';

const NOTIFICATION_ENTITY = 'qdb_portal_notifications';
const MAX_NOTIFICATIONS_PER_FETCH = 50;

/** Thrown when a user attempts to modify a notification they do not own. */
class NotificationOwnershipError extends Error {
  readonly statusCode = 403;
  readonly code = 'notification_ownership_error';

  constructor(notificationId: string) {
    super(`Notification '${notificationId}' does not belong to the requesting user`);
    this.name = 'NotificationOwnershipError';
  }
}

interface DataverseNotification {
  qdb_portal_notificationid: string;
  qdb_user_id: string;
  qdb_title: string;
  qdb_body: string;
  qdb_type: number; // 860000001=info, 860000002=success, 860000003=warning, 860000004=error
  qdb_link_url: string | null;
  qdb_is_read: boolean;
  createdon: string;
}

const TYPE_MAP: Record<number, NotificationType> = {
  860000001: 'info',
  860000002: 'success',
  860000003: 'warning',
  860000004: 'error',
};

/**
 * CRUD service for portal notifications stored in Dataverse.
 *
 * All queries are scoped to the authenticated user by qdb_user_id —
 * users can never read or modify another user's notifications.
 */
export class NotificationService {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns the latest 50 notifications for the given user, newest first.
   *
   * @param userId - Authenticated user's ID (sub claim from JWT)
   * @param correlationId - Request correlation ID
   */
  async getNotificationsForUser(
    userId: string,
    correlationId?: string,
  ): Promise<PortalNotification[]> {
    const result = await this.dataverse.getList<DataverseNotification>(
      NOTIFICATION_ENTITY,
      {
        select: this.selectFields(),
        filter: `qdb_user_id eq '${userId}'`,
        orderBy: 'createdon desc',
        top: MAX_NOTIFICATIONS_PER_FETCH,
      },
      { correlationId },
    );

    return result.value.map((record) => this.mapToNotification(record));
  }

  /**
   * Marks a single notification as read.
   * Validates the notification belongs to the requesting user before updating.
   *
   * @param notificationId - GUID of the notification to mark read
   * @param userId - Authenticated user's ID — used to authorise the update
   * @param correlationId - Request correlation ID
   */
  async markAsRead(
    notificationId: string,
    userId: string,
    correlationId?: string,
  ): Promise<void> {
    await this.assertNotificationOwnership(notificationId, userId, correlationId);
    await this.dataverse.update(
      NOTIFICATION_ENTITY,
      notificationId,
      { qdb_is_read: true },
      { correlationId },
    );
  }

  /**
   * Marks all of the user's unread notifications as read in a batch.
   *
   * Dataverse does not support bulk update via standard OData; we load unread
   * IDs then update each individually. For large volumes consider an Action.
   *
   * @param userId - Authenticated user's ID
   * @param correlationId - Request correlation ID
   */
  async markAllAsRead(userId: string, correlationId?: string): Promise<void> {
    const unreadIds = await this.loadUnreadIds(userId, correlationId);

    await Promise.all(
      unreadIds.map((id) =>
        this.dataverse.update(
          NOTIFICATION_ENTITY,
          id,
          { qdb_is_read: true },
          { correlationId },
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadUnreadIds(userId: string, correlationId?: string): Promise<string[]> {
    const result = await this.dataverse.getList<{ qdb_portal_notificationid: string }>(
      NOTIFICATION_ENTITY,
      {
        select: ['qdb_portal_notificationid'],
        filter: `qdb_user_id eq '${userId}' and qdb_is_read eq false`,
        top: 500,
      },
      { correlationId },
    );
    return result.value.map((r) => r.qdb_portal_notificationid);
  }

  private async assertNotificationOwnership(
    notificationId: string,
    userId: string,
    correlationId?: string,
  ): Promise<void> {
    const record = await this.dataverse.getById<DataverseNotification>(
      NOTIFICATION_ENTITY,
      notificationId,
      { select: ['qdb_user_id'] },
      { correlationId },
    );

    if (record.qdb_user_id !== userId) {
      throw new NotificationOwnershipError(notificationId);
    }
  }

  private mapToNotification(record: DataverseNotification): PortalNotification {
    return {
      id: record.qdb_portal_notificationid,
      userId: record.qdb_user_id,
      title: record.qdb_title,
      body: record.qdb_body,
      type: TYPE_MAP[record.qdb_type] ?? 'info',
      linkUrl: record.qdb_link_url,
      isRead: record.qdb_is_read,
      createdOn: record.createdon,
    };
  }

  private selectFields(): string[] {
    return [
      'qdb_portal_notificationid',
      'qdb_user_id',
      'qdb_title',
      'qdb_body',
      'qdb_type',
      'qdb_link_url',
      'qdb_is_read',
      'createdon',
    ];
  }
}
