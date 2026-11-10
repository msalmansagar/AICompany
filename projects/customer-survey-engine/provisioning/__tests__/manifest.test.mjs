/**
 * Manifest invariants (B1). These are the rules the provisioner and the on-prem packager rely
 * on; breaking one would either fail an import or silently weaken a requirement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLES, RELATIONSHIPS, ALTERNATE_KEYS, ROLES } from '../manifest.mjs';
import { findManifestProblems } from '../lib/validate-manifest.mjs';

const columnNamesOf = (tableName) => new Set([
  ...TABLES.find((t) => t.name === tableName).columns.map((c) => c.name),
  ...RELATIONSHIPS.filter((r) => r.from === tableName).map((r) => r.lookup),
]);

test('findManifestProblems_shippedManifest_reportsNone', () => {
  assert.deepEqual(findManifestProblems({ tables: TABLES, relationships: RELATIONSHIPS, alternateKeys: ALTERNATE_KEYS, roles: ROLES }), []);
});

test('tables_everyName_usesTheSurveySegment', () => {
  for (const table of TABLES) assert.match(table.name, /^qdb_survey_[a-z_]+$/);
});

test('picklists_everyOption_isInThe100000000Range', () => {
  for (const column of TABLES.flatMap((t) => t.columns).filter((c) => c.type === 'picklist')) {
    for (const option of column.options) assert.ok(option.value >= 100000000 && option.value < 100010000, `${column.name} ${option.value}`);
  }
});

test('alternateKeys_everyColumn_existsOnItsTable', () => {
  for (const key of ALTERNATE_KEYS) {
    for (const column of key.columns) assert.ok(columnNamesOf(key.table).has(column), `${key.name}.${column}`);
  }
});

test('roles_answerContent_isReadableOnlyByAnalystAndIntegration', () => {
  const readers = ROLES.filter((role) => role.privileges.some((p) => ['qdb_survey_response', 'qdb_survey_answer'].includes(p.table) && p.rights.includes('Read')));
  assert.deepEqual(readers.map((r) => r.name).sort(), ['Survey Analyst', 'Survey Integration']);
});

test('roles_surveyAdmin_cannotWriteSources', () => {
  // Writing a source could flip it active; activation is System Administrator only (FR-CSE-003, section 11.1).
  const admin = ROLES.find((role) => role.name === 'Survey Admin');
  const sourceRights = admin.privileges.find((p) => p.table === 'qdb_survey_source').rights;
  assert.ok(!sourceRights.includes('Write'), sourceRights.join(','));
});

test('roles_suppressionLog_isNeverWritableOrDeletable', () => {
  const logPrivileges = ROLES.flatMap((role) => role.privileges.filter((p) => p.table === 'qdb_survey_suppression_log'));
  for (const privilege of logPrivileges) {
    assert.ok(!privilege.rights.includes('Write') && !privilege.rights.includes('Delete'), privilege.rights.join(','));
  }
});

test('findManifestProblems_keyOnMissingColumn_reportsIt', () => {
  const problems = findManifestProblems({
    tables: TABLES, relationships: RELATIONSHIPS, roles: ROLES,
    alternateKeys: [{ name: 'qdb_bad_key', label: 'Bad', table: 'qdb_survey_source', columns: ['qdb_missing'] }],
  });
  assert.deepEqual(problems, ['alternate key qdb_bad_key: qdb_survey_source has no column qdb_missing']);
});

test('findManifestProblems_duplicateColumn_reportsIt', () => {
  const [source, ...rest] = TABLES;
  const duplicated = { ...source, columns: [...source.columns, source.columns[0]] };
  const problems = findManifestProblems({ tables: [duplicated, ...rest], relationships: RELATIONSHIPS, alternateKeys: ALTERNATE_KEYS, roles: ROLES });
  assert.deepEqual(problems, [`qdb_survey_source: column ${source.columns[0].name} is declared twice`]);
});

test('findManifestProblems_relationshipToUnknownSurveyTable_reportsIt', () => {
  const problems = findManifestProblems({
    tables: TABLES, alternateKeys: ALTERNATE_KEYS, roles: ROLES,
    relationships: [...RELATIONSHIPS, { lookup: 'qdb_x_id', label: 'X', from: 'qdb_survey_answer', to: 'qdb_survey_missing', cascade: 'RemoveLink' }],
  });
  assert.deepEqual(problems, ['relationship qdb_survey_answer.qdb_x_id: target qdb_survey_missing is not a survey table']);
});

test('findManifestProblems_nameOverTheSchemaLimit_reportsIt', () => {
  const [source, ...rest] = TABLES;
  const longName = `qdb_${'x'.repeat(50)}`;
  const withLong = { ...source, columns: [...source.columns, { name: longName, type: 'string', label: 'Long', maxLength: 10 }] };
  const problems = findManifestProblems({ tables: [withLong, ...rest], relationships: RELATIONSHIPS, alternateKeys: ALTERNATE_KEYS, roles: ROLES });
  assert.deepEqual(problems, [`qdb_survey_source: column ${longName} is longer than 50 characters`]);
});
