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
    await revokeSurplusPrivileges(context, role, roleId);
  }
}

/**
 * Privileges a role holds on its `revokeOn` tables that the manifest no longer grants (a role cut back after it
 * was created, e.g. Survey Integration, review item 3). Platform defaults on other tables are never listed.
 *
 * @param {{ privileges: object[], revokeOn?: string[] }} role
 * @param {string[]} grantedNames Privilege names the role holds now.
 * @returns {string[]} The names to remove.
 */
export function surplusPrivileges(role, grantedNames) {
  if (!role.revokeOn?.length) return [];
  const allowed = new Set(role.privileges.flatMap(privilegeNamesFor).map((name) => name.toLowerCase()));
  const pattern = new RegExp(`^prv(Create|Read|Write|Delete|Append|AppendTo|Assign|Share)(${role.revokeOn.join('|')})$`, 'i');
  return grantedNames.filter((name) => pattern.test(name) && !allowed.has(name.toLowerCase()));
}

async function revokeSurplusPrivileges({ client, isApply, report }, role, roleId) {
  if (!role.revokeOn?.length || !roleId) return;
  const held = await heldPrivileges(client, roleId);
  const surplus = surplusPrivileges(role, held.map((privilege) => privilege.name));
  if (surplus.length === 0) { report('exists', `role ${role.name}: nothing to revoke`); return; }
  report('revoke', `role ${role.name}: ${surplus.length} privileges it no longer needs (${surplus.join(', ')})`);
  if (!isApply) return;
  const idByName = new Map(held.map((privilege) => [privilege.name.toLowerCase(), privilege.privilegeid]));
  for (const name of surplus) {
    await client.send('POST', `roles(${roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`, { PrivilegeId: idByName.get(name.toLowerCase()) });
  }
}

// The role's privileges with their names (RetrieveRolePrivilegesRole returns ids only).
async function heldPrivileges(client, roleId) {
  const ids = (await client.send('GET', `RetrieveRolePrivilegesRole(RoleId=${roleId})`)).json.RolePrivileges.map((granted) => granted.PrivilegeId);
  const named = [];
  for (let start = 0; start < ids.length; start += 50) {
    const filter = ids.slice(start, start + 50).map((id) => `privilegeid eq ${id}`).join(' or ');
    named.push(...(await client.send('GET', `privileges?$select=privilegeid,name&$filter=${encodeURIComponent(filter)}`)).json.value);
  }
  return named;
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
  // A role that only admits its holder to a check (Survey Scheduler) grants nothing; AddPrivilegesRole needs a list.
  if (names.length === 0) { report('grant', `role ${role.name}: no table rights`); return; }
  report('grant', `role ${role.name}: ${names.length} privileges at organization depth`);
  if (!isApply) return;
  const privileges = await resolvePrivileges(client, names);
  await client.send('POST', `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, {
    Privileges: privileges.map((privilege) => ({ PrivilegeId: privilege.privilegeid, Depth: 'Global' })),
  });
  await verifyOrganizationDepth(client, role, roleId, privileges);
  report('verified', `role ${role.name}: all ${privileges.length} privileges at organization depth`);
}

// A grant at the wrong depth fails silently: an organization-owned row is then invisible to
// the role. Reading the role back is the only proof the grant landed as intended.
async function verifyOrganizationDepth(client, role, roleId, privileges) {
  const granted = (await client.send('GET', `RetrieveRolePrivilegesRole(RoleId=${roleId})`)).json.RolePrivileges;
  const depthById = new Map(granted.map((g) => [g.PrivilegeId, String(g.Depth)]));
  const wrong = privileges.filter((p) => !['Global', '3'].includes(depthById.get(p.privilegeid)));
  if (wrong.length > 0) {
    const detail = wrong.map((p) => `${p.name}=${depthById.get(p.privilegeid) ?? 'missing'}`).join(', ');
    throw new Error(`Role ${role.name}: privileges not at organization depth: ${detail}`);
  }
}

async function resolvePrivileges(client, names) {
  const filter = names.map((name) => `name eq '${name}'`).join(' or ');
  const found = (await client.send('GET', `privileges?$select=privilegeid,name&$filter=${encodeURIComponent(filter)}`)).json.value;
  const foundNames = new Set(found.map((p) => p.name.toLowerCase()));
  const missing = names.filter((name) => !foundNames.has(name.toLowerCase()));
  if (missing.length > 0) throw new Error(`Privileges not found (table missing or not published?): ${missing.join(', ')}`);
  return found;
}
