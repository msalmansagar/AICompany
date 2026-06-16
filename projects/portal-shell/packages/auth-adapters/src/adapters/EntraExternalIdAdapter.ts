import {
  ConfidentialClientApplication,
  type Configuration,
  type AuthenticationResult,
} from '@azure/msal-node';
import type { IAuthAdapter } from '../IAuthAdapter.js';
import type { EntraExternalIdConfig } from '../AuthAdapterConfig.js';
import type { AuthResult, TokenClaims, UserProfile } from '@portal/types';
import { AuthAdapterError, TokenValidationError } from '../errors.js';

const ENTRA_EXTERNAL_AUTHORITY_BASE =
  'https://{tenantId}.ciamlogin.com/{tenantId}';

/**
 * Auth adapter backed by Microsoft Entra External Identities (CIAM).
 *
 * Functionally similar to AzureAdB2cAdapter but targets a different authority
 * URL and does not use B2C user flows. Uses MSAL ROPC for credential-based auth.
 */
export class EntraExternalIdAdapter implements IAuthAdapter {
  readonly provider = 'entra-external-id' as const;

  private readonly msalApp: ConfidentialClientApplication;
  private readonly config: EntraExternalIdConfig;

  constructor(config: EntraExternalIdConfig) {
    this.config = config;
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: this.buildAuthority(),
        knownAuthorities: [`${config.tenantId}.ciamlogin.com`],
      },
    };
    this.msalApp = new ConfidentialClientApplication(msalConfig);
  }

  /** Authenticate via Entra External Identities ROPC flow. */
  async authenticateWithCredentials(email: string, password: string): Promise<AuthResult> {
    try {
      const result = await this.msalApp.acquireTokenByUsernamePassword({
        scopes: ['openid', 'profile', 'offline_access'],
        username: email,
        password,
      });
      return this.mapMsalResultToAuthResult(result);
    } catch (error) {
      throw new AuthAdapterError('Entra External ID ROPC authentication failed', {
        cause: error,
      });
    }
  }

  /** Validate a JWT access token by parsing its payload structure. */
  async validateToken(token: string): Promise<TokenClaims> {
    try {
      const [, payloadBase64] = token.split('.');
      if (!payloadBase64) {
        throw new TokenValidationError('Malformed JWT: missing payload segment');
      }
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64url').toString('utf-8'),
      ) as Record<string, unknown>;

      return this.mapJwtPayloadToTokenClaims(payload);
    } catch (error) {
      if (error instanceof TokenValidationError) throw error;
      throw new TokenValidationError('JWT payload parsing failed', { cause: error });
    }
  }

  /** Exchange a refresh token for new tokens via Entra External ID. */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const result = await this.msalApp.acquireTokenByRefreshToken({
        refreshToken,
        scopes: ['openid', 'profile', 'offline_access'],
      });
      return this.mapMsalResultToAuthResult(result);
    } catch (error) {
      throw new AuthAdapterError('Entra External ID refresh token exchange failed', {
        cause: error,
      });
    }
  }

  /** Token revocation is handled by the OIDC logout endpoint on the client. */
  async revokeToken(_token: string): Promise<void> {
    // Entra External Identities does not support server-side refresh token
    // revocation via MSAL. The Auth.js session destruction covers this.
  }

  /** Trigger SSPR (self-service password reset) for the given email. */
  async generatePasswordResetToken(email: string): Promise<string> {
    // Entra External Identities exposes a reset flow via the CIAM portal.
    // Return the redirect URL for the frontend.
    return `https://${this.config.tenantId}.ciamlogin.com/reset-password?login_hint=${encodeURIComponent(email)}`;
  }

  /** Password reset is delegated to the Entra External ID user flow. */
  async resetPassword(_token: string, _newPassword: string): Promise<void> {
    // Handled entirely by the Entra External Identities SSPR flow.
  }

  /** Fetch user profile by Entra object ID. */
  async getUserById(_id: string): Promise<UserProfile | null> {
    return null;
  }

  /** Fetch user profile by email. */
  async getUserByEmail(_email: string): Promise<UserProfile | null> {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildAuthority(): string {
    return ENTRA_EXTERNAL_AUTHORITY_BASE.replace(/{tenantId}/g, this.config.tenantId);
  }

  private mapMsalResultToAuthResult(result: AuthenticationResult | null): AuthResult {
    if (!result) {
      throw new AuthAdapterError('MSAL returned null authentication result');
    }
    return {
      accessToken: result.accessToken,
      refreshToken: (result as { refreshToken?: string }).refreshToken ?? '',
      expiresAt: Math.floor((result.expiresOn?.getTime() ?? Date.now()) / 1000),
      user: this.extractUserProfile(result),
    };
  }

  private extractUserProfile(result: AuthenticationResult): UserProfile {
    const account = result.account;
    return {
      id: account?.localAccountId ?? '',
      email: account?.username ?? '',
      displayName: account?.name ?? '',
      firstName: '',
      lastName: '',
      avatarUrl: null,
      roles: (result.idTokenClaims?.['roles'] as string[] | undefined) ?? [],
      linkedEntityIds: [],
      preferredLanguage: 'en',
    };
  }

  private mapJwtPayloadToTokenClaims(payload: Record<string, unknown>): TokenClaims {
    const sub = typeof payload['sub'] === 'string' ? payload['sub'] : '';
    const email = typeof payload['email'] === 'string' ? payload['email'] : '';
    const roles = Array.isArray(payload['roles']) ? (payload['roles'] as string[]) : [];
    const iat = typeof payload['iat'] === 'number' ? payload['iat'] : 0;
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;

    if (!sub || !exp) {
      throw new TokenValidationError('JWT payload missing required claims (sub, exp)');
    }
    return { sub, email, roles, iat, exp };
  }
}
