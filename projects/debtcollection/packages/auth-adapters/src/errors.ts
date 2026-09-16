/** Base error for all auth-adapter failures. */
export class AuthAdapterError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'AuthAdapterError';
  }
}

/** JWT signature invalid, expired, or issuer mismatch. */
export class TokenValidationError extends AuthAdapterError {
  constructor(detail: string) {
    super(`Token validation failed: ${detail}`, 'token_invalid');
    this.name = 'TokenValidationError';
  }
}

/** Token endpoint returned an error (e.g. invalid client credentials). */
export class TokenGrantError extends AuthAdapterError {
  constructor(detail: string) {
    super(`Token grant failed: ${detail}`, 'token_grant_failed');
    this.name = 'TokenGrantError';
  }
}

/** OIDC discovery endpoint unreachable or returned invalid metadata. */
export class OidcDiscoveryError extends AuthAdapterError {
  constructor(detail: string) {
    super(`OIDC discovery failed: ${detail}`, 'discovery_failed');
    this.name = 'OidcDiscoveryError';
  }
}
