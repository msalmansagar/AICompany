import type { FastifyInstance } from 'fastify';
import { PortalConfigPatchSchema } from '@portal/types';
import type { PortalConfigService } from '../../services/PortalConfigService.js';

interface AdminPortalConfigRouteOptions {
  portalConfigService: PortalConfigService;
}

const ADMIN_ROLE = 'Admin';

/**
 * Admin portal-config routes — /api/admin/portal-config
 * Requires Admin role. PATCH invalidates the 5-minute cache.
 */
export async function adminPortalConfigRoutes(
  app: FastifyInstance,
  { portalConfigService }: AdminPortalConfigRouteOptions,
): Promise<void> {
  // GET /api/admin/portal-config — returns same data as public endpoint but un-cached
  app.get(
    '/api/admin/portal-config',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Get portal configuration (admin, uncached)' },
    },
    async (request, reply) => {
      // Bypass cache for admin view — always fresh from Dataverse
      portalConfigService.purgeCache();
      const config = await portalConfigService.getActiveConfig(request.correlationId);
      return reply.status(200).send({ data: config });
    },
  );

  // PATCH /api/admin/portal-config/:id
  app.patch<{ Params: { id: string } }>(
    '/api/admin/portal-config/:id',
    {
      preHandler: [app.authenticate, app.requireRole(ADMIN_ROLE)],
      schema: { tags: ['Admin'], summary: 'Update portal configuration' },
    },
    async (request, reply) => {
      const { id } = request.params;
      const patch = PortalConfigPatchSchema.parse(request.body);
      await portalConfigService.updateConfig(id, patch as Record<string, unknown>, request.correlationId);
      return reply.status(204).send();
    },
  );
}
