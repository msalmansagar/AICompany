import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRenderCacheStore } from './RenderCacheStore.js';

// ── MemoryRenderCacheStore ────────────────────────────────────────────────────

describe('MemoryRenderCacheStore', () => {
  let store: MemoryRenderCacheStore;

  beforeEach(() => {
    store = new MemoryRenderCacheStore(100, 300);
  });

  it('get_whenKeyNotFound_returnsNull', async () => {
    const result = await store.get('missing-key');
    expect(result).toBeNull();
  });

  it('get_afterSet_returnsStoredValue', async () => {
    await store.set('form-a:1:en', '{"id":"form-a"}', 300);
    const result = await store.get('form-a:1:en');
    expect(result).toBe('{"id":"form-a"}');
  });

  it('get_afterTtlExpiry_returnsNull', async () => {
    // Set with a 1-second store TTL but override per-entry TTL to 1ms
    // so it has effectively already expired by the time we read it back.
    // LRUCache v10: entries with ttl < Date.now() difference are purged on next get.
    const shortStore = new MemoryRenderCacheStore(100, 300);
    // Manually set via the public API with a 1ms TTL
    await shortStore.set('form-a:1:en', '{"id":"form-a"}', 0.001);
    // Wait 5ms to ensure the TTL window has passed
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await shortStore.get('form-a:1:en');
    expect(result).toBeNull();
  });

  it('invalidate_removesAllKeysForFormCode', async () => {
    await store.set('form-a:1:en', 'v1-en', 300);
    await store.set('form-a:1:ar', 'v1-ar', 300);
    await store.set('form-a:2:en', 'v2-en', 300);

    await store.invalidate('form-a');

    expect(await store.get('form-a:1:en')).toBeNull();
    expect(await store.get('form-a:1:ar')).toBeNull();
    expect(await store.get('form-a:2:en')).toBeNull();
  });

  it('invalidate_doesNotRemoveOtherFormCodes', async () => {
    await store.set('form-a:1:en', 'form-a-value', 300);
    await store.set('form-b:1:en', 'form-b-value', 300);

    await store.invalidate('form-a');

    expect(await store.get('form-b:1:en')).toBe('form-b-value');
  });

  it('set_overwritesExistingValue', async () => {
    await store.set('form-a:1:en', 'old-value', 300);
    await store.set('form-a:1:en', 'new-value', 300);
    const result = await store.get('form-a:1:en');
    expect(result).toBe('new-value');
  });
});
