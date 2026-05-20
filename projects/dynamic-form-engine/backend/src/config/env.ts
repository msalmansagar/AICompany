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
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
