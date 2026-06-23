import type { FastifyInstance } from 'fastify';
import { NavItemCreateSchema, NavItemPatchSchema } from '@portal/types';
import type { NavService } from '../../services/NavService.js';
import { z } from 'zod';

interface AdminNavRouteOptions {
  navService: NavService;
}

const ADMIN_ROLE = 'Admin';
const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Admin nav-item management — /api/admin/nav-items
 * Full CRUD. Requires Admin role.
 */
export async function adminNavRoutes(
  app: FastifyInstance,
  { navService }: AdminNavRouteOptions,
): Promise<void> {
  // GET /api/admin/nav-items
  app.get(
    '/api/admin/nav-items',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'List all nav items (admin view, no role filtering)' },
    },
    async (request, reply) => {
      // Admin sees all items regardless of role — pass empty roles array to bypass filtering
      const tree = await navService.getNavTree([], request.correlationId);
      return reply.status(200).send({ data: tree });
    },
  );

  // POST /api/admin/nav-items
  app.post(
    '/api/admin/nav-items',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Create a nav item' },
    },
    async (request, reply) => {
      const body = NavItemCreateSchema.parse(request.body);
      const created = await navService.createNavItem(
        body as Record<string, unknown>,
        request.correlationId,
      );
      return reply.status(201).send({ data: created });
    },
  );

  // PATCH /api/admin/nav-items/:id
  app.patch<{ Params: { id: string } }>(
    '/api/admin/nav-items/:id',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Update a nav item' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const patch = NavItemPatchSchema.parse(request.body);
      await navService.updateNavItem(id, patch as Record<string, unknown>, request.correlationId);
      return reply.status(204).send();
    },
  );

  // DELETE /api/admin/nav-items/:id
  app.delete<{ Params: { id: string } }>(
    '/api/admin/nav-items/:id',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Delete a nav item' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await navService.deleteNavItem(id, request.correlationId);
      return reply.status(204).send();
    },
  );
}
