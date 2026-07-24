import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiLookupService } from './ApiLookupService.js';
import { EndpointRegistry } from './EndpointRegistry.js';
import { ValidationError, RateLimitError } from '../utils/errors.js';

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function registry() {
  return new EndpointRegistry(JSON.stringify([
    { endpointKey: 'hr', targetUrl: 'https://hr.example.com/api/employees', authHeaderName: 'X-Api-Key', authHeaderValue: 'secret', timeoutMs: 5000 },
  ]));
}

function service(overrides?: { cacheTtlMs?: number; rateLimitPerMin?: number }) {
  return new ApiLookupService(registry(), {
    cacheTtlMs: overrides?.cacheTtlMs ?? 60_000,
    rateLimitPerMin: overrides?.rateLimitPerMin ?? 30,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const BASE = { valuePath: 'id', labelPath: 'name' } as const;

describe('ApiLookupService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects_unknown_endpoint_key_with_validation_error', async () => {
    await expect(service().search({ endpointKey: 'nope', ...BASE })).rejects.toBeInstanceOf(ValidationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps_value_and_label_paths_and_tags_endpointKey', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]));
    const { results } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([
      { id: '1', displayName: 'Alice', entityLogicalName: 'hr' },
      { id: '2', displayName: 'Bob', entityLogicalName: 'hr' },
    ]);
  });

  it('resolves_dot_notation_paths', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ data: { id: '9' }, profile: { label: 'Zed' } }]));
    const { results } = await service().search({ endpointKey: 'hr', valuePath: 'data.id', labelPath: 'profile.label' });
    expect(results[0]).toEqual({ id: '9', displayName: 'Zed', entityLogicalName: 'hr' });
  });

  it('typeahead_appends_the_search_param_and_auth_header', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    await service().search({ endpointKey: 'hr', ...BASE, search: 'ali', searchParamName: 'q', searchMode: 'typeahead' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('q=ali');
    expect((init as { headers: Record<string, string> }).headers['X-Api-Key']).toBe('secret');
  });

  it('fetchAll_filters_in_memory_by_label_and_caches', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]));
    const svc = service();
    const first = await svc.search({ endpointKey: 'hr', ...BASE, search: 'ali', searchMode: 'fetchAll' });
    expect(first.results).toEqual([{ id: '1', displayName: 'Alice', entityLogicalName: 'hr' }]);
    // Second call is served from cache — fetch not called again.
    await svc.search({ endpointKey: 'hr', ...BASE, search: 'bob', searchMode: 'fetchAll' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('non_2xx_degrades_to_empty_with_warning', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: 'boom' }, 500));
    const { results, warning } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([]);
    expect(warning).toBe('upstream_error');
  });

  it('malformed_json_degrades_to_empty', async () => {
    mockFetch.mockReturnValue(Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) }));
    const { results, warning } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([]);
    expect(warning).toBe('upstream_error');
  });

  it('aborted_request_reports_timeout_warning', async () => {
    mockFetch.mockReturnValue(Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const { results, warning } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([]);
    expect(warning).toBe('timeout');
  });

  it('enforces_the_per_key_rate_limit', async () => {
    mockFetch.mockReturnValue(jsonResponse([]));
    const svc = service({ rateLimitPerMin: 2 });
    await svc.search({ endpointKey: 'hr', ...BASE, formCode: 'f1' });
    await svc.search({ endpointKey: 'hr', ...BASE, formCode: 'f1' });
    await expect(svc.search({ endpointKey: 'hr', ...BASE, formCode: 'f1' })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('extracts_an_array_nested_in_an_object_response', async () => {
    mockFetch.mockReturnValue(jsonResponse({ items: [{ id: '1', name: 'Alice' }] }));
    const { results } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([{ id: '1', displayName: 'Alice', entityLogicalName: 'hr' }]);
  });

  it('skips_items_with_no_resolvable_value', async () => {
    mockFetch.mockReturnValue(jsonResponse([{ name: 'NoId' }, { id: '2', name: 'HasId' }]));
    const { results } = await service().search({ endpointKey: 'hr', ...BASE });
    expect(results).toEqual([{ id: '2', displayName: 'HasId', entityLogicalName: 'hr' }]);
  });
});
