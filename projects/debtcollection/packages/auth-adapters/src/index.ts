// @dcp/auth-adapters — public API

export type { IAuthAdapter, UserClaims } from './IAuthAdapter.js';
export { AdfsAdapter } from './AdfsAdapter.js';
export type { AdfsAdapterConfig, OrgCredentials } from './AdfsAdapter.js';
export { AzureAdAdapter } from './AzureAdAdapter.js';
export type { AzureAdAdapterConfig } from './AzureAdAdapter.js';
export {
  AuthAdapterError,
  TokenValidationError,
  TokenGrantError,
  OidcDiscoveryError,
} from './errors.js';
