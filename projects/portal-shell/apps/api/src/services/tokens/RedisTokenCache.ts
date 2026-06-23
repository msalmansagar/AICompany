/**
 * RedisTokenCache — shared Redis implementation of ITokenCacheService.
 *
 * Uses ioredis for:
 *  - SCAN-based key pattern deletion (never KEYS — blocks the Redis event loop)
 *  - SET NX EX for distributed publish lock (ADR-003-007)
 *
 * Key naming (all prefixed with 'token:' for namespace isolation):
 *   token:raw:definitions          — active definitions JSON array (TTL: 300s)
 *   token:raw:values:live          — active values JSON array (TTL: 300s)
 *   token:raw:values:draft         — draft values JSON array (TTL: 120s)
 *   token:live:<contextKey>        — resolved map, live tier (TTL: 300s)
 *   token:draft:<contextKey>       — resolved map, draft tier (TTL: 120s)
 *   token:meta:lastPublishedAt     — ISO 8601 string, no TTL
 *   token:lock:publish             — publish lock, TTL set by caller (ADR-003-007)
 *
 * For production: set maxmemory + maxmemory-policy allkeys-lru in Redis config
 * to prevent unbounded key growth (Audit A-003-001, Skeptic Challenge 1).
 */

import Redis from 'ioredis';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type { TokenDefinition, TokenValue } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const PREFIX = 'token:';
const KEY_RAW_DEFINITIONS = `${PREFIX}raw:definitions`;
const KEY_RAW_VALUES_LIVE = `${PREFIX}raw:values:live`;
const KEY_RAW_VALUES_DRAFT = `${PREFIX}raw:values:draft`;
const KEY_LAST_PUBLISHED_AT = `${PREFIX}meta:lastPublishedAt`;
const KEY_PUBLISH_LOCK = `${PREFIX}lock:publish`;

const TTL_LIVE_SECONDS = 300;
const TTL_DRAFT_SECONDS = 120;
const SCAN_BATCH_SIZE = 100;

function resolvedMapKey(cacheType: 'live' | 'draft', contextKey: string): string {
  return `${PREFIX}${cacheType}:${contextKey}`;
}

function resolvedMapPattern(cacheType: 'live' | 'draft'): string {
  return `${PREFIX}${cacheType}:*`;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Shared Redis implementation of ITokenCacheService.
 * Provides distributed lock and pattern-delete semantics for multi-instance deployments.
 */
export class RedisTokenCache implements ITokenCacheService {
  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  // ---------------------------------------------------------------------------
  // Raw record store
  // ---------------------------------------------------------------------------

  async getRawDefinitions(): Promise<TokenDefinition[] | null> {
    const raw = await this.redis.get(KEY_RAW_DEFINITIONS);
    return raw !== null ? (JSON.parse(raw) as TokenDefinition[]) : null;
  }

  async setRawDefinitions(definitions: TokenDefinition[]): Promise<void> {
    await this.redis.set(KEY_RAW_DEFINITIONS, JSON.stringify(definitions), 'EX', TTL_LIVE_SECONDS);
  }

  async getRawValues(cacheType: 'live' | 'draft'): Promise<TokenValue[] | null> {
    const key = cacheType === 'live' ? KEY_RAW_VALUES_LIVE : KEY_RAW_VALUES_DRAFT;
    const raw = await this.redis.get(key);
    return raw !== null ? (JSON.parse(raw) as TokenValue[]) : null;
  }

  async setRawValues(cacheType: 'live' | 'draft', values: TokenValue[]): Promise<void> {
    const key = cacheType === 'live' ? KEY_RAW_VALUES_LIVE : KEY_RAW_VALUES_DRAFT;
    const ttl = cacheType === 'live' ? TTL_LIVE_SECONDS : TTL_DRAFT_SECONDS;
    await this.redis.set(key, JSON.stringify(values), 'EX', ttl);
  }

  // ---------------------------------------------------------------------------
  // Resolved context map store
  // ---------------------------------------------------------------------------

  async getResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
  ): Promise<Record<string, string> | null> {
    const key = resolvedMapKey(cacheType, contextKey);
    const raw = await this.redis.get(key);
    return raw !== null ? (JSON.parse(raw) as Record<string, string>) : null;
  }

  async setResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
    map: Record<string, string>,
  ): Promise<void> {
    const key = resolvedMapKey(cacheType, contextKey);
    const ttl = cacheType === 'live' ? TTL_LIVE_SECONDS : TTL_DRAFT_SECONDS;
    await this.redis.set(key, JSON.stringify(map), 'EX', ttl);
  }

  // ---------------------------------------------------------------------------
  // Publish metadata
  // ---------------------------------------------------------------------------

  async getLastPublishedAt(): Promise<Date | null> {
    const raw = await this.redis.get(KEY_LAST_PUBLISHED_AT);
    return raw !== null ? new Date(raw) : null;
  }

  async setLastPublishedAt(date: Date): Promise<void> {
    // No TTL — publish timestamp must survive cache expiry cycles for rate-limit checks.
    await this.redis.set(KEY_LAST_PUBLISHED_AT, date.toISOString());
  }

  // ---------------------------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------------------------

  async flushLiveCache(): Promise<void> {
    await Promise.all([
      this.deleteByPattern(resolvedMapPattern('live')),
      this.redis.del(KEY_RAW_VALUES_LIVE),
    ]);
  }

  async flushDraftCache(): Promise<void> {
    await Promise.all([
      this.deleteByPattern(resolvedMapPattern('draft')),
      this.redis.del(KEY_RAW_VALUES_DRAFT),
    ]);
  }

  async flushAllResolvedMaps(cacheType: 'live' | 'draft'): Promise<void> {
    await this.deleteByPattern(resolvedMapPattern(cacheType));
  }

  // ---------------------------------------------------------------------------
  // Publish lock — distributed serialisation (ADR-003-007)
  // ---------------------------------------------------------------------------

  async acquirePublishLock(ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(KEY_PUBLISH_LOCK, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }

  async releasePublishLock(): Promise<void> {
    await this.redis.del(KEY_PUBLISH_LOCK);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Gracefully disconnect from Redis. Call on API server shutdown. */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Deletes all keys matching the given glob pattern using SCAN + DEL batches.
   * SCAN is non-blocking (iterates in small steps); never use KEYS in production.
   */
  private async deleteByPattern(pattern: string): Promise<void> {
    const keysToDelete: string[] = [];
    const stream = this.redis.scanStream({ match: pattern, count: SCAN_BATCH_SIZE });

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => keysToDelete.push(...keys));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
    }
  }
}
