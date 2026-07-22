import Fastify, { type FastifyInstance } from 'fastify';
import type { GatewayConfig } from './config.js';
import type { DecisionRuntime } from './envelope.js';
import { registerDecisionRoutes } from './routes/decisions.js';

export interface AppDeps {
  readonly config: GatewayConfig;
  readonly runtime: DecisionRuntime;
}

/**
 * Build the gateway app. The runtime is injected so the transport layer can be tested with a
 * fake — the gateway itself contains no decision logic (ADR-EDS-02).
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, requestIdHeader: 'x-request-id' });

  app.get('/health', async () => ({ status: 'ok' }));

  // API-key authentication for the decision surface. Empty key set = auth disabled (dev only).
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    if (deps.config.apiKeys.length === 0) return;
    const provided = request.headers['x-api-key'];
    const key = Array.isArray(provided) ? provided[0] : provided;
    if (!key || !deps.config.apiKeys.includes(key)) {
      await reply.code(401).send({
        meta: { correlationId: request.id, requestId: request.id },
        error: { code: 'unauthorized', message: 'A valid x-api-key header is required.' },
      });
    }
  });

  registerDecisionRoutes(app, deps.runtime);

  return app;
}
