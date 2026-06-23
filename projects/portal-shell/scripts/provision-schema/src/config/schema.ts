import { z } from 'zod';

export const envSchema = z
  .object({
    DATAVERSE_ORG_URL: z.string().url(),
    DATAVERSE_CLIENT_ID: z.string().uuid(),
    DATAVERSE_CLIENT_SECRET: z.string().min(1),
    DATAVERSE_TENANT_ID: z.string().uuid(),
    SEED_TEST_USER_PASSWORD: z.string().min(12).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DRY_RUN: z.coerce.boolean().default(false),
  })
  .refine(
    (data) => data.DRY_RUN === true || data.SEED_TEST_USER_PASSWORD !== undefined,
    {
      message:
        'SEED_TEST_USER_PASSWORD is required when DRY_RUN=false. ' +
        'Set a strong password (min 12 chars) or set DRY_RUN=true to skip seeding.',
      path: ['SEED_TEST_USER_PASSWORD'],
    },
  );

export type EnvInput = z.input<typeof envSchema>;
export type EnvOutput = z.output<typeof envSchema>;
