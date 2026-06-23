/**
 * ITokenCacheService — abstraction over the dual-cache layer (live / draft)
 * for the DXP-P1-003 Theme Token System.
 *
 * Concrete implementations:
 *  - NodeCacheTokenCache  — in-process NodeCache (dev / test)
 *  - RedisTokenCache      — shared Redis via ioredis (production) — Phase 4b
 *
 * See ADR-003-001 for cache strategy rationale and key naming conventions.
 */

import type { TokenDefinition, TokenValue } from './TokenTypes.js';

export interface ITokenCacheService {
  // ---------------------------------------------------------------------------
  // Raw record store — JSON arrays of Dataverse records
  // ---------------------------------------------------------------------------

  /** Returns all active token definitions from cache, or null on miss. */
  getRawDefinitions(): Promise<TokenDefinition[] | null>;

  /** Stores all active token definitions in cache. */
  setRawDefinitions(definitions: TokenDefinition[]): Promise<void>;

  /**
   * Returns all active token values from the specified cache tier, or null on miss.
   * @param cacheType - 'live' for the published cache; 'draft' for unpublished preview
   */
  getRawValues(cacheType: 'live' | 'draft'): Promise<TokenValue[] | null>;

  /**
   * Stores all active token values in the specified cache tier.
   * @param cacheType - 'live' for the published cache; 'draft' for unpublished preview
   */
  setRawValues(cacheType: 'live' | 'draft', values: TokenValue[]): Promise<void>;

  // ---------------------------------------------------------------------------
  // Resolved context map store — per-context { slug: value } maps
  // ---------------------------------------------------------------------------

  /**
   * Returns a pre-resolved token map for the given context key, or null on miss.
   * @param cacheType  - 'live' | 'draft'
   * @param contextKey - Built by buildContextKey(); 5-part key joined with ':'
   */
  getResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
  ): Promise<Record<string, string> | null>;

  /**
   * Stores a pre-resolved token map for the given context key.
   * @param cacheType  - 'live' | 'draft'
   * @param contextKey - Built by buildContextKey()
   * @param map        - Resolved { slug: cssValue } map
   */
  setResolvedMap(
    cacheType: 'live' | 'draft',
    contextKey: string,
    map: Record<string, string>,
  ): Promise<void>;

  // ---------------------------------------------------------------------------
  // Publish metadata
  // ---------------------------------------------------------------------------

  /** Returns the timestamp of the last successful publish, or null if never published. */
  getLastPublishedAt(): Promise<Date | null>;

  /** Records the timestamp of a successful publish. No TTL — persists until overwritten. */
  setLastPublishedAt(date: Date): Promise<void>;

  // ---------------------------------------------------------------------------
  // Cache invalidation
  // ---------------------------------------------------------------------------

  /** Flushes the live cache (token:live:* resolved maps and live raw values). */
  flushLiveCache(): Promise<void>;

  /** Flushes the draft cache (token:draft:* resolved maps and draft raw values). */
  flushDraftCache(): Promise<void>;

  /**
   * Flushes all resolved context maps for the given cache tier.
   * Raw records are left intact so subsequent resolutions can skip Dataverse.
   */
  flushAllResolvedMaps(cacheType: 'live' | 'draft'): Promise<void>;

  // ---------------------------------------------------------------------------
  // Publish lock — serialises concurrent publish calls (ADR-003-007)
  // ---------------------------------------------------------------------------

  /**
   * Attempts to acquire the publish lock.
   * In Redis: SET NX EX <ttlSeconds>. In NodeCache: boolean flag.
   * @param ttlSeconds - Lock auto-release after this many seconds (Redis only)
   * @returns true if the lock was acquired; false if already held
   */
  acquirePublishLock(ttlSeconds: number): Promise<boolean>;

  /** Releases the publish lock. No-op if the lock is not currently held. */
  releasePublishLock(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Context key helper — exported so routes and the cache implementation share it
// ---------------------------------------------------------------------------

/**
 * Builds the 5-part context key used to address resolved token maps in cache.
 *
 * Uses '_' as a placeholder for null/undefined dimensions so the key is always
 * exactly 5 parts joined with ':'. Example:
 *   "portal:ar:home-finance:widget:hero-banner"
 *   "portal:en:_:_:_"
 */
export function buildContextKey(ctx: {
  renderTarget: string;
  locale?: string | null;
  service?: string | null;
  category?: string | null;
  componentSlug?: string | null;
}): string {
  const parts = [
    ctx.renderTarget,
    ctx.locale ?? '_',
    ctx.service ?? '_',
    ctx.category ?? '_',
    ctx.componentSlug ?? '_',
  ];
  return parts.join(':');
}
