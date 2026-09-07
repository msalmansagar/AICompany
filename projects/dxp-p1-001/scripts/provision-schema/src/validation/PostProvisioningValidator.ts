import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, SolutionRecord } from '../types/DataverseMetadata.js';
import type { ValidationCheckResult, ExistingSolutionSnapshot } from '../types/ProvisioningResult.js';

const SEED_NAMES = [
  'my-requests-summary',
  'recent-activity',
  'announcements',
  'quick-actions',
  'statistics',
] as const;

export async function runPostProvisioningValidation(
  http: DataverseHttpClient,
  existingSnapshots: readonly (ExistingSolutionSnapshot | null)[],
): Promise<readonly ValidationCheckResult[]> {
  console.log('[PHASE-9] Running post-provisioning validation...');

  const checks = await Promise.all([
    checkSolutionExists(http),
    checkOptionSetExists(http),
    checkEntityExists(http, 'qdb_component_definitions'),
    checkEntityExists(http, 'qdb_component_versions'),
    checkRelationshipExists(http),
    checkAlternateKeyExists(http),
    ...SEED_NAMES.map((name) => checkSeedDefinitionExists(http, name)),
    ...existingSnapshots
      .filter((s): s is ExistingSolutionSnapshot => s !== null)
      .map((s) => checkSolutionUnchanged(http, s)),
  ]);

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;

  console.log(`[PHASE-9] Validation complete: ${passed} passed, ${failed} failed.`);

  if (failed > 0) {
    checks.filter((c) => !c.passed).forEach((c) => {
      console.error(`[PHASE-9] [FAIL] ${c.checkName}: ${c.detail}`);
    });
  }

  return checks;
}

async function checkSolutionExists(http: DataverseHttpClient): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    { filter: `uniquename eq 'QdbDxpPlatform'`, select: ['solutionid'] },
  );
  const exists = (response?.value.length ?? 0) > 0;
  return { checkName: 'Solution QdbDxpPlatform exists', passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkOptionSetExists(http: DataverseHttpClient): Promise<ValidationCheckResult> {
  const existing = await http.get(`GlobalOptionSetDefinitions(Name='qdb_component_category')`);
  const exists = existing !== null;
  return { checkName: 'GlobalOptionSet qdb_component_category exists', passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkEntityExists(http: DataverseHttpClient, logicalName: string): Promise<ValidationCheckResult> {
  const existing = await http.get(`EntityDefinitions(LogicalName='${logicalName}')`);
  const exists = existing !== null;
  return { checkName: `Entity ${logicalName} exists`, passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkRelationshipExists(http: DataverseHttpClient): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<{ SchemaName: string }>>(
    'RelationshipDefinitions',
    { filter: `SchemaName eq 'qdb_componentdefinition_versions'` },
  );
  const exists = (response?.value.length ?? 0) > 0;
  return { checkName: 'Relationship qdb_componentdefinition_versions exists', passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkAlternateKeyExists(http: DataverseHttpClient): Promise<ValidationCheckResult> {
  const response = await http.get<{ value: readonly { SchemaName: string }[] }>(
    `EntityDefinitions(LogicalName='qdb_component_definitions')/Keys`,
  );
  const exists = response?.value.some((k) => k.SchemaName === 'qdb_ComponentDefinitionNameKey') ?? false;
  return { checkName: 'Alternate key qdb_ComponentDefinitionNameKey exists', passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkSeedDefinitionExists(http: DataverseHttpClient, name: string): Promise<ValidationCheckResult> {
  const existing = await http.get(`qdb_component_definitionses(qdb_name='${name}')`);
  const exists = existing !== null;
  return { checkName: `Seed definition '${name}' exists`, passed: exists, detail: exists ? 'Found' : 'NOT FOUND' };
}

async function checkSolutionUnchanged(
  http: DataverseHttpClient,
  snapshot: ExistingSolutionSnapshot,
): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    { filter: `uniquename eq '${snapshot.uniqueName}'`, select: ['solutionid', 'version'] },
  );

  const current = response?.value[0];
  if (!current) {
    return {
      checkName: `${snapshot.uniqueName} unchanged`,
      passed: false,
      detail: `Solution no longer found — was at v${snapshot.version}`,
    };
  }

  const versionUnchanged = current.version === snapshot.version;
  return {
    checkName: `${snapshot.uniqueName} unchanged`,
    passed: versionUnchanged,
    detail: versionUnchanged
      ? `v${current.version} — unchanged`
      : `Version changed from ${snapshot.version} to ${current.version}`,
  };
}
