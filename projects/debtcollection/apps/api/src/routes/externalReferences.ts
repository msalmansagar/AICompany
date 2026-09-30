import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { OrganizationCode } from '@dcp/domain';
import { ComplaintError } from '../services/caseManagement/ComplaintErrors.js';
import { summariseReferences, type ReferenceOrganisation } from '../services/caseManagement/ExternalReferenceReader.js';

/** One grid page; a queue asks once per page, never once per row. */
const MAX_REFERENCES_PER_CALL = 50;

const BodySchema = z.object({
  references: z.array(z.object({
    process: z.enum(['Complaint', 'Legal']),
    organization: z.enum(['HL', 'BFD']),
    recordId: z.string().uuid(),
  }).strict()).min(1).max(MAX_REFERENCES_PER_CALL),
}).strict();

/**
 * POST /external-references/summaries — the current state of Complaint and Legal records that
 * Collection Activities refer to, read from the owning module as the signed-in user.
 *
 * DCP stores only the reference; status, owner and dates are always read here, so there is one
 * source of truth. Security stays the owning organisation's: the read is made as the user.
 */
export async function externalReferenceRoutes(app: FastifyInstance): Promise<void> {
  app.post('/external-references/summaries', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = BodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(422).send({ code: 'validation_error', message: 'The reference request is invalid', correlationId: request.correlationId });
    }
    try {
      const summaries = await summariseReferences(organisationsOf(app), body.data.references, request.userClaims?.email);
      return reply.status(200).send({ summaries });
    } catch (error) {
      if (!(error instanceof ComplaintError)) throw error;
      request.log.warn({ correlationId: request.correlationId, operation: 'summariseReferences', code: error.code, reason: error.message });
      return reply.status(error.httpStatus).send({ code: error.code, message: error.message, correlationId: request.correlationId });
    }
  });
}

function organisationsOf(app: FastifyInstance): Partial<Record<OrganizationCode, ReferenceOrganisation>> {
  const hl = { client: app.clientForOrg(app.hlOrgTarget), baseUrl: app.hlOrgTarget.baseUrl };
  const bfd = app.bfdOrgTarget ? { client: app.clientForOrg(app.bfdOrgTarget), baseUrl: app.bfdOrgTarget.baseUrl } : undefined;
  return { HL: hl, ...(bfd ? { BFD: bfd } : {}) };
}
