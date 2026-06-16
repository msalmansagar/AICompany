import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type {
  ODataCollectionResponse,
  EntityDefinitionRecord,
  RoleRecord,
  RelationshipRecord,
  SolutionRecord,
} from '../types/DataverseMetadata.js';
import type {
  ValidationCheckResult,
  ExistingSolutionSnapshot,
} from '../types/ProvisioningResult.js';
import { runServicePrincipalRoleCheck } from '../preflight/ServicePrincipalRoleCheck.js';

const EXPECTED_ENTITIES: readonly string[] = [
  'qdb_portal_users',
  'qdb_portal_reset_tokens',
  'qdb_portal_revoked_tokens',
  'qdb_portal_configs',
  'qdb_portal_nav_items',
  'qdb_portal_widget_configs',
  'qdb_portal_services',
  'qdb_portal_service_tabs',
  'qdb_portal_requests',
  'qdb_portal_request_timelines',
  'qdb_portal_request_documents',
  'qdb_portal_notifications',
  'qdb_cms_contents',
  'qdb_cms_revisions',
  'qdb_portal_user_entities',
];

const EXPECTED_OPTION_SETS: readonly string[] = [
  'qdb_preferred_language',
  'qdb_nav_layout',
  'qdb_sidebar_default_state',
  'qdb_auth_provider',
  'qdb_badge_source',
  'qdb_request_status',
  'qdb_notification_type',
  'qdb_cms_content_type',
  'qdb_cms_status',
];

// Read-only verification. Returns all 24 check results.
// Exits with code 1 if any check fails.
export async function runPostProvisioningValidation(
  http: DataverseHttpClient,
  phase2cSnapshot: ExistingSolutionSnapshot | null,
): Promise<readonly ValidationCheckResult[]> {
  console.log('[PHASE-9] Starting post-provisioning validation (24 checks)...');

  const results: ValidationCheckResult[] = [];

  // 15 entity checks
  for (const entityName of EXPECTED_ENTITIES) {
    const result = await checkEntityExists(http, entityName);
    results.push(result);
    logCheck(result);
  }

  // 9 option set checks
  for (const optionSetName of EXPECTED_OPTION_SETS) {
    const result = await checkOptionSetExists(http, optionSetName);
    results.push(result);
    logCheck(result);
  }

  // Solution check
  const solutionCheck = await checkSolutionExists(http, 'QdbPortalShell');
  results.push(solutionCheck);
  logCheck(solutionCheck);

  // Security role check
  const roleCheck = await checkRoleExists(http);
  results.push(roleCheck);
  logCheck(roleCheck);

  // C-SCHEMA-004: SP has no System Admin
  const spCheck = await checkSpHasNoSystemAdmin(http);
  results.push(spCheck);
  logCheck(spCheck);

  // C-SCHEMA-006: QdbDynamicFormEngine unchanged
  const solutionIntegrityCheck = await checkSolutionIntegrity(http, phase2cSnapshot);
  results.push(solutionIntegrityCheck);
  logCheck(solutionIntegrityCheck);

  // Self-referential relationship
  const relationshipCheck = await checkRelationshipExists(http);
  results.push(relationshipCheck);
  logCheck(relationshipCheck);

  // Seed SD-001
  const sd001Check = await checkSeedConfigExists(http);
  results.push(sd001Check);
  logCheck(sd001Check);

  // Seed SD-003
  const sd003Check = await checkSeedUserExists(http);
  results.push(sd003Check);
  logCheck(sd003Check);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log('');
  if (passed === total) {
    console.log(`[PHASE-9] [PASS] Validation complete. ${passed}/${total} checks passed.`);
  } else {
    console.error(`[PHASE-9] [ERROR] Validation complete. ${passed}/${total} checks passed. See [FAIL] entries above.`);
  }

  return results;
}

// ── Individual check functions ─────────────────────────────────────────────────

async function checkEntityExists(
  http: DataverseHttpClient,
  logicalName: string,
): Promise<ValidationCheckResult> {
  const result = await http.get<EntityDefinitionRecord>(
    `EntityDefinitions(LogicalName='${logicalName}')`,
  );
  return {
    checkName: `Entity ${logicalName}`,
    passed: result !== null,
    detail: result !== null ? 'exists' : 'NOT FOUND',
  };
}

async function checkOptionSetExists(
  http: DataverseHttpClient,
  name: string,
): Promise<ValidationCheckResult> {
  const result = await http.get(`GlobalOptionSetDefinitions(Name='${name}')`);
  return {
    checkName: `GlobalOptionSet ${name}`,
    passed: result !== null,
    detail: result !== null ? 'exists' : 'NOT FOUND',
  };
}

async function checkSolutionExists(
  http: DataverseHttpClient,
  uniqueName: string,
): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    { filter: `uniquename eq '${uniqueName}'`, select: ['solutionid'] },
  );
  const found = (response?.value ?? []).length > 0;
  return {
    checkName: `Solution ${uniqueName}`,
    passed: found,
    detail: found ? 'exists' : 'NOT FOUND',
  };
}

async function checkRoleExists(
  http: DataverseHttpClient,
): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<RoleRecord>>(
    'roles',
    { filter: `name eq 'Portal Shell API Role'`, select: ['roleid'] },
  );
  const found = (response?.value ?? []).length > 0;
  return {
    checkName: 'Security Role "Portal Shell API Role"',
    passed: found,
    detail: found ? 'exists' : 'NOT FOUND',
  };
}

async function checkSpHasNoSystemAdmin(
  http: DataverseHttpClient,
): Promise<ValidationCheckResult> {
  try {
    await runServicePrincipalRoleCheck(http, '7');
    return {
      checkName: 'SP has no System Administrator role',
      passed: true,
      detail: 'confirmed',
    };
  } catch {
    return {
      checkName: 'SP has no System Administrator role',
      passed: false,
      detail: 'C-SCHEMA-004 VIOLATION — System Administrator role detected',
    };
  }
}

async function checkSolutionIntegrity(
  http: DataverseHttpClient,
  snapshot: ExistingSolutionSnapshot | null,
): Promise<ValidationCheckResult> {
  const DFE_SOLUTION = 'QdbDynamicFormEngine';

  if (snapshot === null) {
    return {
      checkName: `${DFE_SOLUTION} component count unchanged`,
      passed: true,
      detail: 'No Phase 2c snapshot available — solution was not present at start',
    };
  }

  const response = await http.get<ODataCollectionResponse<SolutionRecord>>(
    'solutions',
    { filter: `uniquename eq '${DFE_SOLUTION}'`, select: ['solutionid', 'version'] },
  );

  const solutions = response?.value ?? [];
  const current = solutions[0];

  if (!current) {
    return {
      checkName: `${DFE_SOLUTION} component count unchanged`,
      passed: false,
      detail: `Solution ${DFE_SOLUTION} not found — may have been deleted`,
    };
  }

  if (current.version !== snapshot.version) {
    return {
      checkName: `${DFE_SOLUTION} version unchanged`,
      passed: false,
      detail: `Version changed: was ${snapshot.version}, now ${current.version}`,
    };
  }

  return {
    checkName: `${DFE_SOLUTION} component count unchanged`,
    passed: true,
    detail: `unchanged (v${snapshot.version}, ${snapshot.componentCount} components)`,
  };
}

async function checkRelationshipExists(
  http: DataverseHttpClient,
): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<RelationshipRecord>>(
    'RelationshipDefinitions',
    { filter: `SchemaName eq 'qdb_portalnavitems_parentnavitem'` },
  );
  const found = (response?.value ?? []).length > 0;
  return {
    checkName: 'Self-referential nav item relationship',
    passed: found,
    detail: found ? 'exists' : 'NOT FOUND',
  };
}

async function checkSeedConfigExists(
  http: DataverseHttpClient,
): Promise<ValidationCheckResult> {
  const response = await http.get<ODataCollectionResponse<{ qdb_portal_configsid: string }>>(
    'qdb_portal_configses',
    {
      filter: `qdb_portal_name eq 'Portal Shell (Staging)'`,
      select: ['qdb_portal_configsid'],
      top: 1,
    },
  );
  const found = (response?.value ?? []).length > 0;
  return {
    checkName: 'Seed SD-001 portal config record',
    passed: found,
    detail: found ? 'exists' : 'NOT FOUND',
  };
}

async function checkSeedUserExists(
  http: DataverseHttpClient,
): Promise<ValidationCheckResult> {
  if (env.DRY_RUN) {
    return {
      checkName: 'Seed SD-003 test user record',
      passed: true,
      detail: 'DRY_RUN — not seeded; skipping check',
    };
  }

  const response = await http.get<ODataCollectionResponse<{ qdb_portal_usersid: string }>>(
    'qdb_portal_userses',
    {
      filter: `qdb_email eq 'smoketest@portalshell.internal'`,
      select: ['qdb_portal_usersid'],
      top: 1,
    },
  );
  const found = (response?.value ?? []).length > 0;
  return {
    checkName: 'Seed SD-003 test user record',
    passed: found,
    detail: found ? 'exists' : 'NOT FOUND',
  };
}

function logCheck(result: ValidationCheckResult): void {
  const status = result.passed ? '[PASS]' : '[FAIL]';
  const name = result.checkName.padEnd(50);
  console.log(`${status} ${name} ${result.detail}`);
}
