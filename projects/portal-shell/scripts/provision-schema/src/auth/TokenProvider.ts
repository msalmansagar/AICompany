import {
  ConfidentialClientApplication,
  type Configuration,
  type AuthenticationResult,
} from '@azure/msal-node';
import { env } from '../config/env.js';

// Responsibility: token acquisition only. No OData calls happen here.
// MSAL's in-memory token cache handles refresh transparently.
export class TokenProvider {
  private readonly client: ConfidentialClientApplication;
  private readonly scope: string;

  constructor() {
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
      await this.client.acquireTokenByClientCredential({
        scopes: [this.scope],
      });

    if (result === null || !result.accessToken) {
      throw new Error(
        `[AUTH] MSAL returned null result for scope ${this.scope}. ` +
          'Verify CLIENT_ID, CLIENT_SECRET, and TENANT_ID.',
      );
    }

    return result.accessToken;
  }
}
