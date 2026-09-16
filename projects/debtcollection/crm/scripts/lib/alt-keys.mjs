/**
 * alt-keys.mjs
 * Provisions the alternate key on msst_dcpcustomer.msst_qid (FR-007).
 * Works on both on-prem 9.x and Dataverse (EntityKeyDefinitions endpoint).
 */
import { apiGet, apiPost } from './crm-client.mjs';
import { label1033 } from './labels.mjs';

const KEY_SCHEMA_NAME = 'msst_dcpcustomer_qid_alternatekey';

/**
 * Returns true if the QID alternate key already exists on the customer entity.
 * Uses the Keys collection (list) rather than a URI key lookup, since
 * EntityKeyMetadata does not support SchemaName as a key in the URI.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @returns {Promise<boolean>}
 */
export async function altKeyExists(cfg, token, solutionName) {
  const path = `/EntityDefinitions(LogicalName='msst_dcpcustomer')/Keys?$select=SchemaName`;
  const result = await apiGet(cfg, token, solutionName, path);
  return (result?.value ?? []).some(k => k.SchemaName === KEY_SCHEMA_NAME);
}

/**
 * Creates the QID alternate key on msst_dcpcustomer if it does not exist.
 * Returns 'created' | 'skipped'.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureQidAltKey(cfg, token, solutionName) {
  if (await altKeyExists(cfg, token, solutionName)) {
    console.log(`  [SKIP] Alternate key ${KEY_SCHEMA_NAME}`);
    return 'skipped';
  }
  await apiPost(
    cfg, token, solutionName,
    `/EntityDefinitions(LogicalName='msst_dcpcustomer')/Keys`,
    {
      SchemaName: KEY_SCHEMA_NAME,
      LogicalName: KEY_SCHEMA_NAME,
      DisplayName: label1033('QID Alternate Key'),
      KeyAttributes: ['msst_qid'],
    },
  );
  console.log(`  [CREATED] Alternate key ${KEY_SCHEMA_NAME}`);
  return 'created';
}
