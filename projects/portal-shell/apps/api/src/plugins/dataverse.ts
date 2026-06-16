import { DataverseClient } from '@portal/dataverse-client';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Typed Dataverse OData client — use this for all CRM queries. */
    dataverse: DataverseClient;
  }
}

/**
 * Creates and decorates the Fastify instance with the DataverseClient singleton.
 *
 * Depends on the msal plugin having already decorated `fastify.getDataverseToken`.
 * The token is acquired lazily on each request by the client.
 */
export const dataversePlugin = fp(async function registerDataverse(
  app: FastifyInstance,
  config: Pick<AppConfig, 'DATAVERSE_URL'>,
): Promise<void> {
  const client = new DataverseClient({
    orgUrl: config.DATAVERSE_URL,
    getAccessToken: () => app.getDataverseToken(),
  });

  app.decorate('dataverse', client);
});
