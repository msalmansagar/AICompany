import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppAbility, RbacAction, RbacSubject } from '@portal/types';
import type { RbacService } from '../services/RbacService.js';
import type { RbacAuditWriter } from '../services/RbacAuditWriter.js';
import { getCachedAbility, setCachedAbility } from '../services/RbacAbilityCache.js';
import { buildAbility } from '../services/RbacAbilityFactory.js';

type PermissionHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

// ---------------------------------------------------------------------------
// FastifyInstance / FastifyRequest augmentation
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyInstance {
    rbacService: RbacService;
    rbacAuditWriter: RbacAuditWriter;
    requirePermission(action: RbacAction, subject: RbacSubject): PermissionHandler;
  }

  interface FastifyRequest {
    ability?: AppAbility | undefined;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Registers `fastify.requirePermission(action, subject)` — a preHandler factory
 * that checks the caller's CASL AppAbility against the requested action/subject.
 *
 * Depends on `fastify.authenticate` (from auth-guard plugin) having already
 * populated `request.user` before this preHandler runs.
 *
 * Cache strategy (ADR-RBAC-001):
 *   key = `${userId}:${rbac_version}` — miss triggers one Dataverse fetch.
 *   Hit path adds < 1 ms overhead.
 */
export const rbacPlugin = fp(async function registerRbac(app: FastifyInstance): Promise<void> {
  app.decorateRequest('ability', undefined);

  app.decorate(
    'requirePermission',
    function requirePermission(
      action: RbacAction,
      subject: RbacSubject,
    ): PermissionHandler {
      return async function checkPermission(
        request: FastifyRequest,
        reply: FastifyReply,
      ): Promise<void> {
        const user = request.user;
        const rbacVersion = user.rbac_version ?? 0;

        let ability = getCachedAbility(user.sub, rbacVersion);

        if (ability === undefined) {
          const roles = await app.rbacService.getActiveRoles(user.sub, request.correlationId);
          ability = buildAbility(roles.map((r) => r.roleSlug));
          setCachedAbility(user.sub, rbacVersion, ability);
        }

        request.ability = ability;

        if (!ability.can(action, subject)) {
          void app.rbacAuditWriter
            .logPermissionDenied({
              actorUserId: user.sub,
              subject,
              action,
              correlationId: request.correlationId,
              ipAddress: request.ip,
            })
            .catch((err: unknown) => {
              // Audit failure must not break the response (AC-RBAC-001 best-effort)
              app.log.warn(
                { err, operation: 'rbac.audit.permissionDenied' },
                'Failed to write permission_denied audit log entry',
              );
            });

          await reply.status(403).send({
            code: 'forbidden',
            message: `Cannot ${action} ${subject}`,
          });
        }
      };
    },
  );
});
