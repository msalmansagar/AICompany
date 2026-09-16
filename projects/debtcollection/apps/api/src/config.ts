import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment variable schema — all env is validated at startup, never read
// raw in service code (Article VII; BE preferred approach).
// ---------------------------------------------------------------------------

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3100),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // HL org (Housing Loan CRM) — mandatory
  DV_DATAVERSE_URL: z.string().url(),
  DV_TENANT_ID: z.string().min(1),
  DV_CLIENT_ID: z.string().min(1),
  DV_CLIENT_SECRET: z.string().min(1),
  /** OAuth2 scope for the HL CRM resource. */
  DV_SCOPE: z.string().min(1).default('https://hl-crm/.default'),

  // BFD org (BFD CRM) — optional, guarded by FEATURE_BFD
  FEATURE_BFD: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
  DV_BFD_DATAVERSE_URL: z.string().url().optional(),
  DV_BFD_TENANT_ID: z.string().optional(),
  DV_BFD_CLIENT_ID: z.string().optional(),
  DV_BFD_CLIENT_SECRET: z.string().optional(),
  DV_BFD_SCOPE: z.string().optional(),

  // Auth — OIDC issuer used by BOTH user-token validation and service tokens
  AUTH_PROVIDER: z.enum(['adfs', 'azure-ad']).default('adfs'),
  AUTH_ISSUER_URL: z.string().url(),
  /**
   * Expected audience claim in user bearer tokens (aud). When set, jwtVerify
   * rejects tokens whose aud does not match — prevents tokens minted for a
   * different relying party from being accepted (security hardening).
   * Required in production; optional to ease local testing without a real IdP.
   */
  AUTH_AUDIENCE: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parses and validates all environment variables at startup.
 * Throws a descriptive error on missing or malformed values — fail fast,
 * not with a cryptic runtime TypeError ten minutes later.
 */
export function loadConfig(): AppConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
