import type { IAuthAdapter } from './IAuthAdapter.js';
import type { AuthAdapterConfig } from './AuthAdapterConfig.js';
import { AzureAdB2cAdapter } from './adapters/AzureAdB2cAdapter.js';
import { EntraExternalIdAdapter } from './adapters/EntraExternalIdAdapter.js';
import { CustomCredentialAdapter } from './adapters/CustomCredentialAdapter.js';

/**
 * Factory function for creating the correct IAuthAdapter implementation
 * based on the portal's configured auth provider.
 *
 * This is the single place where the concrete class is resolved from config —
 * callers depend only on the IAuthAdapter interface.
 *
 * @param config - Discriminated union config object carrying the provider key
 */
export function createAuthAdapter(config: AuthAdapterConfig): IAuthAdapter {
  switch (config.provider) {
    case 'azure-ad-b2c':
      return new AzureAdB2cAdapter(config);

    case 'entra-external-id':
      return new EntraExternalIdAdapter(config);

    case 'custom':
      return new CustomCredentialAdapter(config);
  }
}
