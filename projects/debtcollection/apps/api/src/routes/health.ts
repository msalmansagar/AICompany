import type { FastifyInstance } from 'fastify';
import { DataverseClient } from '@dcp/dataverse-client';

/**
 * GET /health — service liveness (Article XIV).
 *
 * No auth required (it is the probe endpoint).
 * Returns:
 *   - status: 'ok' | 'degraded'
 *   - version: from package.json (embedded at build time via env)
 *   - orgs: per-org reachability; BFD reported as 'disabled' while FEATURE_BFD=false
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { skipAuth: true } }, async (request, reply) => {
    const hlReachable = await probeOrg(app.hlOrgTarget.baseUrl);
    const bfdStatus = buildBfdStatus(app);

    const overallStatus = hlReachable ? 'ok' : 'degraded';

    return reply.status(hlReachable ? 200 : 503).send({
      status: overallStatus,
      version: process.env['npm_package_version'] ?? 'unknown',
      timestamp: new Date().toISOString(),
      orgs: {
        HL: { status: hlReachable ? 'reachable' : 'unreachable' },
        BFD: bfdStatus,
      },
    });
  });
}

async function probeOrg(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl}/api/data/v9.2/$metadata`;
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return response.ok || response.status === 401; // 401 = reachable but auth needed
  } catch {
    return false;
  }
}

function buildBfdStatus(app: FastifyInstance): Record<string, string> {
  if (app.bfdOrgTarget === null) {
    return { status: 'disabled' };
  }
  return { status: 'enabled' };
}

// Augment Fastify route config to support skipAuth flag
declare module 'fastify' {
  interface FastifyContextConfig {
    skipAuth?: boolean;
  }
}
