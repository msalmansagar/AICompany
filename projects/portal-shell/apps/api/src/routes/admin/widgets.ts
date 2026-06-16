import type { FastifyInstance } from 'fastify';
import { WidgetCreateSchema, WidgetPatchSchema } from '@portal/types';
import type { DataverseClient } from '@portal/dataverse-client';
import { z } from 'zod';

interface AdminWidgetRouteOptions {
  dataverse: DataverseClient;
}

const ADMIN_ROLE = 'Admin';
const WIDGET_CONFIG_ENTITY = 'qdb_portal_widget_configs';
const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Admin widget management — /api/admin/widgets
 * Full CRUD. Requires Admin role.
 */
export async function adminWidgetRoutes(
  app: FastifyInstance,
  { dataverse }: AdminWidgetRouteOptions,
): Promise<void> {
  // GET /api/admin/widgets
  app.get(
    '/api/admin/widgets',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'List all widget configs' },
    },
    async (request, reply) => {
      const result = await dataverse.getList(
        WIDGET_CONFIG_ENTITY,
        { filter: 'statecode eq 0', orderBy: 'qdb_display_order asc' },
        { correlationId: request.correlationId },
      );
      return reply.status(200).send({ data: result.value });
    },
  );

  // POST /api/admin/widgets
  app.post(
    '/api/admin/widgets',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Create a widget config' },
    },
    async (request, reply) => {
      const body = WidgetCreateSchema.parse(request.body);
      const created = await dataverse.create(
        WIDGET_CONFIG_ENTITY,
        { ...body, qdb_config: JSON.stringify(body.config) },
        { correlationId: request.correlationId },
      );
      return reply.status(201).send({ data: created });
    },
  );

  // PATCH /api/admin/widgets/:id
  app.patch<{ Params: { id: string } }>(
    '/api/admin/widgets/:id',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Update a widget config' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      const patch = WidgetPatchSchema.parse(request.body);
      const dvPatch: Record<string, unknown> = { ...patch };
      if (patch.config !== undefined) {
        dvPatch['qdb_config'] = JSON.stringify(patch.config);
        delete dvPatch['config'];
      }
      await dataverse.update(WIDGET_CONFIG_ENTITY, id, dvPatch, { correlationId: request.correlationId });
      return reply.status(204).send();
    },
  );

  // DELETE /api/admin/widgets/:id
  app.delete<{ Params: { id: string } }>(
    '/api/admin/widgets/:id',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Delete a widget config' },
    },
    async (request, reply) => {
      const { id } = IdParamSchema.parse(request.params);
      await dataverse.delete(WIDGET_CONFIG_ENTITY, id, { correlationId: request.correlationId });
      return reply.status(204).send();
    },
  );
}
