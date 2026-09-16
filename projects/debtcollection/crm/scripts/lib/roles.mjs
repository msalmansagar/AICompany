/**
 * roles.mjs
 * Creates security roles and assigns entity privileges idempotently.
 *
 * Privilege lookup: queries the 'privileges' entity set by name.
 * Privilege names for custom entities follow the pattern:
 *   prv{Action}{EntityLogicalName}  e.g. prvReadmsst_dcpcollectioncase
 * Actions: Create, Read, Write (=Update), Delete, Append, AppendTo, Assign, Share
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { addToSolution, COMPONENT_TYPE } from './solution.mjs';
import { DEPTH, ORG_OWNED } from './role-defs.mjs';

const PRIV_ACTIONS = ['Read', 'Create', 'Write', 'Delete', 'Append', 'AppendTo'];

/**
 * Looks up a privilege id by name. Returns null if not found.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} privName
 * @returns {Promise<string|null>}
 */
async function findPrivilegeId(cfg, token, solutionName, privName) {
  const result = await apiGet(cfg, token, solutionName,
    `/privileges?$filter=name eq '${privName}'&$select=privilegeid,name`);
  return result?.value?.[0]?.privilegeid ?? null;
}

/**
 * Resolves privilege ids for all PRIV_ACTIONS on a given entity.
 * Returns a map: { create: id|null, read: id|null, write: id|null, ... }
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} entityLogicalName
 */
async function resolveEntityPrivileges(cfg, token, solutionName, entityLogicalName) {
  const map = {};
  for (const action of PRIV_ACTIONS) {
    const name = `prv${action}${entityLogicalName}`;
    map[action.toLowerCase()] = await findPrivilegeId(cfg, token, solutionName, name);
  }
  return map;
}

/**
 * Returns the roleid of an existing role by name, or null.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} roleName
 */
export async function getRoleId(cfg, token, solutionName, roleName) {
  const result = await apiGet(cfg, token, solutionName,
    `/roles?$filter=name eq '${roleName}'&$select=roleid`);
  return result?.value?.[0]?.roleid ?? null;
}

/**
 * Creates the security role if it does not exist. Returns { roleId, status }.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} roleName @param {string} rootBuId
 */
export async function ensureRole(cfg, token, solutionName, roleName, rootBuId) {
  const existingId = await getRoleId(cfg, token, solutionName, roleName);
  if (existingId) {
    console.log(`  [SKIP] Role ${roleName}`);
    return { roleId: existingId, status: 'skipped' };
  }
  const { entityId } = await apiPost(cfg, token, solutionName, '/roles', {
    name: roleName,
    'businessunitid@odata.bind': `/businessunits(${rootBuId})`,
  });
  const roleId = entityId ?? await getRoleId(cfg, token, solutionName, roleName);
  if (roleId) {
    await addToSolution(cfg, token, solutionName, roleId, COMPONENT_TYPE.SECURITY_ROLE);
  }
  console.log(`  [CREATED] Role ${roleName}`);
  return { roleId, status: 'created' };
}

/**
 * Applies entity privileges for one role using AddPrivilegesRole.
 * Builds a privilege list from the role definition and the resolved privilege ids.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} roleId @param {object} rolePrivileges map of entity → { c, r, u }
 */
/** ReplacePrivilegesRole is used, not Add: it is idempotent and makes the single role matrix the whole truth. */
/** @param {{c?: string, r?: string, u?: string}} access */
function toGlobalDepth(access) {
  return { ...(access.c && { c: DEPTH.GLOBAL }), ...(access.r && { r: DEPTH.GLOBAL }), ...(access.u && { u: DEPTH.GLOBAL }) };
}

export async function applyRolePrivileges(cfg, token, solutionName, roleId, rolePrivileges) {
  const privilegeList = [];
  for (const [entityLogicalName, rawAccess] of Object.entries(rolePrivileges)) {
    const access = ORG_OWNED.has(entityLogicalName) ? toGlobalDepth(rawAccess) : rawAccess;
    const ids = await resolveEntityPrivileges(cfg, token, solutionName, entityLogicalName);
    if (access.r && ids.read) {
      privilegeList.push({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: access.r, PrivilegeId: ids.read });
    }
    if (access.c && ids.create) {
      privilegeList.push({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: access.c, PrivilegeId: ids.create });
    }
    if (access.u && ids.write) {
      privilegeList.push({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: access.u, PrivilegeId: ids.write });
    }
    // Append/AppendTo needed for lookups to work
    if ((access.c || access.u) && ids.append) {
      privilegeList.push({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: ORG_OWNED.has(entityLogicalName) ? DEPTH.GLOBAL : DEPTH.LOCAL, PrivilegeId: ids.append });
    }
    if ((access.c || access.u) && ids.appendto) {
      privilegeList.push({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: ORG_OWNED.has(entityLogicalName) ? DEPTH.GLOBAL : DEPTH.LOCAL, PrivilegeId: ids.appendto });
    }
  }
  if (privilegeList.length === 0) return;
  await apiPost(cfg, token, solutionName,
    `/roles(${roleId})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`,
    { Privileges: privilegeList },
  );
}
