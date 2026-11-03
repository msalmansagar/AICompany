import 'dotenv/config';
import { envSchema } from './schema.js';
import type { EnvOutput } from './schema.js';

export type Env = EnvOutput;

export const env: Env = envSchema.parse(process.env);
