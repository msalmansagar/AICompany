import { LRUCache } from 'lru-cache';

// IRenderCacheStore — abstraction over in-process and distributed caches.
// Key convention: `${formCode}:${version}:${lang}` where version may be 'latest'.
export interface IRenderCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Remove all entries whose key starts with `${formCode}:`. */
  invalidate(formCode: string): Promise<void>;
}

// ── MemoryRenderCacheStore ────────────────────────────────────────────────────

export class MemoryRenderCacheStore implements IRenderCacheStore {
  private readonly lru: LRUCache<string, string>;

  constructor(maxEntries: number, ttlSeconds: number) {
    this.lru = new LRUCache<string, string>({
      max: maxEntries,
      // LRUCache v10 uses milliseconds for ttl
      ttl: ttlSeconds * 1000,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.lru.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.lru.set(key, value, { ttl: ttlSeconds * 1000 });
  }

  async invalidate(formCode: string): Promise<void> {
    const prefix = `${formCode}:`;
    for (const key of this.lru.keys()) {
      if (key.startsWith(prefix)) {
        this.lru.delete(key);
      }
    }
  }
}

// ── RedisRenderCacheStore ─────────────────────────────────────────────────────
// ioredis is an optional peer dependency.  The dynamic import guard keeps the
// backend bootable in environments where ioredis is not installed.

export class RedisRenderCacheStore implements IRenderCacheStore {
  // Typed as `unknown` here; narrowed after async init via connect().
  private client: RedisClient | null = null;
  private readonly redisUrl: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  /** Must be called once before any cache operations. */
  async connect(): Promise<void> {
    let Redis: RedisConstructor;
    try {
      // Use a runtime-only import path so TypeScript does not attempt to resolve
      // the ioredis module at compile time — it is an optional peer dependency.
      const moduleName = 'ioredis';
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const mod = await (new Function('m', 'return import(m)')(moduleName) as Promise<{ default?: RedisConstructor } & RedisConstructor>);
      Redis = (mod.default ?? mod) as RedisConstructor;
    } catch {
      throw new Error(
        'ioredis is required for RedisRenderCacheStore — install ioredis: npm i ioredis',
      );
    }
    this.client = new Redis(this.redisUrl) as RedisClient;
  }

  async get(key: string): Promise<string | null> {
    const c = this.requireClient();
    return c.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const c = this.requireClient();
    await c.set(key, value, 'EX', ttlSeconds);
  }

  async invalidate(formCode: string): Promise<void> {
    const c = this.requireClient();
    const pattern = `${formCode}:*`;
    const keysToDelete: string[] = [];

    let cursor = '0';
    do {
      const [nextCursor, keys] = await c.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await c.del(...keysToDelete);
    }
  }

  private requireClient(): RedisClient {
    if (!this.client) {
      throw new Error('RedisRenderCacheStore.connect() must be called before use');
    }
    return this.client;
  }
}

// ── Minimal structural types for ioredis (avoids @types/ioredis hard dep) ────

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, flag: 'EX', ttl: number): Promise<unknown>;
  scan(cursor: string, matchFlag: 'MATCH', pattern: string, countFlag: 'COUNT', count: number): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
}

type RedisConstructor = new (url: string) => RedisClient;

// ── Factory ───────────────────────────────────────────────────────────────────

const MAX_MEMORY_ENTRIES = 500;

/**
 * Resolves the correct store implementation from environment.
 * When `redisUrl` is provided, returns a connected `RedisRenderCacheStore`.
 * Otherwise returns a `MemoryRenderCacheStore` (on-prem / dev default).
 */
export async function createRenderCacheStore(
  ttlSeconds: number,
  redisUrl?: string,
): Promise<IRenderCacheStore> {
  if (redisUrl) {
    const store = new RedisRenderCacheStore(redisUrl);
    await store.connect();
    return store;
  }
  return new MemoryRenderCacheStore(MAX_MEMORY_ENTRIES, ttlSeconds);
}
