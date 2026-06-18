/**
 * Migration: FixPropsSchemaMaxLength
 *
 * Patches qdb_propsschema on qdb_component_versions from Memo(4000) to
 * Memo(1048576) as required by BRD FR-021. Resolves GGAP-003 / CEO Condition 2.
 *
 * Run once against the live environment. The operation is idempotent — if the
 * field is already at MaxLength 1048576, the PATCH is a no-op in Dataverse.
 *
 * Usage:
 *   npm run migrate:fix-props-schema-maxlength
 *   DRY_RUN=true npm run migrate:fix-props-schema-maxlength
 */
import { env } from '../config/env.js';
import { TokenProvider } from '../auth/TokenProvider.js';
import { DataverseHttpClient } from '../http/DataverseHttpClient.js';

const ENTITY_LOGICAL_NAME = 'qdb_component_versions';
const ATTRIBUTE_LOGICAL_NAME = 'qdb_propsschema';
const TARGET_MAX_LENGTH = 1048576;

interface MemoAttributeMetadata {
  MaxLength: number;
  LogicalName: string;
  AttributeType: string;
}

async function fetchCurrentMaxLength(http: DataverseHttpClient): Promise<number | null> {
  const path = `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes(LogicalName='${ATTRIBUTE_LOGICAL_NAME}')`;
  const attr = await http.get<MemoAttributeMetadata>(path, {
    select: ['MaxLength', 'LogicalName', 'AttributeType'],
  });
  if (attr === null) return null;
  return attr.MaxLength;
}

async function patchMaxLength(http: DataverseHttpClient): Promise<void> {
  const path = `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes(LogicalName='${ATTRIBUTE_LOGICAL_NAME}')`;
  await http.patch(path, {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    MaxLength: TARGET_MAX_LENGTH,
  });
}

async function main(): Promise<void> {
  console.log('[MIGRATION] FixPropsSchemaMaxLength — GGAP-003 / CEO Condition 2');
  console.log(`[MIGRATION] Target: ${ENTITY_LOGICAL_NAME}.${ATTRIBUTE_LOGICAL_NAME} → MaxLength ${TARGET_MAX_LENGTH}`);

  if (env.DRY_RUN) {
    console.log('[MIGRATION] DRY_RUN=true — no writes will be made.');
  }

  const tokenProvider = new TokenProvider();
  await tokenProvider.acquireToken();
  console.log('[MIGRATION] Token acquired.');

  const http = new DataverseHttpClient(tokenProvider);

  const currentMaxLength = await fetchCurrentMaxLength(http);
  if (currentMaxLength === null) {
    console.error(`[MIGRATION] [FAIL] Attribute '${ATTRIBUTE_LOGICAL_NAME}' not found on entity '${ENTITY_LOGICAL_NAME}'.`);
    console.error('[MIGRATION]        Check that provision-schema has been run and the entity exists.');
    process.exit(1);
  }

  console.log(`[MIGRATION] Current MaxLength: ${currentMaxLength}`);

  if (currentMaxLength === TARGET_MAX_LENGTH) {
    console.log('[MIGRATION] [PASS] MaxLength is already 1048576 — nothing to do.');
    return;
  }

  if (env.DRY_RUN) {
    console.log(`[MIGRATION] [DRY RUN] Would PATCH MaxLength from ${currentMaxLength} to ${TARGET_MAX_LENGTH}.`);
    return;
  }

  await patchMaxLength(http);
  console.log(`[MIGRATION] [PASS] MaxLength updated from ${currentMaxLength} to ${TARGET_MAX_LENGTH}.`);

  const confirmedMaxLength = await fetchCurrentMaxLength(http);
  if (confirmedMaxLength !== TARGET_MAX_LENGTH) {
    console.error(`[MIGRATION] [FAIL] Post-patch verification failed. MaxLength is ${confirmedMaxLength}, expected ${TARGET_MAX_LENGTH}.`);
    process.exit(1);
  }

  console.log('[MIGRATION] [PASS] Post-patch verification passed. GGAP-003 resolved.');
}

main().catch((err: unknown) => {
  console.error('[MIGRATION] [ERROR] Unhandled failure:', err);
  process.exit(1);
});
