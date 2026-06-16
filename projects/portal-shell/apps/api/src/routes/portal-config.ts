import type { FastifyInstance } from 'fastify';
import type { PortalConfigService } from '../services/PortalConfigService.js';
import type { PortalConfig } from '@portal/types';

interface PortalConfigRouteOptions {
  portalConfigService: PortalConfigService;
}

/**
 * GET /api/portal-config — public endpoint, cached 5 minutes.
 *
 * Returns the active portal configuration consumed by the Next.js shell
 * on every cold start. No auth required — config is not sensitive.
 */
export async function portalConfigRoutes(
  app: FastifyInstance,
  { portalConfigService }: PortalConfigRouteOptions,
): Promise<void> {
  app.get<{ Reply: { data: PortalConfig } }>('/api/portal-config', {
    schema: {
      tags: ['Portal'],
      summary: 'Get active portal configuration',
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const config = await portalConfigService.getActiveConfig(request.correlationId);
    return reply.status(200).send({ data: config });
  });
}
