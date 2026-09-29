import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { ComplaintCreationService } from '../services/caseManagement/ComplaintCreationService.js';
import { ComplaintConfigurationError, ComplaintError } from '../services/caseManagement/ComplaintErrors.js';

/** Case Management's `description` is a 2,000-character memo by default. */
const MAX_DESCRIPTION_LENGTH = 2000;

const ParamsSchema = z.object({ collectionCaseId: z.string().uuid() });
const BodySchema = z.object({
  /** One per "Create Complaint" dialog; repeated on every retry of that submission. */
  requestId: z.string().uuid(),
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
}).strict();

/**
 * POST /collection-cases/:collectionCaseId/complaints — raise an HL complaint in QDB's existing
 * BFD Case Management from a Collection Case.
 *
 * The body is the officer's description and a request id, nothing else: `.strict()` rejects any
 * attempt to supply the customer, owner, business unit, product, case type or source, which are
 * all derived on the server. Case Management owns everything after creation.
 */
export async function complaintRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.post('/collection-cases/:collectionCaseId/complaints', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    const body = BodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(422).send({ code: 'validation_error', message: 'The complaint request is invalid', correlationId: request.correlationId });
    }
    try {
      const service = buildService(app, config);
      const complaint = await service.create({ ...params.data, ...body.data, user: request.userClaims! });
      return reply.status(complaint.isRepeatSubmission ? 200 : 201).send(complaint);
    } catch (error) {
      return sendComplaintError(error, request, reply);
    }
  });
}

function buildService(app: FastifyInstance, config: AppConfig): ComplaintCreationService {
  const caseManagementOrg = app.bfdOrgTarget;
  const nonCustomerAccountId = config.CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID;
  if (caseManagementOrg === null || nonCustomerAccountId === undefined) {
    throw new ComplaintConfigurationError('Case Management integration is not configured in this deployment');
  }
  return new ComplaintCreationService({
    hlClient: app.clientForOrg(app.hlOrgTarget),
    caseManagementClient: app.clientForOrg(caseManagementOrg),
    caseManagementBaseUrl: caseManagementOrg.baseUrl,
    nonCustomerAccountId,
    now: () => new Date(),
  });
}

async function sendComplaintError(error: unknown, request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
  if (!(error instanceof ComplaintError)) throw error;
  request.log.warn({ correlationId: request.correlationId, operation: 'createComplaint', code: error.code, reason: error.message });
  return reply.status(error.httpStatus).send({ code: error.code, message: error.message, correlationId: request.correlationId });
}
