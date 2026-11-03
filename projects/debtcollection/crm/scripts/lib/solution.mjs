/**
 * solution.mjs
 * Ensures the MsstDebtCollection unmanaged solution exists and exposes helpers
 * to add components to it.
 */
import { apiGet, apiPost } from './crm-client.mjs';

/** Component type codes for AddSolutionComponent */
export const COMPONENT_TYPE = {
  ENTITY:             1,
  ATTRIBUTE:          2,
  RELATIONSHIP:       10,
  OPTION_SET:         9,
  SECURITY_ROLE:      20,
  FIELD_SEC_PROFILE:  70,
};

/**
 * Returns the publisherid for publisher uniquename='MSST'.
 * Throws if not found — the publisher must exist before this script runs.
 * @param {object} cfg @param {string} token @param {string} solutionName
 */
export async function getPublisherId(cfg, token, solutionName) {
  const result = await apiGet(cfg, token, solutionName, `/publishers?$filter=uniquename eq 'MSST'&$select=publisherid`);
  if (!result?.value?.length) throw new Error('Publisher MSST not found on this org. Create it first.');
  return result.value[0].publisherid;
}

/**
 * Returns the root business unit id (parentbusinessunitid is null).
 * @param {object} cfg @param {string} token @param {string} solutionName
 */
export async function getRootBuId(cfg, token, solutionName) {
  const result = await apiGet(cfg, token, solutionName, `/businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid`);
  if (!result?.value?.length) throw new Error('Root business unit not found');
  return result.value[0].businessunitid;
}

/**
 * Creates the MsstDebtCollection unmanaged solution if it does not exist.
 * Returns its solutionid.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} publisherId
 */
export async function ensureSolution(cfg, token, solutionName, publisherId) {
  const existing = await apiGet(cfg, token, solutionName, `/solutions?$filter=uniquename eq '${solutionName}'&$select=solutionid`);
  if (existing?.value?.length) {
    console.log(`  [SKIP] Solution ${solutionName} already exists`);
    return existing.value[0].solutionid;
  }
  const { entityId } = await apiPost(cfg, token, solutionName, '/solutions', {
    uniquename:   solutionName,   // msst_debtcollection — lowercase prefix required
    friendlyname: 'MSS Debt Collection Platform',
    version:      '1.0.0.0',
    'publisherid@odata.bind': `/publishers(${publisherId})`,
  });
  console.log(`  [CREATED] Solution ${solutionName} (${entityId})`);
  return entityId;
}

/**
 * Adds a component to the solution via AddSolutionComponent.
 * Idempotent — the platform ignores duplicates.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} componentId @param {number} componentType
 */
export async function addToSolution(cfg, token, solutionName, componentId, componentType) {
  await apiPost(cfg, token, solutionName, '/AddSolutionComponent', {
    ComponentId:           componentId,
    ComponentType:         componentType,
    SolutionUniqueName:    solutionName,
    AddRequiredComponents: false,
    IncludedComponentSettingsValues: null,
  });
}
