import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DataverseClient } from '@dcp/dataverse-client';
import type { OrgTarget } from '@dcp/types';
import type { AppConfig } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Resolves the OrgTarget for a request and returns a DataverseClient
     * bound to that org. Call once per request — the client holds the token
     * factory for that org.
     */
    resolveOrgClient(request: FastifyRequest, reply: FastifyReply): Promise<DataverseClient | null>;
    hlOrgTarget: OrgTarget;
    bfdOrgTarget: OrgTarget | null;
  }
}

/**
 * CRM org router (§5.3 arch doc).
 *
 * Resolves the active OrgTarget from (in order):
 *   1. Explicit `org` query param (`?org=HL` or `?org=BFD`)
 *   2. Record-id prefix (future, step 2+)
 *   3. Default: HL
 *
 * Phase 1: always resolves HL. BFD is behind FEATURE_BFD and returns 403 if
 * the flag is off (SC-06 / NFR-012).
 */
export const orgRouterPlugin = fp(async function registerOrgRouter(
  app: FastifyInstance,
  options: {
    config: AppConfig;
    getServiceToken: (orgKey: string) => Promise<string>;
  },
): Promise<void> {
  const hlOrg: OrgTarget = {
    orgKey: 'HL',
    baseUrl: options.config.DV_DATAVERSE_URL,
    apiVersion: options.config.DV_API_VERSION,
  };

  const bfdOrg: OrgTarget | null = buildBfdOrg(options.config);

  app.decorate('hlOrgTarget', hlOrg);
  app.decorate('bfdOrgTarget', bfdOrg);

  app.decorate(
    'resolveOrgClient',
    async function resolveOrgClient(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<DataverseClient | null> {
      const org = resolveOrgTarget(request, options.config, hlOrg, bfdOrg);

      if (org === null) {
        await reply.status(403).send({
          code: 'bfd_disabled',
          message: 'BFD org is not enabled in this deployment',
          correlationId: request.correlationId,
        });
        return null;
      }

      return new DataverseClient({
        org,
        getAccessToken: options.getServiceToken,
      });
    },
  );
});

function buildBfdOrg(config: AppConfig): OrgTarget | null {
  if (!config.FEATURE_BFD) return null;
  if (!config.DV_BFD_DATAVERSE_URL) return null;
  return {
    orgKey: 'BFD',
    baseUrl: config.DV_BFD_DATAVERSE_URL,
    apiVersion: config.DV_BFD_API_VERSION ?? config.DV_API_VERSION,
  };
}

function resolveOrgTarget(
  request: FastifyRequest,
  config: AppConfig,
  hlOrg: OrgTarget,
  bfdOrg: OrgTarget | null,
): OrgTarget | null {
  const orgParam = (request.query as Record<string, unknown>)['org'];
  if (orgParam === 'BFD') {
    if (!config.FEATURE_BFD || bfdOrg === null) return null;
    return bfdOrg;
  }
  // Default: HL in Phase 1
  return hlOrg;
}
