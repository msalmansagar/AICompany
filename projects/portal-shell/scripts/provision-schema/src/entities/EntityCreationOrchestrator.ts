import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { provisionEntity } from './EntityProvisioner.js';
import type { EntityMetadataPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// Corrected batch assignments from architect review (CHALLENGE 2 + 9 resolutions).
// Each batch is sequential to respect Dataverse lookup target validation.

import { portalConfigsDefinition } from './definitions/portalConfigs.js';
import { portalUsersDefinition } from './definitions/portalUsers.js';
import { portalServicesDefinition } from './definitions/portalServices.js';

import { portalResetTokensDefinition } from './definitions/portalResetTokens.js';
import { portalRevokedTokensDefinition } from './definitions/portalRevokedTokens.js';
import { portalNavItemsDefinition } from './definitions/portalNavItems.js';
import { portalWidgetConfigsDefinition } from './definitions/portalWidgetConfigs.js';
import { portalRequestsDefinition } from './definitions/portalRequests.js';
import { portalUserEntitiesDefinition } from './definitions/portalUserEntities.js';
import { portalNotificationsDefinition } from './definitions/portalNotifications.js';
import { cmsContentsDefinition } from './definitions/cmsContents.js';
import { portalServiceTabsDefinition } from './definitions/portalServiceTabs.js';

import { portalRequestTimelinesDefinition } from './definitions/portalRequestTimelines.js';
import { portalRequestDocumentsDefinition } from './definitions/portalRequestDocuments.js';
import { cmsRevisionsDefinition } from './definitions/cmsRevisions.js';

// Batch A: entities with no lookups to other provisioned entities.
const BATCH_A: readonly EntityMetadataPayload[] = [
  portalConfigsDefinition,     // 1
  portalUsersDefinition,       // 2
  portalServicesDefinition,    // 3
];

// Batch B: lookups to Batch A entities only.
// - portalResetTokens: qdb_user_id (plain string) — no lookup; included here for organisation
// - portalRevokedTokens: no lookups — included here after Batch A
// - portalNavItems: no lookup inline (self-ref is Phase 6)
// - portalWidgetConfigs: no Dataverse lookup (config entity with no FK inline)
// - portalRequests: qdb_user_id (plain string), qdb_service_code (plain string) — no lookups
// - portalUserEntities: qdb_account_id lookup to OOB account (always exists)
// - portalNotifications: qdb_user_id (plain string) — no lookup
// - cmsContents: no lookups
// - portalServiceTabs: lookup to qdb_portal_services (Batch A entity 3)
const BATCH_B: readonly EntityMetadataPayload[] = [
  portalResetTokensDefinition,    // 4  — qdb_user_id is plain string
  portalRevokedTokensDefinition,  // 5  — no lookups
  portalNavItemsDefinition,       // 6  — no inline lookups (self-ref in Phase 6)
  portalWidgetConfigsDefinition,  // 7  — no lookups
  portalRequestsDefinition,       // 8  — qdb_user_id is plain string
  portalUserEntitiesDefinition,   // 9  — lookup to OOB account (always exists)
  portalNotificationsDefinition,  // 10 — qdb_user_id is plain string
  cmsContentsDefinition,          // 11 — no lookups
  portalServiceTabsDefinition,    // 12 — lookup to qdb_portal_services (Batch A)
];

// Batch C: lookups to Batch B entities only.
const BATCH_C: readonly EntityMetadataPayload[] = [
  portalRequestTimelinesDefinition,  // 13 — lookup to qdb_portal_requests (Batch B)
  portalRequestDocumentsDefinition,  // 14 — lookup to qdb_portal_requests (Batch B)
  cmsRevisionsDefinition,            // 15 — lookup to qdb_cms_contents (Batch B)
];

export async function orchestrateEntityCreation(
  http: DataverseHttpClient,
): Promise<readonly StepResult[]> {
  console.log('[PHASE-5] Starting entity creation (Batch A → B → C)...');

  const batchAResults = await runBatch(http, 'A', BATCH_A);
  const batchBResults = await runBatch(http, 'B', BATCH_B);
  const batchCResults = await runBatch(http, 'C', BATCH_C);

  const allResults = [...batchAResults, ...batchBResults, ...batchCResults];
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
