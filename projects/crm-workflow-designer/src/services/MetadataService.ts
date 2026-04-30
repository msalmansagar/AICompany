import type { CrmContext, EntityMetadata, AttributeMetadata } from '../types/CrmTypes';
import { ALLOWED_ENTITIES } from '../config/allowedEntities';

export class MetadataService {
  private readonly baseUrl: string;
  private readonly inFlight = new Map<string, Promise<EntityMetadata>>();

  constructor(context: CrmContext) {
    this.baseUrl = `${context.orgUrl}/api/data/v9.2`;
  }

  async loadAllowedEntities(): Promise<string[]> {
    // TODO: load from client config entity once entity name is provided (BRD Risk R3)
    return Promise.resolve([...ALLOWED_ENTITIES]);
  }

  async getEntityMetadata(logicalName: string): Promise<EntityMetadata> {
    const cached = this.inFlight.get(logicalName);
    if (cached) return cached;

    const request = this.fetchEntityMetadata(logicalName);
    this.inFlight.set(logicalName, request);
    return request;
  }

  private async fetchEntityMetadata(logicalName: string): Promise<EntityMetadata> {
    const [entityDef, attributes] = await Promise.all([
      this.fetchJson<ODataEntityDef>(
        `EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,DisplayName,EntitySetName`
      ),
      this.fetchJson<ODataCollection<ODataAttributeDef>>(
        `EntityDefinitions(LogicalName='${logicalName}')/Attributes` +
        `?$filter=IsValidForAdvancedFind eq true` +
        `&$select=LogicalName,DisplayName,AttributeType`
      ),
    ]);

    return {
      logicalName,
      displayName: entityDef.DisplayName?.UserLocalizedLabel?.Label ?? logicalName,
      entitySetName: entityDef.EntitySetName,
      attributes: attributes.value.map(mapAttribute),
    };
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await window.fetch(`${this.baseUrl}/${path}`, {
      headers: {
        'OData-Version': '4.0',
        'OData-MaxVersion': '4.0',
        'Accept': 'application/json',
        'Prefer': 'odata.include-annotations="*"',
      },
    });
    if (!response.ok) {
      throw new Error(`Metadata fetch error ${response.status} for ${path}`);
    }
    return response.json() as Promise<T>;
  }
}

function mapAttribute(attr: ODataAttributeDef): AttributeMetadata {
  return {
    logicalName: attr.LogicalName,
    displayName: attr.DisplayName?.UserLocalizedLabel?.Label ?? attr.LogicalName,
    attributeType: attr.AttributeType,
  };
}

interface LocalizedLabel {
  UserLocalizedLabel?: { Label: string };
}

interface ODataEntityDef {
  LogicalName: string;
  DisplayName: LocalizedLabel;
  EntitySetName: string;
}

interface ODataAttributeDef {
  LogicalName: string;
  DisplayName: LocalizedLabel;
  AttributeType: string;
}

interface ODataCollection<T> {
  value: T[];
}
