import fp from 'fastify-plugin';
import NodeCache from 'node-cache';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DataverseClient } from '@portal/dataverse-client';
import type { TokenClaims } from '@portal/types';

// Augmenting @fastify/jwt (not fastify directly) avoids a type conflict: @fastify/jwt
// already declares FastifyRequest.user as string|object|Buffer. Augmenting FastifyJWT
// makes the jwt package's own declaration resolve to TokenClaims throughout.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenClaims;
    user: TokenClaims;
  }
}

const REVOKED_TOKENS_ENTITY = 'qdb_portal_revoked_tokenses';

// Revoked JTIs cached for 1 hour (matches max access token TTL).
// Valid JTIs cached for 60 s to avoid a Dataverse round-trip on every request.
// Max logout propagation delay = 60 s — a documented and accepted tradeoff.
const revokedJtiCache = new NodeCache({ stdTTL: 3600, useClones: false });
const validJtiCache = new NodeCache({ stdTTL: 60, useClones: false });

/**
 * Checks whether a JTI has been added to the Dataverse revocation blocklist.
 * Uses a two-level cache to minimise Dataverse calls on the hot path.
 */
async function isJtiRevoked(
  jti: string,
  dataverse: DataverseClient,
  log: FastifyInstance['log'],
): Promise<boolean> {
  if (revokedJtiCache.get<boolean>(jti) === true) return true;
  if (validJtiCache.get<boolean>(jti) === true) return false;

  try {
    const result = await dataverse.getList<{ qdb_jti: string }>(REVOKED_TOKENS_ENTITY, {
      filter: `qdb_jti eq '${jti}'`,
      top: 1,
      select: ['qdb_jti'],
    });

    if (result.value.length > 0) {
      revokedJtiCache.set(jti, true);
      return true;
    }

    validJtiCache.set(jti, true);
    return false;
  } catch (error) {
    // Fail-open: if the blocklist is unreachable we log but do not block
    // valid traffic. The alternative (fail-closed) would cause a full outage
    // if Dataverse is temporarily unavailable.
    log.warn({ error, jti }, 'JTI blocklist check failed — allowing request (fail-open)');
    return false;
  }
}

/**
 * Pre-handler hook that validates the Bearer JWT on protected routes and
 * checks the JTI against the Dataverse revocation blocklist (A-001 fix).
 *
 * Routes that require authentication must add this hook explicitly:
 * ```
 * fastify.addHook('preHandler', fastify.authenticate)
 * ```
 *
 * Routes that require a specific role use `fastify.requireRole('Admin')` instead.
 */
export const authGuardPlugin = fp(async function registerAuthGuard(
  app: FastifyInstance,
): Promise<void> {
  const dataverse = (app as FastifyInstance & { dataverse: DataverseClient }).dataverse;

  app.decorate(
    'authenticate',
    async function authenticate(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      try {
        const claims = await request.jwtVerify<TokenClaims>();

        if (claims.jti) {
          const revoked = await isJtiRevoked(claims.jti, dataverse, app.log);
          if (revoked) {
            await reply.status(401).send({
              code: 'token_revoked',
              message: 'This token has been revoked',
            });
            return;
          }
        }

        request.user = claims;
        request.userId = claims.sub;
      } catch (error) {
        // Do not re-send if the revocation handler already replied
        if (reply.sent) return;
        await reply.status(401).send({
          code: 'unauthorized',
          message: 'A valid Bearer token is required',
        });
      }
    },
  );

  app.decorate(
    'requireRole',
    function requireRole(role: string) {
      return async function checkRole(
        request: FastifyRequest,
        reply: FastifyReply,
      ): Promise<void> {
        if (!request.user?.roles.includes(role)) {
          await reply.status(403).send({
            code: 'forbidden',
            message: `Role '${role}' is required for this resource`,
          });
        }
      };
    },
  );
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireRole(role: string): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
