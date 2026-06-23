import type { IAuthAdapter } from '@portal/auth-adapters';
import type { AuthResult, TokenClaims, UserProfile } from '@portal/types';
import { InvalidCredentialsError } from '@portal/auth-adapters';

/**
 * Orchestrates authentication flows by delegating to the injected IAuthAdapter.
 *
 * This service is the only caller of IAuthAdapter — all routes go through here
 * so that cross-cutting concerns (logging, error normalisation) are centralised.
 */
export class AuthService {
  private readonly adapter: IAuthAdapter;

  constructor(adapter: IAuthAdapter) {
    this.adapter = adapter;
  }

  /**
   * Authenticate a user with email and password credentials.
   * Throws InvalidCredentialsError on failure.
   */
  async login(email: string, password: string): Promise<AuthResult> {
    return this.adapter.authenticateWithCredentials(email, password);
  }

  /**
   * Exchange a refresh token for new access + refresh tokens.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    return this.adapter.refreshToken(refreshToken);
  }

  /**
   * Revoke a token (logout).
   */
  async logout(token: string): Promise<void> {
    await this.adapter.revokeToken(token);
  }

  /**
   * Initiate forgot-password flow. Returns the reset token (for testing).
   * In production the adapter sends the email internally.
   */
  async forgotPassword(email: string): Promise<string> {
    return this.adapter.generatePasswordResetToken(email);
  }

  /**
   * Complete password reset with a valid token and new password.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.adapter.resetPassword(token, newPassword);
  }

  /**
   * Validate and decode a Bearer JWT.
   */
  async validateToken(token: string): Promise<TokenClaims> {
    return this.adapter.validateToken(token);
  }

  /**
   * Fetch a user profile by ID. Returns null when the user does not exist.
   */
  async getUserById(id: string): Promise<UserProfile | null> {
    return this.adapter.getUserById(id);
  }
}
