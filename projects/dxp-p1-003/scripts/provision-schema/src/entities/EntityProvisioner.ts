import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, EntityMetadataPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

interface EntityRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
  readonly LogicalName: string;
}

export class EntityProvisioner {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async ensureEntityExists(payload: EntityMetadataPayload): Promise<StepResult> {
    const schemaName = payload.SchemaName;
    console.log(`  Checking entity '${schemaName}'...`);

    const existing = await this.fetchEntity(schemaName);

    if (existing !== null) {
      console.log(`  [SKIP] Entity '${schemaName}' already exists`);
      return { name: schemaName, status: 'skipped', id: existing.MetadataId };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create entity '${schemaName}'`);
      return { name: schemaName, status: 'dry-run' };
    }

    console.log(`  [CREATE] Creating entity '${schemaName}'...`);

    const response = await this.http.postAdminRaw('EntityDefinitions', payload);

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const metadataId = match?.[1] ?? entityId;

    console.log(`  [OK] Entity '${schemaName}' created: ${metadataId}`);
    return { name: schemaName, status: 'created', id: metadataId };
  }

  async fetchEntityLogicalName(schemaName: string): Promise<string | null> {
    const entity = await this.fetchEntity(schemaName);
    return entity?.LogicalName ?? null;
  }

  private async fetchEntity(schemaName: string): Promise<EntityRecord | null> {
    const result = await this.http.get<ODataCollectionResponse<EntityRecord>>(
      'EntityDefinitions',
      {
        filter: `SchemaName eq '${schemaName}'`,
        select: ['MetadataId', 'SchemaName', 'LogicalName'],
        top: 1,
      },
    );
    return result?.value?.[0] ?? null;
  }
}
