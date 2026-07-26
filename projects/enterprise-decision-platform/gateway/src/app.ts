import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { GatewayConfig } from './config.js';
import type { DecisionRuntime } from './envelope.js';
import { registerDecisionRoutes } from './routes/decisions.js';
import { openApiDocument, docsHtml } from './openapi.js';

const PUBLIC_PATHS = new Set(['/health', '/openapi.json', '/docs']);

export interface AppDeps {
  readonly config: GatewayConfig;
  readonly runtime: DecisionRuntime;
}

/**
 * Build the gateway app. The runtime is injected so the transport layer can be tested with a
 * fake — the gateway itself contains no decision logic (ADR-EDS-02).
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, requestIdHeader: 'x-request-id' });

  app.setErrorHandler(gatewayErrorHandler);
  await registerRateLimit(app, deps.config);

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/openapi.json', async () => openApiDocument);
  app.get('/docs', async (_request, reply) => reply.type('text/html').send(docsHtml));

  // API-key authentication for the decision surface. Empty key set = auth disabled (dev only).
  //
  // Deliberately a preHandler, not an onRequest hook: @fastify/rate-limit attaches its hook
  // per-route, and route-level onRequest hooks run *after* instance-level ones. Authenticating
  // at onRequest would therefore short-circuit before the limiter ever counted the request,
  // leaving an unauthenticated flood unthrottled. preHandler runs after every onRequest hook,
  // so the limiter sees the request first.
  app.addHook('preHandler', async (request, reply) => {
    if (PUBLIC_PATHS.has(pathOf(request))) return;
    if (deps.config.apiKeys.length === 0) return;
    const key = apiKeyOf(request);
    if (!key || !deps.config.apiKeys.includes(key)) {
      await reply.code(401).send({
        meta: { correlationId: request.id, requestId: request.id },
        error: { code: 'unauthorized', message: 'A valid x-api-key header is required.' },
      });
    }
  });

  registerDecisionRoutes(app, deps.runtime);

  return app;
}

/**
 * Per-caller request throttling. Liveness is never throttled — a probe must not be able to
 * fail because a caller is noisy.
 *
 * The bucket key is the API key only when that key is *valid*; everything else shares an
 * address bucket. Keying on the presented key alone would let a caller mint an unlimited
 * number of buckets by rotating invented keys.
 */
async function registerRateLimit(app: FastifyInstance, config: GatewayConfig): Promise<void> {
  if (config.rateLimit.max === 0) return; // explicitly disabled

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowSeconds * 1000,
    allowList: (request) => pathOf(request) === '/health',
    keyGenerator: (request) => {
      const key = apiKeyOf(request);
      return key && config.apiKeys.includes(key) ? `key:${key}` : `ip:${request.ip}`;
    },
    // The plugin *throws* whatever this returns, so it must be an Error carrying the status.
    // gatewayErrorHandler renders it in the canonical envelope.
    // 429 is the only status this builder can produce — the plugin uses 403 solely in `ban`
    // mode, which this gateway does not enable.
    errorResponseBuilder: (_request, context) => {
      const error = new Error(`Rate limit exceeded — at most ${context.max} requests per ${context.after}.`);
      return Object.assign(error, { statusCode: 429, code: 'rate_limited' });
    },
  });
}

/**
 * Renders anything thrown outside a route's own try/catch in the canonical error envelope,
 * so a client never sees a shape the contract does not describe.
 */
function gatewayErrorHandler(
  error: Error & { statusCode?: number; code?: string },
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const status = error.statusCode ?? 500;
  const code = status === 429 ? 'rate_limited' : 'internal_error';
  return reply.code(status).send({
    meta: { correlationId: request.id, requestId: request.id },
    error: { code, message: status === 500 ? 'The gateway failed to handle the request.' : error.message },
  });
}

function pathOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

function apiKeyOf(request: FastifyRequest): string | undefined {
  const provided = request.headers['x-api-key'];
  return Array.isArray(provided) ? provided[0] : provided;
}
