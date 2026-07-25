import { CrmBaseService } from './CrmBaseService.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { IEndpointRegistry, RegisteredEndpoint } from './EndpointRegistry.js';
import { logger } from '../utils/logger.js';

// DFE-APILOOKUP-001 — endpoint registry backed by the qdb_lookupendpoint Dataverse
// table (admin-managed via the normal UI, restricted by security roles). The table is
// read on every proxy call, so a short-lived snapshot is cached to avoid hammering
// Dataverse. URLs/credentials live only server-side — they are never returned to the UI.

interface RawEndpoint {
  qdb_endpoint_key?: string;
  qdb_target_url?: string;
  qdb_auth_header_name?: string;
  qdb_auth_header_value?: string;
  qdb_timeout_ms?: number;
  qdb_is_active?: boolean;
}

const SELECT =
  'qdb_endpoint_key,qdb_target_url,qdb_auth_header_name,qdb_auth_header_value,qdb_timeout_ms,qdb_is_active';
const DEFAULT_TIMEOUT_MS = 5_000;

export class DataverseEndpointRegistry extends CrmBaseService implements IEndpointRegistry {
  private snapshot: { at: number; byKey: Map<string, RegisteredEndpoint> } | null = null;

  constructor(authService: CrmAuthService, private readonly cacheTtlMs: number) {
    super(authService);
  }

  async resolve(endpointKey: string): Promise<RegisteredEndpoint | null> {
    const byKey = await this.freshSnapshot();
    const entry = byKey.get(endpointKey);
    return entry && entry.isActive ? entry : null;
  }

  async activeKeys(): Promise<string[]> {
    const byKey = await this.freshSnapshot();
    return [...byKey.values()].filter((e) => e.isActive).map((e) => e.endpointKey);
  }

  private async freshSnapshot(): Promise<Map<string, RegisteredEndpoint>> {
    if (this.snapshot && Date.now() - this.snapshot.at < this.cacheTtlMs) {
      return this.snapshot.byKey;
    }
    const byKey = await this.load();
    this.snapshot = { at: Date.now(), byKey };
    return byKey;
  }

  private async load(): Promise<Map<string, RegisteredEndpoint>> {
    const map = new Map<string, RegisteredEndpoint>();
    const response = await this.crmFetch<{ value: RawEndpoint[] }>(`/qdb_lookupendpoints?$select=${SELECT}`);
    for (const row of response.value) {
      const endpoint = toEndpoint(row);
      if (endpoint) map.set(endpoint.endpointKey, endpoint);
    }
    logger.info({ count: map.size }, 'Endpoint registry loaded from Dataverse');
    return map;
  }
}

/** Map a Dataverse row to a validated endpoint. Rows without a key or an HTTPS URL are dropped. */
function toEndpoint(row: RawEndpoint): RegisteredEndpoint | null {
  const targetUrl = row.qdb_target_url ?? '';
  if (!row.qdb_endpoint_key || !targetUrl.startsWith('https://')) {
    logger.warn({ endpointKey: row.qdb_endpoint_key ?? null }, 'Skipping registry row — missing key or non-HTTPS URL');
    return null;
  }
  return {
    endpointKey: row.qdb_endpoint_key,
    targetUrl,
    httpMethod: 'GET',
    authHeaderName: row.qdb_auth_header_name || undefined,
    authHeaderValue: row.qdb_auth_header_value || undefined,
    timeoutMs: row.qdb_timeout_ms ?? DEFAULT_TIMEOUT_MS,
    isActive: row.qdb_is_active ?? true,
  };
}
