import type { FastifyInstance } from 'fastify';
import type { NavService } from '../services/NavService.js';
import type { NavItem } from '@portal/types';

interface NavRouteOptions {
  navService: NavService;
}

/**
 * GET /api/nav — authenticated.
 *
 * Returns the navigation tree filtered by the authenticated user's roles,
 * with live badge counts resolved for query-type badges.
 */
export async function navRoutes(
  app: FastifyInstance,
  { navService }: NavRouteOptions,
): Promise<void> {
  app.get<{ Reply: { data: NavItem[] } }>(
    '/api/nav',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Navigation'], summary: 'Get navigation tree for the authenticated user' },
    },
    async (request, reply) => {
      const roles = request.user?.roles ?? [];
      const navTree = await navService.getNavTree(roles, request.correlationId);
      return reply.status(200).send({ data: navTree });
    },
  );
}
