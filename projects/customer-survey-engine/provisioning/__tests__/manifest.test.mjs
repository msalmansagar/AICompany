/**
 * Manifest invariants (B1). These are the rules the provisioner and the on-prem packager rely
 * on; breaking one would either fail an import or silently weaken a requirement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// CEO 2026-11-14 (audit SEC-01): the unattended scheduler account holds only this role. The run works as
// SYSTEM, so the role admits the caller and grants no survey or customer table rights; its one read of the
// organization row is the platform minimum (security review of e32e2054, SUSPECTED-001).
test('roles_surveyScheduler_grantsOnlyTheOrganizationRead', () => {
  assert.deepEqual(ROLES.find((role) => role.name === 'Survey Scheduler')?.privileges, [{ table: 'organization', rights: ['Read'] }]);
});

// The plugin admits the role by name; a rename on either side would lock the scheduler out.
test('roles_surveyScheduler_nameMatchesThePluginCheck', () => {
  const source = readFileSync(new URL('../../crm-plugins/Qdb.SurveyEngine/Data/SchedulerAccessCheck.cs', import.meta.url), 'utf8');
  const [, pluginName] = source.match(/SurveySchedulerRoleName\s*=\s*"([^"]+)"/);
  assert.ok(ROLES.some((role) => role.name === pluginName), pluginName);
});

// CEO 2026-11-14 (audit AUD-01, checklist B9): change history on the rule tables, invitations and the
// suppression log, but not on responses or answers, whose history would keep anonymised answers (PDPPL).
test('tables_auditHistory_isOnForRulesAndInvitationsOnly', () => {
  const audited = TABLES.filter((table) => table.isAuditEnabled === true).map((table) => table.name).sort();

  assert.deepEqual(audited, ['qdb_survey_invitation', 'qdb_survey_settings', 'qdb_survey_setup', 'qdb_survey_sms_config', 'qdb_survey_source', 'qdb_survey_suppression_log', 'qdb_survey_trigger']);
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
