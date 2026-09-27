/**
 * relationships.mjs
 * Creates 1:N lookup relationships idempotently.
 */
import { apiGet, apiPost } from './crm-client.mjs';

/**
 * Returns true if a relationship with the given schema name already exists.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} schemaName
 * @returns {Promise<boolean>}
 */
export async function relationshipExists(cfg, token, solutionName, schemaName) {
  const result = await apiGet(cfg, token, solutionName, `/RelationshipDefinitions(SchemaName='${schemaName}')?$select=SchemaName`);
  return result !== null;
}

/**
 * Creates a 1:N relationship if it does not exist.
 * Returns 'created' | 'skipped'.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {object} definition
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureRelationship(cfg, token, solutionName, definition) {
  const schemaName = definition.SchemaName;
  if (await relationshipExists(cfg, token, solutionName, schemaName)) {
    console.log(`  [SKIP] Relationship ${schemaName}`);
    return 'skipped';
  }
  await apiPost(cfg, token, solutionName, '/RelationshipDefinitions', definition);
  console.log(`  [CREATED] Relationship ${schemaName}`);
  return 'created';
}
