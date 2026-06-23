import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DataverseClient } from '@portal/dataverse-client';
import type { IAuthAdapter } from '../IAuthAdapter.js';
import type { CustomCredentialConfig } from '../AuthAdapterConfig.js';
import type { AuthResult, TokenClaims, UserProfile } from '@portal/types';
import {
  AuthAdapterError,
  TokenValidationError,
  UserNotFoundError,
  InvalidCredentialsError,
} from '../errors.js';

/** Dataverse logical name for the custom user table */
const PORTAL_USER_ENTITY = 'qdb_portal_users';
/** Dataverse logical name for the password-reset token table */
const RESET_TOKEN_ENTITY = 'qdb_portal_reset_tokens';

interface DataversePortalUser {
  qdb_portal_userid: string;
  qdb_email: string;
  qdb_password_hash: string;
  qdb_first_name: string;
  qdb_last_name: string;
  qdb_display_name: string;
  qdb_avatar_url: string | null;
  qdb_roles: string;
  qdb_linked_entity_ids: string;
  qdb_preferred_language: 'en' | 'ar';
}

interface DataverseResetToken {
  qdb_portal_reset_tokenid: string;
  qdb_token_hash: string;
  qdb_user_id: string;
  qdb_expires_on: string;
  qdb_used: boolean;
}

/**
 * Custom credential adapter — stores users in Dataverse qdb_portal_user table.
 *
 * Passwords are stored as bcrypt hashes. JWTs are signed with a secret loaded
 * from environment configuration (never hardcoded).
 */
export class CustomCredentialAdapter implements IAuthAdapter {
  readonly provider = 'custom' as const;

  private readonly config: CustomCredentialConfig;
  private readonly dataverseClient: DataverseClient;

  constructor(config: CustomCredentialConfig) {
    this.config = config;
    this.dataverseClient = new DataverseClient({
      orgUrl: config.dataverseOrgUrl,
      getAccessToken: config.dataverseGetAccessToken,
    });
  }

  /** Verify credentials against the bcrypt hash stored in Dataverse. */
  async authenticateWithCredentials(email: string, password: string): Promise<AuthResult> {
    const user = await this.loadUserByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isMatch = await bcrypt.compare(password, user.qdb_password_hash);
    if (!isMatch) {
      throw new InvalidCredentialsError();
    }

    return this.issueTokensForUser(user);
  }

  /** Verify and decode a JWT signed by this adapter. */
  async validateToken(token: string): Promise<TokenClaims> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as Record<string, unknown>;
      return this.mapJwtPayloadToTokenClaims(payload);
    } catch (error) {
      throw new TokenValidationError('JWT verification failed', { cause: error });
    }
  }

  /**
   * Re-issue access + refresh tokens from a valid refresh token.
   * The presented refresh token is revoked before new tokens are issued
   * to prevent replay attacks (A-002 fix).
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const claims = await this.validateToken(refreshToken);
    const user = await this.loadUserById(claims.sub);
    if (!user) {
      throw new UserNotFoundError(claims.sub);
    }

    // Revoke the consumed refresh token — single-use enforcement
    await this.revokeToken(refreshToken);

    return this.issueTokensForUser(user);
  }

  /**
   * Revoke a token by storing its JTI in a Dataverse block-list table.
   * The auth-guard plugin checks this list on every request.
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const payload = jwt.decode(token) as Record<string, unknown> | null;
      if (!payload || typeof payload['jti'] !== 'string') return;

      await this.dataverseClient.create(
        'qdb_portal_revoked_tokens',
        {
          qdb_jti: payload['jti'],
          qdb_revoked_on: new Date().toISOString(),
        },
      );
    } catch (error) {
      throw new AuthAdapterError('Token revocation failed', { cause: error });
    }
  }

  /**
   * Create a time-limited reset token record in Dataverse and return the
   * raw token (SHA-256 hashed before storing).
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.loadUserByEmail(email);
    if (!user) {
      // Do not leak whether the email exists — return silently
      return '';
    }

    const rawToken = this.generateSecureToken();
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresOn = new Date(
      Date.now() + this.config.resetTokenTtlSeconds * 1000,
    ).toISOString();

    await this.dataverseClient.create(RESET_TOKEN_ENTITY, {
      qdb_token_hash: tokenHash,
      qdb_user_id: user.qdb_portal_userid,
      qdb_expires_on: expiresOn,
      qdb_used: false,
    });

    return rawToken;
  }

  /** Validate a reset token and update the user's password hash. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetRecord = await this.findValidResetToken(token);

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.dataverseClient.update(PORTAL_USER_ENTITY, resetRecord.qdb_user_id, {
      qdb_password_hash: newHash,
    });

    // Mark token as used so it cannot be replayed
    await this.dataverseClient.update(RESET_TOKEN_ENTITY, resetRecord.qdb_portal_reset_tokenid, {
      qdb_used: true,
    });
  }

  /** Load a UserProfile from Dataverse by internal GUID. */
  async getUserById(id: string): Promise<UserProfile | null> {
    const user = await this.loadUserById(id);
    return user ? this.mapDataverseUserToProfile(user) : null;
  }

  /** Load a UserProfile from Dataverse by email address. */
  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const user = await this.loadUserByEmail(email);
    return user ? this.mapDataverseUserToProfile(user) : null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadUserById(id: string): Promise<DataversePortalUser | null> {
    try {
      return await this.dataverseClient.getById<DataversePortalUser>(
        PORTAL_USER_ENTITY,
        id,
        { select: this.userSelectFields() },
      );
    } catch {
      return null;
    }
  }

  private async loadUserByEmail(email: string): Promise<DataversePortalUser | null> {
    const safeEmail = email.replace(/'/g, "''");
    const result = await this.dataverseClient.getList<DataversePortalUser>(
      PORTAL_USER_ENTITY,
      {
        select: this.userSelectFields(),
        filter: `qdb_email eq '${safeEmail}'`,
        top: 1,
      },
    );
    return result.value[0] ?? null;
  }

  private async findValidResetToken(rawToken: string): Promise<DataverseResetToken> {
    const result = await this.dataverseClient.getList<DataverseResetToken>(
      RESET_TOKEN_ENTITY,
      {
        select: [
          'qdb_portal_reset_tokenid',
          'qdb_token_hash',
          'qdb_user_id',
          'qdb_expires_on',
          'qdb_used',
        ],
        filter: `qdb_used eq false and qdb_expires_on gt ${new Date().toISOString()}`,
        top: 100,
      },
    );

    for (const record of result.value) {
      const isMatch = await bcrypt.compare(rawToken, record.qdb_token_hash);
      if (isMatch) return record;
    }

    throw new AuthAdapterError('Password reset token is invalid or has expired');
  }

  private issueTokensForUser(user: DataversePortalUser): AuthResult {
    const profile = this.mapDataverseUserToProfile(user);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const accessToken = jwt.sign(
      {
        sub: user.qdb_portal_userid,
        email: user.qdb_email,
        roles: profile.roles,
        jti: this.generateSecureToken(),
      },
      this.config.jwtSecret,
      { expiresIn: this.config.accessTokenTtlSeconds },
    );

    const refreshToken = jwt.sign(
      {
        sub: user.qdb_portal_userid,
        email: user.qdb_email,
        roles: [],
        jti: this.generateSecureToken(),
      },
      this.config.jwtSecret,
      { expiresIn: this.config.refreshTokenTtlSeconds },
    );

    return {
      accessToken,
      refreshToken,
      expiresAt: nowSeconds + this.config.accessTokenTtlSeconds,
      user: profile,
    };
  }

  private mapDataverseUserToProfile(user: DataversePortalUser): UserProfile {
    return {
      id: user.qdb_portal_userid,
      email: user.qdb_email,
      displayName: user.qdb_display_name,
      firstName: user.qdb_first_name,
      lastName: user.qdb_last_name,
      avatarUrl: user.qdb_avatar_url,
      roles: user.qdb_roles ? (JSON.parse(user.qdb_roles) as string[]) : [],
      linkedEntityIds: user.qdb_linked_entity_ids
        ? (JSON.parse(user.qdb_linked_entity_ids) as string[])
        : [],
      preferredLanguage: user.qdb_preferred_language ?? 'en',
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

  private userSelectFields(): string[] {
    return [
      'qdb_portal_userid',
      'qdb_email',
      'qdb_password_hash',
      'qdb_first_name',
      'qdb_last_name',
      'qdb_display_name',
      'qdb_avatar_url',
      'qdb_roles',
      'qdb_linked_entity_ids',
      'qdb_preferred_language',
    ];
  }

  private generateSecureToken(): string {
    // crypto.randomUUID() is available on Node.js 15+ without import
    return crypto.randomUUID();
  }
}
