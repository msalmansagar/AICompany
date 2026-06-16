import fastifyCors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

/**
 * Registers @fastify/cors with environment-aware origin policy.
 *
 * In production only the Next.js web app origin is trusted.
 * In development all origins are permitted for local tooling convenience.
 */
export async function registerCors(
  app: FastifyInstance,
  config: Pick<AppConfig, 'NODE_ENV'>,
): Promise<void> {
  await app.register(fastifyCors, {
    origin: config.NODE_ENV === 'production'
      ? [/\.portal\.maqsad\.ai$/]
      : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    credentials: true,
  });
}
