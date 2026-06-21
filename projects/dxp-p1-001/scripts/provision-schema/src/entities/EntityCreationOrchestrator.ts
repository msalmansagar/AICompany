import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { provisionEntity } from './EntityProvisioner.js';
import type { EntityMetadataPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

import { componentDefinitionsDefinition } from './definitions/componentDefinitions.js';
import { componentVersionsDefinition } from './definitions/componentVersions.js';
import {
  rbacUserRolesDefinition,
  rbacAuditLogDefinition,
  rbacPromotionRequestsDefinition,
} from './definitions/rbacEntities.js';

// Batch A: entities with no FK lookups to other provisioned entities.
const BATCH_A: readonly EntityMetadataPayload[] = [
  componentDefinitionsDefinition,
  // RBAC entities are independent — no FK relationships between them.
  rbacUserRolesDefinition,
  rbacAuditLogDefinition,
  rbacPromotionRequestsDefinition,
];

// Batch B: entities whose lookups to Batch A entities are added via the
// relationship provisioner after both entities exist (not inline).
const BATCH_B: readonly EntityMetadataPayload[] = [
  componentVersionsDefinition,
];

export async function orchestrateEntityCreation(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-5] Starting entity creation (Batch A → B)...');

  const batchAResults = await runBatch(http, 'A', BATCH_A);
  const batchBResults = await runBatch(http, 'B', BATCH_B);

  const allResults = [...batchAResults, ...batchBResults];
  const created = allResults.filter((r) => r.status === 'created').length;
  const skipped = allResults.filter((r) => r.status === 'skipped').length;

  console.log(
    `[PHASE-5] Complete: ${created} created, ${skipped} skipped out of ${allResults.length} entities.`,
  );

  return allResults;
}

async function runBatch(
  http: DataverseHttpClient,
  batchLabel: string,
  definitions: readonly EntityMetadataPayload[],
): Promise<readonly StepResult[]> {
  console.log(`[PHASE-5] Batch ${batchLabel}: ${definitions.length} entities...`);
  const results: StepResult[] = [];

  for (const definition of definitions) {
    const result = await provisionEntity(http, definition);
    results.push(result);
  }

  return results;
}
