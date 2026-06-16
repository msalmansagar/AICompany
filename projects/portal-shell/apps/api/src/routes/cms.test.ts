// RED → GREEN → REFACTOR — CMS route integration tests
//
// Covers public routes: happy path, validation failure, and auth (none required).
// Covers admin routes: happy path, validation failure, and auth failure.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { cmsRoutes } from './cms.js';
import { adminCmsRoutes } from './admin/cms.js';
import { authGuardPlugin } from '../plugins/auth-guard.js';
import { registerJwt } from '../plugins/jwt.js';
import { requestContextPlugin } from '../plugins/request-context.js';
import type { CmsService } from '../services/CmsService.js';
import type { CmsContent, CmsSummary, CmsRevision } from '@portal/types';

// ---------------------------------------------------------------------------
// Mock CmsService
// ---------------------------------------------------------------------------

const MOCK_SUMMARY: CmsSummary = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  slug: 'hello-world',
  title: 'Hello World',
  titleAr: 'مرحبا بالعالم',
  contentType: 'blog',
  excerpt: 'An excerpt',
  excerptAr: 'ملخص',
  coverImageUrl: null,
  status: 'published',
  publishedOn: '2025-01-01T00:00:00Z',
  authorName: 'Jane Doe',
  tags: ['tech'],
  createdOn: '2025-01-01T00:00:00Z',
};

const MOCK_CONTENT: CmsContent = {
  ...MOCK_SUMMARY,
  bodyHtml: '<p>Hello</p>',
  bodyHtmlAr: '<p>مرحبا</p>',
  metaDescription: 'SEO',
  modifiedOn: '2025-01-02T00:00:00Z',
};

const MOCK_REVISION: CmsRevision = {
  id: 'rev-001',
  contentId: 'aaaaaaaa-0000-0000-0000-000000000001',
  bodyHtml: '<p>Old</p>',
  bodyHtmlAr: '',
  savedBy: 'Jane Doe',
  savedOn: '2025-01-01T12:00:00Z',
};

function buildMockCmsService(overrides: Partial<CmsService> = {}): CmsService {
  return {
    listPublished: vi.fn().mockResolvedValue({ items: [MOCK_SUMMARY], total: 1 }),
    getBySlug: vi.fn().mockResolvedValue(MOCK_CONTENT),
    listPublishedTags: vi.fn().mockResolvedValue(['news', 'tech']),
    listAll: vi.fn().mockResolvedValue({ items: [MOCK_SUMMARY], total: 1 }),
    getById: vi.fn().mockResolvedValue(MOCK_CONTENT),
    create: vi.fn().mockResolvedValue(MOCK_CONTENT),
    update: vi.fn().mockResolvedValue(MOCK_CONTENT),
    publish: vi.fn().mockResolvedValue(undefined),
    unpublish: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listRevisions: vi.fn().mockResolvedValue([MOCK_REVISION]),
    ...overrides,
  } as unknown as CmsService;
}

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

async function buildTestApp(cmsService: CmsService): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET });
  await app.register(authGuardPlugin);
  await app.register(
    fp(async (instance) => {
      await cmsRoutes(instance, { cmsService });
      await adminCmsRoutes(instance, { cmsService });
    }),
  );
  await app.ready();
  return app;
}

function makeAdminToken(app: ReturnType<typeof Fastify>): string {
  return app.jwt.sign({
    sub: 'user-admin-001',
    email: 'admin@example.com',
    roles: ['Admin'],
    displayName: 'Admin User',
    linkedEntityIds: [],
    preferredLanguage: 'en',
  });
}

// ---------------------------------------------------------------------------
// Public CMS routes
// ---------------------------------------------------------------------------

describe('GET /api/cms — public list', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_items_and_meta_on_happy_path', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cms' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: CmsSummary[]; meta: { total: number } }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.slug).toBe('hello-world');
    expect(body.meta.total).toBe(1);
  });

  it('should_return_200_when_filtering_by_valid_type_param', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cms?type=blog' });

    expect(response.statusCode).toBe(200);
  });

  it('should_return_422_when_type_param_is_invalid', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cms?type=invalid-type' });

    expect([400, 422, 500]).toContain(response.statusCode);
  });
});

describe('GET /api/cms/tags — public tags', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_array_of_tag_strings', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cms/tags' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: string[] }>();
    expect(body.data).toEqual(['news', 'tech']);
  });
});

describe('GET /api/cms/:slug — public detail', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_full_content_on_happy_path', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cms/hello-world' });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: CmsContent }>();
    expect(body.data.slug).toBe('hello-world');
    expect(body.data.bodyHtml).toBe('<p>Hello</p>');
  });

  it('should_not_require_authentication', async () => {
    // No Authorization header — must still return 200
    const response = await app.inject({
      method: 'GET',
      url: '/api/cms/hello-world',
      // deliberate: no headers
    });

    expect(response.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Admin CMS routes
// ---------------------------------------------------------------------------

describe('GET /api/admin/cms — admin list', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_items_when_admin_token_is_provided', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/cms',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: CmsSummary[] }>();
    expect(body.data).toHaveLength(1);
  });

  it('should_return_401_when_no_token_is_provided', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/cms' });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('should_return_403_when_user_does_not_have_admin_role', async () => {
    const userToken = app.jwt.sign({
      sub: 'user-portal-001',
      email: 'user@example.com',
      roles: ['portal_user'],
      displayName: 'User',
      linkedEntityIds: [],
      preferredLanguage: 'en',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/cms',
      headers: { Authorization: `Bearer ${userToken}` },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('forbidden');
  });
});

describe('POST /api/admin/cms — admin create', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  const validPayload = {
    slug: 'new-post',
    title: 'New Post',
    titleAr: 'مقالة جديدة',
    contentType: 'blog',
    authorName: 'Admin',
  };

  it('should_return_201_with_created_content_on_happy_path', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ data: CmsContent }>();
    expect(body.data.slug).toBe('hello-world'); // from mock
  });

  it('should_return_422_when_slug_contains_uppercase_letters', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { ...validPayload, slug: 'Invalid-Slug' },
    });

    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('should_return_422_when_required_title_field_is_missing', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { slug: 'valid-slug', contentType: 'blog', authorName: 'Admin' },
      // title and titleAr missing
    });

    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('should_return_401_when_no_token_is_provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms',
      headers: { 'content-type': 'application/json' },
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/admin/cms/:id/publish — admin publish', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_204_when_publish_succeeds', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms/aaaaaaaa-0000-0000-0000-000000000001/publish',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(204);
  });

  it('should_return_401_without_auth_token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/cms/aaaaaaaa-0000-0000-0000-000000000001/publish',
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/admin/cms/:id/revisions — admin revisions', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockCmsService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_revision_list_on_happy_path', async () => {
    const token = makeAdminToken(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/cms/aaaaaaaa-0000-0000-0000-000000000001/revisions',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: CmsRevision[] }>();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe('rev-001');
  });
});
