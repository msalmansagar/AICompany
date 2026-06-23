import { env } from './config/env.js';
import { TokenProvider } from './auth/TokenProvider.js';
import { DataverseHttpClient } from './http/DataverseHttpClient.js';
import { PublisherCheck } from './preflight/PublisherCheck.js';
import { ExistingSolutionCheck } from './preflight/ExistingSolutionCheck.js';
import { PicklistConflictCheck } from './preflight/PicklistConflictCheck.js';
import { SolutionProvisioner } from './solution/SolutionProvisioner.js';
import { GlobalOptionSetProvisioner } from './optionsets/GlobalOptionSetProvisioner.js';
import { EntityProvisioner } from './entities/EntityProvisioner.js';
import { EntityCreationOrchestrator } from './entities/EntityCreationOrchestrator.js';
import { RelationshipProvisioner } from './relationships/RelationshipProvisioner.js';
import { AlternateKeyProvisioner } from './alternatekeys/AlternateKeyProvisioner.js';
import { TokenDefinitionSeed } from './seed/TokenDefinitionSeed.js';
import { TokenValueSeed } from './seed/TokenValueSeed.js';
import { SeedOrchestrator } from './seed/SeedOrchestrator.js';
import { PostProvisioningValidator } from './validation/PostProvisioningValidator.js';
import { ProvisioningCompleteEmitter } from './output/ProvisioningCompleteEmitter.js';

async function run(): Promise<void> {
  const startMs = Date.now();

  console.log('DXP-P1-003 Schema Provisioner');
  console.log(`  Org URL : ${env.DATAVERSE_ORG_URL}`);
  console.log(`  Mode    : ${env.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const tokenProvider = new TokenProvider();
  const http = new DataverseHttpClient(tokenProvider);

  // Phase 0: acquire a token to verify credentials early
  console.log('[Phase 0] Verifying credentials...');
  await tokenProvider.acquireToken();
  console.log('  [OK] Credentials verified');

  // Phase 1: publisher
  const publisherCheck = new PublisherCheck(http);
  const publisherResult = await publisherCheck.ensurePublisherExists();
  let publisherId: string;
  if (publisherResult.found) {
    publisherId = publisherResult.publisherId;
  } else if (publisherResult.created) {
    publisherId = publisherResult.publisherId;
  } else {
    publisherId = publisherResult.mockPublisherId;
  }

  // Phase 2: existing solution snapshot
  const solutionCheck = new ExistingSolutionCheck(http);
  await solutionCheck.captureSnapshot();

  // Phase 3: picklist conflict detection
  const conflictCheck = new PicklistConflictCheck(http);
  const conflictReport = await conflictCheck.detectConflicts();

  // Phase 4: solution
  const solutionProvisioner = new SolutionProvisioner(http);
  const solutionResult = await solutionProvisioner.ensureSolutionExists(publisherId);

  // Phase 5: global option sets
  const optionSetProvisioner = new GlobalOptionSetProvisioner(http);
  const optionSetResults = await optionSetProvisioner.provisionAll(conflictReport.alreadyExist);

  // Phase 6: entities
  const entityProvisioner = new EntityProvisioner(http);
  const entityOrchestrator = new EntityCreationOrchestrator(entityProvisioner);
  const entityResults = await entityOrchestrator.provisionAll();

  // Phase 7: relationship
  const relationshipProvisioner = new RelationshipProvisioner(http);
  const relationshipResult = await relationshipProvisioner.ensureRelationshipExists();

  // Phase 8: alternate key
  const altKeyProvisioner = new AlternateKeyProvisioner(http);
  const altKeyResult = await altKeyProvisioner.ensureAlternateKeyExists();

  // Phases 9–10: seed data
  const definitionSeed = new TokenDefinitionSeed(http);
  const valueSeed = new TokenValueSeed(http);
  const seedOrchestrator = new SeedOrchestrator(definitionSeed, valueSeed);
  const seedResults = await seedOrchestrator.seedAll();

  // Phase 11: post-provisioning validation
  const validator = new PostProvisioningValidator(http);
  const validationChecks = await validator.runAll();

  // Emit final report
  const emitter = new ProvisioningCompleteEmitter();
  emitter.emit({
    publisher: publisherId,
    solution: solutionResult,
    optionSets: optionSetResults,
    entities: entityResults,
    relationship: relationshipResult,
    alternateKey: altKeyResult,
    seedDefinitions: seedResults.definitions,
    seedValues: seedResults.values,
    validationChecks,
    durationMs: Date.now() - startMs,
    dryRun: env.DRY_RUN,
  });
}

run().catch((error: unknown) => {
  console.error('[FATAL] Provisioning failed:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
