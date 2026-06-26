import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATAVERSE_URL: z.string().url(),
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_CLIENT_ID: z.string().min(1),
  AZURE_CLIENT_SECRET: z.string().min(1),
  AZURE_AD_AUDIENCE: z.string().min(1),
  METADATA_CACHE_TTL_SECONDS: z.coerce.number().default(300),
  CORS_ORIGIN: z.string().default('http://localhost:3000').transform((v) => v.split(',').map((s) => s.trim())),
  MOCK_CRM: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SKIP_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  STORAGE_ACCOUNT_NAME: z.string().optional(),
  STORAGE_ACCOUNT_KEY: z.string().optional(),
  STORAGE_CONTAINER_NAME: z.string().default('form-uploads'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DESIGN_CACHE_TTL_SECONDS: z.coerce.number().default(300),
  QDB_CSS_ALLOWED_DOMAINS: z.string().default(''),
  // DFE-ADD-002: maximum operations in a single $batch changeset (Dataverse hard limit is 1000).
  MAX_BATCH_OPERATIONS: z.coerce.number().default(500),
  // DFE-i18n-001: language config cache TTL (60 min default — language list changes rarely).
  LANGUAGE_CONFIG_CACHE_TTL_MS: z.coerce.number().default(3_600_000),
  // DFE-i18n-001: Dataverse translation query timeout.
  TRANSLATION_QUERY_TIMEOUT_MS: z.coerce.number().default(5_000),
  // DFE-i18n-001: per-language form definition cache TTL (5 min default).
  FORM_CACHE_TTL_MS: z.coerce.number().default(300_000),
  // DFE-RC-001: feature flag to serve form JSON from the Dataverse render cache entity.
  USE_RENDER_CACHE: z.string().default('false').transform((v) => v === 'true'),
  // DFE-RC-001: TTL for in-process render cache entries (seconds).
  RENDER_CACHE_TTL_SECONDS: z.coerce.number().default(300),
  // DFE-RC-001: optional Redis URL — when set, RedisRenderCacheStore is used instead of MemoryRenderCacheStore.
  REDIS_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
