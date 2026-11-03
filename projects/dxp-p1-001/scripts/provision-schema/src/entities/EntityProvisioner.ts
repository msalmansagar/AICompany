import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { DataverseApiError } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { EntityMetadataPayload, AttributeMetadata } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const ENTITY_CUSTOMIZATION_SETTLE_MS = 20_000;

function stampPrimaryAttribute(definition: EntityMetadataPayload): EntityMetadataPayload {
  const stamped = definition.Attributes.map(
    (attr): AttributeMetadata & { IsPrimaryName?: boolean } => {
      if (attr.LogicalName === definition.PrimaryNameAttribute) {
        return { ...attr, IsPrimaryName: true };
      }
      return attr;
    },
  );

  const hasPrimary = stamped.some((a) => (a as { IsPrimaryName?: boolean }).IsPrimaryName);
  if (!hasPrimary) {
    throw new Error(
      `Primary attribute '${definition.PrimaryNameAttribute}' not found in Attributes for entity '${definition.SchemaName}'.`,
    );
  }

  return { ...definition, Attributes: stamped };
}

function isSchemaNameUniqueConflict(error: unknown): boolean {
  return (
    error instanceof DataverseApiError &&
    error.statusCode === 400 &&
    error.dataverseMessage.includes('is not unique')
  );
}

export async function provisionEntity(
  http: DataverseHttpClient,
  definition: EntityMetadataPayload,
): Promise<StepResult> {
  const logicalName = definition.SchemaName.toLowerCase();

  const existing = await http.get(`EntityDefinitions(LogicalName='${logicalName}')`);

  if (existing !== null) {
    console.log(`[PHASE-5] [SKIP] Entity '${logicalName}' already exists.`);
    return { name: logicalName, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-5] [DRY-RUN SKIP] Would create entity '${logicalName}'.`);
    return { name: logicalName, status: 'dry-run' };
  }

  console.log(`[PHASE-5] Creating entity '${logicalName}'...`);

  const payload = stampPrimaryAttribute(definition);

  try {
    const response = await http.postRaw('EntityDefinitions', payload);
    const entityIdHeader = response.headers.get('OData-EntityId') ?? '';
    const entityIdMatch = entityIdHeader.match(/\(([^)]+)\)/);
    const metadataId = entityIdMatch?.[1] ?? '';

    console.log(`[PHASE-5] [PASS] Created entity '${logicalName}' (MetadataId: ${metadataId})`);
    console.log(`[PHASE-5] Waiting ${ENTITY_CUSTOMIZATION_SETTLE_MS / 1000}s for customization lock to clear...`);
    await sleep(ENTITY_CUSTOMIZATION_SETTLE_MS);
    return { name: logicalName, status: 'created', id: metadataId };
  } catch (error) {
    if (isSchemaNameUniqueConflict(error)) {
      console.log(`[PHASE-5] [SKIP] Entity '${logicalName}' was created concurrently — treating as skipped.`);
      return { name: logicalName, status: 'skipped' };
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
