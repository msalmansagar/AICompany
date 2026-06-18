// Integration tests for admin component routes.
// TC-052: every admin component route must return HTTP 403 when the caller's
// JWT contains a non-Admin role. Missing-token requests must return 401.
// Admin-role requests must reach the handler (proven by 200/204 responses).

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { adminComponentRoutes } from './components.js';
import { authGuardPlugin } from '../../plugins/auth-guard.js';
import { registerJwt } from '../../plugins/jwt.js';
import { requestContextPlugin } from '../../plugins/request-context.js';
import type { ComponentRegistryService } from '../../services/ComponentRegistryService.js';
import type { DataverseClient } from '@portal/dataverse-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
const COMPONENT_ID = '11111111-1111-1111-1111-111111111111';
const VERSION_ID = '22222222-2222-2222-2222-222222222222';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Dataverse mock whose getList always returns empty (JTI not revoked). */
function buildMockDataverse(): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [] }),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    executeAction: vi.fn(),
    executeBatch: vi.fn(),
  } as unknown as DataverseClient;
}

function buildMockRegistry(): ComponentRegistryService {
  const nowIso = new Date().toISOString();
  return {
    listDefinitions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getDefinitionById: vi.fn().mockResolvedValue({
      id: COMPONENT_ID,
      name: 'test-component',
      displayName: 'Test Component',
      displayNameAr: null,
      category: 1,
      renderTargets: ['portal'],
      isActive: true,
      descriptionEn: null,
      descriptionAr: null,
      createdOn: nowIso,
      modifiedOn: nowIso,
    }),
    createDefinition: vi.fn(),
    patchDefinition: vi.fn().mockResolvedValue(undefined),
    deactivateDefinition: vi.fn().mockResolvedValue(undefined),
    listVersions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getVersionById: vi.fn().mockResolvedValue({
      id: VERSION_ID,
      versionNumber: '1.0.0',
      isLatest: false,
      changeLog: null,
      propsSchema: null,
      definitionId: COMPONENT_ID,
      createdOn: nowIso,
    }),
    createVersion: vi.fn(),
    patchVersion: vi.fn().mockResolvedValue(undefined),
    deactivateVersion: vi.fn().mockResolvedValue(undefined),
    setLatestVersion: vi.fn().mockResolvedValue(undefined),
  } as unknown as ComponentRegistryService;
}

type TestApp = ReturnType<typeof Fastify>;

async function buildTestApp(registry: ComponentRegistryService): Promise<TestApp> {
  const app = Fastify({ logger: false });
  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET });
  // auth-guard reads app.dataverse for JTI revocation checks
  app.decorate('dataverse', buildMockDataverse());
  await app.register(authGuardPlugin);
  await app.register(
    fp(async (instance) => {
      await adminComponentRoutes(instance, { componentRegistryService: registry });
    }),
  );
  await app.ready();
  return app;
}

/** Signs a JWT with the test secret after the app is ready. */
function makeAuthHeader(app: TestApp, roles: string[]): string {
  const token = app.jwt.sign(
    { sub: 'user-test-001', email: 'tester@example.com', roles, jti: 'jti-test-001' },
    { expiresIn: '1h' },
  );
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// TC-052 — Viewer-role JWT must be rejected with 403 on all 11 routes
// ---------------------------------------------------------------------------

describe('TC-052 — Viewer-role JWT returns 403 on every admin component route', () => {
  let app: TestApp;
  let viewerAuth: string;

  beforeAll(async () => {
    app = await buildTestApp(buildMockRegistry());
    viewerAuth = makeAuthHeader(app, ['Viewer']);
  });

  afterAll(async () => {
    await app.close();
  });

  async function expectForbidden(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string): Promise<void> {
    const res = await app.inject({ method, url, headers: { Authorization: viewerAuth } });
    expect(res.statusCode, `${method} ${url}`).toBe(403);
    expect(res.json<{ code: string }>().code, `${method} ${url} code`).toBe('forbidden');
  }

  it('should_return_403_when_viewer_calls_GET_components', async () => {
    await expectForbidden('GET', '/api/admin/components');
  });

  it('should_return_403_when_viewer_calls_POST_components', async () => {
    await expectForbidden('POST', '/api/admin/components');
  });

  it('should_return_403_when_viewer_calls_GET_component_by_id', async () => {
    await expectForbidden('GET', `/api/admin/components/${COMPONENT_ID}`);
  });

  it('should_return_403_when_viewer_calls_PATCH_component', async () => {
    await expectForbidden('PATCH', `/api/admin/components/${COMPONENT_ID}`);
  });

  it('should_return_403_when_viewer_calls_DELETE_component', async () => {
    await expectForbidden('DELETE', `/api/admin/components/${COMPONENT_ID}`);
  });

  it('should_return_403_when_viewer_calls_GET_versions', async () => {
    await expectForbidden('GET', `/api/admin/components/${COMPONENT_ID}/versions`);
  });

  it('should_return_403_when_viewer_calls_POST_versions', async () => {
    await expectForbidden('POST', `/api/admin/components/${COMPONENT_ID}/versions`);
  });

  it('should_return_403_when_viewer_calls_GET_version_by_id', async () => {
    await expectForbidden('GET', `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`);
  });

  it('should_return_403_when_viewer_calls_PATCH_version', async () => {
    await expectForbidden('PATCH', `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`);
  });

  it('should_return_403_when_viewer_calls_DELETE_version', async () => {
    await expectForbidden('DELETE', `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`);
  });

  it('should_return_403_when_viewer_calls_POST_set_latest', async () => {
    await expectForbidden('POST', `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}/set-latest`);
  });
});

// ---------------------------------------------------------------------------
// Auth boundary — missing token must return 401
// ---------------------------------------------------------------------------

describe('Auth boundary — missing Bearer token returns 401 on admin component routes', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildTestApp(buildMockRegistry());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_401_on_GET_components_when_no_token_provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/components' });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('unauthorized');
  });

  it('should_return_401_on_POST_components_when_no_token_provided', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/components', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('unauthorized');
  });

  it('should_return_401_on_set_latest_when_no_token_provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}/set-latest`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ code: string }>().code).toBe('unauthorized');
  });
});

// ---------------------------------------------------------------------------
// Admin role — request passes auth guard and reaches handler
// ---------------------------------------------------------------------------

describe('Admin role — JWT with Admin role reaches the route handler', () => {
  let app: TestApp;
  let adminAuth: string;

  beforeAll(async () => {
    app = await buildTestApp(buildMockRegistry());
    adminAuth = makeAuthHeader(app, ['Admin']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_empty_list_when_admin_calls_GET_components', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/components',
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[]; total: number }>();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('should_return_200_when_admin_calls_GET_component_by_id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { id: string } }>();
    expect(body.data.id).toBe(COMPONENT_ID);
  });

  it('should_return_204_when_admin_calls_set_latest', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}/set-latest`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(204);
  });
});
