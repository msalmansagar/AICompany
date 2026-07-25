import type { LookupResult } from '@qdb/shared';
import type { IEndpointRegistry, RegisteredEndpoint } from './EndpointRegistry.js';
import { ValidationError, RateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// DFE-APILOOKUP-001 — resolves an opaque endpointKey against the server-side registry
// and proxies a typeahead/fetchAll call to the external API. The browser never sees the
// URL or credentials; only the endpointKey and the non-sensitive mapping paths cross the
// wire. Any upstream failure degrades to an empty result with a warning — never a 5xx.

export interface ApiLookupParams {
  endpointKey: string;
  search?: string;
  formCode?: string;
  correlationId?: string;
  valuePath: string;
  labelPath: string;
  searchParamName?: string;
  searchMode?: 'typeahead' | 'fetchAll';
  maxResults?: number;
}

export interface ApiLookupOutcome {
  results: LookupResult[];
  warning?: 'timeout' | 'upstream_error' | 'bad_response';
}

interface CacheEntry {
  at: number;
  items: unknown[];
}

const MAX_RESULTS_HARD_CAP = 50;

export class ApiLookupService {
  private readonly fetchAllCache = new Map<string, CacheEntry>();
  private readonly callTimestamps = new Map<string, number[]>();

  constructor(
    private readonly registry: IEndpointRegistry,
    private readonly options: { cacheTtlMs: number; rateLimitPerMin: number },
  ) {}

  async search(params: ApiLookupParams): Promise<ApiLookupOutcome> {
    const endpoint = await this.registry.resolve(params.endpointKey);
    if (!endpoint) {
      logger.warn(
        { endpointKey: params.endpointKey, formCode: params.formCode ?? null },
        'Rejected API lookup — unrecognised endpoint key',
      );
      throw new ValidationError('Unknown lookup endpoint');
    }

    this.enforceRateLimit(params.endpointKey, params.formCode);

    const startedAt = Date.now();
    const mode = params.searchMode ?? 'typeahead';
    const maxResults = clampMaxResults(params.maxResults);

    const outcome =
      mode === 'fetchAll'
        ? await this.searchFetchAll(endpoint, params, maxResults)
        : await this.searchTypeahead(endpoint, params, maxResults);

    logger.info(
      {
        correlationId: params.correlationId ?? null,
        endpointKey: params.endpointKey,
        formCode: params.formCode ?? null,
        durationMs: Date.now() - startedAt,
        resultCount: outcome.results.length,
        searchTermProvided: Boolean(params.search?.trim()),
        warning: outcome.warning ?? null,
      },
      'API lookup proxy call completed',
    );
    return outcome;
  }

  /** Returns the active endpoint keys — safe to expose to the designer. */
  async activeKeys(): Promise<string[]> {
    return this.registry.activeKeys();
  }

  private async searchTypeahead(
    endpoint: RegisteredEndpoint,
    params: ApiLookupParams,
    maxResults: number,
  ): Promise<ApiLookupOutcome> {
    const url = new URL(endpoint.targetUrl);
    if (params.search?.trim() && params.searchParamName) {
      url.searchParams.set(params.searchParamName, params.search.trim());
    }
    const fetched = await this.callExternal(endpoint, url);
    if (fetched.warning) return { results: [], warning: fetched.warning };
    const results = mapItems(fetched.items, params.valuePath, params.labelPath).slice(0, maxResults);
    return { results: withEndpointKey(results, params.endpointKey) };
  }

  private async searchFetchAll(
    endpoint: RegisteredEndpoint,
    params: ApiLookupParams,
    maxResults: number,
  ): Promise<ApiLookupOutcome> {
    const cached = this.readCache(params.endpointKey);
    let items = cached;
    if (!items) {
      const fetched = await this.callExternal(endpoint, new URL(endpoint.targetUrl));
      if (fetched.warning) return { results: [], warning: fetched.warning };
      items = fetched.items;
      this.writeCache(params.endpointKey, items);
    }

    const term = params.search?.trim().toLowerCase();
    const mapped = mapItems(items, params.valuePath, params.labelPath);
    const filtered = term
      ? mapped.filter((r) => r.displayName.toLowerCase().includes(term))
      : mapped;
    return { results: withEndpointKey(filtered.slice(0, maxResults), params.endpointKey) };
  }

  private async callExternal(
    endpoint: RegisteredEndpoint,
    url: URL,
  ): Promise<{ items: unknown[]; warning?: ApiLookupOutcome['warning'] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), endpoint.timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (endpoint.authHeaderName && endpoint.authHeaderValue) {
      headers[endpoint.authHeaderName] = endpoint.authHeaderValue;
    }

    try {
      const response = await fetch(url.toString(), { method: 'GET', headers, signal: controller.signal });
      if (!response.ok) {
        logger.warn({ endpointKey: endpoint.endpointKey, httpStatus: response.status }, 'External lookup returned non-2xx');
        return { items: [], warning: 'upstream_error' };
      }
      const body: unknown = await response.json();
      return { items: extractArray(body) };
    } catch (error) {
      const aborted = (error as { name?: string }).name === 'AbortError';
      logger.warn(
        { endpointKey: endpoint.endpointKey, aborted },
        aborted ? 'External lookup timed out' : 'External lookup failed',
      );
      return { items: [], warning: aborted ? 'timeout' : 'upstream_error' };
    } finally {
      clearTimeout(timer);
    }
  }

  private enforceRateLimit(endpointKey: string, formCode?: string): void {
    const key = `${endpointKey}::${formCode ?? ''}`;
    const now = Date.now();
    const windowStart = now - 60_000;
    const recent = (this.callTimestamps.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.options.rateLimitPerMin) {
      throw new RateLimitError();
    }
    recent.push(now);
    this.callTimestamps.set(key, recent);
  }

  private readCache(endpointKey: string): unknown[] | null {
    const entry = this.fetchAllCache.get(endpointKey);
    if (!entry) return null;
    if (Date.now() - entry.at > this.options.cacheTtlMs) {
      this.fetchAllCache.delete(endpointKey);
      return null;
    }
    return entry.items;
  }

  private writeCache(endpointKey: string, items: unknown[]): void {
    this.fetchAllCache.set(endpointKey, { at: Date.now(), items });
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function clampMaxResults(maxResults?: number): number {
  if (!maxResults || maxResults < 1) return 10;
  return Math.min(maxResults, MAX_RESULTS_HARD_CAP);
}

/** Accept a root JSON array, or an object whose first array-valued property holds the items. */
function extractArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const firstArray = Object.values(body as Record<string, unknown>).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) return firstArray;
  }
  return [];
}

/** Resolve a dot-notation path (e.g. 'address.city') against an item. */
function resolveDotPath(item: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[segment];
    return undefined;
  }, item);
}

function mapItems(items: unknown[], valuePath: string, labelPath: string): LookupResult[] {
  const results: LookupResult[] = [];
  for (const item of items) {
    const value = resolveDotPath(item, valuePath);
    const labelSource = resolveDotPath(item, labelPath);
    const id = value == null ? '' : String(value);
    if (!id) continue;
    results.push({ id, displayName: labelSource == null ? '' : String(labelSource), entityLogicalName: '' });
  }
  return results;
}

function withEndpointKey(results: LookupResult[], endpointKey: string): LookupResult[] {
  return results.map((r) => ({ ...r, entityLogicalName: endpointKey }));
}
