/**
 * Manifest invariants (B1). These are the rules the provisioner and the on-prem packager rely
 * on; breaking one would either fail an import or silently weaken a requirement.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TABLES, RELATIONSHIPS, ALTERNATE_KEYS, ROLES, DATA_OFFICER_ROLE_NAME, SCHEDULER_ROLE_NAME } from '../manifest.mjs';
import { findManifestProblems } from '../lib/validate-manifest.mjs';

const columnNamesOf = (tableName) => new Set([
  ...TABLES.find((t) => t.name === tableName).columns.map((c) => c.name),
  ...RELATIONSHIPS.filter((r) => r.from === tableName).map((r) => r.lookup),
]);

// ── Addendum C: DATA_OFFICER_ROLE_NAME, erasure log, Survey Data Officer role ──

// The exported constant is what the C# ErasureAccessCheck compares; renaming either side locks
// Compliance staff out or admits them when they should be blocked.
test('dataOfficerRoleName_matchesTheSurveyDataOfficerRoleInRoles', () => {
  assert.ok(ROLES.some((role) => role.name === DATA_OFFICER_ROLE_NAME), DATA_OFFICER_ROLE_NAME);
});

test('roles_surveyDataOfficer_grantsOrganizationReadAndErasureLogRead', () => {
  const officer = ROLES.find((role) => role.name === DATA_OFFICER_ROLE_NAME);
  // Organization Read is the platform minimum CRM 9.1 may require before a plugin runs (SUSPECTED-001).
  // Erasure log Read lets Compliance staff query the DSAR register directly (OQ-C1 = B).
  assert.deepEqual(officer?.privileges, [
    { table: 'organization', rights: ['Read'] },
    { table: 'qdb_survey_erasure_log', rights: ['Read'] },
  ]);
});

test('roles_surveyDataOfficer_isDistinctFromSurveyIntegration', () => {
  // FR-CSE-082 AC5: the portal integration account must never hold the Data Officer role.
  // Enforced by keeping the role names different and by the plugin's access check.
  assert.notEqual(DATA_OFFICER_ROLE_NAME, ROLES.find((r) => r.name === 'Survey Integration')?.name);
  assert.notEqual(DATA_OFFICER_ROLE_NAME, SCHEDULER_ROLE_NAME);
});

// The erasure log is the evidence of record; change history makes a privileged edit or delete visible (AUD-C-01).
test('tables_erasureLog_isAuditEnabledSoTamperingIsRecorded', () => {
  const log = TABLES.find((table) => table.name === 'qdb_survey_erasure_log');
  assert.ok(log, 'qdb_survey_erasure_log table missing from manifest');
  assert.equal(log.isAuditEnabled, true);
});

test('tables_erasureLog_keepsTheCustomerAsTextWithNoLookup', () => {
  const log = TABLES.find((table) => table.name === 'qdb_survey_erasure_log');
  // The GUID as text outlives the customer record, and the log adds no navigable path back to the person.
  assert.ok(log.columns.some((c) => c.name === 'qdb_customer_guid'), 'qdb_customer_guid column missing');
  assert.deepEqual(RELATIONSHIPS.filter((r) => r.from === 'qdb_survey_erasure_log'), []);
});

// The plugin writes the log by column name; a column the manifest lacks fails every erasure.
test('tables_erasureLog_hasEveryColumnThePluginWrites', () => {
  const source = readFileSync(new URL('../../crm-plugins/Qdb.SurveyEngine/Data/ErasureLogWriter.cs', import.meta.url), 'utf8');
  const written = [...source.matchAll(/\["(qdb_[a-z_]+)"\]\s*=/g)].map(([, name]) => name);
  const log = TABLES.find((table) => table.name === 'qdb_survey_erasure_log');
  const provisioned = new Set(['qdb_name', ...log.columns.map((c) => c.name)]);
  assert.ok(written.length > 0, 'no columns found in ErasureLogWriter.cs');
  assert.deepEqual(written.filter((name) => !provisioned.has(name)), []);
});

// The plugin admits the role by name; a rename on either side would lock Compliance out of erasure.
test('roles_surveyDataOfficer_nameMatchesThePluginCheck', () => {
  const source = readFileSync(new URL('../../crm-plugins/Qdb.SurveyEngine/Data/ErasureAccessCheck.cs', import.meta.url), 'utf8');
  const [, pluginName] = source.match(/SurveyDataOfficerRoleName\s*=\s*"([^"]+)"/);
  assert.equal(pluginName, DATA_OFFICER_ROLE_NAME);
});

test('tables_erasureLog_hasAllTraceColumns', () => {
  const log = TABLES.find((table) => table.name === 'qdb_survey_erasure_log');
  const columnNames = new Set(log.columns.map((c) => c.name));
  for (const required of ['qdb_caller_id', 'qdb_mode', 'qdb_dry_run', 'qdb_invitation_count',
    'qdb_response_count', 'qdb_answer_count', 'qdb_suppression_log_count',
    'qdb_are_actual', 'qdb_is_complete', 'qdb_logged_on']) {
    assert.ok(columnNames.has(required), `missing column ${required}`);
  }
});

// ── Original manifest tests ──

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

test('roles_answerContent_isReadableOnlyByAnalyst', () => {
  const readers = ROLES.filter((role) => role.privileges.some((p) => ['qdb_survey_response', 'qdb_survey_answer'].includes(p.table) && p.rights.includes('Read')));
  assert.deepEqual(readers.map((r) => r.name).sort(), ['Survey Analyst']);
});

// Review item 3 (2026-11-19): the integration APIs admit the role and work as SYSTEM, so the portal account
// reads no survey or customer table directly; the organization read is the platform minimum, as for the scheduler.
test('roles_surveyIntegration_grantsOnlyTheOrganizationRead', () => {
  assert.deepEqual(ROLES.find((role) => role.name === 'Survey Integration')?.privileges, [{ table: 'organization', rights: ['Read'] }]);
});

test('roles_surveyIntegration_revokesWhatItUsedToGrant', () => {
  const revokeOn = ROLES.find((role) => role.name === 'Survey Integration')?.revokeOn ?? [];

  for (const table of ['qdb_survey_invitation', 'qdb_survey_response', 'qdb_survey_answer', 'account', 'contact', 'qdb_form_render_cache']) assert.ok(revokeOn.includes(table), table);
});

test('roles_surveyIntegration_nameMatchesThePluginCheck', () => {
  const source = readFileSync(new URL('../../crm-plugins/Qdb.SurveyEngine/Data/IntegrationAccessCheck.cs', import.meta.url), 'utf8');
  const [, pluginName] = source.match(/SurveyIntegrationRoleName\s*=\s*"([^"]+)"/);
  assert.ok(ROLES.some((role) => role.name === pluginName), pluginName);
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
// CEO 2026-11-15 (audit AUD-C-01): also on the erasure log, so a privileged edit or delete is recorded.
test('tables_auditHistory_isOnForRulesInvitationsAndTheErasureLogOnly', () => {
  const audited = TABLES.filter((table) => table.isAuditEnabled === true).map((table) => table.name).sort();

  assert.deepEqual(audited, ['qdb_survey_erasure_log', 'qdb_survey_invitation', 'qdb_survey_settings', 'qdb_survey_setup', 'qdb_survey_sms_config', 'qdb_survey_source', 'qdb_survey_suppression_log', 'qdb_survey_trigger']);
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
