// RED → GREEN → REFACTOR — RedisTokenCache unit tests
//
// ioredis is mocked — no real Redis connection required.
// Tests verify key naming, TTL selection, SET NX semantics, and SCAN-based deletion.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// ioredis mock — vi.hoisted() ensures the object exists when vi.mock is hoisted
// ---------------------------------------------------------------------------

const { mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    scanStream: vi.fn(),
  };
  return { mockRedis };
});

vi.mock('ioredis', () => ({
  default: vi.fn().mockReturnValue(mockRedis),
}));

// Import after mock is registered
import { RedisTokenCache } from './RedisTokenCache.js';
import type { TokenDefinition, TokenValue } from './TokenTypes.js';
import { TOKEN_LEVEL, TOKEN_TYPE } from './TokenTypes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScanStream(keys: string[]): EventEmitter {
  const stream = new EventEmitter();
  // Emit asynchronously so listeners can be attached before data fires
  setImmediate(() => {
    if (keys.length > 0) stream.emit('data', keys);
    stream.emit('end');
  });
  return stream;
}

function makeDefinition(overrides: Partial<TokenDefinition> = {}): TokenDefinition {
  return {
    id: 'def-0001',
    name: 'Color Primary',
    slug: 'color-primary',
    tokenType: TOKEN_TYPE.COLOR,
    description: null,
    defaultValue: '#1a4d8f',
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeValue(overrides: Partial<TokenValue> = {}): TokenValue {
  return {
    id: 'val-0001',
    definitionId: 'def-0001',
    definitionSlug: 'color-primary',
    level: TOKEN_LEVEL.GLOBAL,
    renderTarget: null,
    category: null,
    componentSlug: null,
    serviceSlug: null,
    locale: null,
    value: '#1a4d8f',
    publishedOn: null,
    publishedBy: null,
    isActive: true,
    createdOn: '2026-01-01T00:00:00Z',
    modifiedOn: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let cache: RedisTokenCache;

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.scanStream.mockReturnValue(makeScanStream([]));
  cache = new RedisTokenCache('redis://localhost:6379');
});

// ---------------------------------------------------------------------------
// getRawDefinitions / setRawDefinitions
// ---------------------------------------------------------------------------

describe('RedisTokenCache.getRawDefinitions', () => {
  it('should_return_null_when_cache_miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cache.getRawDefinitions()).toBeNull();
  });

  it('should_return_parsed_definitions_on_cache_hit', async () => {
    const defs = [makeDefinition()];
    mockRedis.get.mockResolvedValue(JSON.stringify(defs));
    const result = await cache.getRawDefinitions();
    expect(result).toEqual(defs);
  });
});

describe('RedisTokenCache.setRawDefinitions', () => {
  it('should_store_definitions_with_300s_ttl', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await cache.setRawDefinitions([makeDefinition()]);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:raw:definitions',
      expect.any(String),
      'EX',
      300,
    );
  });
});

// ---------------------------------------------------------------------------
// getRawValues / setRawValues
// ---------------------------------------------------------------------------

describe('RedisTokenCache.getRawValues', () => {
  it('should_return_null_on_live_cache_miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cache.getRawValues('live')).toBeNull();
  });

  it('should_return_parsed_values_on_live_cache_hit', async () => {
    const values = [makeValue()];
    mockRedis.get.mockResolvedValue(JSON.stringify(values));
    expect(await cache.getRawValues('live')).toEqual(values);
  });
});

describe('RedisTokenCache.setRawValues', () => {
  it('should_store_live_values_with_300s_ttl', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await cache.setRawValues('live', [makeValue()]);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:raw:values:live',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should_store_draft_values_with_120s_ttl', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await cache.setRawValues('draft', [makeValue()]);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:raw:values:draft',
      expect.any(String),
      'EX',
      120,
    );
  });
});

// ---------------------------------------------------------------------------
// getResolvedMap / setResolvedMap
// ---------------------------------------------------------------------------

describe('RedisTokenCache.getResolvedMap', () => {
  it('should_return_null_on_cache_miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cache.getResolvedMap('live', 'portal:en:_:_:_')).toBeNull();
  });

  it('should_return_parsed_map_on_cache_hit', async () => {
    const map = { 'color-primary': '#1a4d8f' };
    mockRedis.get.mockResolvedValue(JSON.stringify(map));
    expect(await cache.getResolvedMap('live', 'portal:en:_:_:_')).toEqual(map);
  });
});

describe('RedisTokenCache.setResolvedMap', () => {
  it('should_store_live_map_under_token_live_prefix_with_300s_ttl', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await cache.setResolvedMap('live', 'portal:en:_:_:_', { 'color-primary': '#1a4d8f' });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:live:portal:en:_:_:_',
      expect.any(String),
      'EX',
      300,
    );
  });

  it('should_store_draft_map_under_token_draft_prefix_with_120s_ttl', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await cache.setResolvedMap('draft', 'portal:ar:_:_:_', { 'color-primary': '#003e80' });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:draft:portal:ar:_:_:_',
      expect.any(String),
      'EX',
      120,
    );
  });
});

// ---------------------------------------------------------------------------
// getLastPublishedAt / setLastPublishedAt
// ---------------------------------------------------------------------------

describe('RedisTokenCache.getLastPublishedAt', () => {
  it('should_return_null_when_never_published', async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cache.getLastPublishedAt()).toBeNull();
  });

  it('should_return_Date_parsed_from_stored_ISO_string', async () => {
    const iso = '2026-06-21T10:00:00.000Z';
    mockRedis.get.mockResolvedValue(iso);
    const result = await cache.getLastPublishedAt();
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe(iso);
  });
});

describe('RedisTokenCache.setLastPublishedAt', () => {
  it('should_store_ISO_string_without_TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');
    const date = new Date('2026-06-21T10:00:00.000Z');
    await cache.setLastPublishedAt(date);
    // Called with exactly 2 arguments — no EX or TTL
    expect(mockRedis.set).toHaveBeenCalledWith(
      'token:meta:lastPublishedAt',
      '2026-06-21T10:00:00.000Z',
    );
    expect(mockRedis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// acquirePublishLock / releasePublishLock
// ---------------------------------------------------------------------------

describe('RedisTokenCache.acquirePublishLock', () => {
  it('should_return_true_when_SET_NX_returns_OK', async () => {
    mockRedis.set.mockResolvedValue('OK');
    expect(await cache.acquirePublishLock(60)).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith('token:lock:publish', '1', 'NX', 'EX', 60);
  });

  it('should_return_false_when_SET_NX_returns_null_lock_already_held', async () => {
    mockRedis.set.mockResolvedValue(null);
    expect(await cache.acquirePublishLock(60)).toBe(false);
  });
});

describe('RedisTokenCache.releasePublishLock', () => {
  it('should_delete_the_publish_lock_key', async () => {
    mockRedis.del.mockResolvedValue(1);
    await cache.releasePublishLock();
    expect(mockRedis.del).toHaveBeenCalledWith('token:lock:publish');
  });
});

// ---------------------------------------------------------------------------
// flushAllResolvedMaps — SCAN + DEL
// ---------------------------------------------------------------------------

describe('RedisTokenCache.flushAllResolvedMaps', () => {
  it('should_scan_with_token_live_pattern_and_delete_found_keys', async () => {
    const foundKeys = ['token:live:portal:en:_:_:_', 'token:live:admin:en:_:_:_'];
    mockRedis.scanStream.mockReturnValue(makeScanStream(foundKeys));
    mockRedis.del.mockResolvedValue(2);

    await cache.flushAllResolvedMaps('live');

    expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'token:live:*', count: 100 });
    expect(mockRedis.del).toHaveBeenCalledWith(...foundKeys);
  });

  it('should_not_call_del_when_no_keys_match_the_pattern', async () => {
    mockRedis.scanStream.mockReturnValue(makeScanStream([]));

    await cache.flushAllResolvedMaps('live');

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('should_scan_with_token_draft_pattern_for_draft_tier', async () => {
    const foundKeys = ['token:draft:portal:ar:_:_:_'];
    mockRedis.scanStream.mockReturnValue(makeScanStream(foundKeys));
    mockRedis.del.mockResolvedValue(1);

    await cache.flushAllResolvedMaps('draft');

    expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'token:draft:*', count: 100 });
  });
});

// ---------------------------------------------------------------------------
// flushLiveCache / flushDraftCache
// ---------------------------------------------------------------------------

describe('RedisTokenCache.flushLiveCache', () => {
  it('should_delete_live_resolved_maps_and_raw_values_key', async () => {
    const foundKeys = ['token:live:portal:en:_:_:_'];
    mockRedis.scanStream.mockReturnValue(makeScanStream(foundKeys));
    mockRedis.del.mockResolvedValue(1);

    await cache.flushLiveCache();

    expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'token:live:*', count: 100 });
    // del called for both the resolved map key and the raw values key
    expect(mockRedis.del).toHaveBeenCalledTimes(2);
    expect(mockRedis.del).toHaveBeenCalledWith('token:raw:values:live');
  });
});

describe('RedisTokenCache.flushDraftCache', () => {
  it('should_delete_draft_resolved_maps_and_raw_values_key', async () => {
    mockRedis.scanStream.mockReturnValue(makeScanStream([]));
    mockRedis.del.mockResolvedValue(1);

    await cache.flushDraftCache();

    expect(mockRedis.del).toHaveBeenCalledWith('token:raw:values:draft');
  });
});
