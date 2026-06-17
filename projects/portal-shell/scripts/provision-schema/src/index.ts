// DFE-PORT-001/SCHEMA — Dataverse Schema Provisioning Script
// Entrypoint: orchestrates all 11 phases in sequence.
// No HTTP calls happen here — phase modules own their logic.

import { env } from './config/env.js';
import { TokenProvider } from './auth/TokenProvider.js';
import { DataverseHttpClient } from './http/DataverseHttpClient.js';

import { runPublisherCheck } from './preflight/PublisherCheck.js';
import { runPicklistConflictCheck } from './preflight/PicklistConflictCheck.js';
import { runExistingSolutionCheck } from './preflight/ExistingSolutionCheck.js';

import { provisionSolution } from './solution/SolutionProvisioner.js';
import { provisionAllGlobalOptionSets } from './optionsets/GlobalOptionSetProvisioner.js';
import { orchestrateEntityCreation } from './entities/EntityCreationOrchestrator.js';
import { provisionSelfReferentialNavRelationship } from './relationships/RelationshipProvisioner.js';
import { provisionSecurityRole } from './security/SecurityRoleProvisioner.js';
import { assignRoleToServicePrincipal } from './security/ServicePrincipalRoleAssignment.js';
import { orchestrateSeed } from './seed/SeedOrchestrator.js';
import { runPostProvisioningValidation } from './validation/PostProvisioningValidator.js';

import { emitProvisioningCompleteFile } from './output/ProvisioningCompleteEmitter.js';
import type { ExistingSolutionSnapshot } from './types/ProvisioningResult.js';

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
  // 2a Publisher check
  const publisherResult = await runPublisherCheck(http);
  const publisherId =
    'publisherId' in publisherResult
      ? publisherResult.publisherId
      : publisherResult.mockPublisherId;

  // 2b Picklist conflict check
  await runPicklistConflictCheck(http);

  // 2c Existing solution snapshot (C-SCHEMA-006)
  const phase2cSnapshot: ExistingSolutionSnapshot | null = await runExistingSolutionCheck(http);

  // NOTE: C-SCHEMA-004 (SP must not have SysAdmin at runtime) is a post-provisioning
  // manual step. The provisioner SP needs SysAdmin to create schema — checking for its
  // absence here would always block. Admin removes SysAdmin after this script completes
  // and assigns the custom QDB Portal Shell User role (Phase 7 below).

  console.log('[PHASE-2] [PASS] All pre-flight guards passed.');

  // PHASE 3: Solution provisioning
  const solutionResult = await provisionSolution(http, publisherId);
  const solutionId = solutionResult.id ?? '';

  if (solutionId) {
    console.log(`[PHASE-3] Solution ID: ${solutionId}`);
  }

  // PHASE 4: Global option sets
  await provisionAllGlobalOptionSets(http);

  // PHASE 5: Entity creation (Batch A → B → C)
  await orchestrateEntityCreation(http);

  // PHASE 6: Relationships (self-referential nav item parent)
  await provisionSelfReferentialNavRelationship(http);

  // PHASE 7: Security role + SP assignment
  // Called at end of provisioning (CHALLENGE 3: maximises delay from entity creation)
  const roleResult = await provisionSecurityRole(http);

  if (roleResult.roleId && !env.DRY_RUN) {
    await assignRoleToServicePrincipal(http, roleResult.roleId);
  }

  // PHASE 8: Seed data
  await orchestrateSeed(http);

  // PHASE 9: Post-provisioning validation
  const validationResults = await runPostProvisioningValidation(http, phase2cSnapshot);

  const failedChecks = validationResults.filter((r) => !r.passed);

  // PHASE 10: Deactivation warning (C-SCHEMA-005)
  console.log('');
  console.log('='.repeat(60));
  console.log('WARNING [C-SCHEMA-005]: Test user smoketest@portalshell.internal');
  console.log('was seeded with a bcrypt hash. Deactivate or delete this record');
  console.log('before promoting this environment to production.');
  console.log('Set qdb_is_active = false or delete the record via Power Apps.');
  console.log('='.repeat(60));

  // PHASE 11: Solution export instruction (C-SCHEMA-008) + CHALLENGE 8 checklist file
  printSolutionExportInstruction();

  // CHALLENGE 8: Emit PROVISIONING-COMPLETE.md
  await emitProvisioningCompleteFile(validationResults, env.DRY_RUN);

  const durationMs = Date.now() - startMs;
  console.log(`\n[COMPLETE] Provisioning finished in ${(durationMs / 1000).toFixed(1)}s`);

  if (failedChecks.length > 0) {
    console.error(
      `[ERROR] ${failedChecks.length} validation check(s) failed. Review output above.`,
    );
    process.exit(1);
  }
}

function printSolutionExportInstruction(): void {
  console.log('');
  console.log('='.repeat(60));
  console.log('C-SCHEMA-008: Solution export required before delivery.');
  console.log('Run the following PAC CLI command:');
  console.log('');
  console.log('pac solution export \\');
  console.log('  --name QdbPortalShell \\');
  console.log('  --path ./QdbPortalShell_1_0_0_0_managed.zip \\');
  console.log('  --managed \\');
  console.log('  --overwrite');
  console.log('');
  console.log('Prerequisite: pac auth create --url https://org5869857f.crm4.dynamics.com');
  console.log('              (or existing auth profile for this org)');
  console.log('');
  console.log('The managed solution file must be delivered to the client');
  console.log('as the deployable artefact. Do not deliver the unmanaged version.');
  console.log('='.repeat(60));
  console.log('');
  console.log('POST-PROVISIONING MANUAL STEPS REQUIRED:');
  console.log('1. Run PAC CLI export (command above)');
  console.log('2. [C-SCHEMA-004] Remove System Administrator role from the DFE Backend API');
  console.log('   service principal — it now has the QDB Portal Shell User role which is sufficient.');
  console.log('   Power Apps > Settings > Users > Application Users > DFE Backend API > Manage roles');
  console.log('3. Apply Column Security Profile to qdb_portal_configs.qdb_auth_config_json:');
  console.log('   - In Power Apps maker portal: Settings -> Column Security Profiles');
  console.log('   - Create profile "Portal Auth Config" with Read=No, Update=No for non-admin roles');
  console.log('   - Assign to qdb_auth_config_json column on qdb_portal_configs entity');
  console.log('   REASON: This column stores auth provider credentials. Without this step,');
  console.log('   any user with Read access to portal config can read clientId and clientSecret.');
  console.log('='.repeat(60));
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
