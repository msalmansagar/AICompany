import { z } from 'zod';

/** Gateway configuration, validated at the process boundary (fail fast on misconfig). */
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  /** Comma-separated caller API keys. Empty in dev = auth disabled (logged as a warning). */
  EDP_GATEWAY_API_KEYS: z.string().default(''),
  /** Requests allowed per caller per window. 0 disables rate limiting. */
  EDP_RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(120),
  /** Rolling window length in seconds. */
  EDP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  DATAVERSE_URL: z.string().url(),
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_CLIENT_ID: z.string().min(1),
  AZURE_CLIENT_SECRET: z.string().min(1),
});

export interface GatewayConfig {
  readonly port: number;
  readonly apiKeys: readonly string[];
  readonly rateLimit: {
    /** Requests per window per caller; 0 disables the limiter entirely. */
    readonly max: number;
    readonly windowSeconds: number;
  };
  readonly dataverse: {
    readonly url: string;
    readonly tenantId: string;
    readonly clientId: string;
    readonly clientSecret: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const parsed = ConfigSchema.parse(env);
  return {
    port: parsed.PORT,
    apiKeys: parsed.EDP_GATEWAY_API_KEYS.split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0),
    rateLimit: {
      max: parsed.EDP_RATE_LIMIT_MAX,
      windowSeconds: parsed.EDP_RATE_LIMIT_WINDOW_SECONDS,
    },
    dataverse: {
      url: parsed.DATAVERSE_URL.replace(/\/$/, ''),
      tenantId: parsed.AZURE_TENANT_ID,
      clientId: parsed.AZURE_CLIENT_ID,
      clientSecret: parsed.AZURE_CLIENT_SECRET,
    },
  };
}
