/**
 * Admin token value routes.
 *
 * All routes require JWT authentication + 'portal-admin' role.
 *
 * Routes:
 *   GET    /api/admin/tokens/values       — list values (filterable)
 *   POST   /api/admin/tokens/values       — create a value override
 *   DELETE /api/admin/tokens/values/:id   — soft-delete a value override
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TokenValueListQuerySchema,
  TokenValueCreateSchema,
} from '../../../services/tokens/TokenTypes.js';
import type { TokenValueSummary } from '../../../services/tokens/TokenTypes.js';
import type { TokenValueService } from '../../../services/tokens/TokenValueService.js';
import type { CallerContext } from '../../../services/tokens/TokenTypes.js';

interface AdminTokenValueRouteOptions {
  tokenValueService: TokenValueService;
}

const PORTAL_ADMIN_ROLE = 'portal-admin';
const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Admin token value management routes.
 */
export async function adminTokenValueRoutes(
  app: FastifyInstance,
  { tokenValueService }: AdminTokenValueRouteOptions,
): Promise<void> {
  const AUTH_HANDLERS = [app.authenticate, app.requireRole(PORTAL_ADMIN_ROLE)];

  // GET /api/admin/tokens/values
  app.get<{
    Querystring: Record<string, string>;
    Reply: { data: TokenValueSummary[]; meta: { total: number; top: number; skip: number } };
  }>(
    '/api/admin/tokens/values',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'Tokens'], summary: 'List token value overrides' },
    },
    async (request, reply) => {
      const query = TokenValueListQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.tokens.values.list',
        correlationId: request.correlationId,
        userId: request.userId,
        query,
      });

      const values = await tokenValueService.listValues({
        slug: query.slug,
        level: query.level,
        service: query.service,
        activeOnly: query.activeOnly,
        top: query.top,
        skip: query.skip,
      });

      return reply.status(200).send({
        data: values,
        meta: { total: values.length, top: query.top, skip: query.skip },
      });
    },
  );

  // POST /api/admin/tokens/values
  app.post<{ Reply: { data: TokenValueSummary } }>(
    '/api/admin/tokens/values',
    {
      preHandler: AUTH_HANDLERS,
      schema: {
        tags: ['Admin', 'Tokens'],
        summary: 'Create a new token value override',
      },
    },
    async (request, reply) => {
      const body = TokenValueCreateSchema.parse(request.body);
      const callerContext: CallerContext = {
        role: PORTAL_ADMIN_ROLE,
        serviceSlug: null,
        userId: request.userId ?? 'unknown',
      };

      app.log.info({
        operation: 'admin.tokens.values.create',
        correlationId: request.correlationId,
        userId: request.userId,
        definitionSlug: body.definitionSlug,
        level: body.level,
      });

      const created = await tokenValueService.createValue(body, callerContext);
      return reply.status(201).send({ data: created });
    },
  );

  // DELETE /api/admin/tokens/values/:id
  app.delete<{ Params: { id: string } }>(
    '/api/admin/tokens/values/:id',
    {
      preHandler: AUTH_HANDLERS,
      schema: { tags: ['Admin', 'Tokens'], summary: 'Soft-delete a token value override' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const callerContext: CallerContext = {
        role: PORTAL_ADMIN_ROLE,
        serviceSlug: null,
        userId: request.userId ?? 'unknown',
      };

      app.log.info({
        operation: 'admin.tokens.values.delete',
        correlationId: request.correlationId,
        userId: request.userId,
        valueId: id,
      });

      await tokenValueService.deactivateValue(id, callerContext);
      return reply.status(204).send();
    },
  );
}
