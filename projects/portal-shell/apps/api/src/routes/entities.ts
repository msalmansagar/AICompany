import type { FastifyInstance } from 'fastify';
import type { EntityService } from '../services/EntityService.js';
import type { LinkedEntity } from '@portal/types';

interface EntityRouteOptions {
  entityService: EntityService;
}

/**
 * GET /api/entities — authenticated.
 *
 * Returns the list of companies/accounts linked to the authenticated user
 * for use in the entity switcher UI component.
 */
export async function entityRoutes(
  app: FastifyInstance,
  { entityService }: EntityRouteOptions,
): Promise<void> {
  app.get<{ Reply: { data: LinkedEntity[] } }>(
    '/api/entities',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Entities'], summary: "Get user's linked entities for the switcher" },
    },
    async (request, reply) => {
      const userId = request.user?.sub ?? '';
      const entities = await entityService.getLinkedEntities(userId, request.correlationId);
      return reply.status(200).send({ data: entities });
    },
  );
}
