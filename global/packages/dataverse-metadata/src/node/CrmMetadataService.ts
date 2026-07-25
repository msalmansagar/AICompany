/**
 * Node reference implementation of the canonical metadata contract.
 * MSS Technologies global library — server/backend runtime.
 *
 * Adapted from DFE's mature CrmMetadataService (the most complete of the five
 * existing implementations). Reads the Web API with a bearer token supplied by
 * the caller's token provider — this package does NOT acquire tokens or hold a
 * secret; that is the caller's Node auth service.
 *
 * A browser build satisfies the same contract via Xrm.WebApi — see ../browser/.
 */

import {
  DataverseMetadataService,
  EntityMetadata,
  FieldMetadata,
  OptionMetadata,
  RelationshipMetadata,
  MetadataError,
} from '../contract.js';

/** The minimal auth the caller injects — never a secret, just a token getter. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface CrmMetadataServiceOptions {
  /** e.g. https://org5869857f.crm4.dynamics.com */
  dataverseUrl: string;
  tokenProvider: TokenProvider;
}

const API_VERSION = 'v9.2';

export class CrmMetadataService implements DataverseMetadataService {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;

  constructor(options: CrmMetadataServiceOptions) {
    this.baseUrl = `${options.dataverseUrl}/api/data/${API_VERSION}`;
    this.tokenProvider = options.tokenProvider;
  }

  async getEntity(logicalName: string): Promise<EntityMetadata> {
    // Direct lookup by logical name — NOT a filtered scan, which is silently
    // paginated and reports entities missing that exist.
    const expand =
      '$expand=Attributes,OneToManyRelationships,ManyToOneRelationships,ManyToManyRelationships';
    const entity = await this.get<RawEntity>(
      `/EntityDefinitions(LogicalName='${logicalName}')?${expand}`,
      { entity: logicalName },
    );
    return this.mapEntity(entity);
  }

  async getFields(logicalName: string): Promise<readonly FieldMetadata[]> {
    const entity = await this.getEntity(logicalName);
    return entity.fields;
  }

  async getRelatedFields(logicalName: string): Promise<readonly RelationshipMetadata[]> {
    const entity = await this.getEntity(logicalName);
    return entity.relationships;
  }

  async getOptions(
    logicalName: string,
    attributeLogicalName: string,
  ): Promise<readonly OptionMetadata[]> {
    const path =
      `/EntityDefinitions(LogicalName='${logicalName}')` +
      `/Attributes(LogicalName='${attributeLogicalName}')` +
      `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
      `?$expand=OptionSet`;
    const attr = await this.get<RawPicklist>(path, {
      entity: logicalName,
      attribute: attributeLogicalName,
    });
    return this.mapOptions(attr);
  }

  private async get<T>(path: string, ctx: { entity?: string; attribute?: string }): Promise<T> {
    const token = await this.tokenProvider.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    });
    if (!response.ok) {
      throw new MetadataError(`Metadata read failed (${response.status})`, {
        ...ctx,
        cause: await response.text().catch(() => undefined),
      });
    }
    return (await response.json()) as T;
  }

  private mapEntity(raw: RawEntity): EntityMetadata {
    return {
      logicalName: raw.LogicalName,
      displayName: label(raw.DisplayName) ?? raw.LogicalName,
      entitySetName: raw.EntitySetName,
      primaryIdAttribute: raw.PrimaryIdAttribute,
      primaryNameAttribute: raw.PrimaryNameAttribute,
      fields: (raw.Attributes ?? []).map((a) => this.mapField(a)),
      relationships: this.mapRelationships(raw),
    };
  }

  private mapField(a: RawAttribute): FieldMetadata {
    return {
      logicalName: a.LogicalName,
      displayName: label(a.DisplayName) ?? a.LogicalName,
      attributeType: a.AttributeType,
      isRequired: a.RequiredLevel?.Value === 'ApplicationRequired',
      isCustom: a.IsCustomAttribute ?? false,
      maxLength: a.MaxLength,
      targets: a.Targets,
    };
  }

  private mapRelationships(raw: RawEntity): RelationshipMetadata[] {
    const rel = (
      list: RawRelationship[] | undefined,
      type: string,
      relatedKey: (r: RawRelationship) => string,
    ): RelationshipMetadata[] =>
      (list ?? []).map((r) => ({
        schemaName: r.SchemaName,
        relationshipType: type,
        relatedEntity: relatedKey(r),
        navigationProperty: r.ReferencingEntityNavigationPropertyName ?? r.SchemaName,
      }));
    return [
      ...rel(raw.OneToManyRelationships, 'OneToMany', (r) => r.ReferencingEntity ?? ''),
      ...rel(raw.ManyToOneRelationships, 'ManyToOne', (r) => r.ReferencedEntity ?? ''),
      ...rel(raw.ManyToManyRelationships, 'ManyToMany', (r) => r.Entity2LogicalName ?? ''),
    ];
  }

  private mapOptions(attr: RawPicklist): OptionMetadata[] {
    // Values are the real metadata codes (100000000-based) — never re-index them.
    return (attr.OptionSet?.Options ?? []).map((o) => ({
      value: o.Value,
      label: label(o.Label) ?? String(o.Value),
    }));
  }
}

function label(l: RawLabel | undefined): string | undefined {
  return l?.UserLocalizedLabel?.Label ?? l?.LocalizedLabels?.[0]?.Label;
}

// --- Raw Web API metadata shapes (only the fields this service reads) ---
interface RawLabel {
  UserLocalizedLabel?: { Label: string };
  LocalizedLabels?: { Label: string }[];
}
interface RawAttribute {
  LogicalName: string;
  DisplayName?: RawLabel;
  AttributeType: string;
  RequiredLevel?: { Value: string };
  IsCustomAttribute?: boolean;
  MaxLength?: number;
  Targets?: string[];
}
interface RawRelationship {
  SchemaName: string;
  ReferencingEntity?: string;
  ReferencedEntity?: string;
  Entity2LogicalName?: string;
  ReferencingEntityNavigationPropertyName?: string;
}
interface RawEntity {
  LogicalName: string;
  DisplayName?: RawLabel;
  EntitySetName: string;
  PrimaryIdAttribute: string;
  PrimaryNameAttribute: string;
  Attributes?: RawAttribute[];
  OneToManyRelationships?: RawRelationship[];
  ManyToOneRelationships?: RawRelationship[];
  ManyToManyRelationships?: RawRelationship[];
}
interface RawPicklist {
  OptionSet?: { Options?: { Value: number; Label?: RawLabel }[] };
}
