/**
 * MetadataCache.test.ts
 * Unit tests for the two-tier cache (memory + sessionStorage).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { MetadataCache } from '../src/services/MetadataCache';

// Minimal in-memory sessionStorage mock
class MockStorage implements Storage {
  private store: Record<string, string> = {};
  get length() { return Object.keys(this.store).length; }
  key(index: number) { return Object.keys(this.store)[index] ?? null; }
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

let storage: MockStorage;
let cache: MetadataCache;

beforeEach(() => {
  storage = new MockStorage();
  cache = new MetadataCache(storage, 'https://test.crm.dynamics.com');
});

describe('MetadataCache', () => {
  it('get_missingKey_returnsNull', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('set_thenGet_returnsValue', () => {
    cache.set('key1', { name: 'test' });
    const result = cache.get<{ name: string }>('key1');
    expect(result?.name).toBe('test');
  });

  it('get_afterInvalidate_returnsNull', () => {
    cache.set('key1', 'value');
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('get_expiredEntry_returnsNull', () => {
    // Set with 1ms TTL (effectively already expired by the time we read)
    cache.set('key1', 'value', -1);
    expect(cache.get('key1')).toBeNull();
  });

  it('set_writesToStorage', () => {
    cache.set('key1', { x: 1 });
    expect(storage.length).toBe(1);
  });

  it('get_readsFromStorageOnMemoryMiss', () => {
    // Populate via storage directly, bypassing memory
    const freshCache = new MetadataCache(storage, 'https://test.crm.dynamics.com');
    cache.set('key1', 'hello');

    // Fresh cache has no memory entry — should read from storage
    const result = freshCache.get<string>('key1');
    expect(result).toBe('hello');
  });

  it('clear_removesAllCacheEntries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });
});
