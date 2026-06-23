import { parseEnv } from './config.js';
import { TokenProvider } from './TokenProvider.js';
import { ApiClient } from './ApiClient.js';
import {
  SecurityRoleProvisioner,
  RUNTIME_ROLE_NAME,
  COMPONENT_ENTITIES,
  type SystemUser,
  type EntityPrivilege,
} from './SecurityRoleProvisioner.js';

async function main(): Promise<void> {
  const startMs = Date.now();
  const env = parseEnv();

  log('[PHASE-0] Environment validated.');
  if (env.DRY_RUN) log('[PHASE-0] DRY_RUN=true — no writes will be made to Dataverse.');

  const tokenProvider = new TokenProvider(env);
  await tokenProvider.acquireToken();
  log('[PHASE-1] Token acquired.');

  const api = new ApiClient(env.DATAVERSE_ORG_URL, () => tokenProvider.acquireToken());
  const provisioner = new SecurityRoleProvisioner(api, env.DRY_RUN);

  const runtimeUser = await resolveRuntimeUser(provisioner, env.RUNTIME_SP_CLIENT_ID);
  const rootBuId = await resolveRootBusinessUnit(provisioner);
  const roleId = await ensureRuntimeRole(provisioner, rootBuId);
  const privileges = await gatherPrivileges(provisioner);
  await applyPrivilegesToRole(provisioner, roleId, privileges);
  await ensureRoleOnUser(provisioner, runtimeUser.systemuserid, roleId);
  await reportProvisioningSpRoles(provisioner, env.DATAVERSE_CLIENT_ID);

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  log(`\n[COMPLETE] SP privilege configuration finished in ${elapsed}s`);
}

async function resolveRuntimeUser(
  provisioner: SecurityRoleProvisioner,
  clientId: string,
): Promise<SystemUser> {
  log('[PHASE-2] Looking up runtime SP system user...');
  const user = await provisioner.findSystemUser(clientId);
  if (user === null) {
    throw new Error(
      `Runtime SP system user not found (applicationid=${clientId}).\n` +
        'Ensure the runtime SP has been added to Dataverse as a non-interactive Application User.',
    );
  }
  log(`[PHASE-2] [PASS] Runtime SP: ${user.fullname} (${user.systemuserid})`);
  return user;
}

async function resolveRootBusinessUnit(provisioner: SecurityRoleProvisioner): Promise<string> {
  log('[PHASE-3] Resolving root business unit...');
  const rootBuId = await provisioner.findRootBusinessUnitId();
  log(`[PHASE-3] [PASS] Root BU: ${rootBuId}`);
  return rootBuId;
}

async function ensureRuntimeRole(
  provisioner: SecurityRoleProvisioner,
  rootBuId: string,
): Promise<string> {
  log(`[PHASE-4] Ensuring security role "${RUNTIME_ROLE_NAME}" exists...`);
  const existing = await provisioner.findRole(RUNTIME_ROLE_NAME);

  if (existing !== null) {
    log(`[PHASE-4] [SKIP] Role already exists: ${existing.roleid}`);
    return existing.roleid;
  }

  const roleId = await provisioner.createRole(RUNTIME_ROLE_NAME, rootBuId);
  log(`[PHASE-4] [PASS] Created role: ${roleId}`);
  return roleId;
}

async function gatherPrivileges(provisioner: SecurityRoleProvisioner): Promise<EntityPrivilege[]> {
  log('[PHASE-5] Fetching required privileges from entity metadata...');
  const collected: EntityPrivilege[] = [];

  for (const entity of COMPONENT_ENTITIES) {
    try {
      const privileges = await provisioner.fetchPrivilegesForEntity(entity.logicalName, entity.readOnly);
      const label = entity.readOnly ? 'Read' : 'CRUD';
      log(`[PHASE-5]   ${entity.logicalName}: ${privileges.length} ${label} privileges`);
      collected.push(...privileges);
    } catch (error) {
      log(`[PHASE-5] [WARN] Could not fetch privileges for ${entity.logicalName}: ${String(error)}`);
    }
  }

  if (collected.length === 0) throw new Error('[PHASE-5] No privileges resolved — aborting.');
  log(`[PHASE-5] [PASS] Total privileges to assign: ${collected.length}`);
  return collected;
}

async function applyPrivilegesToRole(
  provisioner: SecurityRoleProvisioner,
  roleId: string,
  privileges: EntityPrivilege[],
): Promise<void> {
  log(`[PHASE-6] Assigning ${privileges.length} privileges to role...`);
  await provisioner.assignPrivilegesToRole(roleId, privileges);
  log('[PHASE-6] [PASS] Privileges assigned.');
}

async function ensureRoleOnUser(
  provisioner: SecurityRoleProvisioner,
  userId: string,
  roleId: string,
): Promise<void> {
  log(`[PHASE-7] Assigning runtime role to SP user ${userId}...`);
  const alreadyAssigned = await provisioner.isRoleAssignedToUser(userId, roleId);

  if (alreadyAssigned) {
    log('[PHASE-7] [SKIP] Role already assigned to user.');
    return;
  }

  await provisioner.assignRoleToUser(userId, roleId);
  log('[PHASE-7] [PASS] Role assigned to user.');
}

async function reportProvisioningSpRoles(
  provisioner: SecurityRoleProvisioner,
  provisioningSpClientId: string,
): Promise<void> {
  log('[PHASE-8] Verifying provisioning SP privilege scope (GGAP-005)...');
  const provUser = await provisioner.findSystemUser(provisioningSpClientId);

  if (provUser === null) {
    log('[PHASE-8] [WARN] Provisioning SP system user not found — skipping verification.');
    return;
  }

  const roleNames = await provisioner.getUserRoleNames(provUser.systemuserid);
  const hasSysAdmin = roleNames.some((r) => r === 'System Administrator');

  log(`[PHASE-8] Provisioning SP roles: ${roleNames.join(', ') || '(none)'}`);

  if (hasSysAdmin) {
    log('[PHASE-8] [FAIL] Provisioning SP still holds System Administrator.');
    log('[PHASE-8]        ACTION REQUIRED: Remove System Administrator from the provisioning SP in Dataverse.');
    log('[PHASE-8]        Path: Settings > Security > Users > [provisioning user] > Manage Roles');
  } else {
    log('[PHASE-8] [PASS] System Administrator not present on provisioning SP.');
  }
}

function log(message: string): void {
  console.log(message);
}

main().catch((error: unknown) => {
  console.error('[FATAL] Script aborted:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
