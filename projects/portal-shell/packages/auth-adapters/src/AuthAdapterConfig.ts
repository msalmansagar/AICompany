// ---------------------------------------------------------------------------
// Configuration types for each auth adapter implementation
// ---------------------------------------------------------------------------

export interface MsalB2cConfig {
  tenantName: string;
  policyName: string;
  clientId: string;
  clientSecret: string;
  /** Dataverse org URL so user profiles can be fetched from CRM */
  dataverseOrgUrl: string;
}

export interface EntraExternalIdConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  dataverseOrgUrl: string;
}

export interface CustomCredentialConfig {
  /** JWT signing secret (must be ≥ 32 chars) */
  jwtSecret: string;
  /** Dataverse client for reading/writing qdb_portal_user records */
  dataverseOrgUrl: string;
  dataverseGetAccessToken: () => Promise<string>;
  /** Access-token TTL in seconds — loaded from config, never hardcoded */
  accessTokenTtlSeconds: number;
  /** Refresh-token TTL in seconds */
  refreshTokenTtlSeconds: number;
  /** Password-reset token TTL in seconds */
  resetTokenTtlSeconds: number;
}

export type AuthAdapterConfig =
  | ({ provider: 'azure-ad-b2c' } & MsalB2cConfig)
  | ({ provider: 'entra-external-id' } & EntraExternalIdConfig)
  | ({ provider: 'custom' } & CustomCredentialConfig);
