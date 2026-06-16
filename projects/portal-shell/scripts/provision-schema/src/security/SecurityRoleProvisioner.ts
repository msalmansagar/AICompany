import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type {
  ODataCollectionResponse,
  RoleRecord,
  PrivilegeRecord,
  BusinessUnitRecord,
} from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';
import { PRIVILEGE_MATRIX, OOB_PRIVILEGE_NAMES } from './privilegeMatrix.js';

export const PORTAL_SHELL_ROLE_NAME = 'Portal Shell API Role';

export async function provisionSecurityRole(
  http: DataverseHttpClient,
): Promise<StepResult & { roleId: string }> {
  console.log(`[PHASE-7] Checking for security role '${PORTAL_SHELL_ROLE_NAME}'...`);

  const existingRole = await findExistingRole(http);

  if (existingRole !== null) {
    console.log(`[PHASE-7] [SKIP] Role '${PORTAL_SHELL_ROLE_NAME}' already exists (${existingRole.roleid}).`);
    await assignPrivilegesToRole(http, existingRole.roleid);
    return { name: PORTAL_SHELL_ROLE_NAME, status: 'skipped', id: existingRole.roleid, roleId: existingRole.roleid };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-7] [DRY-RUN SKIP] Would create role '${PORTAL_SHELL_ROLE_NAME}'.`);
    return { name: PORTAL_SHELL_ROLE_NAME, status: 'dry-run', id: '', roleId: '' };
  }

  const defaultBuId = await resolveDefaultBusinessUnit(http);
  const createResponse = await http.postRaw('roles', {
    name: PORTAL_SHELL_ROLE_NAME,
    'businessunitid@odata.bind': `/businessunits(${defaultBuId})`,
  });

  const entityIdHeader = createResponse.headers.get('OData-EntityId') ?? '';
  const roleIdMatch = entityIdHeader.match(/\(([^)]+)\)/);
  const roleId = roleIdMatch?.[1];

  if (!roleId) {
    throw new Error(
      `[PHASE-7] Role POST succeeded but OData-EntityId header was missing. Header: '${entityIdHeader}'`,
    );
  }

  console.log(`[PHASE-7] [PASS] Role '${PORTAL_SHELL_ROLE_NAME}' created (${roleId}).`);

  await assignPrivilegesToRole(http, roleId);

  return { name: PORTAL_SHELL_ROLE_NAME, status: 'created', id: roleId, roleId };
}

async function assignPrivilegesToRole(
  http: DataverseHttpClient,
  roleId: string,
): Promise<void> {
  if (env.DRY_RUN) {
    console.log('[PHASE-7] [DRY-RUN SKIP] Would assign privileges to role.');
    return;
  }

  console.log('[PHASE-7] Resolving privilege GUIDs (with retry — CHALLENGE 3)...');

  const privilegeIds = await resolveAllPrivilegeIds(http);

  if (privilegeIds.length === 0) {
    console.warn('[PHASE-7] [WARN] No privilege IDs resolved — role will have no privileges.');
    return;
  }

  const privilegePayload = privilegeIds.map((id) => ({
    PrivilegeId: id,
    Depth: 'Global',
  }));

  await http.post(
    `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`,
    { Privileges: privilegePayload },
  );

  console.log(`[PHASE-7] [PASS] ${privilegeIds.length} privilege(s) assigned to role.`);
}

// CHALLENGE 3 resolution: poll up to 3 times with 3-second delays per privilege name.
async function resolvePrivilegeId(
  http: DataverseHttpClient,
  privilegeName: string,
): Promise<string | null> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await http.get<ODataCollectionResponse<PrivilegeRecord>>(
      'privileges',
      {
        filter: `name eq '${privilegeName}'`,
        select: ['privilegeid', 'name'],
      },
    );

    const privileges = response?.value ?? [];
    if (privileges.length > 0) {
      return privileges[0]?.privilegeid ?? null;
    }

    if (attempt < MAX_RETRIES) {
      console.log(
        `[PHASE-7] Privilege '${privilegeName}' not yet available (attempt ${attempt}/${MAX_RETRIES}). ` +
          `Waiting ${RETRY_DELAY_MS}ms...`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.warn(
    `[PHASE-7] [WARN] Privilege '${privilegeName}' not found after ${MAX_RETRIES} retries. ` +
      'It may appear later. Continuing without this privilege.',
  );
  return null;
}

async function resolveAllPrivilegeIds(
  http: DataverseHttpClient,
): Promise<readonly string[]> {
  const privilegeIds: string[] = [];

  // Custom entity privileges
  for (const entitySpec of PRIVILEGE_MATRIX) {
    for (const action of entitySpec.actions) {
      const privilegeName = `prv${action}${entitySpec.logicalName}`;
      const id = await resolvePrivilegeId(http, privilegeName);
      if (id !== null) {
        privilegeIds.push(id);
      }
    }
  }

  // OOB privileges
  for (const oobPrivName of OOB_PRIVILEGE_NAMES) {
    const id = await resolvePrivilegeId(http, oobPrivName);
    if (id !== null) {
      privilegeIds.push(id);
    }
  }

  return privilegeIds;
}

async function findExistingRole(
  http: DataverseHttpClient,
): Promise<RoleRecord | null> {
  const response = await http.get<ODataCollectionResponse<RoleRecord>>(
    'roles',
    {
      filter: `name eq '${PORTAL_SHELL_ROLE_NAME}'`,
      select: ['roleid', 'name'],
    },
  );
  const roles = response?.value ?? [];
  return roles[0] ?? null;
}

async function resolveDefaultBusinessUnit(
  http: DataverseHttpClient,
): Promise<string> {
  const response = await http.get<ODataCollectionResponse<BusinessUnitRecord>>(
    'businessunits',
    {
      filter: 'parentbusinessunitid eq null',
      select: ['businessunitid', 'name'],
      top: 1,
    },
  );
  const units = response?.value ?? [];
  const defaultUnit = units[0];
  if (!defaultUnit) {
    throw new Error('[PHASE-7] Could not resolve default business unit (parentbusinessunitid eq null).');
  }
  return defaultUnit.businessunitid;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
