import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
    /** Populated by auth-guard for authenticated requests */
    userId?: string;
    /** Populated by auth-guard when entity switcher header is present */
    activeEntityId?: string;
  }
}

/**
 * Attaches a correlation ID to every request.
 *
 * Reads the `x-correlation-id` header if provided by the caller (e.g. from
 * the Next.js frontend or an upstream service), otherwise generates a new UUID.
 * The correlation ID flows to all log entries and Dataverse requests.
 */
export const requestContextPlugin = fp(async function registerRequestContext(
  app: FastifyInstance,
): Promise<void> {
  app.decorateRequest('correlationId', '');
  app.decorateRequest('userId', undefined);
  app.decorateRequest('activeEntityId', undefined);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const headerValue = request.headers['x-correlation-id'];
    request.correlationId =
      typeof headerValue === 'string' && headerValue.length > 0
        ? headerValue
        : crypto.randomUUID();

    const entityHeader = request.headers['x-active-entity-id'];
    if (typeof entityHeader === 'string' && entityHeader.length > 0) {
      request.activeEntityId = entityHeader;
    }
  });
});
