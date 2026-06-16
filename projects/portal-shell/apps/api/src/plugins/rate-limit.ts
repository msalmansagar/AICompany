import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

const MAX_REQUESTS_PER_MINUTE = 120;
const AUTH_MAX_REQUESTS_PER_MINUTE = 10;

/**
 * Registers @fastify/rate-limit with separate tighter limits on auth routes.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    max: MAX_REQUESTS_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request) =>
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      request.ip,
    errorResponseBuilder: (_request, context) => ({
      code: 'rate_limit_exceeded',
      message: `Too many requests. Retry after ${String(context.after)}.`,
    }),
  });
}

export { AUTH_MAX_REQUESTS_PER_MINUTE };
