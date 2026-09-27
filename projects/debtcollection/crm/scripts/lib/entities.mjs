/**
 * entities.mjs
 * Creates Dataverse entities idempotently via EntityDefinitions, in two phases:
 *   1. the table with only its primary name column,
 *   2. every other column one POST at a time.
 * A single payload carrying forty columns fails with the opaque 0x80040216 and names
 * nothing; per-column creation names the offending column and stays idempotent.
 * Picklists bind to their global option set by MetadataId, which is the only form the
 * Web API accepts on both on-prem 9.x and Dataverse.
 * Note: GOT-010 — always use direct logical-name lookup, never a filtered scan.
 */
import { apiGet, apiPost, apiPut } from './crm-client.mjs';
import { addToSolution, COMPONENT_TYPE } from './solution.mjs';

const optionSetIdCache = new Map();

/**
 * Returns true if the entity already exists on the org.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} logicalName
 * @returns {Promise<boolean>}
 */
export async function entityExists(cfg, token, solutionName, logicalName) {
  const result = await apiGet(cfg, token, solutionName, `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName`);
  return result !== null;
}

/**
 * Returns the MetadataId of an existing entity, or null if not found.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} logicalName
 * @returns {Promise<string|null>}
 */
export async function getEntityMetadataId(cfg, token, solutionName, logicalName) {
  const result = await apiGet(cfg, token, solutionName, `/EntityDefinitions(LogicalName='${logicalName}')?$select=MetadataId`);
  return result?.MetadataId ?? null;
}

/**
 * Returns true if the attribute already exists on the entity.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {string} entityName @param {string} attributeName
 * @returns {Promise<boolean>}
 */
async function attributeExists(cfg, token, solutionName, entityName, attributeName) {
  const path = `/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')?$select=LogicalName`;
  return (await apiGet(cfg, token, solutionName, path)) !== null;
}

/**
 * Resolves a global option set's MetadataId by name, cached for the run.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} name
 * @returns {Promise<string>}
 */
async function getGlobalOptionSetId(cfg, token, solutionName, name) {
  if (optionSetIdCache.has(name)) return optionSetIdCache.get(name);
  const result = await apiGet(cfg, token, solutionName, `/GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`);
  if (!result?.MetadataId) throw new Error(`Global option set ${name} not found`);
  optionSetIdCache.set(name, result.MetadataId);
  return result.MetadataId;
}

/**
 * Rewrites a picklist attribute to bind its global option set by MetadataId.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} attribute
 * @returns {Promise<object>}
 */
async function bindGlobalOptionSet(cfg, token, solutionName, attribute) {
  const setName = attribute.OptionSet?.Name;
  if (!attribute.OptionSet?.IsGlobal || !setName) return attribute;
  const { OptionSet, ...rest } = attribute;
  const optionSetId = await getGlobalOptionSetId(cfg, token, solutionName, setName);
  return { ...rest, 'GlobalOptionSet@odata.bind': `/GlobalOptionSetDefinitions(${optionSetId})` };
}

/**
 * Creates one attribute on an existing entity if it is absent.
 * @param {object} cfg @param {string} token @param {string} solutionName
 * @param {{ entityName: string, attribute: object }} target
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureAttribute(cfg, token, solutionName, { entityName, attribute }) {
  if (await attributeExists(cfg, token, solutionName, entityName, attribute.LogicalName)) return 'skipped';
  const body = await bindGlobalOptionSet(cfg, token, solutionName, attribute);
  await apiPost(cfg, token, solutionName, `/EntityDefinitions(LogicalName='${entityName}')/Attributes`, body);
  console.log(`    [CREATED] ${entityName}.${attribute.LogicalName}`);
  return 'created';
}

/**
 * Splits a definition into the table payload (primary column only) and the remaining columns.
 * @param {object} definition
 * @returns {{ table: object, columns: object[] }}
 */
function splitDefinition(definition) {
  const attributes = definition.Attributes ?? [];
  const primary = attributes.filter(a => a.IsPrimaryName === true);
  const columns = attributes.filter(a => a.IsPrimaryName !== true);
  return { table: { ...definition, Attributes: primary }, columns };
}

/**
 * Creates the table itself (primary column only) and registers it in the solution.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} table
 */
async function createTable(cfg, token, solutionName, table) {
  await apiPost(cfg, token, solutionName, '/EntityDefinitions', table);
  const metadataId = await getEntityMetadataId(cfg, token, solutionName, table.LogicalName);
  if (metadataId) await addToSolution(cfg, token, solutionName, metadataId, COMPONENT_TYPE.ENTITY);
  console.log(`  [CREATED] Entity ${table.LogicalName}${table.IsActivity ? ' (activity)' : ''}`);
}

/**
 * Turns HasActivities on for an existing table when the definition requires it; the flag is
 * one-way on the platform and can only be set through a full-definition PUT.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} table
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureHasActivities(cfg, token, solutionName, table) {
  if (!table.HasActivities) return 'skipped';
  const path = `/EntityDefinitions(LogicalName='${table.LogicalName}')`;
  const current = await apiGet(cfg, token, solutionName, path);
  if (!current || current.HasActivities === true) return 'skipped';
  await apiPut(cfg, token, solutionName, path, { ...current, HasActivities: true });
  console.log(`    [UPDATED] ${table.LogicalName}.HasActivities = true`);
  return 'created';
}

/**
 * Creates an entity and all its columns if absent; re-runs add only the missing columns.
 * Returns 'created' when the table or any column was created, otherwise 'skipped'.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} definition
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureEntity(cfg, token, solutionName, definition) {
  const { table, columns } = splitDefinition(definition);
  const tableExisted = await entityExists(cfg, token, solutionName, table.LogicalName);
  if (tableExisted) console.log(`  [SKIP] Entity ${table.LogicalName} (checking columns)`);
  else await createTable(cfg, token, solutionName, table);
  const flagOutcome = tableExisted ? await ensureHasActivities(cfg, token, solutionName, table) : 'skipped';
  let createdColumns = 0;
  for (const attribute of columns) {
    const outcome = await ensureAttribute(cfg, token, solutionName, { entityName: table.LogicalName, attribute });
    if (outcome === 'created') createdColumns++;
  }
  return (!tableExisted || createdColumns > 0 || flagOutcome === 'created') ? 'created' : 'skipped';
}
