import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse, SystemUserRecord, RoleRecord } from '../types/DataverseMetadata.js';
import type { CheckResult } from '../types/ProvisioningResult.js';

const SYSTEM_ADMIN_ROLE_NAME = 'System Administrator';

// C-SCHEMA-004: The service principal must NOT have the System Administrator role.
// This check runs in Phase 2d (pre-flight) and again in Phase 7 (post-assignment).
export async function runServicePrincipalRoleCheck(
  http: DataverseHttpClient,
  phase: '2d' | '7',
): Promise<CheckResult> {
  const phaseLabel = `PHASE-${phase}`;
  console.log(
    `[${phaseLabel}] Checking service principal role assignments for CLIENT_ID ${env.DATAVERSE_CLIENT_ID}...`,
  );

  const spUserResponse = await http.get<ODataCollectionResponse<SystemUserRecord>>(
    'systemusers',
    {
      filter: `applicationid eq ${env.DATAVERSE_CLIENT_ID}`,
      select: ['systemuserid', 'fullname'],
    },
  );

  const spUsers = spUserResponse?.value ?? [];

  if (spUsers.length === 0) {
    const message =
      `Service principal application user not found for CLIENT_ID ${env.DATAVERSE_CLIENT_ID}. ` +
      'The application user must be registered in Dataverse before provisioning.';
    console.error(`[${phaseLabel}] [ERROR] ${message}`);
    throw new Error(`[${phaseLabel}] [ERROR] ${message}`);
  }

  const spUser = spUsers[0];
  if (!spUser) {
    throw new Error(`[${phaseLabel}] SP user query returned empty array element.`);
  }

  const rolesResponse = await http.get<ODataCollectionResponse<RoleRecord>>(
    `systemusers(${spUser.systemuserid})/systemuserroles_association`,
    { select: ['name', 'roleid'] },
  );

  const roles = rolesResponse?.value ?? [];
  const hasSystemAdmin = roles.some((r) => r.name === SYSTEM_ADMIN_ROLE_NAME);

  if (hasSystemAdmin) {
    const message =
      `C-SCHEMA-004 VIOLATION: Service principal '${spUser.fullname}' ` +
      `has the '${SYSTEM_ADMIN_ROLE_NAME}' role assigned. ` +
      'Remove this role manually and re-run. The script will NOT remove it.';
    console.error(`[${phaseLabel}] [ERROR] ${message}`);
    throw new Error(`[${phaseLabel}] UnauthorizedConfigurationError: ${message}`);
  }

  console.log(
    `[${phaseLabel}] [PASS] Service principal '${spUser.fullname}' has no System Administrator role.`,
  );

  return {
    passed: true,
    message: `SP '${spUser.fullname}' confirmed — no System Administrator role.`,
    detail: { spUserId: spUser.systemuserid, roles: roles.map((r) => r.name) },
  };
}

export async function resolveServicePrincipalUserId(
  http: DataverseHttpClient,
): Promise<string> {
  const spUserResponse = await http.get<ODataCollectionResponse<SystemUserRecord>>(
    'systemusers',
    {
      filter: `applicationid eq ${env.DATAVERSE_CLIENT_ID}`,
      select: ['systemuserid'],
    },
  );

  const spUsers = spUserResponse?.value ?? [];
  const spUser = spUsers[0];
  if (!spUser) {
    throw new Error(
      `Service principal user not found for CLIENT_ID ${env.DATAVERSE_CLIENT_ID}`,
    );
  }
  return spUser.systemuserid;
}
