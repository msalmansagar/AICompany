import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { RbacService, ServiceCallContext } from '../../services/RbacService.js';
import { RbacError } from '../../services/RbacService.js';

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

interface AdminRbacRouteOptions {
  rbacService: RbacService;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UuidParamSchema = z.object({ id: z.string().uuid() });
const UserIdParamSchema = z.object({ userId: z.string().uuid() });
const AssignmentIdParamSchema = z.object({ assignmentId: z.string().uuid() });

const AssignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleSlug: z.enum([
    'staff-viewer',
    'service-owner',
    'support-agent',
    'content-editor',
    'registered-citizen',
    'corporate-user',
    'guest',
  ]),
  expiresAt: z.string().datetime().optional(),
});

const InitiatePromotionSchema = z.object({
  targetUserId: z.string().uuid(),
  targetRole: z.literal('portal-admin'),
});

const RejectPromotionSchema = z.object({
  reason: z.string().min(1).max(500),
});

const AuditLogQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  eventType: z
    .enum([
      'role_assigned',
      'role_revoked',
      'promotion_initiated',
      'promotion_approved',
      'promotion_rejected',
      'pii_accessed',
      'permission_denied',
    ])
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  top: z.coerce.number().int().min(1).max(200).optional(),
});

type AuthHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Admin RBAC routes — JWT authentication + `manage RbacRole` permission required
 * on all mutating routes. Read routes require at minimum authentication.
 *
 * Routes:
 *   GET    /api/admin/rbac/users/:userId/roles
 *   POST   /api/admin/rbac/roles/assign
 *   DELETE /api/admin/rbac/roles/:assignmentId
 *
 *   POST   /api/admin/rbac/promotions
 *   GET    /api/admin/rbac/promotions
 *   GET    /api/admin/rbac/promotions/:id
 *   POST   /api/admin/rbac/promotions/:id/approve
 *   POST   /api/admin/rbac/promotions/:id/reject
 *
 *   GET    /api/admin/rbac/audit
 */
export async function adminRbacRoutes(
  app: FastifyInstance,
  { rbacService }: AdminRbacRouteOptions,
): Promise<void> {
  const authOnly: AuthHandler[] = [app.authenticate];
  const adminGuard: AuthHandler[] = [
    app.authenticate,
    app.requirePermission('manage', 'RbacRole'),
  ];

  // GET /api/admin/rbac/users/:userId/roles
  app.get(
    '/api/admin/rbac/users/:userId/roles',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { userId } = UserIdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.rbac.getRoles',
        correlationId: request.correlationId,
        userId: request.userId,
        targetUserId: userId,
      });

      const roles = await rbacService.getActiveRoles(userId, request.correlationId);
      return reply.status(200).send({ data: roles });
    },
  );

  // POST /api/admin/rbac/roles/assign
  app.post(
    '/api/admin/rbac/roles/assign',
    { preHandler: adminGuard },
    async (request, reply) => {
      const body = AssignRoleSchema.parse(request.body);

      app.log.info({
        operation: 'admin.rbac.assignRole',
        correlationId: request.correlationId,
        userId: request.userId,
        targetUserId: body.userId,
        roleSlug: body.roleSlug,
      });

      try {
        const ctx: ServiceCallContext = { correlationId: request.correlationId, actorIp: request.ip };
        const role = await rbacService.assignRole(body, request.userId ?? '', ctx);
        return reply.status(201).send({ data: role });
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // DELETE /api/admin/rbac/roles/:assignmentId
  app.delete(
    '/api/admin/rbac/roles/:assignmentId',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { assignmentId } = AssignmentIdParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.rbac.revokeRole',
        correlationId: request.correlationId,
        userId: request.userId,
        assignmentId,
      });

      try {
        const ctx: ServiceCallContext = { correlationId: request.correlationId, actorIp: request.ip };
        await rbacService.revokeRole(assignmentId, request.userId ?? '', ctx);
        return reply.status(204).send();
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // POST /api/admin/rbac/promotions
  app.post(
    '/api/admin/rbac/promotions',
    { preHandler: adminGuard },
    async (request, reply) => {
      const body = InitiatePromotionSchema.parse(request.body);

      app.log.info({
        operation: 'admin.rbac.initiatePromotion',
        correlationId: request.correlationId,
        userId: request.userId,
        targetUserId: body.targetUserId,
        targetRole: body.targetRole,
      });

      try {
        const ctx: ServiceCallContext = { correlationId: request.correlationId, actorIp: request.ip };
        const promotion = await rbacService.initiatePromotion(
          body,
          request.userId ?? '',
          ctx,
        );
        return reply.status(201).send({ data: promotion });
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // GET /api/admin/rbac/promotions
  app.get(
    '/api/admin/rbac/promotions',
    { preHandler: adminGuard },
    async (request, reply) => {
      app.log.info({
        operation: 'admin.rbac.listPromotions',
        correlationId: request.correlationId,
        userId: request.userId,
      });

      const promotions = await rbacService.listPendingPromotions(request.correlationId);
      return reply.status(200).send({ data: promotions });
    },
  );

  // GET /api/admin/rbac/promotions/:id
  app.get(
    '/api/admin/rbac/promotions/:id',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { id } = UuidParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.rbac.getPromotion',
        correlationId: request.correlationId,
        userId: request.userId,
        promotionId: id,
      });

      try {
        const promotion = await rbacService.getPromotionById(id, request.correlationId);
        return reply.status(200).send({ data: promotion });
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // POST /api/admin/rbac/promotions/:id/approve
  app.post(
    '/api/admin/rbac/promotions/:id/approve',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { id } = UuidParamSchema.parse(request.params);

      app.log.info({
        operation: 'admin.rbac.approvePromotion',
        correlationId: request.correlationId,
        userId: request.userId,
        promotionId: id,
      });

      try {
        const ctx: ServiceCallContext = { correlationId: request.correlationId, actorIp: request.ip };
        const role = await rbacService.approvePromotion(
          id,
          request.userId ?? '',
          ctx,
        );
        return reply.status(200).send({ data: role });
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // POST /api/admin/rbac/promotions/:id/reject
  app.post(
    '/api/admin/rbac/promotions/:id/reject',
    { preHandler: adminGuard },
    async (request, reply) => {
      const { id } = UuidParamSchema.parse(request.params);
      const body = RejectPromotionSchema.parse(request.body);

      app.log.info({
        operation: 'admin.rbac.rejectPromotion',
        correlationId: request.correlationId,
        userId: request.userId,
        promotionId: id,
      });

      try {
        const ctx: ServiceCallContext = { correlationId: request.correlationId, actorIp: request.ip };
        await rbacService.rejectPromotion(
          id,
          request.userId ?? '',
          body.reason,
          ctx,
        );
        return reply.status(204).send();
      } catch (error) {
        return handleRbacError(error, reply);
      }
    },
  );

  // GET /api/admin/rbac/audit
  app.get(
    '/api/admin/rbac/audit',
    { preHandler: adminGuard },
    async (request, reply) => {
      const query = AuditLogQuerySchema.parse(request.query);

      app.log.info({
        operation: 'admin.rbac.queryAudit',
        correlationId: request.correlationId,
        userId: request.userId,
        query,
      });

      const entries = await rbacService.queryAuditLog(query, request.correlationId);
      return reply.status(200).send({ data: entries });
    },
  );
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleRbacError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof RbacError) {
    return reply.status(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof DataverseNotFoundError) {
    return reply.status(404).send({ code: 'not_found', message: 'Resource not found' });
  }
  throw error;
}
