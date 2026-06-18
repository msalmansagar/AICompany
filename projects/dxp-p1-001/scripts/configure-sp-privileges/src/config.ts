import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATAVERSE_ORG_URL: z.string().url(),
  DATAVERSE_TENANT_ID: z.string().min(1),
  DATAVERSE_CLIENT_ID: z.string().min(1),
  DATAVERSE_CLIENT_SECRET: z.string().min(1),
  RUNTIME_SP_CLIENT_ID: z.string().min(1),
  DRY_RUN: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[CONFIG] Missing or invalid environment variables:');
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
}
