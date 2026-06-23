/**
 * NodeCacheTokenCache — in-process implementation of ITokenCacheService.
 *
 * Uses two NodeCache instances to maintain the live/draft separation:
 *  - liveTokenCache  (stdTTL: 300s, checkperiod: 60s)  — serves GET /api/tokens/resolve
 *  - draftTokenCache (stdTTL: 120s, checkperiod: 30s)  — serves admin preview
 *
 * useClones: false — token maps are read-only after resolution; cloning is unnecessary.
 *
 * The publish lock is a module-level boolean flag. In a single-instance dev/test
 * deployment this is sufficient; it does NOT provide distributed lock semantics
 * across multiple API instances (see ADR-003-007 for the Redis alternative).
 *
 * Key naming mirrors the Redis key scheme for consistency:
 *   raw:definitions                — all active definitions
 *   raw:values:live / raw:values:draft
 *   live:<contextKey>              — resolved map, live tier
 *   draft:<contextKey>             — resolved map, draft tier
 *   meta:lastPublishedAt           — ISO 8601 string, no TTL (stored in liveTokenCache)
 */

import NodeCache from 'node-cache';
import type { ITokenCacheService } from './ITokenCacheService.js';
import type { TokenDefinition, TokenValue } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// NodeCache instances — module-level singletons per process
// ---------------------------------------------------------------------------

const liveTokenCache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false });
const draftTokenCache = new NodeCache({ stdTTL: 120, checkperiod: 30, useClones: false });

// ---------------------------------------------------------------------------
// Publish debounce state (ADR-003-007)
// ---------------------------------------------------------------------------

let isPublishing = false;
let lastPublishedAt: Date | null = null;

// ---------------------------------------------------------------------------
// Cache key constants
// ---------------------------------------------------------------------------

const KEY_RAW_DEFINITIONS = 'raw:definitions';
const KEY_RAW_VALUES_LIVE = 'raw:values:live';
const KEY_RAW_VALUES_DRAFT = 'raw:values:draft';
const KEY_LAST_PUBLISHED_AT = 'meta:lastPublishedAt';

function resolvedMapKey(cacheType: 'live' | 'draft', contextKey: string): string {
  return `${cacheType}:${contextKey}`;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-process NodeCache implementation of ITokenCacheService.
 * Suitable for development and test environments.
 * For production multi-instance deployments use RedisTokenCache (Phase 4b).
 */
export class NodeCacheTokenCache implements ITokenCacheService {
  // ---------------------------------------------------------------------------
  // Raw record store
  // ---------------------------------------------------------------------------

  /** Returns all active token definitions from the live cache, or null on miss. */
  async getRawDefinitions(): Promise<TokenDefinition[] | null> {
    return liveTokenCache.get<TokenDefinition[]>(KEY_RAW_DEFINITIONS) ?? null;
  }

  /** Stores all active token definitions in the live cache. */
  async setRawDefinitions(definitions: TokenDefinition[]): Promise<void> {
    liveTokenCache.set(KEY_RAW_DEFINITIONS, definitions);
  }

  /** Returns all active token values for the specified cache tier, or null on miss. */
  async getRawValues(cacheType: 'live' | 'draft'): Promise<TokenValue[] | null> {
    const key = cacheType === 'live' ? KEY_RAW_VALUES_LIVE : KEY_RAW_VALUES_DRAFT;
    const cache = cacheType === 'live' ? liveTokenCache : draftTokenCache;
    return cache.get<TokenValue[]>(key) ?? null;
  }

  /** Stores all active token values in the specified cache tier. */
  async setRawValues(cacheType: 'live' | 'draft', values: TokenValue[]): Promise<void> {
    const key = cacheType === 'live' ? KEY_RAW_VALUES_LIVE : KEY_RAW_VALUES_DRAFT;
    const cache = cacheType === 'live' ? liveTokenCache : draftTokenCache;
    cache.set(key, values);
  }

  // ---------------------------------------------------------------------------
  // Resolved context map store
  // ---------------------------------------------------------------------------

  /** Returns a pre-resolved token map for the given context key, or null on miss. */
  async getResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
  ): Promise<Record<string, string> | null> {
    const key = resolvedMapKey(cacheType, contextKey);
    const cache = cacheType === 'live' ? liveTokenCache : draftTokenCache;
    return cache.get<Record<string, string>>(key) ?? null;
  }

  /** Stores a pre-resolved token map for the given context key. */
  async setResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
    map: Record<string, string>,
  ): Promise<void> {
    const key = resolvedMapKey(cacheType, contextKey);
    const cache = cacheType === 'live' ? liveTokenCache : draftTokenCache;
    cache.set(key, map);
  }

  // ---------------------------------------------------------------------------
  // Publish metadata
  // ---------------------------------------------------------------------------

  /** Returns the timestamp of the last successful publish, or null if never published. */
  async getLastPublishedAt(): Promise<Date | null> {
    return lastPublishedAt;
  }

  /** Records the timestamp of a successful publish. */
  async setLastPublishedAt(date: Date): Promise<void> {
    lastPublishedAt = date;
    // Also persist in liveTokenCache so external code can query it if needed.
    liveTokenCache.set(KEY_LAST_PUBLISHED_AT, date.toISOString(), 0);
  }

  // ---------------------------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------------------------

  /** Flushes the entire live cache (all raw and resolved live entries). */
  async flushLiveCache(): Promise<void> {
    liveTokenCache.flushAll();
  }

  /** Flushes the entire draft cache (all raw and resolved draft entries). */
  async flushDraftCache(): Promise<void> {
    draftTokenCache.flushAll();
  }

  /**
   * Flushes all resolved context maps for the given tier without touching raw records.
   * Simulates Redis pattern-delete by iterating keys and filtering by prefix.
   */
  async flushAllResolvedMaps(cacheType: 'live' | 'draft'): Promise<void> {
    const cache = cacheType === 'live' ? liveTokenCache : draftTokenCache;
    const prefix = `${cacheType}:`;
    const keysToDelete = cache.keys().filter((k) => k.startsWith(prefix));
    cache.del(keysToDelete);
  }

  // ---------------------------------------------------------------------------
  // Publish lock (ADR-003-007)
  // ---------------------------------------------------------------------------

  /**
   * Attempts to acquire the publish lock.
   * @param _ttlSeconds - Ignored in NodeCache impl; included for interface compatibility
   * @returns true if the lock was acquired; false if already held
   */
  async acquirePublishLock(_ttlSeconds: number): Promise<boolean> {
    if (isPublishing) return false;
    isPublishing = true;
    return true;
  }

  /** Releases the publish lock. */
  async releasePublishLock(): Promise<void> {
    isPublishing = false;
  }
}
