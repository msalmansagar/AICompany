/**
 * createTokenCacheService — factory that selects the appropriate ITokenCacheService
 * implementation based on environment configuration (ADR-003-001).
 *
 * Production (REDIS_URL set):  RedisTokenCache  — distributed lock + SCAN delete
 * Development / test:          NodeCacheTokenCache — in-process, single-instance
 */

import type { ITokenCacheService } from './ITokenCacheService.js';
import { NodeCacheTokenCache } from './NodeCacheTokenCache.js';
import { RedisTokenCache } from './RedisTokenCache.js';

/**
 * Creates and returns the appropriate token cache service implementation.
 *
 * @param redisUrl - Value of the REDIS_URL environment variable (may be undefined)
 */
export function createTokenCacheService(redisUrl: string | undefined): ITokenCacheService {
  if (redisUrl !== undefined) {
    return new RedisTokenCache(redisUrl);
  }

  return new NodeCacheTokenCache();
}
