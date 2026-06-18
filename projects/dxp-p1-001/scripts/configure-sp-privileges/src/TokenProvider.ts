import {
  ConfidentialClientApplication,
  type Configuration,
  type AuthenticationResult,
} from '@azure/msal-node';
import type { Env } from './config.js';

export class TokenProvider {
  private readonly client: ConfidentialClientApplication;
  private readonly scope: string;

  constructor(env: Env) {
    const msalConfig: Configuration = {
      auth: {
        clientId: env.DATAVERSE_CLIENT_ID,
        clientSecret: env.DATAVERSE_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${env.DATAVERSE_TENANT_ID}`,
      },
    };
    this.client = new ConfidentialClientApplication(msalConfig);
    this.scope = `${env.DATAVERSE_ORG_URL}/.default`;
  }

  async acquireToken(): Promise<string> {
    const result: AuthenticationResult | null =
      await this.client.acquireTokenByClientCredential({ scopes: [this.scope] });

    if (result === null || !result.accessToken) {
      throw new Error(
        '[AUTH] MSAL returned null. Verify DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, and DATAVERSE_TENANT_ID.',
      );
    }

    return result.accessToken;
  }
}
