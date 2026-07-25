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

export interface CrmLookupServiceOptions {
  dataverseUrl: string;
  tokenProvider: TokenProvider;
  /** Injected @mss/dataverse-metadata service, for searchOptionSet. */
  metadata: OptionSetResolver;
  /** Hard ceiling on results regardless of query.maxResults. Default 50. */
  maxResultsCeiling?: number;
}

const API_VERSION = 'v9.2';
const DEFAULT_MAX = 20;

export class CrmLookupService implements DataverseLookupService {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly metadata: OptionSetResolver;
  private readonly ceiling: number;

  constructor(options: CrmLookupServiceOptions) {
    this.baseUrl = `${options.dataverseUrl}/api/data/${API_VERSION}`;
    this.tokenProvider = options.tokenProvider;
    this.metadata = options.metadata;
    this.ceiling = options.maxResultsCeiling ?? 50;
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

    const collection = await this.get<{ value: Record<string, unknown>[] }>(
      `/${query.entity}s?${odata}`,
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
