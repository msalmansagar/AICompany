import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { AppConfig } from './config.js';
import { registerCors } from './plugins/cors.js';
import { registerRateLimit } from './plugins/rate-limit.js';
import { registerJwt } from './plugins/jwt.js';
import { msalPlugin } from './plugins/msal.js';
import { dataversePlugin } from './plugins/dataverse.js';
import { requestContextPlugin } from './plugins/request-context.js';
import { authGuardPlugin } from './plugins/auth-guard.js';

import { PortalConfigService } from './services/PortalConfigService.js';
import { NavService } from './services/NavService.js';
import { NotificationService } from './services/NotificationService.js';
import { EntityService } from './services/EntityService.js';
import { AuthService } from './services/AuthService.js';
import { createAuthAdapter } from '@portal/auth-adapters';

import { healthRoutes } from './routes/health.js';
import { portalConfigRoutes } from './routes/portal-config.js';
import { authRoutes } from './routes/auth.js';
import { navRoutes } from './routes/nav.js';
import { entityRoutes } from './routes/entities.js';
import { notificationRoutes } from './routes/notifications.js';
import { serviceRoutes } from './routes/services.js';
import { requestRoutes } from './routes/requests.js';
import { widgetRoutes } from './routes/widgets.js';
import { adminPortalConfigRoutes } from './routes/admin/portal-config.js';
import { adminNavRoutes } from './routes/admin/nav.js';
import { adminWidgetRoutes } from './routes/admin/widgets.js';
import { cmsRoutes } from './routes/cms.js';
import { adminCmsRoutes } from './routes/admin/cms.js';
import { CmsService } from './services/CmsService.js';

/**
 * Builds and configures the Fastify application instance.
 *
 * Separated from server.ts so the app can be instantiated in tests without
 * binding to a port. All plugins and routes are registered here; calling
 * app.listen() is the responsibility of server.ts.
 *
 * @param config - Validated environment config (from loadConfig())
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    disableRequestLogging: false,
  });

  // ---------------------------------------------------------------------------
  // Plugin registration — order is strict:
  // 1. Cross-cutting concerns (cors, rate-limit, request-context)
  // 2. Auth infrastructure (jwt, msal, dataverse)
  // 3. Auth guard (depends on jwt)
  // 4. Business routes (depend on dataverse decorator)
  // ---------------------------------------------------------------------------

  await registerCors(app, config);
  await registerRateLimit(app);
  await app.register(requestContextPlugin);
  await registerJwt(app, config);

  // msal and dataverse use fp() internally so decorations escape encapsulation
  await app.register(msalPlugin, {
    TENANT_ID: config.TENANT_ID,
    CLIENT_ID: config.CLIENT_ID,
    CLIENT_SECRET: config.CLIENT_SECRET,
    DATAVERSE_URL: config.DATAVERSE_URL,
  });

  await app.register(dataversePlugin, {
    DATAVERSE_URL: config.DATAVERSE_URL,
  });

  await app.register(authGuardPlugin);

  // ---------------------------------------------------------------------------
  // Services and routes registered as a single plugin so they execute after
  // all decorators (dataverse, getDataverseToken) are available on the instance.
  // ---------------------------------------------------------------------------

  await app.register(
    fp(async (instance: FastifyInstance) => {
      const authAdapter = createAuthAdapter(buildAuthAdapterConfig(config, instance));
      const authService = new AuthService(authAdapter);
      const portalConfigService = new PortalConfigService(
        instance.dataverse,
        config.CACHE_TTL_PORTAL_CONFIG,
      );
      const navService = new NavService(instance.dataverse);
      const notificationService = new NotificationService(instance.dataverse);
      const entityService = new EntityService(instance.dataverse);

      await healthRoutes(instance);
      await portalConfigRoutes(instance, { portalConfigService });
      await authRoutes(instance, { authService });
      await navRoutes(instance, { navService });
      await entityRoutes(instance, { entityService });
      await notificationRoutes(instance, { notificationService });
      await serviceRoutes(instance, { dataverse: instance.dataverse });
      await requestRoutes(instance, { dataverse: instance.dataverse });
      await widgetRoutes(instance, { dataverse: instance.dataverse });
      await adminPortalConfigRoutes(instance, { portalConfigService });
      await adminNavRoutes(instance, { navService });
      await adminWidgetRoutes(instance, { dataverse: instance.dataverse });

      const cmsService = new CmsService(instance.dataverse);
      await cmsRoutes(instance, { cmsService });
      await adminCmsRoutes(instance, { cmsService });
    }),
  );

  // ---------------------------------------------------------------------------
  // Global error handler — RFC 7807 Problem Details
  // ---------------------------------------------------------------------------

  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.correlationId;

    app.log.error({
      error: {
        name: error.name,
        message: error.message,
        code: (error as { code?: string }).code,
      },
      correlationId,
      operation: `${request.method} ${request.url}`,
    });

    // Zod validation failures are re-thrown as ZodError from route handlers
    if (error.name === 'ZodError') {
      return reply.status(422).send({
        code: 'validation_error',
        message: 'Request validation failed',
        details: (error as { issues?: unknown[] }).issues,
      });
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const isProduction = config.NODE_ENV === 'production';

    return reply.status(statusCode).send({
      code: (error as { code?: string }).code ?? 'internal_error',
      message: isProduction ? 'An unexpected error occurred' : error.message,
      ...(isProduction ? {} : { details: { correlationId } }),
    });
  });

  return app;
}

/**
 * Constructs the discriminated union auth adapter config from the flat env
 * config. The Fastify instance is passed so the custom adapter can acquire
 * Dataverse tokens via the msal plugin after it is registered.
 */
function buildAuthAdapterConfig(
  config: AppConfig,
  app: FastifyInstance,
): Parameters<typeof createAuthAdapter>[0] {
  switch (config.AUTH_PROVIDER) {
    case 'azure-ad-b2c':
      return {
        provider: 'azure-ad-b2c',
        tenantName: config.B2C_TENANT_NAME,
        policyName: config.B2C_POLICY_NAME,
        clientId: config.CLIENT_ID,
        clientSecret: config.CLIENT_SECRET,
        dataverseOrgUrl: config.DATAVERSE_URL,
      };

    case 'entra-external-id':
      return {
        provider: 'entra-external-id',
        tenantId: config.ENTRA_TENANT_ID,
        clientId: config.CLIENT_ID,
        clientSecret: config.CLIENT_SECRET,
        dataverseOrgUrl: config.DATAVERSE_URL,
      };

    case 'custom':
      return {
        provider: 'custom',
        jwtSecret: config.JWT_SECRET,
        dataverseOrgUrl: config.DATAVERSE_URL,
        dataverseGetAccessToken: () => app.getDataverseToken(),
        // A-004 fix: TTLs loaded from env so they can be shortened during an
        // incident without a code deployment
        accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtlSeconds: config.REFRESH_TOKEN_TTL_SECONDS,
        resetTokenTtlSeconds: config.RESET_TOKEN_TTL_SECONDS,
      };
  }
}
