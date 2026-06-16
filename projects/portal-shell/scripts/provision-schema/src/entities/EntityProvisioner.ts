import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { EntityMetadataPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// Single responsibility: create or skip one entity.
// No loops, no orchestration — those belong in EntityCreationOrchestrator.
export async function provisionEntity(
  http: DataverseHttpClient,
  definition: EntityMetadataPayload,
): Promise<StepResult> {
  const logicalName = definition.SchemaName.toLowerCase();

  const existing = await http.get(
    `EntityDefinitions(LogicalName='${logicalName}')`,
  );

  if (existing !== null) {
    console.log(`[PHASE-5] [SKIP] Entity '${logicalName}' already exists.`);
    return { name: logicalName, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-5] [DRY-RUN SKIP] Would create entity '${logicalName}'.`);
    return { name: logicalName, status: 'dry-run' };
  }

  console.log(`[PHASE-5] Creating entity '${logicalName}'...`);

  const response = await http.postRaw('EntityDefinitions', definition);
  const entityIdHeader = response.headers.get('OData-EntityId') ?? '';
  const entityIdMatch = entityIdHeader.match(/\(([^)]+)\)/);
  const metadataId = entityIdMatch?.[1] ?? '';

  console.log(`[PHASE-5] [PASS] Created entity '${logicalName}' (MetadataId: ${metadataId})`);
  return { name: logicalName, status: 'created', id: metadataId };
}
