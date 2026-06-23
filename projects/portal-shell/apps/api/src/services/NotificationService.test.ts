// RED → GREEN → REFACTOR — NotificationService unit tests
// TC-NOT-001 through TC-NOT-004 (DFE-PORT-001 Phase 5 QA)
// References: FR: NOT-*, AUTH-007

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from './NotificationService.js';
import type { DataverseClient } from '@portal/dataverse-client';
import type { PortalNotification } from '@portal/types';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

interface MockNotificationRecord {
  qdb_portal_notificationid: string;
  qdb_user_id: string;
  qdb_title: string;
  qdb_body: string;
  qdb_type: number;
  qdb_link_url: string | null;
  qdb_is_read: boolean;
  createdon: string;
}

function makeNotificationRecord(overrides: Partial<MockNotificationRecord> = {}): MockNotificationRecord {
  return {
    qdb_portal_notificationid: 'notif-001',
    qdb_user_id: 'user-001',
    qdb_title: 'Test Notification',
    qdb_body: 'This is a test body',
    qdb_type: 860000001, // info
    qdb_link_url: null,
    qdb_is_read: false,
    createdon: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function buildMockDataverse(overrides: Partial<DataverseClient> = {}): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [] }),
    getById: vi.fn().mockResolvedValue(makeNotificationRecord()),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    executeAction: vi.fn(),
    ...overrides,
  } as unknown as DataverseClient;
}

// ---------------------------------------------------------------------------
// TC-NOT-001: markAsRead_NotificationBelongsToOtherUser_ThrowsForbiddenError
// ---------------------------------------------------------------------------

describe('NotificationService.markAsRead', () => {
  it('markAsRead_NotificationBelongsToOtherUser_ThrowsError', async () => {
    // Arrange: notification belongs to user-002, not user-001
    const recordForOtherUser = makeNotificationRecord({ qdb_user_id: 'user-002' });
    const dvMock = buildMockDataverse({
      getById: vi.fn().mockResolvedValue(recordForOtherUser),
    });
    const service = new NotificationService(dvMock);

    // Act + Assert
    await expect(
      service.markAsRead('notif-001', 'user-001'),
    ).rejects.toThrow("does not belong to user 'user-001'");
  });

  it('markAsRead_NotificationBelongsToRequestingUser_CallsDataverseUpdate', async () => {
    // Arrange: notification belongs to the requesting user
    const ownRecord = makeNotificationRecord({ qdb_user_id: 'user-001' });
    const dvMock = buildMockDataverse({
      getById: vi.fn().mockResolvedValue(ownRecord),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const service = new NotificationService(dvMock);

    // Act
    await service.markAsRead('notif-001', 'user-001');

    // Assert: update was called with read flag
    expect(dvMock.update).toHaveBeenCalledWith(
      'qdb_portal_notifications',
      'notif-001',
      { qdb_is_read: true },
      expect.objectContaining({}),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-NOT-002: markAllAsRead_NoUnreadNotifications_UpdatesZeroRecords
// ---------------------------------------------------------------------------

describe('NotificationService.markAllAsRead', () => {
  it('markAllAsRead_NoUnreadNotifications_UpdatesZeroRecords', async () => {
    // Arrange: loadUnreadIds returns empty array
    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const service = new NotificationService(dvMock);

    // Act
    await service.markAllAsRead('user-001');

    // Assert: no update calls were made since there are no unread notifications
    expect(dvMock.update).not.toHaveBeenCalled();
  });

  it('markAllAsRead_ThreeUnreadNotifications_UpdatesAllThree', async () => {
    // Arrange: three unread IDs returned
    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({
        value: [
          { qdb_portal_notificationid: 'n-001' },
          { qdb_portal_notificationid: 'n-002' },
          { qdb_portal_notificationid: 'n-003' },
        ],
      }),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const service = new NotificationService(dvMock);

    // Act
    await service.markAllAsRead('user-001');

    // Assert: exactly 3 update calls
    expect(dvMock.update).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// TC-NOT-003: listNotifications_FiltersToCurrentUser_ReturnsOnlyOwnedItems
// ---------------------------------------------------------------------------

describe('NotificationService.getNotificationsForUser', () => {
  it('listNotifications_FiltersToCurrentUser_ODataFilterContainsUserId', async () => {
    // Arrange
    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new NotificationService(dvMock);

    // Act
    await service.getNotificationsForUser('user-abc', 'corr-123');

    // Assert: the OData filter is scoped to the requesting user
    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.filter).toContain("qdb_user_id eq 'user-abc'");
  });

  it('listNotifications_MapsDataverseRecordToPortalNotification', async () => {
    // Arrange: one record with all fields populated
    const record = makeNotificationRecord({
      qdb_portal_notificationid: 'notif-xyz',
      qdb_user_id: 'user-001',
      qdb_title: 'My Title',
      qdb_body: 'My Body',
      qdb_type: 860000002, // success
      qdb_link_url: 'https://example.com',
      qdb_is_read: true,
      createdon: '2026-01-01T00:00:00Z',
    });

    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [record] }),
    });
    const service = new NotificationService(dvMock);

    // Act
    const results = await service.getNotificationsForUser('user-001');

    // Assert: mapping is correct
    const notification = results[0] as PortalNotification;
    expect(notification.id).toBe('notif-xyz');
    expect(notification.userId).toBe('user-001');
    expect(notification.title).toBe('My Title');
    expect(notification.body).toBe('My Body');
    expect(notification.type).toBe('success');
    expect(notification.linkUrl).toBe('https://example.com');
    expect(notification.isRead).toBe(true);
    expect(notification.createdOn).toBe('2026-01-01T00:00:00Z');
  });

  it('listNotifications_UnknownTypeCode_DefaultsToInfo', async () => {
    // Arrange: type code not in the map
    const record = makeNotificationRecord({ qdb_type: 999 });
    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [record] }),
    });
    const service = new NotificationService(dvMock);

    // Act
    const results = await service.getNotificationsForUser('user-001');

    // Assert: defaults to 'info' when type code is unrecognised
    expect(results[0]?.type).toBe('info');
  });

  // TC-NOT-004
  it('listNotifications_Returns50MaxItems_OrderedByCreatedOnDesc', async () => {
    // Arrange
    const dvMock = buildMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new NotificationService(dvMock);

    // Act
    await service.getNotificationsForUser('user-001');

    // Assert: top is 50, orderBy is newest first
    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.top).toBe(50);
    expect(queryOptions.orderBy).toBe('createdon desc');
  });
});
