/**
 * Security role steps (phase-3-arch.md section 11.1). Roles are created in the root business
 * unit, added to the SurveyEngine solution, and granted their manifest privileges at
 * organization depth (the survey tables are organization-owned).
 *
 * @module survey-provisioning/role-steps
 */
import { privilegeNamesFor } from './payloads.mjs';

const ROLE_COMPONENT_TYPE = 20;

/**
 * @param {{ client: object, roles: object[], solutionUniqueName: string, isApply: boolean, report: Function }} context
 */
export async function ensureRoles(context) {
  const rootBusinessUnitId = await findRootBusinessUnitId(context.client);
  for (const role of context.roles) {
    const roleId = await ensureRole(context, role, rootBusinessUnitId);
    await grantPrivileges(context, role, roleId);
  }
}

async function findRootBusinessUnitId(client) {
  const units = (await client.send('GET', 'businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null')).json.value;
  if (units.length !== 1) throw new Error(`Expected one root business unit, found ${units.length}`);
  return units[0].businessunitid;
}

async function ensureRole({ client, solutionUniqueName, isApply, report }, role, rootBusinessUnitId) {
  const filter = `name eq '${role.name}' and _businessunitid_value eq ${rootBusinessUnitId}`;
  const existing = (await client.send('GET', `roles?$select=roleid&$filter=${encodeURIComponent(filter)}`)).json.value;
  if (existing.length > 0) { report('exists', `role ${role.name}`); return existing[0].roleid; }
  report('create', `role ${role.name}`);
  if (!isApply) return null;
  const { entityId } = await client.send('POST', 'roles', { name: role.name, 'businessunitid@odata.bind': `/businessunits(${rootBusinessUnitId})` });
  await client.send('POST', 'AddSolutionComponent', {
    ComponentId: entityId, ComponentType: ROLE_COMPONENT_TYPE, SolutionUniqueName: solutionUniqueName,
    AddRequiredComponents: false, DoNotIncludeSubcomponents: false,
  });
  return entityId;
}

async function grantPrivileges({ client, isApply, report }, role, roleId) {
  const names = role.privileges.flatMap(privilegeNamesFor);
  report('grant', `role ${role.name}: ${names.length} privileges at organization depth`);
  if (!isApply) return;
  const privileges = await resolvePrivileges(client, names);
  await client.send('POST', `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, {
    Privileges: privileges.map((privilege) => ({ PrivilegeId: privilege.privilegeid, Depth: 'Global' })),
  });
}

async function resolvePrivileges(client, names) {
  const filter = names.map((name) => `name eq '${name}'`).join(' or ');
  const found = (await client.send('GET', `privileges?$select=privilegeid,name&$filter=${encodeURIComponent(filter)}`)).json.value;
  const foundNames = new Set(found.map((p) => p.name.toLowerCase()));
  const missing = names.filter((name) => !foundNames.has(name.toLowerCase()));
  if (missing.length > 0) throw new Error(`Privileges not found (table missing or not published?): ${missing.join(', ')}`);
  return found;
}
