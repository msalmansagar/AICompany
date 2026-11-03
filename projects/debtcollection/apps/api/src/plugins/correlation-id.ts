import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CORRELATION_ID_HEADER } from '@dcp/types';

declare module 'fastify' {
  interface FastifyRequest {
    /** UUID echoed from x-correlation-id or generated for every request. */
    correlationId: string;
  }
}

/**
 * Attaches a correlationId to every request (§5.5 arch doc, Article XIV).
 *
 * Read: inbound `x-correlation-id` header if present, else generate a new UUID.
 * Write: echoed as `x-correlation-id` in the response.
 * Propagation: placed on every log entry and every outbound Dataverse call
 * as the same header so the CRM audit plugin can record the full source path.
 */
export const correlationIdPlugin = fp(async function registerCorrelationId(
  app: FastifyInstance,
): Promise<void> {
  app.decorateRequest('correlationId', '');

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers[CORRELATION_ID_HEADER];
    request.correlationId =
      typeof header === 'string' && header.length > 0
        ? header
        : crypto.randomUUID();
  });

  // Fastify v5: onSend hook MUST return the payload (or null to remove body).
  // Not returning causes the response to hang waiting for a payload value.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(CORRELATION_ID_HEADER, request.correlationId);
    return payload;
  });
});
