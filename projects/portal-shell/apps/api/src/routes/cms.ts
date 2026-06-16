import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CmsListQuerySchema } from '@portal/types';
import type { CmsSummary, CmsContent } from '@portal/types';
import type { CmsService } from '../services/CmsService.js';

interface CmsRouteOptions {
  cmsService: CmsService;
}

const SlugParamSchema = z.object({ slug: z.string().min(1) });

/**
 * Public CMS routes — no authentication required.
 * Rate-limited to 60 requests per minute (per the global @fastify/rate-limit
 * plugin already registered in app.ts; the config override below tightens the
 * limit for these read-heavy public endpoints).
 *
 * Routes:
 *   GET /api/cms             — paginated list of published content
 *   GET /api/cms/tags        — distinct tags from all published content
 *   GET /api/cms/:slug       — single published content by URL slug
 *
 * Note: /api/cms/tags must be declared before /api/cms/:slug so Fastify does
 * not treat "tags" as a slug value.
 */
export async function cmsRoutes(
  app: FastifyInstance,
  { cmsService }: CmsRouteOptions,
): Promise<void> {
  const PUBLIC_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };

  // GET /api/cms
  app.get<{ Querystring: Record<string, string>; Reply: { data: CmsSummary[]; meta: { total: number; page: number; pageSize: number } } }>(
    '/api/cms',
    {
      config: { rateLimit: PUBLIC_RATE_LIMIT },
      schema: {
        tags: ['CMS'],
        summary: 'List published content — paginated',
      },
    },
    async (request, reply) => {
      const query = CmsListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'cms.listPublished',
        correlationId: request.correlationId,
        query,
      });

      const { items, total } = await cmsService.listPublished(query, request.correlationId);

      return reply.status(200).send({
        data: items,
        meta: { total, page: query.page, pageSize: query.pageSize },
      });
    },
  );

  // GET /api/cms/tags — must come before /:slug to avoid route conflict
  app.get<{ Reply: { data: string[] } }>(
    '/api/cms/tags',
    {
      config: { rateLimit: PUBLIC_RATE_LIMIT },
      schema: {
        tags: ['CMS'],
        summary: 'List distinct tags from all published content',
      },
    },
    async (request, reply) => {
      app.log.info({
        operation: 'cms.listPublishedTags',
        correlationId: request.correlationId,
      });

      const tags = await cmsService.listPublishedTags(request.correlationId);
      return reply.status(200).send({ data: tags });
    },
  );

  // GET /api/cms/:slug
  app.get<{ Params: { slug: string }; Reply: { data: CmsContent } }>(
    '/api/cms/:slug',
    {
      config: { rateLimit: PUBLIC_RATE_LIMIT },
      schema: {
        tags: ['CMS'],
        summary: 'Get a single published content item by URL slug',
      },
    },
    async (request, reply) => {
      const { slug } = SlugParamSchema.parse(request.params);

      app.log.info({
        operation: 'cms.getBySlug',
        correlationId: request.correlationId,
        slug,
      });

      const content = await cmsService.getBySlug(slug, request.correlationId);
      return reply.status(200).send({ data: content });
    },
  );
}
