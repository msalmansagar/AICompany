// RED → GREEN → REFACTOR — notification route integration tests
// TC-ROUT-001 through TC-ROUT-005 (DFE-PORT-001 Phase 5 QA)
// References: FR: NOT-*, AUTH-007
// Pattern: mirrors auth.test.ts — buildTestApp() + app.inject(), DataverseClient mocked via service mock

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { notificationRoutes } from './notifications.js';
import { authGuardPlugin } from '../plugins/auth-guard.js';
import { registerJwt } from '../plugins/jwt.js';
import { requestContextPlugin } from '../plugins/request-context.js';
import type { NotificationService } from '../services/NotificationService.js';
import type { PortalNotification } from '@portal/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
const USER_ID = 'user-001';

// ---------------------------------------------------------------------------
// Helpers — mock NotificationService and test app builder
// ---------------------------------------------------------------------------

const MOCK_NOTIFICATION: PortalNotification = {
  id: 'notif-001',
  userId: USER_ID,
  title: 'You have a new update',
  body: 'Your request has been approved',
  type: 'success',
  linkUrl: '/en/my-requests/req-001',
  isRead: false,
  createdOn: '2026-06-01T10:00:00Z',
};

function buildMockNotificationService(
  overrides: Partial<NotificationService> = {},
): NotificationService {
  return {
    getNotificationsForUser: vi.fn().mockResolvedValue([MOCK_NOTIFICATION]),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as NotificationService;
}

async function buildTestApp(
  notificationService: NotificationService,
): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET });
  await app.register(authGuardPlugin);
  await app.register(
    fp(async (instance) => {
      await notificationRoutes(instance, { notificationService });
    }),
  );
  await app.ready();
  return app;
}

/**
 * Signs a minimal JWT for test purposes using the Fastify jwt plugin.
 * Must be called AFTER the app is built and ready.
 */
function signTestToken(app: ReturnType<typeof Fastify>, userId: string, roles: string[] = ['portal_user']): string {
  return app.jwt.sign({ sub: userId, email: `${userId}@test.com`, roles }, { expiresIn: '1h' });
}

// ---------------------------------------------------------------------------
// TC-ROUT-001: GET /api/notifications — returns 401 when no bearer token
// ---------------------------------------------------------------------------

describe('GET /api/notifications — unauthenticated', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockNotificationService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET_api_notifications_NoToken_Returns401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      // No Authorization header
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });
});

// ---------------------------------------------------------------------------
// TC-ROUT-002: GET /api/notifications — returns user's notifications when authenticated
// ---------------------------------------------------------------------------

describe('GET /api/notifications — authenticated', () => {
  let app: ReturnType<typeof Fastify>;
  let token: string;
  let mockService: NotificationService;

  beforeAll(async () => {
    mockService = buildMockNotificationService();
    app = await buildTestApp(mockService);
    token = signTestToken(app, USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET_api_notifications_ValidToken_ReturnsNotificationsArray', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: PortalNotification[] }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe('notif-001');
    expect(body.data[0]?.userId).toBe(USER_ID);
  });

  it('GET_api_notifications_ValidToken_CallsServiceWithCorrectUserId', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(mockService.getNotificationsForUser).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String), // correlationId — auto-generated UUID
    );
  });
});

// ---------------------------------------------------------------------------
// TC-ROUT-003: PATCH /api/notifications/read-all — marks all unread as read
// ---------------------------------------------------------------------------

describe('PATCH /api/notifications/read-all', () => {
  let app: ReturnType<typeof Fastify>;
  let token: string;
  let mockService: NotificationService;

  beforeAll(async () => {
    mockService = buildMockNotificationService();
    app = await buildTestApp(mockService);
    token = signTestToken(app, USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH_readAll_ValidToken_Returns204', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
    // 204 No Content — body should be empty
    expect(response.body).toBe('');
  });

  it('PATCH_readAll_ValidToken_CallsMarkAllAsReadWithCorrectUserId', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(mockService.markAllAsRead).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
    );
  });

  it('PATCH_readAll_NoToken_Returns401', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/read-all',
    });

    expect(response.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// TC-ROUT-004: PATCH /api/notifications/:id/read — returns 404 / error when notification not found
// (The NotificationService throws when ownership check fails, which the route surfaces as 5xx
//  unless an explicit error handler maps it. We test both the happy path and the error case.)
// ---------------------------------------------------------------------------

describe('PATCH /api/notifications/:id/read', () => {
  let app: ReturnType<typeof Fastify>;
  let token: string;

  beforeAll(async () => {
    const mockService = buildMockNotificationService({
      markAsRead: vi.fn().mockResolvedValue(undefined),
    });
    app = await buildTestApp(mockService);
    token = signTestToken(app, USER_ID);
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH_read_ValidTokenAndOwnNotification_Returns204', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/a1b2c3d4-e5f6-7890-abcd-ef1234567890/read',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
  });

  it('PATCH_read_NoToken_Returns401', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/a1b2c3d4-e5f6-7890-abcd-ef1234567890/read',
    });

    expect(response.statusCode).toBe(401);
  });

  // TC-ROUT-005: invalid UUID param fails Zod parse → 400
  it('PATCH_read_InvalidUuidParam_Returns400OrZodError', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/notifications/not-a-uuid/read',
      headers: { Authorization: `Bearer ${token}` },
    });

    // Zod parse on the id param throws, Fastify returns 400 or 422 depending on error handler
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('PATCH_read_ServiceThrowsOwnershipError_Returns500OrMapped', async () => {
    // Arrange: service simulates ownership violation
    const ownershipError = new Error("Notification 'notif-999' does not belong to user 'user-001'");
    const mockService = buildMockNotificationService({
      markAsRead: vi.fn().mockRejectedValue(ownershipError),
    });
    const testApp = await buildTestApp(mockService);
    const testToken = signTestToken(testApp, USER_ID);

    const response = await testApp.inject({
      method: 'PATCH',
      url: '/api/notifications/a1b2c3d4-e5f6-7890-abcd-ef1234567890/read',
      headers: { Authorization: `Bearer ${testToken}` },
    });

    // The error is propagated — Fastify's default error handler returns 500
    // If a global error handler maps ownership errors to 403, update accordingly
    expect([403, 500]).toContain(response.statusCode);

    await testApp.close();
  });
});
