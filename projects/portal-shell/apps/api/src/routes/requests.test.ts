// TC-SEC-003 — PII access audit trail integration test (promoted from QA gap list)
//
// Verifies AC-RBAC-001: every read of CitizenPII fields (qdb_form_data, qdb_user_id)
// via GET /api/requests/:id must produce a pii_accessed audit log entry.
//
// Phase 6 audit raised SEC-02: logPiiAccessed was defined but never called from any
// production route. The fix wired it into GET /api/requests/:id. This file proves
// the wire-up is correct end-to-end under the Fastify request lifecycle.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { requestRoutes } from './requests.js';
import { rbacPlugin } from '../plugins/rbac.js';
import { authGuardPlugin } from '../plugins/auth-guard.js';
import { registerJwt } from '../plugins/jwt.js';
import { requestContextPlugin } from '../plugins/request-context.js';
import type { RbacAuditWriter, PiiAuditParams } from '../services/RbacAuditWriter.js';
import type { RbacService } from '../services/RbacService.js';
import type { DataverseClient } from '@portal/dataverse-client';
import type { RbacUserRole } from '@portal/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
const CITIZEN_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const REQUEST_ID = 'cccccccc-0000-0000-0000-000000000003';
const GUEST_USER_ID = 'dddddddd-0000-0000-0000-000000000004';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDataverseRequest(ownerUserId: string): Record<string, unknown> {
  return {
    qdb_portal_requestid: REQUEST_ID,
    qdb_service_code: 'loan-application',
    qdb_service_title: 'Loan Application',
    qdb_status: 860000001,
    createdon: '2026-01-01T00:00:00Z',
    modifiedon: '2026-01-02T00:00:00Z',
    qdb_reference_number: 'REF-001',
    qdb_form_data: JSON.stringify({ nationalId: '29012345678' }),
    qdb_user_id: ownerUserId,
  };
}

function makeCitizenRole(): RbacUserRole {
  return {
    id: 'role-001',
    userId: CITIZEN_USER_ID,
    roleSlug: 'registered-citizen',
    population: 'citizen',
    assignedBy: 'system',
    assignedOn: '2026-01-01T00:00:00Z',
    expiresAt: null,
    rbacVersion: 1,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockDataverse(ownerUserId = CITIZEN_USER_ID): DataverseClient {
  return {
    getById: vi.fn().mockResolvedValue(makeDataverseRequest(ownerUserId)),
    getList: vi.fn().mockResolvedValue({ value: [] }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as DataverseClient;
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

function makeMockRbacService(roleSlug = 'registered-citizen'): RbacService {
  return {
    getActiveRoles: vi.fn().mockResolvedValue([
      { ...makeCitizenRole(), roleSlug },
    ]),
  } as unknown as RbacService;
}

// ---------------------------------------------------------------------------
// Test app builder
// ---------------------------------------------------------------------------

async function buildTestApp(
  dataverse: DataverseClient,
  rbacAuditWriter: RbacAuditWriter,
  rbacService: RbacService,
): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });

  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET } as Parameters<typeof registerJwt>[1]);
  await app.register(authGuardPlugin);
  await app.register(rbacPlugin);

  // Decorate with mocks — resolved at request time, not registration time
  app.decorate('rbacService', rbacService);
  app.decorate('rbacAuditWriter', rbacAuditWriter);

  await app.register(fp(async (instance) => {
    await requestRoutes(instance, { dataverse, rbacAuditWriter });
  }));

  await app.ready();
  return app;
}

function signCitizenToken(app: ReturnType<typeof Fastify>, sub = CITIZEN_USER_ID): string {
  return app.jwt.sign({
    sub,
    email: 'citizen@example.com',
    role: 'registered-citizen',
    rbac_version: 1,
    jti: `jti-${Math.random()}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

// ---------------------------------------------------------------------------
// TC-SEC-003 — PII access audit trail (AC-RBAC-001)
// ---------------------------------------------------------------------------

describe('TC-SEC-003 — GET /api/requests/:id PII audit trail', () => {
  let app: ReturnType<typeof Fastify>;
  let auditWriter: RbacAuditWriter;
  let token: string;

  beforeAll(async () => {
    auditWriter = makeMockAuditWriter();
    app = await buildTestApp(
      makeMockDataverse(CITIZEN_USER_ID),
      auditWriter,
      makeMockRbacService('registered-citizen'),
    );
    token = signCitizenToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logPiiAccessed_calledOnSuccessfulRequestDetailFetch_withCorrectSubjectAndResourceId', async () => {
    // Arrange — auditWriter.logPiiAccessed is a fresh mock after clearAllMocks

    // Act
    const response = await app.inject({
      method: 'GET',
      url: `/api/requests/${REQUEST_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    // Assert — HTTP response is 200
    expect(response.statusCode).toBe(200);

    // Assert — logPiiAccessed called exactly once (AC-RBAC-001)
    expect(auditWriter.logPiiAccessed).toHaveBeenCalledOnce();

    const callArg = vi.mocked(auditWriter.logPiiAccessed).mock.calls[0]?.[0] as PiiAuditParams;
    expect(callArg.subject).toBe('CitizenPII');
    expect(callArg.resourceId).toBe(REQUEST_ID);
    expect(callArg.actorUserId).toBe(CITIZEN_USER_ID);
    expect(callArg.correlationId).toBeTruthy();
    expect(callArg.ipAddress).toBeDefined();
  });

  it('logPiiAccessed_notCalled_whenOwnershipCheckFails', async () => {
    // Arrange — dataverse returns a request owned by a DIFFERENT user
    const otherOwnerApp = await buildTestApp(
      makeMockDataverse(OTHER_USER_ID),
      auditWriter,
      makeMockRbacService('registered-citizen'),
    );
    const citizenToken = signCitizenToken(otherOwnerApp, CITIZEN_USER_ID);

    // Act
    const response = await otherOwnerApp.inject({
      method: 'GET',
      url: `/api/requests/${REQUEST_ID}`,
      headers: { Authorization: `Bearer ${citizenToken}` },
    });

    // Assert — 403 before PII is served
    expect(response.statusCode).toBe(403);
    expect(auditWriter.logPiiAccessed).not.toHaveBeenCalled();

    await otherOwnerApp.close();
  });

  it('logPiiAccessed_notCalled_whenRequestIsUnauthenticated', async () => {
    // Act
    const response = await app.inject({
      method: 'GET',
      url: `/api/requests/${REQUEST_ID}`,
    });

    // Assert — 401 before any data is fetched
    expect(response.statusCode).toBe(401);
    expect(auditWriter.logPiiAccessed).not.toHaveBeenCalled();
  });

  it('logPiiAccessed_notCalled_whenCallerLacksCitizenPiiPermission', async () => {
    // Arrange — guest role has no CitizenPII read permission
    const guestApp = await buildTestApp(
      makeMockDataverse(CITIZEN_USER_ID),
      auditWriter,
      makeMockRbacService('guest'),
    );
    const guestToken = guestApp.jwt.sign({
      sub: GUEST_USER_ID,
      email: 'guest@example.com',
      role: 'guest',
      rbac_version: 1,
      jti: `jti-${Math.random()}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    // Act
    const response = await guestApp.inject({
      method: 'GET',
      url: `/api/requests/${REQUEST_ID}`,
      headers: { Authorization: `Bearer ${guestToken}` },
    });

    // Assert — 403 from requirePermission before PII is served
    expect(response.statusCode).toBe(403);
    expect(auditWriter.logPiiAccessed).not.toHaveBeenCalled();

    await guestApp.close();
  });
});

// ---------------------------------------------------------------------------
// GET /api/requests — list endpoint (no PII fields, no audit required)
// ---------------------------------------------------------------------------

describe('GET /api/requests — list (no PII)', () => {
  let app: ReturnType<typeof Fastify>;
  let auditWriter: RbacAuditWriter;

  beforeAll(async () => {
    auditWriter = makeMockAuditWriter();
    const dataverse = {
      getList: vi.fn().mockResolvedValue({ value: [] }),
    } as unknown as DataverseClient;

    app = await buildTestApp(dataverse, auditWriter, makeMockRbacService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('listRequests_noAuditLog_whenListEndpointCalled', async () => {
    const token = signCitizenToken(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/requests',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(auditWriter.logPiiAccessed).not.toHaveBeenCalled();
  });

  it('listRequests_returns401_withoutToken', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/requests' });
    expect(response.statusCode).toBe(401);
  });
});
