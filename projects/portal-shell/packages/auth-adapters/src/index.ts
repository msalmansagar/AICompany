// @portal/auth-adapters — public API

export type { IAuthAdapter } from './IAuthAdapter.js';
export { createAuthAdapter } from './factory.js';
export type { AuthAdapterConfig, MsalB2cConfig, EntraExternalIdConfig, CustomCredentialConfig } from './AuthAdapterConfig.js';
export {
  AuthAdapterError,
  TokenValidationError,
  InvalidCredentialsError,
  UserNotFoundError,
} from './errors.js';
// Concrete adapters are exported for tests / DI wiring; callers should
// prefer the factory function for normal use.
export { AzureAdB2cAdapter } from './adapters/AzureAdB2cAdapter.js';
export { EntraExternalIdAdapter } from './adapters/EntraExternalIdAdapter.js';
export { CustomCredentialAdapter } from './adapters/CustomCredentialAdapter.js';
