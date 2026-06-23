import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

/**
 * Registers @fastify/jwt to validate Auth.js-issued JWTs on protected routes.
 *
 * The JWT_SECRET here is shared with the Next.js Auth.js configuration.
 * The auth-guard plugin calls fastify.jwt.verify() on every protected route.
 */
export async function registerJwt(
  app: FastifyInstance,
  config: Pick<AppConfig, 'JWT_SECRET'>,
): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });
}
