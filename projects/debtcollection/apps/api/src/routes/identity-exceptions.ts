import type { FastifyInstance } from 'fastify';
import { httpStatusForCode } from '@dcp/types';
import { listIdentityExceptions } from '../services/IdentityExceptionService.js';

/**
 * GET /identity-exceptions — unresolved-identity queue (FR-007, stub).
 *
 * Returns the list of msst_dcpidentityexception records for the active org.
 * Pagination (cursor-based per arch §5.1) is deferred to step 2 — Phase 1
 * caps at the service's DEFAULT_PAGE_SIZE.
 */
export async function identityExceptionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/identity-exceptions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const orgClient = await app.resolveOrgClient(request, reply);
      if (orgClient === null) return; // org router already replied

      const result = await listIdentityExceptions(orgClient, request.correlationId);

      if (!result.ok) {
        const httpStatus = httpStatusForCode(result.error.code);
        // FIXED: log error server-side with correlationId before responding (B-3).
        // No PII in the log entry — code + message are domain error strings only.
        request.log.error({
          code: result.error.code,
          correlationId: request.correlationId,
        }, result.error.message);
        return reply.status(httpStatus).send({
          code: result.error.code,
          message: result.error.message,
          correlationId: request.correlationId,
        });
      }

      return reply.status(200).send({ value: result.value });
    },
  );
}
