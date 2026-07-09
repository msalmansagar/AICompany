import type { CrmContextService } from './CrmContextService';

/**
 * Reads Dataverse entity/attribute/relationship metadata for the designer's
 * schema-bound dropdowns (submission mapping target entity/attribute, child
 * relationship). Works in both modes:
 *   - CRM (UCI): credentialed fetch to the org's /api/data EntityDefinitions.
 *   - Local dev (REST): routed through the designer proxy's metadata passthrough.
 * The proxy returns the raw OData body, so parsing is identical in both modes.
 */

export interface EntityMetadata {
  logicalName: string;
  displayName: string;
}

export interface AttributeMetadata {
  logicalName: string;
  displayName: string;
  attributeType: string;
}

export interface RelationshipMetadata {
  schemaName: string;
  referencingEntity: string;
}

interface ODataLabel {
  UserLocalizedLabel?: { Label?: string };
}

const API_VERSION = 'v9.2';

export class MetadataService {
  constructor(private readonly crm: CrmContextService) {}

  async getEntities(): Promise<EntityMetadata[]> {
    // Note: EntityDefinitions rejects $orderby (400) — sorted client-side below.
    const data = await this.fetchMetadata(
      "EntityDefinitions?$select=LogicalName,DisplayName&$filter=IsValidForAdvancedFind eq true",
    );
    return data
      .map((raw) => {
        const entity = raw as { LogicalName: string; DisplayName?: ODataLabel };
        return {
          logicalName: entity.LogicalName,
          displayName: entity.DisplayName?.UserLocalizedLabel?.Label ?? entity.LogicalName,
        };
      })
      .sort((a, b) => a.logicalName.localeCompare(b.logicalName));
  }

  async getAttributes(entityLogicalName: string): Promise<AttributeMetadata[]> {
    const data = await this.fetchMetadata(
      `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,DisplayName,AttributeType`,
    );
    return data
      .map((raw) => {
        const attribute = raw as { LogicalName: string; AttributeType?: string; DisplayName?: ODataLabel };
        return {
          logicalName: attribute.LogicalName,
          displayName: attribute.DisplayName?.UserLocalizedLabel?.Label ?? attribute.LogicalName,
          attributeType: attribute.AttributeType ?? '',
        };
      })
      .sort((a, b) => a.logicalName.localeCompare(b.logicalName));
  }

  async getRelationships(entityLogicalName: string): Promise<RelationshipMetadata[]> {
    const data = await this.fetchMetadata(
      `EntityDefinitions(LogicalName='${entityLogicalName}')/OneToManyRelationships?$select=SchemaName,ReferencingEntity`,
    );
    return data
      .map((raw) => {
        const relationship = raw as { SchemaName: string; ReferencingEntity: string };
        return { schemaName: relationship.SchemaName, referencingEntity: relationship.ReferencingEntity };
      })
      .sort((a, b) => a.schemaName.localeCompare(b.schemaName));
  }

  private buildUrl(pathAndQuery: string): string {
    const base = this.crm.getClientUrl().replace(/\/$/, '');
    return this.crm.isRestMode()
      ? `${base}/api/designer/metadata/${pathAndQuery}`
      : `${base}/api/data/${API_VERSION}/${pathAndQuery}`;
  }

  private async fetchMetadata(pathAndQuery: string): Promise<unknown[]> {
    const init: RequestInit = {
      headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    };
    // In CRM the metadata endpoint is same-origin and needs the user's cookie.
    // In REST mode the proxy injects the service-principal token itself.
    if (!this.crm.isRestMode()) init.credentials = 'include';

    const response = await fetch(this.buildUrl(pathAndQuery), init);
    if (!response.ok) {
      throw new Error(`Metadata request failed: ${response.status}`);
    }
    const body = (await response.json()) as { value?: unknown[] };
    return body.value ?? [];
  }
}
