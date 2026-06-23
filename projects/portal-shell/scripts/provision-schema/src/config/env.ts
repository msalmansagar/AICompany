import 'dotenv/config';
import { envSchema } from './schema.js';
import type { EnvOutput } from './schema.js';

export type Env = EnvOutput;

// Validated once at module load. Process aborts in Phase 0 if any var is missing.
export const env: Env = envSchema.parse(process.env);
