import { ClientSecretCredential } from '@azure/identity';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { CrmApiError } from '../utils/errors.js';

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export class CrmAuthService {
  private readonly credential: ClientSecretCredential;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor() {
    this.credential = new ClientSecretCredential(
      config.AZURE_TENANT_ID,
      config.AZURE_CLIENT_ID,
      config.AZURE_CLIENT_SECRET,
    );
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
      return this.cachedToken.value;
    }

    const scope = `${config.DATAVERSE_URL}/.default`;

    try {
      const tokenResponse = await this.credential.getToken(scope);

      if (!tokenResponse) {
        throw new CrmApiError('Failed to acquire Dataverse access token');
      }

      this.cachedToken = {
        value: tokenResponse.token,
        expiresAt: tokenResponse.expiresOnTimestamp,
      };

      logger.debug('Acquired new Dataverse access token');
      return this.cachedToken.value;
    } catch (error) {
      if (error instanceof CrmApiError) throw error;
      throw new CrmApiError(`Failed to acquire token: ${String(error)}`);
    }
  }
}
