import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from './config.js';
import type { IAuthAdapter } from '@dcp/auth-adapters';
import { AdfsAdapter, AzureAdAdapter } from '@dcp/auth-adapters';
import type { OrgTarget } from '@dcp/types';
import { correlationIdPlugin } from './plugins/correlation-id.js';
import { authPlugin } from './plugins/auth.js';
import { orgRouterPlugin } from './plugins/org-router.js';
import { healthRoutes } from './routes/health.js';
import { customerRoutes } from './routes/customers.js';
import { identityExceptionRoutes } from './routes/identity-exceptions.js';

export interface AppOverrides {
  /** Inject a mock adapter in tests; production resolves from config. */
  authAdapter?: IAuthAdapter;
}

/**
 * Builds and configures the Fastify application.
 *
 * Separated from server.ts so the app can be instantiated in tests without
 * binding to a port (Fastify inject() / supertest pattern).
 */
export async function buildApp(
  config: AppConfig,
  overrides: AppOverrides = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    genReqId: () => crypto.randomUUID(),
  });

  // ---------------------------------------------------------------------------
  // Plugin registration order (strict):
  // 1. correlation-id (needed by auth and error handler)
  // 2. auth (depends on authAdapter)
  // 3. org-router (depends on config and authAdapter.getServiceToken)
  // 4. routes (depend on authenticate and resolveOrgClient decorators)
  // ---------------------------------------------------------------------------

  await app.register(correlationIdPlugin);

  const authAdapter = overrides.authAdapter ?? buildAuthAdapter(config);
  await app.register(authPlugin, { authAdapter });

  await app.register(orgRouterPlugin, {
    config,
    getServiceToken: (orgKey: string) =>
      authAdapter.getServiceToken(buildOrgTargetForKey(config, orgKey)),
  });

  // Routes registered inside a single fp wrapper so they run after all
  // decorators (authenticate, resolveOrgClient) are available.
  await app.register(
    fp(async (instance: FastifyInstance) => {
      await healthRoutes(instance);
      await customerRoutes(instance);
      await identityExceptionRoutes(instance);
    }),
  );

  // ---------------------------------------------------------------------------
  // Global error handler — uniform error model (§5.5 arch doc)
  // No stack traces in production; correlationId always echoed.
  // ---------------------------------------------------------------------------
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const correlationId = request.correlationId;

    app.log.error({
      err: { name: error.name, message: error.message },
      correlationId,
      operation: `${request.method} ${request.url}`,
    });

    if (error.name === 'ZodError') {
      return reply.status(422).send({
        code: 'validation_error',
        message: 'Request validation failed',
        correlationId,
      });
    }

    const statusCode = error.statusCode ?? 500;
    const isProd = config.NODE_ENV === 'production';

    return reply.status(statusCode).send({
      code: (error as Error & { code?: string }).code ?? 'internal_error',
      message: isProd ? 'An unexpected error occurred' : error.message,
      correlationId,
    });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildLoggerOptions(config: AppConfig): object | boolean {
  if (config.NODE_ENV === 'test') return false;
  return {
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  };
}

function buildAuthAdapter(config: AppConfig): IAuthAdapter {
  const orgCredentials = buildOrgCredentials(config);
  if (config.AUTH_PROVIDER === 'azure-ad') {
    return new AzureAdAdapter({ issuerUrl: config.AUTH_ISSUER_URL, orgCredentials, ...buildAudienceOption(config) }); // FIXED: pass audience claim for JWT validation
  }
  return new AdfsAdapter({ issuerUrl: config.AUTH_ISSUER_URL, orgCredentials, ...buildAudienceOption(config) }); // FIXED: pass audience claim for JWT validation
}

// FIXED: returns audience option only when configured — exactOptionalPropertyTypes forbids { audience: undefined }
function buildAudienceOption(config: AppConfig): { audience: string } | Record<string, never> {
  return config.AUTH_AUDIENCE !== undefined ? { audience: config.AUTH_AUDIENCE } : {};
}

function buildOrgCredentials(
  config: AppConfig,
): Record<string, { clientId: string; clientSecret: string; scope: string }> {
  const creds: Record<string, { clientId: string; clientSecret: string; scope: string }> = {
    HL: {
      clientId: config.DV_CLIENT_ID,
      clientSecret: config.DV_CLIENT_SECRET,
      scope: config.DV_SCOPE,
    },
  };

  if (
    config.FEATURE_BFD &&
    config.DV_BFD_CLIENT_ID !== undefined &&
    config.DV_BFD_CLIENT_SECRET !== undefined &&
    config.DV_BFD_SCOPE !== undefined
  ) {
    creds['BFD'] = {
      clientId: config.DV_BFD_CLIENT_ID,
      clientSecret: config.DV_BFD_CLIENT_SECRET,
      scope: config.DV_BFD_SCOPE,
    };
  }

  return creds;
}

function buildOrgTargetForKey(config: AppConfig, orgKey: string): OrgTarget {
  if (orgKey === 'BFD' && config.DV_BFD_DATAVERSE_URL !== undefined) {
    return {
      orgKey: 'BFD',
      baseUrl: config.DV_BFD_DATAVERSE_URL,
      apiVersion: config.DV_BFD_API_VERSION ?? config.DV_API_VERSION,
    };
  }
  return { orgKey: 'HL', baseUrl: config.DV_DATAVERSE_URL, apiVersion: config.DV_API_VERSION };
}
