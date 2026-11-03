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
import { DEPTH } from './role-defs.mjs';

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
const ownershipCache = new Map();

/**
 * Reads OwnershipType from the organisation rather than a hard-coded list.
 * The platform rejects any depth other than Global on an organisation-owned table, and a static set
 * silently goes stale the moment a second schema (here `qdb_`) is provisioned alongside the first.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} entityLogicalName
 * @returns {Promise<boolean>}
 */
async function isOrganizationOwned(cfg, token, solutionName, entityLogicalName) {
  if (!ownershipCache.has(entityLogicalName)) {
    const metadata = await apiGet(cfg, token, solutionName,
      `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=OwnershipType`);
    ownershipCache.set(entityLogicalName, metadata?.OwnershipType === 'OrganizationOwned');
  }
  return ownershipCache.get(entityLogicalName);
}

/**
 * Builds the RolePrivilege entries for one entity at the depths its ownership allows.
 * Append/AppendTo are required for the entity's lookups to be usable.
 * @param {{c?: string, r?: string, u?: string}} access
 * @param {object} ids @param {boolean} isOrgOwned
 * @returns {object[]}
 */
function buildEntityPrivileges(access, ids, isOrgOwned) {
  const depthOf = requested => (isOrgOwned ? DEPTH.GLOBAL : requested);
  const privilege = (depth, privilegeId) =>
    ({ '@odata.type': 'Microsoft.Dynamics.CRM.RolePrivilege', Depth: depth, PrivilegeId: privilegeId });
  const entries = [];
  if (access.r && ids.read) entries.push(privilege(depthOf(access.r), ids.read));
  if (access.c && ids.create) entries.push(privilege(depthOf(access.c), ids.create));
  if (access.u && ids.write) entries.push(privilege(depthOf(access.u), ids.write));
  const mayLink = access.c || access.u;
  if (mayLink && ids.append) entries.push(privilege(depthOf(DEPTH.LOCAL), ids.append));
  if (mayLink && ids.appendto) entries.push(privilege(depthOf(DEPTH.LOCAL), ids.appendto));
  return entries;
}

/** ReplacePrivilegesRole is used, not Add: it is idempotent and makes the single role matrix the whole truth. */
export async function applyRolePrivileges(cfg, token, solutionName, roleId, rolePrivileges) {
  const privilegeList = [];
  for (const [entityLogicalName, access] of Object.entries(rolePrivileges)) {
    const ids = await resolveEntityPrivileges(cfg, token, solutionName, entityLogicalName);
    const isOrgOwned = await isOrganizationOwned(cfg, token, solutionName, entityLogicalName);
    privilegeList.push(...buildEntityPrivileges(access, ids, isOrgOwned));
  }
  if (privilegeList.length === 0) return;
  await apiPost(cfg, token, solutionName,
    `/roles(${roleId})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`,
    { Privileges: privilegeList },
  );
}
