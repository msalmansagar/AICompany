import type { AuthResult, TokenClaims, UserProfile } from '@portal/types';

/**
 * Auth adapter contract — CEO Condition 1: LOCKED, immutable.
 *
 * Every concrete auth implementation must satisfy this interface exactly.
 * The portal runtime depends on this abstraction — never on a concrete class.
 */
export interface IAuthAdapter {
  readonly provider: 'azure-ad-b2c' | 'entra-external-id' | 'custom';

  /** Authenticate a user with email and password credentials. */
  authenticateWithCredentials(email: string, password: string): Promise<AuthResult>;

  /** Validate a JWT access token and return its decoded claims. */
  validateToken(token: string): Promise<TokenClaims>;

  /** Exchange a refresh token for a new AuthResult. */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /** Revoke an access or refresh token. */
  revokeToken(token: string): Promise<void>;

  /**
   * Initiate password reset — creates a time-limited token and (in most
   * implementations) triggers an email to the user.
   *
   * @returns The reset token (used in testing; production callers ignore it)
   */
  generatePasswordResetToken(email: string): Promise<string>;

  /** Validate reset token and update the user's password hash. */
  resetPassword(token: string, newPassword: string): Promise<void>;

  /** Fetch a user profile by internal ID. Returns null when not found. */
  getUserById(id: string): Promise<UserProfile | null>;

  /** Fetch a user profile by email address. Returns null when not found. */
  getUserByEmail(email: string): Promise<UserProfile | null>;
}
