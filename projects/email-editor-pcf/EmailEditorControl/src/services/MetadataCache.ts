/**
 * MetadataCache.ts
 * Two-tier cache: in-memory LRU (hot) + sessionStorage (warm, 30-min TTL).
 * Keyed by "maqsad.emaileditor.v1.<orgHash>.<key>" to isolate across envs.
 */

const SESSION_KEY_PREFIX = 'maqsad.emaileditor.v1';
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 200;

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class MetadataCache {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private readonly orgHash: string;

  public constructor(
    private readonly storage: Storage,
    orgUrl: string = ''
  ) {
    this.orgHash = this.hashString(orgUrl);
  }

  public get<T>(key: string): T | null {
    const now = Date.now();

    // Memory layer first
    const memEntry = this.memory.get(key) as CacheEntry<T> | undefined;
    if (memEntry) {
      if (memEntry.expiresAt > now) return memEntry.value;
      this.memory.delete(key);
    }

    // Session storage fallback
    const sessionValue = this.readFromStorage<T>(key);
    if (sessionValue !== null) {
      this.writeToMemory(key, sessionValue, DEFAULT_TTL_MS);
      return sessionValue;
    }

    return null;
  }

  public set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    this.writeToMemory(key, value, ttlMs);
    this.writeToStorage(key, value, ttlMs);
  }

  public invalidate(key: string): void {
    this.memory.delete(key);
    try {
      this.storage.removeItem(this.storageKey(key));
    } catch {
      // Storage may be unavailable in some embedded contexts
    }
  }

  public clear(): void {
    this.memory.clear();
    // Only clear keys belonging to this instance
    const prefix = this.storageKey('');
    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => this.storage.removeItem(k));
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private writeToMemory<T>(key: string, value: T, ttlMs: number): void {
    if (this.memory.size >= MAX_MEMORY_ENTRIES) {
      // Evict the oldest entry (Map preserves insertion order)
      const firstKey = this.memory.keys().next().value;
      if (firstKey !== undefined) this.memory.delete(firstKey);
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private writeToStorage<T>(key: string, value: T, ttlMs: number): void {
    try {
      const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
      this.storage.setItem(this.storageKey(key), JSON.stringify(entry));
    } catch {
      // Quota exceeded or storage unavailable — memory cache is still warm
    }
  }

  private readFromStorage<T>(key: string): T | null {
    try {
      const raw = this.storage.getItem(this.storageKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt <= Date.now()) {
        this.storage.removeItem(this.storageKey(key));
        return null;
      }
      return entry.value;
    } catch {
      return null;
    }
  }

  private storageKey(key: string): string {
    return `${SESSION_KEY_PREFIX}.${this.orgHash}.${key}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}
