import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { IAuthAdapter, UserClaims } from '@dcp/auth-adapters';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authAdapter: IAuthAdapter;
  }
  interface FastifyRequest {
    /** Populated after authenticate() passes. */
    userClaims?: UserClaims;
  }
}

/**
 * Registers the bearer-token pre-handler and the auth adapter decorator.
 *
 * Usage: add `preHandler: [app.authenticate]` to any route that requires a
 * valid user token. Every route except GET /health requires auth (NFR-005).
 */
export const authPlugin = fp(async function registerAuth(
  app: FastifyInstance,
  options: { authAdapter: IAuthAdapter },
): Promise<void> {
  app.decorate('authAdapter', options.authAdapter);
  app.decorateRequest('userClaims', undefined);

  app.decorate(
    'authenticate',
    async function authenticate(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        await sendUnauthorized(reply, request.correlationId);
        return; // FIXED: exit preHandler after sending 401 — defensive guard against future code added below
      }

      const jwt = authHeader.slice('Bearer '.length);
      try {
        request.userClaims = await app.authAdapter.validateUserToken(jwt);
      } catch {
        await sendUnauthorized(reply, request.correlationId);
        return; // FIXED: exit preHandler after sending 401 — defensive guard against future code added below
      }
    },
  );
});

async function sendUnauthorized(reply: FastifyReply, correlationId: string): Promise<void> {
  await reply.status(401).send({
    code: 'unauthorized',
    message: 'A valid Bearer token is required',
    correlationId,
  });
}
