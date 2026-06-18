import type { ApiClient } from './ApiClient.js';

export interface SystemUser {
  systemuserid: string;
  fullname: string;
}

export interface SecurityRole {
  roleid: string;
  name: string;
}

interface BusinessUnit {
  businessunitid: string;
}

export interface EntityPrivilege {
  PrivilegeId: string;
  PrivilegeName: string;
  // Returned as integer (1=Create, 2=Read, 4=Write, 8=Delete) or string ('Read', etc.)
  PrivilegeType: number | string;
}

// PrivilegeType int/string values for the four CRUD operations
const CRUD_TYPES = new Set<number | string>([1, 2, 4, 8, 'Create', 'Read', 'Write', 'Delete']);
const READ_TYPES = new Set<number | string>([2, 'Read']);

export const RUNTIME_ROLE_NAME = 'QDB DXP Platform Runtime';

// Entities the runtime SP must access. The revoked tokens entity is read-only.
export const COMPONENT_ENTITIES: ReadonlyArray<{ logicalName: string; readOnly: boolean }> = [
  { logicalName: 'qdb_component_definitions', readOnly: false },
  { logicalName: 'qdb_component_versions', readOnly: false },
  { logicalName: 'qdb_portal_revoked_tokens', readOnly: true },
];

export class SecurityRoleProvisioner {
  constructor(
    private readonly api: ApiClient,
    private readonly isDryRun: boolean,
  ) {}

  async findSystemUser(applicationId: string): Promise<SystemUser | null> {
    const users = await this.api.getCollection<SystemUser>(
      'systemusers',
      `applicationid eq ${applicationId}`,
      'systemuserid,fullname',
    );
    return users[0] ?? null;
  }

  async findRootBusinessUnitId(): Promise<string> {
    const units = await this.api.getCollection<BusinessUnit>(
      'businessunits',
      '_parentbusinessunitid_value eq null',
      'businessunitid',
    );
    const unit = units[0];
    if (unit === undefined) throw new Error('Root business unit not found in Dataverse.');
    return unit.businessunitid;
  }

  async findRole(roleName: string): Promise<SecurityRole | null> {
    const roles = await this.api.getCollection<SecurityRole>(
      'roles',
      `name eq '${roleName}'`,
      'roleid,name',
    );
    return roles[0] ?? null;
  }

  async createRole(roleName: string, rootBusinessUnitId: string): Promise<string> {
    if (this.isDryRun) {
      console.log(`[DRY RUN] Would create role: "${roleName}"`);
      return 'dry-run-role-id';
    }
    return this.api.create('roles', {
      name: roleName,
      'businessunitid@odata.bind': `/businessunits(${rootBusinessUnitId})`,
    });
  }

  async fetchPrivilegesForEntity(logicalName: string, readOnly: boolean): Promise<EntityPrivilege[]> {
    const all = await this.api.getCollection<EntityPrivilege>(
      `EntityDefinitions(LogicalName='${logicalName}')/Privileges`,
    );
    const allowedTypes = readOnly ? READ_TYPES : CRUD_TYPES;
    return all.filter((p) => allowedTypes.has(p.PrivilegeType));
  }

  async assignPrivilegesToRole(roleId: string, privileges: EntityPrivilege[]): Promise<void> {
    if (this.isDryRun) {
      console.log(`[DRY RUN] Would add ${privileges.length} privileges to role ${roleId}`);
      return;
    }
    await this.api.executeAction(
      `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`,
      { Privileges: privileges.map((p) => ({ PrivilegeId: p.PrivilegeId, Depth: 'Global' })) },
    );
  }

  async isRoleAssignedToUser(userId: string, roleId: string): Promise<boolean> {
    const assigned = await this.api.getCollection<{ roleid: string }>(
      `systemusers(${userId})/systemuserroles_association`,
      undefined,
      'roleid',
    );
    return assigned.some((r) => r.roleid === roleId);
  }

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    if (this.isDryRun) {
      console.log(`[DRY RUN] Would assign role ${roleId} to user ${userId}`);
      return;
    }
    await this.api.addRef(
      `systemusers(${userId})/systemuserroles_association/$ref`,
      `${this.api.orgUrl}/api/data/v9.2/roles(${roleId})`,
    );
  }

  async getUserRoleNames(userId: string): Promise<string[]> {
    const roles = await this.api.getCollection<SecurityRole>(
      `systemusers(${userId})/systemuserroles_association`,
      undefined,
      'roleid,name',
    );
    return roles.map((r) => r.name);
  }
}
