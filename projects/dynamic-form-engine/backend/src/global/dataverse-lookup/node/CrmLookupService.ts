/**
 * Node reference implementation of the canonical lookup contract.
 * MSS Technologies global library — server/backend runtime.
 *
 * Adapted from DFE's CrmLookupService (multi-column, language-aware search) and
 * ApiLookupService. Reads the Web API with a bearer token from the caller's
 * token provider — this package does NOT acquire tokens or hold a secret.
 *
 * Option-set resolution is delegated to a DataverseMetadataService instance
 * (composition), so option codes are read from metadata (100000000-based),
 * never re-derived here.
 */

import {
  DataverseLookupService,
  EntityLookupQuery,
  LookupColumn,
  LookupOption,
  LookupError,
} from '../contract.js';

/** The token getter the caller injects — never a secret, just a token. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

/** The subset of @mss/dataverse-metadata this service composes with. */
export interface OptionSetResolver {
  getOptions(
    entity: string,
    attribute: string,
  ): Promise<readonly { value: number; label: string }[]>;
}

/**
 * Which records count as "active" per entity. Most entities use `statecode eq 0`;
 * some system entities use a different flag (systemuser → `isdisabled eq false`)
 * or have none (team). A `null` value means no active filter for that entity.
 */
export interface ActiveRecordPolicy {
  /** Applied to entities not named in `overrides`. Default `statecode eq 0`. */
  default?: string | null;
  /** Per-entity overrides; `null` disables the filter for that entity. */
  overrides?: Record<string, string | null>;
}

/** Platform default: statecode for most, isdisabled for systemuser, none for team. */
const DEFAULT_ACTIVE_POLICY: Required<ActiveRecordPolicy> = {
  default: 'statecode eq 0',
  overrides: { systemuser: 'isdisabled eq false', team: null },
};

export interface CrmLookupServiceOptions {
  dataverseUrl: string;
  tokenProvider: TokenProvider;
  /** Injected @mss/dataverse-metadata service. Required only if searchOptionSet is used. */
  metadata?: OptionSetResolver;
  /** Hard ceiling on results regardless of query.maxResults. Default 50. */
  maxResultsCeiling?: number;
  /** Active-record filtering. Omit for the platform default; pass `{ default: null }` to disable. */
  activeRecords?: ActiveRecordPolicy;
}

const API_VERSION = 'v9.2';
const DEFAULT_MAX = 20;

export class CrmLookupService implements DataverseLookupService {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly metadata: OptionSetResolver | undefined;
  private readonly ceiling: number;
  private readonly activePolicy: Required<ActiveRecordPolicy>;

  /** Entity-set names resolved from metadata, cached for the life of the process. */
  private readonly entitySetNames = new Map<string, string>();

  constructor(options: CrmLookupServiceOptions) {
    this.baseUrl = `${options.dataverseUrl}/api/data/${API_VERSION}`;
    this.tokenProvider = options.tokenProvider;
    this.metadata = options.metadata;
    this.ceiling = options.maxResultsCeiling ?? 50;
    this.activePolicy = {
      default: options.activeRecords?.default ?? DEFAULT_ACTIVE_POLICY.default,
      overrides: { ...DEFAULT_ACTIVE_POLICY.overrides, ...options.activeRecords?.overrides },
    };
  }

  /**
   * The entity-set name for a logical name, from metadata.
   *
   * Cached for the life of the process — it changes only when a table is created. Falls back
   * to the naive plural when metadata cannot be read, so a metadata outage degrades to the
   * previous behaviour rather than failing every lookup.
   */
  private async resolveEntitySetName(entity: string): Promise<string> {
    const cached = this.entitySetNames.get(entity);
    if (cached) return cached;

    try {
      const metadata = await this.get<{ EntitySetName?: string }>(
        `/EntityDefinitions(LogicalName='${entity}')?$select=EntitySetName`,
        { entity },
      );
      if (metadata.EntitySetName) {
        this.entitySetNames.set(entity, metadata.EntitySetName);
        return metadata.EntitySetName;
      }
    } catch {
      // fall through to the naive plural
    }

    return `${entity}s`;
  }

  /** The active-record OData filter for an entity, or null if none applies. */
  private activeRecordFilter(entity: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.activePolicy.overrides, entity)
      ? this.activePolicy.overrides[entity] ?? null
      : this.activePolicy.default;
  }

  async searchEntity(query: EntityLookupQuery): Promise<readonly LookupOption[]> {
    const valueAttribute = query.valueAttribute ?? `${query.entity}id`;
    const columns = query.columns && query.columns.length > 0 ? query.columns : undefined;
    const primaryColumn = columns?.[0];
    const primaryAttribute = primaryColumn
      ? this.effectiveAttribute(primaryColumn, query.language)
      : query.displayAttribute;

    const select = new Set<string>([valueAttribute, primaryAttribute]);
    if (columns) {
      for (const column of columns) select.add(this.effectiveAttribute(column, query.language));
    }

    const filters: string[] = [];
    const activeFilter = this.activeRecordFilter(query.entity);
    if (activeFilter) filters.push(activeFilter);
    if (query.searchTerm) {
      // Escape single quotes for OData — never string-concatenate raw input.
      filters.push(`contains(${primaryAttribute},'${query.searchTerm.replace(/'/g, "''")}')`);
    }
    if (query.filter) filters.push(query.filter);

    const top = Math.min(query.maxResults ?? DEFAULT_MAX, this.ceiling);
    const odata = [
      `$select=${[...select].join(',')}`,
      filters.length > 0 ? `$filter=${filters.join(' and ')}` : null,
      `$top=${top}`,
      `$orderby=${primaryAttribute} asc`,
    ]
      .filter((part): part is string => part !== null)
      .join('&');

    // The Web API addresses records by entity-set name, which is NOT the logical name plus
    // "s" — qdb_applicationstatus is qdb_applicationstatuses, and hundreds of custom tables
    // are irregular. Guessing produces "Resource not found for the segment".
    const entitySet = await this.resolveEntitySetName(query.entity);

    const collection = await this.get<{ value: Record<string, unknown>[] }>(
      `/${entitySet}?${odata}`,
      { entity: query.entity },
    );

    return collection.value.map((record) =>
      this.toOption(record, query, valueAttribute, primaryAttribute, columns),
    );
  }

  async searchOptionSet(
    entity: string,
    attribute: string,
    _language?: string,
  ): Promise<readonly LookupOption[]> {
    if (!this.metadata) {
      throw new LookupError('searchOptionSet needs a metadata service (pass options.metadata)', {
        entity,
        attribute,
      });
    }
    try {
      const options = await this.metadata.getOptions(entity, attribute);
      return options.map((option) => ({ id: String(option.value), label: option.label }));
    } catch (cause) {
      throw new LookupError('Option-set resolution failed', { entity, attribute, cause });
    }
  }

  private toOption(
    record: Record<string, unknown>,
    query: EntityLookupQuery,
    valueAttribute: string,
    primaryAttribute: string,
    columns: readonly LookupColumn[] | undefined,
  ): LookupOption {
    const option: LookupOption = {
      id: String(record[valueAttribute] ?? record[`${query.entity}id`] ?? ''),
      label: String(record[primaryAttribute] ?? ''),
      entity: query.entity,
    };
    if (columns) {
      const values: Record<string, unknown> = {};
      for (const column of columns) {
        values[column.attribute] = record[this.effectiveAttribute(column, query.language)] ?? '';
      }
      option.columns = values;
    }
    return option;
  }

  /** The attribute holding the requested language's value, or the base. */
  private effectiveAttribute(column: LookupColumn, language?: string): string {
    if (language && column.localizedAttributes?.[language]) {
      return column.localizedAttributes[language];
    }
    return column.attribute;
  }

  private async get<T>(path: string, ctx: { entity?: string }): Promise<T> {
    const token = await this.tokenProvider.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });
    if (!response.ok) {
      throw new LookupError(`Lookup query failed (${response.status})`, {
        ...ctx,
        cause: await response.text().catch(() => undefined),
      });
    }
    return (await response.json()) as T;
  }
}
