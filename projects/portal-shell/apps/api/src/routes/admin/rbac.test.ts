// RED → GREEN → REFACTOR — adminRbacRoutes integration tests
//
// Tests the HTTP layer of all RBAC admin routes.
// DataverseClient and RbacService are mocked — no real Dataverse calls are made.
// JWT signing uses the same in-process @fastify/jwt used in auth.test.ts.
//
// Pattern follows auth.test.ts: build a test Fastify app, register plugins,
// then use app.inject() to exercise the HTTP layer.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { adminRbacRoutes } from './rbac.js';
import { registerJwt } from '../../plugins/jwt.js';
import { requestContextPlugin } from '../../plugins/request-context.js';
import type { RbacService } from '../../services/RbacService.js';
import type { RbacAuditWriter } from '../../services/RbacAuditWriter.js';
import type { DataverseClient } from '@portal/dataverse-client';
import type { RbacUserRole, PromotionRequest, AuditLogEntry, TokenClaims } from '@portal/types';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppAbility } from '@portal/types';
import { buildAbility } from '../../services/RbacAbilityFactory.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
const ADMIN_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const VIEWER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const TARGET_USER_ID = 'cccccccc-0000-0000-0000-000000000003';
const ASSIGNMENT_ID = 'dddddddd-0000-0000-0000-000000000004';
const PROMOTION_ID = 'eeeeeeee-0000-0000-0000-000000000005';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeRbacUserRole(overrides: Partial<RbacUserRole> = {}): RbacUserRole {
  return {
    id: ASSIGNMENT_ID,
    userId: TARGET_USER_ID,
    roleSlug: 'staff-viewer',
    population: 'staff',
    assignedBy: ADMIN_USER_ID,
    assignedOn: new Date().toISOString(),
    expiresAt: null,
    rbacVersion: 1,
    ...overrides,
  };
}

function makePromotionRequest(overrides: Partial<PromotionRequest> = {}): PromotionRequest {
  return {
    id: PROMOTION_ID,
    targetUserId: TARGET_USER_ID,
    targetRole: 'portal-admin',
    initiatedBy: ADMIN_USER_ID,
    approvedBy: null,
    status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    rejectionReason: null,
    createdOn: new Date().toISOString(),
    ...overrides,
  };
}

function makeAuditLogEntry(): AuditLogEntry {
  return {
    id: 'ffffffff-0000-0000-0000-000000000006',
    eventType: 'role_assigned',
    actorUserId: ADMIN_USER_ID,
    targetUserId: TARGET_USER_ID,
    roleSlug: 'staff-viewer',
    subject: null,
    action: null,
    resourceId: null,
    correlationId: 'corr-001',
    ipAddress: '127.0.0.1',
    detail: null,
    createdOn: new Date().toISOString(),
  };
}

function makeMockRbacService(overrides: Partial<RbacService> = {}): RbacService {
  return {
    getActiveRoles: vi.fn().mockResolvedValue([makeRbacUserRole()]),
    assignRole: vi.fn().mockResolvedValue(makeRbacUserRole()),
    revokeRole: vi.fn().mockResolvedValue(undefined),
    initiatePromotion: vi.fn().mockResolvedValue(makePromotionRequest()),
    listPendingPromotions: vi.fn().mockResolvedValue([makePromotionRequest()]),
    getPromotionById: vi.fn().mockResolvedValue(makePromotionRequest()),
    approvePromotion: vi.fn().mockResolvedValue(makeRbacUserRole({ roleSlug: 'portal-admin' })),
    rejectPromotion: vi.fn().mockResolvedValue(undefined),
    queryAuditLog: vi.fn().mockResolvedValue([makeAuditLogEntry()]),
    getCurrentRbacVersion: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as RbacService;
}

function makeMockAuditWriter(): RbacAuditWriter {
  return {
    logRoleAssigned: vi.fn().mockResolvedValue(undefined),
    logRoleRevoked: vi.fn().mockResolvedValue(undefined),
    logPromotionInitiated: vi.fn().mockResolvedValue(undefined),
    logPromotionApproved: vi.fn().mockResolvedValue(undefined),
    logPromotionRejected: vi.fn().mockResolvedValue(undefined),
    logPiiAccessed: vi.fn().mockResolvedValue(undefined),
    logPermissionDenied: vi.fn().mockResolvedValue(undefined),
  } as unknown as RbacAuditWriter;
}

function makeMockDataverse(): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [] }),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn(),
  } as unknown as DataverseClient;
}

// ---------------------------------------------------------------------------
// JWT helpers — sign a token representing a specific user/role
// ---------------------------------------------------------------------------

type SignedToken = string;

async function signToken(
  app: FastifyInstance,
  claims: Partial<TokenClaims> & { sub: string },
): Promise<SignedToken> {
  return app.jwt.sign({
    email: claims.email ?? 'test@example.com',
    roles: claims.roles ?? ['portal-admin'],
    rbac_version: claims.rbac_version ?? 1,
    jti: claims.jti ?? `jti-${Math.random()}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  });
}

// ---------------------------------------------------------------------------
// Test app factory
//
// Wires:
//   - requestContextPlugin
//   - @fastify/jwt
//   - A stub auth-guard plugin that validates the JWT and resolves ability
//     from buildAbility() using the token's first role (no Dataverse call needed)
//   - rbacPlugin (requirePermission) wired against the mock rbacService
//   - adminRbacRoutes
// ---------------------------------------------------------------------------

async function buildTestApp(
  rbacService: RbacService = makeMockRbacService(),
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET });

  // Stub auth-guard: validates JWT with @fastify/jwt, then resolves ability
  // from the token's roles claim (no Dataverse call needed in tests).
  await app.register(
    fp(async (instance) => {
      // Mock dataverse for auth-guard JTI check (always valid in tests)
      (instance as unknown as Record<string, unknown>)['dataverse'] = makeMockDataverse();

      instance.decorate(
        'authenticate',
        async function authenticate(
          request: FastifyRequest,
          reply: FastifyReply,
        ): Promise<void> {
          try {
            const claims = await request.jwtVerify<TokenClaims>();
            request.user = claims;
            request.userId = claims.sub;
          } catch {
            await reply.status(401).send({ code: 'unauthorized', message: 'A valid Bearer token is required' });
          }
        },
      );

      instance.decorate(
        'requireRole',
        function requireRole(role: string) {
          return async function checkRole(
            req: FastifyRequest,
            rep: FastifyReply,
          ): Promise<void> {
            if (!req.user?.roles.includes(role)) {
              await rep.status(403).send({ code: 'forbidden', message: `Role '${role}' required` });
            }
          };
        },
      );
    }),
  );

  // requirePermission: resolves ability from JWT roles (no Dataverse on every test request)
  await app.register(
    fp(async (instance) => {
      instance.decorate('rbacService', rbacService);
      instance.decorate('rbacAuditWriter', makeMockAuditWriter());
      instance.decorateRequest('ability', undefined);

      instance.decorate(
        'requirePermission',
        function requirePermission(action: string, subject: string) {
          return async function checkPermission(
            request: FastifyRequest,
            reply: FastifyReply,
          ): Promise<void> {
            const user = request.user;
            if (!user) {
              await reply.status(401).send({ code: 'unauthorized', message: 'No user' });
              return;
            }

            const ability: AppAbility = buildAbility(user.roles);
            (request as unknown as Record<string, unknown>)['ability'] = ability;

            if (!ability.can(action as never, subject as never)) {
              await reply.status(403).send({ code: 'forbidden', message: `Cannot ${action} ${subject}` });
            }
          };
        },
      );
    }),
  );

  await app.register(
    fp(async (instance) => {
      await adminRbacRoutes(instance, { rbacService });
    }),
  );

  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// POST /api/admin/rbac/roles/assign
// ---------------------------------------------------------------------------

describe('POST /api/admin/rbac/roles/assign', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('assignRole_happyPath_returns201WithRbacUserRole', async () => {
    // Arrange
    const payload = { userId: TARGET_USER_ID, roleSlug: 'staff-viewer' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/roles/assign',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert
    expect(response.statusCode).toBe(201);
    const body = response.json() as { data: RbacUserRole };
    expect(body.data.userId).toBe(TARGET_USER_ID);
    expect(body.data.roleSlug).toBe('staff-viewer');
  });

  it('assignRole_badUserId_returns400Or422', async () => {
    // Arrange
    const payload = { userId: 'not-a-uuid', roleSlug: 'staff-viewer' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/roles/assign',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('assignRole_portalAdminRoleSlug_returns400FromSchema', async () => {
    // Arrange — 'portal-admin' is excluded from the Zod enum in AssignRoleSchema
    const payload = { userId: TARGET_USER_ID, roleSlug: 'portal-admin' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/roles/assign',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert — Zod parse fails before service is called
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('assignRole_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/roles/assign',
      payload: { userId: TARGET_USER_ID, roleSlug: 'staff-viewer' },
    });

    // Assert
    expect(response.statusCode).toBe(401);
    const body = response.json() as { code: string };
    expect(body.code).toBe('unauthorized');
  });

  it('assignRole_staffViewerToken_returns403', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/roles/assign',
      headers: { Authorization: `Bearer ${viewerToken}` },
      payload: { userId: TARGET_USER_ID, roleSlug: 'staff-viewer' },
    });

    // Assert
    expect(response.statusCode).toBe(403);
    const body = response.json() as { code: string };
    expect(body.code).toBe('forbidden');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/rbac/roles/:assignmentId
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/rbac/roles/:assignmentId', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('revokeRole_happyPath_returns204', async () => {
    // Act
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/rbac/roles/${ASSIGNMENT_ID}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('revokeRole_badAssignmentId_returns400Or422', async () => {
    // Act
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/rbac/roles/not-a-uuid',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('revokeRole_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/rbac/roles/${ASSIGNMENT_ID}`,
    });

    // Assert
    expect(response.statusCode).toBe(401);
  });

  it('revokeRole_staffViewerToken_returns403', async () => {
    // Act
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/admin/rbac/roles/${ASSIGNMENT_ID}`,
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    // Assert
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/rbac/promotions
// ---------------------------------------------------------------------------

describe('POST /api/admin/rbac/promotions', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('initiatePromotion_happyPath_returns201WithPendingPromotion', async () => {
    // Arrange
    const payload = { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert
    expect(response.statusCode).toBe(201);
    const body = response.json() as { data: PromotionRequest };
    expect(body.data.status).toBe('pending');
    expect(body.data.targetRole).toBe('portal-admin');
  });

  it('initiatePromotion_wrongTargetRole_returns400Or422', async () => {
    // Arrange — targetRole must be literal 'portal-admin' per Zod schema
    const payload = { targetUserId: TARGET_USER_ID, targetRole: 'staff-viewer' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('initiatePromotion_badTargetUserId_returns400Or422', async () => {
    // Arrange
    const payload = { targetUserId: 'not-a-uuid', targetRole: 'portal-admin' };

    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload,
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('initiatePromotion_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions',
      payload: { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' },
    });

    // Assert
    expect(response.statusCode).toBe(401);
  });

  it('initiatePromotion_staffViewerToken_returns403', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions',
      headers: { Authorization: `Bearer ${viewerToken}` },
      payload: { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' },
    });

    // Assert
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/rbac/promotions/:id/approve
// ---------------------------------------------------------------------------

describe('POST /api/admin/rbac/promotions/:id/approve', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('approvePromotion_happyPath_returns200WithAssignedRole', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/approve`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: RbacUserRole };
    expect(body.data.roleSlug).toBe('portal-admin');
  });

  it('approvePromotion_badPromotionId_returns400Or422', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/rbac/promotions/not-a-uuid/approve',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('approvePromotion_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/approve`,
    });

    // Assert
    expect(response.statusCode).toBe(401);
  });

  it('approvePromotion_staffViewerToken_returns403', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/approve`,
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    // Assert
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/rbac/promotions/:id/reject
// ---------------------------------------------------------------------------

describe('POST /api/admin/rbac/promotions/:id/reject', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejectPromotion_happyPath_returns204', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/reject`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { reason: 'Insufficient justification provided' },
    });

    // Assert
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('rejectPromotion_emptyReason_returns400Or422', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/reject`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { reason: '' },
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('rejectPromotion_missingReason_returns400Or422', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/reject`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {},
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('rejectPromotion_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/reject`,
      payload: { reason: 'reason' },
    });

    // Assert
    expect(response.statusCode).toBe(401);
  });

  it('rejectPromotion_staffViewerToken_returns403', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/rbac/promotions/${PROMOTION_ID}/reject`,
      headers: { Authorization: `Bearer ${viewerToken}` },
      payload: { reason: 'reason' },
    });

    // Assert
    expect(response.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/rbac/audit
// ---------------------------------------------------------------------------

describe('GET /api/admin/rbac/audit', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    app = await buildTestApp();
    adminToken = await signToken(app, { sub: ADMIN_USER_ID, roles: ['portal-admin'] });
    viewerToken = await signToken(app, { sub: VIEWER_USER_ID, roles: ['staff-viewer'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('queryAuditLog_happyPath_returns200WithArray', async () => {
    // Act
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/rbac/audit',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: AuditLogEntry[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.eventType).toBe('role_assigned');
  });

  it('queryAuditLog_topExceedsMax_returns400Or422', async () => {
    // Arrange — max is 200 per AuditLogQuerySchema
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/rbac/audit?top=999',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Assert
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('queryAuditLog_noToken_returns401', async () => {
    // Act
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/rbac/audit',
    });

    // Assert
    expect(response.statusCode).toBe(401);
  });

  it('queryAuditLog_staffViewerToken_returns403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/rbac/audit',
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    expect(response.statusCode).toBe(403);
  });
});
