import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const ENTITY_LOGICAL_NAME = 'qdb_component_definitions';
const KEY_SCHEMA_NAME = 'qdb_ComponentDefinitionNameKey';
// Dataverse alternate key indexing is async — 60s is the safe minimum before the
// key can be used in OData addressing (the platform job can take 30-120s).
const ENTITY_CUSTOMIZATION_SETTLE_MS = 60_000;

interface AlternateKeyRecord {
  readonly SchemaName: string;
  readonly MetadataId?: string;
}

interface KeysResponse {
  readonly value: readonly AlternateKeyRecord[];
}

export async function provisionAlternateKey(http: DataverseHttpClient): Promise<StepResult> {
  console.log(`[PHASE-7] Checking alternate key '${KEY_SCHEMA_NAME}' on '${ENTITY_LOGICAL_NAME}'...`);

  const existing = await http.get<KeysResponse>(
    `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Keys`,
  );

  const existingKeys = existing?.value ?? [];
  const alreadyExists = existingKeys.some((k) => k.SchemaName === KEY_SCHEMA_NAME);

  if (alreadyExists) {
    console.log(`[PHASE-7] [SKIP] Alternate key '${KEY_SCHEMA_NAME}' already exists.`);
    return { name: KEY_SCHEMA_NAME, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-7] [DRY-RUN SKIP] Would create alternate key '${KEY_SCHEMA_NAME}'.`);
    return { name: KEY_SCHEMA_NAME, status: 'dry-run' };
  }

  console.log(`[PHASE-7] Creating alternate key '${KEY_SCHEMA_NAME}'...`);

  await http.postWithCustomHeaders(
    `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Keys`,
    {
      SchemaName: KEY_SCHEMA_NAME,
      DisplayName: { LocalizedLabels: [{ Label: 'Component Name Key', LanguageCode: 1033 }] },
      KeyAttributes: ['qdb_name'],
    },
    { 'MSCRM.SolutionUniqueName': 'QdbDxpPlatform' },
  );

  console.log(`[PHASE-7] [PASS] Alternate key '${KEY_SCHEMA_NAME}' created. Waiting for async metadata job...`);
  await sleep(ENTITY_CUSTOMIZATION_SETTLE_MS);

  return { name: KEY_SCHEMA_NAME, status: 'created' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
