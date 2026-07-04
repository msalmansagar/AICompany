// AllowlistService — fetches and caches the qdb_css_allowlist_config record from Dataverse.
// Used by the FormStylePanel to validate custom CSS domain rules at authoring time.
// Imports all attribute names from the registry — no inline string literals.

import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { CSS_ALLOWLIST_CONFIG_ATTRS } from '@/constants/styleAttributeNames';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AllowlistConfig {
  readonly configKey: string;
  readonly allowedDomainsJson: string;
  readonly isActive: boolean;
}

/**
 * Minimal logging abstraction. The designer runs as a CRM web resource where
 * pino/winston are unavailable, so production wires a no-op or telemetry sink.
 * Never pass raw error objects/stack traces — pass structured context only.
 */
export interface ILogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/** Default sink: discards messages so committed code carries no console.* calls. */
export const NOOP_LOGGER: ILogger = { warn: () => { /* no-op */ } };

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The single well-known config key for the global domain allowlist.
 * Only one record with this key should exist in Dataverse.
 */
const GLOBAL_CONFIG_KEY = 'global' as const;

/**
 * Returned when no qdb_css_allowlist_config record is found.
 * Safe default: no domains allowed, active flag off.
 * This prevents accidental permissive behaviour on a misconfigured environment.
 */
const SAFE_DEFAULT_CONFIG: AllowlistConfig = {
  configKey: GLOBAL_CONFIG_KEY,
  allowedDomainsJson: '[]',
  isActive: false,
} as const;

// ─── AllowlistService ─────────────────────────────────────────────────────────

/**
 * Session-scoped cache of the CSS domain allowlist.
 * Re-fetch only on explicit invalidateCache() call.
 */
export class AllowlistService {
  private cachedConfig: AllowlistConfig | null = null;

  constructor(
    private readonly webApi: IWebApiAdapter,
    private readonly logger: ILogger = NOOP_LOGGER,
  ) {}

  /**
   * Returns the cached allowlist config, or fetches it from Dataverse on first call.
   * If no record exists, returns SAFE_DEFAULT_CONFIG and logs a warning.
   */
  async fetchAllowlist(): Promise<AllowlistConfig> {
    if (this.cachedConfig !== null) {
      return this.cachedConfig;
    }

    const config = await this.loadFromDataverse();
    this.cachedConfig = config;
    return config;
  }

  /**
   * Clears the session cache so the next fetchAllowlist() call re-queries Dataverse.
   * Call this after an admin saves changes to qdb_css_allowlist_config.
   */
  invalidateCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Returns true if the given URL's hostname (or any parent domain) is in the allowlist.
   * Returns false if the cache has not been populated yet — call fetchAllowlist() first.
   *
   * Example: if allowlist contains "googleapis.com", then
   * "https://fonts.googleapis.com/css2?family=Inter" returns true.
   */
  isUrlAllowed(url: string): boolean {
    if (this.cachedConfig === null) {
      return false;
    }
    return evaluateUrlAgainstConfig(url, this.cachedConfig);
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async loadFromDataverse(): Promise<AllowlistConfig> {
    const select = [
      CSS_ALLOWLIST_CONFIG_ATTRS.CONFIG_KEY,
      CSS_ALLOWLIST_CONFIG_ATTRS.ALLOWED_DOMAINS_JSON,
      CSS_ALLOWLIST_CONFIG_ATTRS.IS_ACTIVE,
    ].join(',');

    const filter =
      `${CSS_ALLOWLIST_CONFIG_ATTRS.CONFIG_KEY} eq '${GLOBAL_CONFIG_KEY}'`;

    let result: { entities: Record<string, unknown>[] };
    try {
      result = await this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.CSS_ALLOWLIST_CONFIG,
        `?$select=${select}&$filter=${filter}&$top=1`,
      );
    } catch {
      // SC-07 FAIL-SAFE: on any Dataverse fetch failure, return the safe default
      // (empty allowlist) so all url()/fontUrl references are stripped rather than allowed.
      // The raw error is intentionally not logged (avoids Dataverse stack-trace disclosure).
      this.logger.warn(
        'AllowlistService: qdb_css_allowlist_config fetch failed — SC-07 fail-safe applied (no domains allowed).',
        { operation: 'loadFromDataverse', outcome: 'fetch-failed' },
      );
      return SAFE_DEFAULT_CONFIG;
    }

    if (result.entities.length === 0) {
      this.logger.warn(
        'AllowlistService: no qdb_css_allowlist_config record for the global key — safe default applied (seed the record in Dataverse).',
        { operation: 'loadFromDataverse', outcome: 'no-record' },
      );
      return SAFE_DEFAULT_CONFIG;
    }

    return mapRecordToConfig(result.entities[0]);
  }
}

// ─── Module-level helpers (pure functions, no side effects) ───────────────────

function mapRecordToConfig(record: Record<string, unknown>): AllowlistConfig {
  return {
    configKey: String(record[CSS_ALLOWLIST_CONFIG_ATTRS.CONFIG_KEY] ?? GLOBAL_CONFIG_KEY),
    allowedDomainsJson: String(record[CSS_ALLOWLIST_CONFIG_ATTRS.ALLOWED_DOMAINS_JSON] ?? '[]'),
    isActive: Boolean(record[CSS_ALLOWLIST_CONFIG_ATTRS.IS_ACTIVE] ?? false),
  };
}

function evaluateUrlAgainstConfig(url: string, config: AllowlistConfig): boolean {
  if (!config.isActive) {
    return false;
  }

  const allowedDomains = parseAllowedDomains(config.allowedDomainsJson);
  if (allowedDomains === null) {
    return false;
  }

  const hostname = extractHostname(url);
  if (hostname === null) {
    return false;
  }

  return isDomainOrParentAllowed(hostname, allowedDomains);
}

/**
 * Parses the JSON array of domain strings.
 * Returns null on malformed JSON (rather than throwing) so the caller can
 * treat it as an empty allowlist rather than crashing.
 */
function parseAllowedDomains(domainsJson: string): readonly string[] | null {
  try {
    const parsed = JSON.parse(domainsJson) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
  } catch {
    return null;
  }
}

/**
 * Extracts the hostname from a URL string.
 * Returns null if the URL is malformed (URL constructor throws).
 */
function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns true if the hostname exactly matches an allowed domain or is a subdomain of one.
 * e.g. "fonts.googleapis.com" is allowed when "googleapis.com" is in the list.
 */
function isDomainOrParentAllowed(
  hostname: string,
  allowedDomains: readonly string[],
): boolean {
  return allowedDomains.some(
    (allowedDomain) =>
      hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`),
  );
}
