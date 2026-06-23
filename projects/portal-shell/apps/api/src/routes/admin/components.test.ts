// Integration tests for admin component routes.
// TC-052: every admin component route must return HTTP 403 when the caller's
// JWT contains a non-Admin role. Missing-token requests must return 401.
// Admin-role requests must reach the handler (proven by 200/204 responses).

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { adminComponentRoutes } from './components.js';
import { authGuardPlugin } from '../../plugins/auth-guard.js';
import { registerJwt } from '../../plugins/jwt.js';
import { requestContextPlugin } from '../../plugins/request-context.js';
import type { ComponentRegistryService } from '../../services/ComponentRegistryService.js';
import { RegistryError } from '../../services/ComponentRegistryService.js';
import { DataverseNotFoundError } from '@portal/dataverse-client';
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
  // Mirror the production app's error handler: ZodError â†’ 400.
  // Use error.name check (more reliable across ESM module boundaries than instanceof).
  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    if (error.name === 'ZodError') {
      return reply.status(400).send({ code: 'validation_error', message: error.message });
    }
    return reply.status(error.statusCode ?? 500).send({ message: error.message });
  });
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
// TC-052 â€” Viewer-role JWT must be rejected with 403 on all 11 routes
// ---------------------------------------------------------------------------

describe('TC-052 â€” Viewer-role JWT returns 403 on every admin component route', () => {
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
    expect((res.json() as { code: string }).code, `${method} ${url} code`).toBe('forbidden');
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
// Auth boundary â€” missing token must return 401
// ---------------------------------------------------------------------------

describe('Auth boundary â€” missing Bearer token returns 401 on admin component routes', () => {
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
    expect((res.json() as { code: string }).code).toBe('unauthorized');
  });

  it('should_return_401_on_POST_components_when_no_token_provided', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/components', payload: {} });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe('unauthorized');
  });

  it('should_return_401_on_set_latest_when_no_token_provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}/set-latest`,
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe('unauthorized');
  });
});

// ---------------------------------------------------------------------------
// Admin role â€” request passes auth guard and reaches handler
// ---------------------------------------------------------------------------

describe('Admin role â€” JWT with Admin role reaches the route handler', () => {
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
    const body = res.json() as { items: unknown[]; total: number };
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
    const body = res.json() as { data: { id: string } };
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

// ---------------------------------------------------------------------------
// Route handler logic â€” validation, error forwarding, response shapes
// ---------------------------------------------------------------------------

describe('Route handler logic â€” validation, RegistryError forwarding, and 404 mapping', () => {
  let app: TestApp;
  let registry: ComponentRegistryService;
  let adminAuth: string;

  const nowIso = new Date().toISOString();

  const mockDefinitionDetail = {
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
  };

  const mockVersionDetail = {
    id: VERSION_ID,
    versionNumber: '1.0.0',
    isLatest: false,
    changeLog: null,
    propsSchema: null,
    definitionId: COMPONENT_ID,
    createdOn: nowIso,
  };

  beforeAll(async () => {
    registry = buildMockRegistry();
    app = await buildTestApp(registry);
    adminAuth = makeAuthHeader(app, ['Admin']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values after clearAllMocks
    (registry.listDefinitions as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    (registry.getDefinitionById as ReturnType<typeof vi.fn>).mockResolvedValue(mockDefinitionDetail);
    (registry.createDefinition as ReturnType<typeof vi.fn>).mockResolvedValue(mockDefinitionDetail);
    (registry.patchDefinition as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (registry.deactivateDefinition as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (registry.listVersions as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });
    (registry.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(mockVersionDetail);
    (registry.createVersion as ReturnType<typeof vi.fn>).mockResolvedValue(mockVersionDetail);
    (registry.patchVersion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (registry.deactivateVersion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (registry.setLatestVersion as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // GET /components â€” response shape

  it('should_include_total_top_and_skip_in_GET_components_response_body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/components?top=10&skip=5',
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number; top: number; skip: number };
    expect(body.top).toBe(10);
    expect(body.skip).toBe(5);
  });

  // POST /components

  it('should_return_409_when_POST_components_service_throws_RegistryError', async () => {
    (registry.createDefinition as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new RegistryError('duplicate_component_name', 'already exists', 409),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/components',
      headers: { Authorization: adminAuth },
      payload: { name: 'button', displayName: 'Button', category: 1, renderTargets: ['portal'] },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('duplicate_component_name');
  });

  it('should_return_201_with_data_when_POST_components_succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/components',
      headers: { Authorization: adminAuth },
      payload: { name: 'button', displayName: 'Button', category: 1, renderTargets: ['portal'] },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { data: { id: string } }).data.id).toBe(COMPONENT_ID);
  });

  // GET /components â€” non-registry error propagates as 500

  it('should_propagate_unexpected_errors_as_500_from_GET_components_by_id', async () => {
    (registry.getDefinitionById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('unexpected database connection failure'),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(500);
  });

  // PATCH /components/:id

  it('should_return_400_when_PATCH_components_includes_immutable_category_field', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
      payload: { category: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should_return_204_when_PATCH_components_succeeds', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
      payload: { displayName: 'Updated Name' },
    });
    expect(res.statusCode).toBe(204);
  });

  // DELETE /components/:id

  it('should_return_204_when_DELETE_components_succeeds', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(204);
  });

  it('should_return_409_when_DELETE_components_service_throws_RegistryError', async () => {
    (registry.deactivateDefinition as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new RegistryError('component_has_versions', 'has active versions', 409),
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('component_has_versions');
  });

  // GET /components/:id â€” 404 path

  it('should_return_404_when_GET_component_by_id_throws_DataverseNotFoundError', async () => {
    (registry.getDefinitionById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DataverseNotFoundError('qdb_component_definitionses', COMPONENT_ID),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe('not_found');
  });

  // GET /components/:id/versions

  it('should_return_200_with_items_when_GET_versions_succeeds', async () => {
    (registry.listVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [mockVersionDetail],
      total: 1,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}/versions`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  // POST /components/:id/versions

  it('should_return_201_with_data_when_POST_versions_succeeds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/components/${COMPONENT_ID}/versions`,
      headers: { Authorization: adminAuth },
      payload: { versionNumber: '1.0.0' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { data: { id: string } }).data.id).toBe(VERSION_ID);
  });

  it('should_return_409_when_POST_versions_service_throws_RegistryError', async () => {
    (registry.createVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new RegistryError('duplicate_version_number', 'already exists', 409),
    );
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/components/${COMPONENT_ID}/versions`,
      headers: { Authorization: adminAuth },
      payload: { versionNumber: '1.0.0' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('duplicate_version_number');
  });

  // GET /components/:id/versions/:versionId

  it('should_return_200_with_version_data_when_GET_version_by_id_succeeds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { id: string } }).data.id).toBe(VERSION_ID);
  });

  it('should_return_404_when_GET_version_by_id_throws_DataverseNotFoundError', async () => {
    (registry.getVersionById as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new DataverseNotFoundError('qdb_component_versionses', VERSION_ID),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe('not_found');
  });

  // PATCH /components/:id/versions/:versionId

  it('should_return_204_when_PATCH_version_succeeds', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`,
      headers: { Authorization: adminAuth },
      payload: { changeLog: 'Bug fix' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('should_include_total_top_and_skip_in_GET_versions_response_body', async () => {
    (registry.listVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [],
      total: 7,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/components/${COMPONENT_ID}/versions?top=5`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; top: number };
    expect(body.total).toBe(7);
    expect(body.top).toBe(5);
  });

  // DELETE /components/:id/versions/:versionId

  it('should_return_204_when_DELETE_version_succeeds', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(204);
  });

  it('should_return_409_when_DELETE_version_throws_cannot_delete_latest_version', async () => {
    (registry.deactivateVersion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new RegistryError('cannot_delete_latest_version', 'promote another first', 409),
    );
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/components/${COMPONENT_ID}/versions/${VERSION_ID}`,
      headers: { Authorization: adminAuth },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('cannot_delete_latest_version');
  });
});
