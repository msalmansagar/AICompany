import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import { resolveServicePrincipalUserId } from '../preflight/ServicePrincipalRoleCheck.js';
import type { ODataCollectionResponse, RoleRecord } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// Assign the Portal Shell API Role to the service principal application user.
// Idempotent: skip if already assigned.
export async function assignRoleToServicePrincipal(
  http: DataverseHttpClient,
  roleId: string,
): Promise<StepResult> {
  console.log('[PHASE-7] Assigning Portal Shell API Role to service principal...');

  if (env.DRY_RUN) {
    console.log('[PHASE-7] [DRY-RUN SKIP] Would assign role to service principal.');
    return { name: 'SP role assignment', status: 'dry-run' };
  }

  const spUserId = await resolveServicePrincipalUserId(http);

  const existingRolesResponse = await http.get<ODataCollectionResponse<RoleRecord>>(
    `systemusers(${spUserId})/systemuserroles_association`,
    { select: ['roleid', 'name'] },
  );

  const existingRoles = existingRolesResponse?.value ?? [];
  const alreadyAssigned = existingRoles.some((r) => r.roleid === roleId);

  if (alreadyAssigned) {
    console.log('[PHASE-7] [SKIP] Portal Shell API Role already assigned to service principal.');
    return { name: 'SP role assignment', status: 'skipped' };
  }

  await http.post(
    `systemusers(${spUserId})/systemuserroles_association/$ref`,
    { '@odata.id': `${env.DATAVERSE_ORG_URL}/api/data/v9.2/roles(${roleId})` },
  );

  console.log('[PHASE-7] [PASS] Portal Shell API Role assigned to service principal.');
  return { name: 'SP role assignment', status: 'created' };
}
