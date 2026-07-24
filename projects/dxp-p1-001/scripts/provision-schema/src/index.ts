import { env } from './config/env.js';
import { TokenProvider } from './auth/TokenProvider.js';
import { DataverseHttpClient } from './http/DataverseHttpClient.js';

import { runPublisherCheck } from './preflight/PublisherCheck.js';
import { runPicklistConflictCheck } from './preflight/PicklistConflictCheck.js';
import { runExistingSolutionCheck } from './preflight/ExistingSolutionCheck.js';

import { provisionSolution } from './solution/SolutionProvisioner.js';
import { provisionAllGlobalOptionSets } from './optionsets/GlobalOptionSetProvisioner.js';
import { orchestrateEntityCreation } from './entities/EntityCreationOrchestrator.js';
import { provisionComponentDefinitionRelationship } from './relationships/RelationshipProvisioner.js';
import { provisionAlternateKey } from './alternatekeys/AlternateKeyProvisioner.js';
import { seedComponentDefinitions } from './seed/ComponentDefinitionSeed.js';
import { runPostProvisioningValidation } from './validation/PostProvisioningValidator.js';
import { emitProvisioningCompleteFile } from './output/ProvisioningCompleteEmitter.js';

async function main(): Promise<void> {
  const startMs = Date.now();

  // PHASE 0: Environment validation (Zod — runs at module import above)
  console.log('[PHASE-0] Environment validated.');
  if (env.DRY_RUN) {
    console.log('[PHASE-0] DRY_RUN=true — POST/PATCH/DELETE operations will be logged only.');
  }

  // PHASE 1: Token acquisition
  console.log('[PHASE-1] Acquiring Dataverse access token...');
  const tokenProvider = new TokenProvider();
  await tokenProvider.acquireToken();
  console.log('[PHASE-1] [PASS] Token acquired.');

  const http = new DataverseHttpClient(tokenProvider);

  // PHASE 2: Pre-flight guards
  const publisherResult = await runPublisherCheck(http);
  const publisherId =
    'publisherId' in publisherResult
      ? publisherResult.publisherId
      : publisherResult.mockPublisherId;

  await runPicklistConflictCheck(http);
  const existingSnapshots = await runExistingSolutionCheck(http);

  console.log('[PHASE-2] [PASS] All pre-flight guards passed.');

  // PHASE 3: Solution provisioning
  const solutionResult = await provisionSolution(http, publisherId);
  if (solutionResult.solutionId) {
    console.log(`[PHASE-3] Solution ID: ${solutionResult.solutionId}`);
  }

  // PHASE 4: Global option sets
  await provisionAllGlobalOptionSets(http);

  // PHASE 5: Entity creation (Batch A → B)
  await orchestrateEntityCreation(http);

  // PHASE 6: Relationship provisioning
  await provisionComponentDefinitionRelationship(http);

  // PHASE 7: Alternate key provisioning
  await provisionAlternateKey(http);

  // PHASE 8: Seed data
  await seedComponentDefinitions(http);

  // PHASE 9: Post-provisioning validation
  const validationResults = await runPostProvisioningValidation(http, existingSnapshots);
  const failedChecks = validationResults.filter((r) => !r.passed);

  // PHASE 10: Emit PROVISIONING-COMPLETE.md + print PAC CLI instruction
  printSolutionExportInstruction();
  await emitProvisioningCompleteFile(validationResults, env.DRY_RUN);

  const durationMs = Date.now() - startMs;
  console.log(`\n[COMPLETE] Provisioning finished in ${(durationMs / 1000).toFixed(1)}s`);

  if (failedChecks.length > 0) {
    console.error(`[ERROR] ${failedChecks.length} validation check(s) failed. Review output above.`);
    process.exit(1);
  }
}

function printSolutionExportInstruction(): void {
  console.log('');
  console.log('='.repeat(60));
  console.log('Solution export required after provisioning:');
  console.log('');
  console.log('pac solution export \\');
  console.log('  --name QdbDxpPlatform \\');
  console.log('  --path ./QdbDxpPlatform_1_0_0_0_managed.zip \\');
  console.log('  --managed \\');
  console.log('  --overwrite');
  console.log('='.repeat(60));
  console.log('');
}

main().catch((error: unknown) => {
  console.error('[FATAL] Provisioning aborted:');
  if (error instanceof Error) {
    console.error(error.message);
    if (env.LOG_LEVEL === 'debug' && error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
