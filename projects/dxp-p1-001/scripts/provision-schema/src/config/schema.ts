import { z } from 'zod';

export const envSchema = z.object({
  DATAVERSE_ORG_URL:    z.string().url(),
  DATAVERSE_CLIENT_ID:  z.string().uuid(),
  DATAVERSE_CLIENT_SECRET: z.string().min(1),
  DATAVERSE_TENANT_ID:  z.string().uuid(),
  LOG_LEVEL:            z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN:              z.enum(['true', 'false', '']).default('false').transform((v) => v === 'true'),
});

export type EnvInput = z.input<typeof envSchema>;
export type EnvOutput = z.output<typeof envSchema>;
