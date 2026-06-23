/**
 * Admin token definition routes.
 *
 * All routes require JWT authentication + 'portal-admin' role.
 *
 * Routes:
 *   GET    /api/admin/tokens/definitions           — list all definitions
 *   POST   /api/admin/tokens/definitions           — create definition
 *   GET    /api/admin/tokens/definitions/:slug     — get single definition
 *   PATCH  /api/admin/tokens/definitions/:slug     — update mutable fields
 *   DELETE /api/admin/tokens/definitions/:slug     — soft-delete + cascade values
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TokenDefinitionListQuerySchema,
  TokenDefinitionCreateSchema,
  TokenDefinitionPatchSchema,
} from '../../../services/tokens/TokenTypes.js';
import type { TokenDefinitionSummary } from '../../../services/tokens/TokenTypes.js';
import type { TokenDefinitionService } from '../../../services/tokens/TokenDefinitionService.js';

interface AdminTokenDefinitionRouteOptions {
  tokenDefinitionService: TokenDefinitionService;
}

const PORTAL_ADMIN_ROLE = 'portal-admin';
const SlugParamSchema = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) });

/**
 * Admin token definition management routes.
 */
export async function adminTokenDefinitionRoutes(
  app: FastifyInstance,
  { tokenDefinitionService }: AdminTokenDefinitionRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(PORTAL_ADMIN_ROLE)];

  // GET /api/admin/tokens/definitions
  app.get<{
    Querystring: Record<string, string>;
    Reply: { data: TokenDefinitionSummary[]; meta: { total: number; top: number; skip: number } };
  }>(
    '/api/admin/tokens/definitions',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'Tokens'], summary: 'List token definitions' },
    },
    async (request, reply) => {
      const query = TokenDefinitionListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.tokens.definitions.list',
        correlationId: request.correlationId,
        userId: request.userId,
        query,
      });

      const definitions = await tokenDefinitionService.listDefinitions(query.activeOnly);

      return reply.status(200).send({
        data: definitions,
        meta: { total: definitions.length, top: query.top, skip: query.skip },
      });
    },
  );

  // POST /api/admin/tokens/definitions
  app.post<{ Reply: { data: TokenDefinitionSummary } }>(
    '/api/admin/tokens/definitions',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'Tokens'], summary: 'Create a new token definition' },
    },
    async (request, reply) => {
      const body = TokenDefinitionCreateSchema.parse(request.body);

      app.log.info({
        operation: 'admin.tokens.definitions.create',
        correlationId: request.correlationId,
        userId: request.userId,
        slug: body.slug,
      });

      const created = await tokenDefinitionService.createDefinition(body);
      return reply.status(201).send({ data: created });
    },
  );

  // GET /api/admin/tokens/definitions/:slug
  app.get<{ Params: { slug: string }; Reply: { data: TokenDefinitionSummary } }>(
    '/api/admin/tokens/definitions/:slug',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'Tokens'], summary: 'Get a single token definition by slug' },
    },
    async (request, reply) => {
      const { slug } = SlugParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.tokens.definitions.getBySlug',
        correlationId: request.correlationId,
        userId: request.userId,
        slug,
      });

      const definition = await tokenDefinitionService.getDefinitionBySlug(slug);
      return reply.status(200).send({ data: definition });
    },
  );

  // PATCH /api/admin/tokens/definitions/:slug
  app.patch<{ Params: { slug: string } }>(
    '/api/admin/tokens/definitions/:slug',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Admin', 'Tokens'],
        summary: 'Update mutable fields on a token definition (slug and tokenType are immutable)',
      },
    },
    async (request, reply) => {
      const { slug } = SlugParamSchema.parse(request.params);
      const patch = TokenDefinitionPatchSchema.parse(request.body);

      app.log.info({
        operation: 'admin.tokens.definitions.update',
        correlationId: request.correlationId,
        userId: request.userId,
        slug,
      });

      await tokenDefinitionService.updateDefinition(slug, patch);
      return reply.status(204).send();
    },
  );

  // DELETE /api/admin/tokens/definitions/:slug — soft-delete + cascade
  app.delete<{ Params: { slug: string } }>(
    '/api/admin/tokens/definitions/:slug',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Admin', 'Tokens'],
        summary: 'Soft-delete a token definition and cascade-deactivate all its values',
      },
    },
    async (request, reply) => {
      const { slug } = SlugParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.tokens.definitions.delete',
        correlationId: request.correlationId,
        userId: request.userId,
        slug,
      });

      await tokenDefinitionService.deactivateDefinition(slug);
      return reply.status(204).send();
    },
  );
}
