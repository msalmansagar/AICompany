import * as openidClient from 'openid-client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OrgTarget } from '@dcp/types';
import { VIEW_SENSITIVE_PII_CLAIM } from '@dcp/types';
import type { IAuthAdapter, UserClaims } from './IAuthAdapter.js';
import { TokenValidationError, TokenGrantError, OidcDiscoveryError } from './errors.js';
import type { OrgCredentials } from './AdfsAdapter.js';

export interface AzureAdAdapterConfig {
  /**
   * Azure AD / Entra ID issuer URL.
   * e.g. https://login.microsoftonline.com/<tenantId>/v2.0
   */
  issuerUrl: string;
  /** Per-org app registrations (client_id, client_secret, scope). */
  orgCredentials: Record<string, OrgCredentials>;
  /** Optional expected audience for user token validation. */
  audience?: string;
  /**
   * Allow HTTP (non-TLS) OIDC discovery. NEVER set in production.
   * Used only for in-process mock OIDC servers in unit tests.
   */
  allowInsecureRequests?: boolean;
}

/**
 * Auth adapter for Azure AD / Entra ID (post-migration, ~Q1 2028).
 *
 * Same contract as AdfsAdapter — both use openid-client + jose so the only
 * difference is the issuer URL and token-endpoint behaviour.
 * No business code is aware of which adapter is active (ADR-DCP-04).
 */
export class AzureAdAdapter implements IAuthAdapter {
  private readonly issuerUrl: URL;
  private readonly orgCredentials: Map<string, OrgCredentials>;
  private readonly audience: string | undefined;
  private readonly allowInsecureRequests: boolean;
  private readonly clientConfigCache = new Map<string, openidClient.Configuration>();
  private jwksConfig?: { jwks: ReturnType<typeof createRemoteJWKSet>; issuer: string };

  constructor(config: AzureAdAdapterConfig) {
    this.issuerUrl = new URL(config.issuerUrl);
    this.audience = config.audience;
    this.allowInsecureRequests = config.allowInsecureRequests === true;
    this.orgCredentials = new Map(Object.entries(config.orgCredentials));
  }

  async getServiceToken(org: OrgTarget): Promise<string> {
    const creds = this.orgCredentials.get(org.orgKey);
    if (creds === undefined) {
      throw new TokenGrantError(`No credentials configured for org '${org.orgKey}'`);
    }
    const config = await this.getOrCreateClientConfig(org.orgKey, creds);
    return this.fetchClientCredentialsToken(config, creds.scope);
  }

  async validateUserToken(jwt: string): Promise<UserClaims> {
    const { jwks, issuer } = await this.getOrCreateJwksConfig();
    try {
      const { payload } = await jwtVerify(jwt, jwks, {
        algorithms: ['RS256'],
        issuer,
        ...(this.audience !== undefined ? { audience: this.audience } : {}),
      });
      return extractUserClaims(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TokenValidationError(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — identical structure to AdfsAdapter by design
  // ---------------------------------------------------------------------------

  private async getOrCreateClientConfig(
    orgKey: string,
    creds: OrgCredentials,
  ): Promise<openidClient.Configuration> {
    const cached = this.clientConfigCache.get(orgKey);
    if (cached !== undefined) return cached;

    try {
      const executeOptions = this.allowInsecureRequests
        ? { execute: [openidClient.allowInsecureRequests] }
        : undefined;
      const config = await openidClient.discovery(
        this.issuerUrl,
        creds.clientId,
        creds.clientSecret,
        undefined,
        executeOptions,
      );
      this.clientConfigCache.set(orgKey, config);
      return config;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OidcDiscoveryError(message);
    }
  }

  private async fetchClientCredentialsToken(
    config: openidClient.Configuration,
    scope: string,
  ): Promise<string> {
    try {
      const tokenSet = await openidClient.clientCredentialsGrant(config, { scope });
      if (tokenSet.access_token === undefined) {
        throw new TokenGrantError('Token endpoint did not return an access_token');
      }
      return tokenSet.access_token;
    } catch (error) {
      if (error instanceof TokenGrantError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new TokenGrantError(message);
    }
  }

  // FIXED: extracted metadata validation into buildJwksConfig to keep
  // getOrCreateJwksConfig within the 20-line maximum (B-2).
  private async getOrCreateJwksConfig(): Promise<{
    jwks: ReturnType<typeof createRemoteJWKSet>;
    issuer: string;
  }> {
    if (this.jwksConfig !== undefined) return this.jwksConfig;

    const firstEntry = this.orgCredentials.entries().next().value;
    if (firstEntry === undefined) {
      throw new OidcDiscoveryError('No org credentials configured');
    }
    const [firstOrgKey, firstCreds] = firstEntry as [string, OrgCredentials];
    const config = await this.getOrCreateClientConfig(firstOrgKey, firstCreds);
    this.jwksConfig = buildJwksConfig(config.serverMetadata());
    return this.jwksConfig;
  }
}

// ---------------------------------------------------------------------------
// Module-level helper
// ---------------------------------------------------------------------------

/**
 * Validates the OIDC server metadata and constructs the JWKS verifier and
 * issuer string. Extracted to keep the owning methods under 20 lines.
 * Shared shape with AdfsAdapter by design — both use identical metadata.
 */
function buildJwksConfig(meta: {
  jwks_uri?: string;
  issuer?: string;
}): { jwks: ReturnType<typeof createRemoteJWKSet>; issuer: string } {
  if (meta.jwks_uri === undefined) {
    throw new OidcDiscoveryError('Issuer metadata does not include jwks_uri');
  }
  if (meta.issuer === undefined) {
    throw new OidcDiscoveryError('Issuer metadata does not include issuer');
  }
  return {
    jwks: createRemoteJWKSet(new URL(meta.jwks_uri)),
    issuer: meta.issuer,
  };
}

function extractUserClaims(payload: Record<string, unknown>): UserClaims {
  const roles = extractRoles(payload);
  return {
    sub: typeof payload['sub'] === 'string' ? payload['sub'] : '',
    // With exactOptionalPropertyTypes email must be absent (not undefined) when missing
    ...(typeof payload['email'] === 'string' ? { email: payload['email'] as string } : {}),
    roles,
    hasViewSensitivePii: roles.includes(VIEW_SENSITIVE_PII_CLAIM),
  };
}

function extractRoles(payload: Record<string, unknown>): string[] {
  const raw = payload['roles'] ?? payload['role'] ?? payload['groups'];
  if (Array.isArray(raw)) {
    return raw.filter((r): r is string => typeof r === 'string');
  }
  if (typeof raw === 'string') return [raw];
  return [];
}
