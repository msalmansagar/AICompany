/**
 * createTokenCacheService — factory that selects the appropriate ITokenCacheService
 * implementation based on environment configuration (ADR-003-001).
 *
 * Production (REDIS_URL set):  RedisTokenCache  — NOT YET IMPLEMENTED (Phase 4b)
 * Development / test:          NodeCacheTokenCache
 *
 * RedisTokenCache (Phase 4b):
 *   Will use ioredis with SCAN-based pattern delete. ioredis is not yet a
 *   project dependency — it must be added (npm install ioredis) and a
 *   RedisTokenCache class created before REDIS_URL is set in production.
 *   Until then, setting REDIS_URL will throw a descriptive startup error.
 */

import type { ITokenCacheService } from './ITokenCacheService.js';
import { NodeCacheTokenCache } from './NodeCacheTokenCache.js';

/**
 * Creates and returns the appropriate token cache service implementation.
 *
 * @param redisUrl - Value of the REDIS_URL environment variable (may be undefined)
 * @throws Error if REDIS_URL is set (RedisTokenCache not yet implemented)
 */
export function createTokenCacheService(redisUrl: string | undefined): ITokenCacheService {
  if (redisUrl !== undefined) {
    // Phase 4b: implement RedisTokenCache using ioredis before setting REDIS_URL.
    // The Redis implementation requires:
    //   - npm install ioredis
    //   - src/services/tokens/RedisTokenCache.ts (implements ITokenCacheService)
    //   - SCAN + DEL for pattern-based cache invalidation (never KEYS — blocks event loop)
    //   - SET NX EX for distributed publish lock
    throw new Error(
      'Redis cache not yet implemented — set REDIS_URL absent to use NodeCache in dev',
    );
  }

  return new NodeCacheTokenCache();
}
