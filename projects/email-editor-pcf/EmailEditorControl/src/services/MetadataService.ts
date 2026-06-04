/**
 * MetadataService.ts
 * Loads entity, attribute, and relationship metadata from the Dataverse
 * Web API v9.2. Uses direct fetch (not context.webAPI) because EntityDefinitions
 * traversal is not exposed through the PCF WebApi interface.
 *
 * In-flight deduplication prevents parallel popup opens from firing duplicate XHRs.
 */

import { Logger } from './Logger';
import { MetadataCache } from './MetadataCache';
import {
  AttributeMetadata,
  EntityMetadata,
  ManyToOneRelationship,
  OneToManyRelationship
} from '../types/Metadata';

export interface MetadataServiceOptions {
  readonly webAPI: ComponentFramework.WebApi;
  readonly cache: MetadataCache;
  readonly logger: Logger;
  readonly clientUrl: string;
}

const API_VERSION = 'v9.2';
const CACHE_TTL_MS = 30 * 60 * 1000;

export class MetadataError extends Error {
  public constructor(
    code: string,
    public readonly httpStatus: number,
    public readonly url: string
  ) {
    super(code);
    this.name = 'MetadataError';
  }
}

export class MetadataService {
  private readonly options: MetadataServiceOptions;
  private readonly log: Logger;
  private readonly inflight = new Map<string, Promise<unknown>>();

  public constructor(options: MetadataServiceOptions) {
    this.options = options;
    this.log = options.logger.child('MetadataService');
  }

  public async getEntity(logicalName: string): Promise<EntityMetadata> {
    const key = `entity:${logicalName}`;
    const cached = this.options.cache.get<EntityMetadata>(key);
    if (cached) return cached;

    return this.dedupe(key, async () => {
      const url = this.buildUrl(
        `EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')` +
        `?$select=LogicalName,SchemaName,DisplayName,PrimaryIdAttribute,` +
        `PrimaryNameAttribute,ObjectTypeCode,EntitySetName`
      );
      const data = await this.fetchJson<EntityMetadata>(url);
      this.options.cache.set(key, data, CACHE_TTL_MS);
      return data;
    });
  }

  public async getAttributes(logicalName: string): Promise<readonly AttributeMetadata[]> {
    const key = `attrs:${logicalName}`;
    const cached = this.options.cache.get<AttributeMetadata[]>(key);
    if (cached) return cached;

    return this.dedupe(key, async () => {
      const url = this.buildUrl(
        `EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')/Attributes` +
        `?$select=LogicalName,SchemaName,DisplayName,AttributeType,IsValidForRead,IsCustomAttribute` +
        `&$filter=IsValidForRead eq true`
      );
      const data = await this.fetchJson<{ value: AttributeMetadata[] }>(url);
      this.options.cache.set(key, data.value, CACHE_TTL_MS);
      return data.value;
    });
  }

  public async getOneToMany(logicalName: string): Promise<readonly OneToManyRelationship[]> {
    const key = `1n:${logicalName}`;
    const cached = this.options.cache.get<OneToManyRelationship[]>(key);
    if (cached) return cached;

    return this.dedupe(key, async () => {
      const url = this.buildUrl(
        `EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')/OneToManyRelationships` +
        `?$select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,` +
        `ReferencingAttribute,ReferencedEntityNavigationPropertyName,` +
        `ReferencingEntityNavigationPropertyName`
      );
      const data = await this.fetchJson<{ value: OneToManyRelationship[] }>(url);
      this.options.cache.set(key, data.value, CACHE_TTL_MS);
      return data.value;
    });
  }

  public async getManyToOne(logicalName: string): Promise<readonly ManyToOneRelationship[]> {
    const key = `n1:${logicalName}`;
    const cached = this.options.cache.get<ManyToOneRelationship[]>(key);
    if (cached) return cached;

    return this.dedupe(key, async () => {
      const url = this.buildUrl(
        `EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')/ManyToOneRelationships` +
        `?$select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,` +
        `ReferencingAttribute,ReferencingEntityNavigationPropertyName`
      );
      const data = await this.fetchJson<{ value: ManyToOneRelationship[] }>(url);
      this.options.cache.set(key, data.value, CACHE_TTL_MS);
      return data.value;
    });
  }

  /**
   * Fetches a single record for the preview pane.
   * @param entitySetName  Plural entity set name (e.g. "contacts")
   * @param recordId       GUID of the record
   * @param select         Field logical names to include
   * @param expand         Navigation properties to expand
   */
  public async fetchRecord(
    entitySetName: string,
    recordId: string,
    select: readonly string[],
    expand: readonly string[]
  ): Promise<Record<string, unknown>> {
    const params: string[] = [];
    if (select.length > 0) params.push(`$select=${select.join(',')}`);
    if (expand.length > 0) params.push(`$expand=${expand.join(',')}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    const url = this.buildUrl(`${entitySetName}(${recordId})${query}`);
    return this.fetchJson<Record<string, unknown>>(url);
  }

  public dispose(): void {
    this.inflight.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private buildUrl(path: string): string {
    const base = this.options.clientUrl.replace(/\/$/, '');
    return `${base}/api/data/${API_VERSION}/${path}`;
  }

  private async dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = loader().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          'Prefer': 'odata.include-annotations="*"'
        }
      });
    } catch (networkError) {
      this.log.error('metadata_network_error', { url, error: String(networkError) });
      throw new MetadataError('network_error', 0, url);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.log.error('metadata_http_error', { url, status: response.status, body });
      throw new MetadataError('http_error', response.status, url);
    }

    return response.json() as Promise<T>;
  }
}
