import {
  ConfidentialClientApplication,
  type Configuration,
  type AuthenticationResult,
} from '@azure/msal-node';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';

const DATAVERSE_SCOPE_SUFFIX = '/.default';

declare module 'fastify' {
  interface FastifyInstance {
    /** Acquires a Dataverse Bearer token using client credentials flow. */
    getDataverseToken(): Promise<string>;
  }
}

/**
 * Registers the MSAL ConfidentialClientApplication and decorates the Fastify
 * instance with a `getDataverseToken()` method. This is the single place
 * in the API that acquires Dataverse access tokens.
 *
 * Token caching is handled by MSAL's in-memory token cache with silent
 * refresh before expiry.
 */
export const msalPlugin = fp(async function registerMsal(
  app: FastifyInstance,
  config: Pick<AppConfig, 'TENANT_ID' | 'CLIENT_ID' | 'CLIENT_SECRET' | 'DATAVERSE_URL'>,
): Promise<void> {
  const msalConfig: Configuration = {
    auth: {
      clientId: config.CLIENT_ID,
      clientSecret: config.CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${config.TENANT_ID}`,
    },
  };

  const msalApp = new ConfidentialClientApplication(msalConfig);
  const scope = `${config.DATAVERSE_URL}${DATAVERSE_SCOPE_SUFFIX}`;

  app.decorate('getDataverseToken', async (): Promise<string> => {
    const result: AuthenticationResult | null = await msalApp.acquireTokenByClientCredential({
      scopes: [scope],
    });

    if (!result) {
      throw new Error('MSAL returned null token result for Dataverse scope');
    }

    return result.accessToken;
  });
});
