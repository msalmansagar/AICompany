import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataverseEndpointRegistry } from './DataverseEndpointRegistry.js';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function rows(value: unknown[]) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ value }), text: () => Promise.resolve('') });
}

const SAMPLE = [
  { qdb_endpoint_key: 'hr', qdb_target_url: 'https://hr.example.com/api', qdb_auth_header_name: 'X-Api-Key', qdb_auth_header_value: 'secret', qdb_timeout_ms: 4000, qdb_is_active: true },
  { qdb_endpoint_key: 'off', qdb_target_url: 'https://off.example.com/api', qdb_is_active: false },
  { qdb_endpoint_key: 'insecure', qdb_target_url: 'http://insecure.example.com/api', qdb_is_active: true },
];

describe('DataverseEndpointRegistry', () => {
  let registry: DataverseEndpointRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new DataverseEndpointRegistry(mockAuthService, 60_000);
  });

  it('loads_rows_and_resolves_an_active_key', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    const endpoint = await registry.resolve('hr');
    expect(endpoint?.targetUrl).toBe('https://hr.example.com/api');
    expect(endpoint?.authHeaderValue).toBe('secret');
    expect(endpoint?.timeoutMs).toBe(4000);
  });

  it('returns_null_for_inactive_key', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    expect(await registry.resolve('off')).toBeNull();
  });

  it('returns_null_for_unknown_key', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    expect(await registry.resolve('nope')).toBeNull();
  });

  it('drops_non_https_rows', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    expect(await registry.resolve('insecure')).toBeNull();
  });

  it('activeKeys_excludes_inactive_and_insecure', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    expect(await registry.activeKeys()).toEqual(['hr']);
  });

  it('defaults_timeout_to_5000_when_absent', async () => {
    mockFetch.mockReturnValue(rows([{ qdb_endpoint_key: 'k', qdb_target_url: 'https://a.example.com', qdb_is_active: true }]));
    expect((await registry.resolve('k'))?.timeoutMs).toBe(5000);
  });

  it('caches_the_snapshot_within_ttl', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    await registry.resolve('hr');
    await registry.activeKeys();
    await registry.resolve('hr');
    // One table read serves all three calls while the snapshot is fresh.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('re_reads_after_ttl_expiry', async () => {
    mockFetch.mockReturnValue(rows(SAMPLE));
    const shortTtl = new DataverseEndpointRegistry(mockAuthService, 0);
    await shortTtl.resolve('hr');
    await shortTtl.resolve('hr');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
