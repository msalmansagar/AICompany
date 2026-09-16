import type { OrgTarget } from '@dcp/types';

/**
 * Claims extracted from a validated user bearer token.
 * Roles are the CRM security-role names the user carries (FR-113).
 * hasViewSensitivePii is derived from the roles list at validation time
 * so callers never repeat the claim name constant.
 */
export interface UserClaims {
  /** Subject identifier (user ID in the directory). */
  readonly sub: string;
  readonly email?: string;
  readonly roles: readonly string[];
  /** True when the token carries the 'View Sensitive PII' claim (FR-014/114). */
  readonly hasViewSensitivePii: boolean;
}

/**
 * IAuthAdapter — the only auth contract the router depends on.
 * Backed by AdfsAdapter (AD FS 2019, Phase 1) and AzureAdAdapter (Entra ID,
 * after migration). The concrete implementation is selected by env var at
 * startup; no business code is aware of the flavour (ADR-DCP-04).
 */
export interface IAuthAdapter {
  /**
   * Obtains a service-to-service access token for calling the given CRM org.
   * Uses client_credentials grant (never uses a user context).
   */
  getServiceToken(org: OrgTarget): Promise<string>;

  /**
   * Validates a user bearer JWT against the issuer's JWKS and returns
   * the decoded claims. Throws AuthAdapterError on invalid/expired tokens.
   */
  validateUserToken(jwt: string): Promise<UserClaims>;
}
