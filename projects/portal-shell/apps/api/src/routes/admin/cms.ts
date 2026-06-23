import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateCmsContentSchema, UpdateCmsContentSchema, AdminCmsListQuerySchema } from '@portal/types';
import type { CmsContent, CmsSummary, CmsRevision } from '@portal/types';
import type { CmsService } from '../../services/CmsService.js';

interface AdminCmsRouteOptions {
  cmsService: CmsService;
}

const ADMIN_ROLE = 'Admin';

const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Admin CMS management routes — JWT authentication + Admin role required on all.
 *
 * Routes:
 *   GET    /api/admin/cms                — list all content (all statuses)
 *   POST   /api/admin/cms                — create content (status=draft)
 *   GET    /api/admin/cms/:id            — get single content by GUID
 *   PATCH  /api/admin/cms/:id            — update content (saves revision first)
 *   DELETE /api/admin/cms/:id            — delete content
 *   POST   /api/admin/cms/:id/publish    — set status=published, publishedOn=now
 *   POST   /api/admin/cms/:id/unpublish  — set status=draft, clear publishedOn
 *   GET    /api/admin/cms/:id/revisions  — list revision history (newest first)
 */
export async function adminCmsRoutes(
  app: FastifyInstance,
  { cmsService }: AdminCmsRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(ADMIN_ROLE)] as const;

  // GET /api/admin/cms
  app.get<{ Querystring: Record<string, string>; Reply: { data: CmsSummary[]; meta: { total: number; page: number; pageSize: number } } }>(
    '/api/admin/cms',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'List all CMS content (all statuses)' },
    },
    async (request, reply) => {
      const query = AdminCmsListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.cms.listAll',
        correlationId: request.correlationId,
        userId: request.userId,
        query,
      });

      const { items, total } = await cmsService.listAll(query, request.correlationId);

      return reply.status(200).send({
        data: items,
        meta: { total, page: query.page, pageSize: query.pageSize },
      });
    },
  );

  // POST /api/admin/cms
  app.post<{ Reply: { data: CmsContent } }>(
    '/api/admin/cms',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Create a new CMS content record (starts as draft)' },
    },
    async (request, reply) => {
      const body = CreateCmsContentSchema.parse(request.body);
      const savedBy = request.userId ?? 'unknown';

      app.log.info({
        operation: 'admin.cms.create',
        correlationId: request.correlationId,
        userId: savedBy,
        slug: body.slug,
      });

      const created = await cmsService.create(body, savedBy, request.correlationId);
      return reply.status(201).send({ data: created });
    },
  );

  // GET /api/admin/cms/:id
  app.get<{ Params: { id: string }; Reply: { data: CmsContent } }>(
    '/api/admin/cms/:id',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Get a single CMS content record by ID' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.cms.getById',
        correlationId: request.correlationId,
        userId: request.userId,
        contentId: id,
      });

      const content = await cmsService.getById(id, request.correlationId);
      return reply.status(200).send({ data: content });
    },
  );

  // PATCH /api/admin/cms/:id
  app.patch<{ Params: { id: string }; Reply: { data: CmsContent } }>(
    '/api/admin/cms/:id',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Update a CMS content record (saves revision snapshot first)' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const body = UpdateCmsContentSchema.parse(request.body);
      const savedBy = request.userId ?? 'unknown';

      app.log.info({
        operation: 'admin.cms.update',
        correlationId: request.correlationId,
        userId: savedBy,
        contentId: id,
      });

      const updated = await cmsService.update(id, body, savedBy, request.correlationId);
      return reply.status(200).send({ data: updated });
    },
  );

  // DELETE /api/admin/cms/:id
  app.delete<{ Params: { id: string } }>(
    '/api/admin/cms/:id',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Delete a CMS content record' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.cms.delete',
        correlationId: request.correlationId,
        userId: request.userId,
        contentId: id,
      });

      await cmsService.delete(id, request.correlationId);
      return reply.status(204).send();
    },
  );

  // POST /api/admin/cms/:id/publish
  app.post<{ Params: { id: string } }>(
    '/api/admin/cms/:id/publish',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Publish a CMS content record (sets status=published, publishedOn=now)' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.cms.publish',
        correlationId: request.correlationId,
        userId: request.userId,
        contentId: id,
      });

      await cmsService.publish(id, request.correlationId);
      return reply.status(204).send();
    },
  );

  // POST /api/admin/cms/:id/unpublish
  app.post<{ Params: { id: string } }>(
    '/api/admin/cms/:id/unpublish',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'Unpublish a CMS content record (sets status=draft, clears publishedOn)' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.cms.unpublish',
        correlationId: request.correlationId,
        userId: request.userId,
        contentId: id,
      });

      await cmsService.unpublish(id, request.correlationId);
      return reply.status(204).send();
    },
  );

  // GET /api/admin/cms/:id/revisions
  app.get<{ Params: { id: string }; Reply: { data: CmsRevision[] } }>(
    '/api/admin/cms/:id/revisions',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'CMS'], summary: 'List revision history for a CMS content record (newest first)' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.cms.listRevisions',
        correlationId: request.correlationId,
        userId: request.userId,
        contentId: id,
      });

      const revisions = await cmsService.listRevisions(id, request.correlationId);
      return reply.status(200).send({ data: revisions });
    },
  );
}
