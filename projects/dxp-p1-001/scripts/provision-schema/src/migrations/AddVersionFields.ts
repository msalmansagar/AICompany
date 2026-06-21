/**
 * Migration: AddVersionFields
 *
 * Adds three fields to qdb_component_versions (POST-3, DXP-P1-001):
 *   qdb_DefaultProps  — Memo(1048576)  — default props JSON blob
 *   qdb_BundleUrl     — String(2048)   — CDN/package bundle URL
 *   qdb_DeprecatedOn  — DateTime       — soft-deprecation timestamp
 *
 * Idempotent — each field is checked first and skipped if it already exists.
 * Run once against the live org5869857f environment.
 *
 * Usage:
 *   npm run migrate:add-version-fields
 *   DRY_RUN=true npm run migrate:add-version-fields
 */
import { env } from '../config/env.js';
import { TokenProvider } from '../auth/TokenProvider.js';
import { DataverseHttpClient } from '../http/DataverseHttpClient.js';

const ENTITY_LOGICAL_NAME = 'qdb_component_versions';

interface FieldSpec {
  readonly logicalName: string;
  readonly displayLabel: string;
  readonly payload: Record<string, unknown>;
}

const FIELDS_TO_ADD: readonly FieldSpec[] = [
  {
    logicalName: 'qdb_defaultprops',
    displayLabel: 'qdb_DefaultProps',
    payload: {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_DefaultProps',
      DisplayName: { LocalizedLabels: [{ Label: 'Default Props (JSON)', LanguageCode: 1033 }] },
      RequiredLevel: { Value: 'None' },
      MaxLength: 1048576,
    },
  },
  {
    logicalName: 'qdb_bundleurl',
    displayLabel: 'qdb_BundleUrl',
    payload: {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_BundleUrl',
      DisplayName: { LocalizedLabels: [{ Label: 'Bundle URL', LanguageCode: 1033 }] },
      RequiredLevel: { Value: 'None' },
      MaxLength: 2048,
    },
  },
  {
    logicalName: 'qdb_deprecatedon',
    displayLabel: 'qdb_DeprecatedOn',
    payload: {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_DeprecatedOn',
      DisplayName: { LocalizedLabels: [{ Label: 'Deprecated On', LanguageCode: 1033 }] },
      RequiredLevel: { Value: 'None' },
      DateTimeBehavior: { Value: 'UserLocal' },
    },
  },
];

async function fieldExists(http: DataverseHttpClient, logicalName: string): Promise<boolean> {
  const path = `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes(LogicalName='${logicalName}')`;
  const result = await http.get(path, { select: ['LogicalName'] });
  return result !== null;
}

const ATTRIBUTE_SETTLE_MS = 15_000;

async function addField(http: DataverseHttpClient, field: FieldSpec): Promise<void> {
  const path = `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes`;
  await http.post<unknown>(path, field.payload);
  console.log(`[MIGRATION] Waiting ${ATTRIBUTE_SETTLE_MS / 1000}s for customization lock to clear...`);
  await sleep(ATTRIBUTE_SETTLE_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[MIGRATION] AddVersionFields — DXP-P1-001 POST-3');
  console.log(`[MIGRATION] Target entity: ${ENTITY_LOGICAL_NAME}`);
  if (env.DRY_RUN) {
    console.log('[MIGRATION] DRY_RUN=true — no writes will be made.');
  }

  const tokenProvider = new TokenProvider();
  await tokenProvider.acquireToken();
  console.log('[MIGRATION] Token acquired.\n');

  const http = new DataverseHttpClient(tokenProvider);

  let added = 0;
  let skipped = 0;

  for (const field of FIELDS_TO_ADD) {
    const exists = await fieldExists(http, field.logicalName);

    if (exists) {
      console.log(`[MIGRATION] [SKIP] ${field.displayLabel} already exists on ${ENTITY_LOGICAL_NAME}.`);
      skipped++;
      continue;
    }

    if (env.DRY_RUN) {
      console.log(`[MIGRATION] [DRY RUN] Would POST ${field.displayLabel} to ${ENTITY_LOGICAL_NAME}/Attributes.`);
      added++;
      continue;
    }

    console.log(`[MIGRATION] Adding ${field.displayLabel}...`);
    await addField(http, field);

    const verified = await fieldExists(http, field.logicalName);
    if (!verified) {
      console.error(`[MIGRATION] [FAIL] ${field.displayLabel} was sent but could not be verified. Check Dataverse for errors.`);
      process.exit(1);
    }

    console.log(`[MIGRATION] [PASS] ${field.displayLabel} added and verified.`);
    added++;
  }

  console.log(`\n[MIGRATION] Complete — ${added} added, ${skipped} skipped.`);

  if (!env.DRY_RUN && added > 0) {
    console.log('\nNext step: export the updated solution:');
    console.log('  pac solution export \\');
    console.log('    --name QdbDxpPlatform \\');
    console.log('    --path ./QdbDxpPlatform_1_0_0_0_managed.zip \\');
    console.log('    --managed \\');
    console.log('    --overwrite');
  }
}

main().catch((err: unknown) => {
  console.error('[MIGRATION] [ERROR] Unhandled failure:', err);
  process.exit(1);
});
