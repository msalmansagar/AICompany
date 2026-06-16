import type { FastifyInstance } from 'fastify';

/** Health check response shape — consumed by load balancers and monitoring. */
interface HealthResponse {
  status: 'ok';
  version: string;
  timestamp: string;
}

const API_VERSION = '1.0.0';

/**
 * GET /health — liveness probe.
 *
 * Always returns 200 when the process is running. Does NOT check Dataverse
 * connectivity (that would make the health endpoint unhealthy during CRM
 * maintenance windows, which is not the desired behaviour).
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'] },
            version: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    });
  });
}
