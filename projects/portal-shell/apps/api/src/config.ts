import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment variable schema — validated at startup, never read raw in code
// ---------------------------------------------------------------------------

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATAVERSE_URL: z.string().url(),
  TENANT_ID: z.string().uuid(),
  CLIENT_ID: z.string().uuid(),
  CLIENT_SECRET: z.string().min(1),

  JWT_SECRET: z.string().min(32),

  AUTH_PROVIDER: z.enum(['azure-ad-b2c', 'entra-external-id', 'custom']).default('custom'),
  B2C_TENANT_NAME: z.string().default(''),
  B2C_POLICY_NAME: z.string().default(''),
  ENTRA_TENANT_ID: z.string().default(''),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CACHE_TTL_PORTAL_CONFIG: z.coerce.number().int().min(10).default(300),
  NOTIFICATION_POLL_INTERVAL_DEFAULT: z.coerce.number().int().min(10).max(120).default(30),

  // Token lifetimes — configurable so they can be shortened during an incident
  // without a code deployment (A-004 audit fix)
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2592000).default(86400),
  RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),

  // DXP-P1-003: Theme Token System (ADR-003-001, ADR-003-006, ADR-003-007)
  REDIS_URL: z.string().url().optional(),
  TOKEN_DEFINITION_SOFT_LIMIT: z.coerce.number().int().default(200),
  TOKEN_PUBLISH_MIN_INTERVAL_MS: z.coerce.number().int().default(10000),
});

export type AppConfig = z.infer<typeof EnvironmentSchema>;

/**
 * Parses and validates all required environment variables.
 * Throws a descriptive ZodError on startup if any are missing or invalid —
 * fail fast rather than fail later with cryptic runtime errors.
 */
export function loadConfig(): AppConfig {
  const result = EnvironmentSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return result.data;
}
