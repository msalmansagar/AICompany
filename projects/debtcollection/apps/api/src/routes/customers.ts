import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { findCustomerByQid, maskCustomerPii } from '../services/CustomerService.js';

const CustomerParamsSchema = z.object({
  // trim first so a URL-encoded space (%20) correctly fails the min(1) check
  qid: z.string().trim().min(1).max(50),
});

/**
 * GET /customers/:qid — customer profile with PII masking (FR-001, FR-014).
 *
 * The route validates the QID param, looks up the customer by alternate key,
 * and masks PII fields for callers whose token lacks 'View Sensitive PII'.
 * A refusal from Dataverse arrives as HTTP 200 with errorCode — checked by
 * the client, not by status code (memory: Report Engine gotcha).
 */
export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/customers/:qid',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const paramsResult = CustomerParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(422).send({
          code: 'validation_error',
          message: 'QID parameter is invalid',
          correlationId: request.correlationId,
        });
      }

      const { qid } = paramsResult.data;
      const orgClient = await app.resolveOrgClient(request, reply);
      if (orgClient === null) return; // org router already replied

      const result = await findCustomerByQid(orgClient, qid, request.correlationId);

      if (!result.ok) {
        const { code, message } = result.error;
        const status = code === 'customer_not_found' ? 404 : 500;
        return reply.status(status).send({
          code,
          message,
          correlationId: request.correlationId,
        });
      }

      const hasPii = request.userClaims?.hasViewSensitivePii ?? false;
      const customer = maskCustomerPii(result.value, hasPii);

      return reply.status(200).send(customer);
    },
  );
}
