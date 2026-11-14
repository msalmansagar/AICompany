/**
 * Structural checks on the survey schema manifest, run by the tests and by the provisioner
 * before it sends anything to an org.
 *
 * @module survey-provisioning/validate-manifest
 */

const MAX_SCHEMA_NAME_LENGTH = 50;

/**
 * Lists every structural problem in a manifest. An empty list means it is safe to provision.
 *
 * @param {{ tables: object[], relationships: object[], alternateKeys: object[], roles: object[] }} manifest
 * @returns {string[]} Human-readable problems, in a stable order.
 */
export function findManifestProblems(manifest) {
  return [
    ...manifest.tables.flatMap(findColumnProblems),
    ...findRelationshipProblems(manifest),
    ...findAlternateKeyProblems(manifest),
  ];
}

function findColumnProblems(table) {
  const seen = new Set();
  const problems = [];
  for (const column of table.columns) {
    if (seen.has(column.name)) problems.push(`${table.name}: column ${column.name} is declared twice`);
    if (column.name.length > MAX_SCHEMA_NAME_LENGTH) problems.push(`${table.name}: column ${column.name} is longer than ${MAX_SCHEMA_NAME_LENGTH} characters`);
    seen.add(column.name);
  }
  return problems;
}

function findRelationshipProblems({ tables, relationships }) {
  const surveyTables = new Set(tables.map((t) => t.name));
  return relationships
    .filter((r) => r.to.startsWith('qdb_survey_') && !surveyTables.has(r.to))
    .map((r) => `relationship ${r.from}.${r.lookup}: target ${r.to} is not a survey table`);
}

function findAlternateKeyProblems({ tables, relationships, alternateKeys }) {
  return alternateKeys.flatMap((key) => {
    const table = tables.find((t) => t.name === key.table);
    const columns = new Set([
      ...(table?.columns ?? []).map((c) => c.name),
      ...relationships.filter((r) => r.from === key.table).map((r) => r.lookup),
    ]);
    return key.columns
      .filter((column) => !columns.has(column))
      .map((column) => `alternate key ${key.name}: ${key.table} has no column ${column}`);
  });
}
