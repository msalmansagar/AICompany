// Role provisioning against a fake Web API client: what is created, granted and verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureRoles, surplusPrivileges } from '../lib/role-steps.mjs';

const ROOT_UNIT = '00000000-0000-0000-0000-0000000000b1';
const NEW_ROLE = '00000000-0000-0000-0000-0000000000r1';

/** A client that answers the role-step requests and records every call. */
function fakeClient() {
  const calls = [];
  const send = async (method, path, body) => {
    calls.push(`${method} ${path.split('?')[0]}`);
    if (path.startsWith('businessunits')) return { json: { value: [{ businessunitid: ROOT_UNIT }] } };
    if (method === 'GET' && path.startsWith('roles')) return { json: { value: [] } };
    if (method === 'POST' && path === 'roles') return { entityId: NEW_ROLE, json: null };
    return { json: { value: [] } };
  };
  return { client: { send }, calls };
}

const run = (client, roles) => ensureRoles({ client, roles, solutionUniqueName: 'SurveyEngine', isApply: true, report: () => {} });

test('ensureRoles_roleWithNoPrivileges_isCreatedAndGrantedNothing', async () => {
  const { client, calls } = fakeClient();

  await run(client, [{ name: 'Survey Scheduler', privileges: [] }]);

  assert.deepEqual(calls, ['GET businessunits', 'GET roles', 'POST roles', 'POST AddSolutionComponent']);
});

const integration = { name: 'Survey Integration', privileges: [{ table: 'organization', rights: ['Read'] }], revokeOn: ['qdb_survey_answer', 'account'] };

test('surplusPrivileges_formerGrantsOnRevokedTables_areListed', () => {
  const granted = ['prvReadorganization', 'prvReadqdb_survey_answer', 'prvCreateqdb_survey_answer', 'prvAppendToaccount'];

  assert.deepEqual(surplusPrivileges(integration, granted).sort(), ['prvAppendToaccount', 'prvCreateqdb_survey_answer', 'prvReadqdb_survey_answer']);
});

test('surplusPrivileges_platformDefaultsAndTheManifestGrant_areKept', () => {
  const granted = ['prvReadorganization', 'prvReadUserSettings', 'prvReadqdb_survey_answers_extra'];

  assert.deepEqual(surplusPrivileges(integration, granted), []);
});

test('surplusPrivileges_roleWithoutRevokeOn_listsNothing', () => {
  assert.deepEqual(surplusPrivileges({ name: 'Survey Analyst', privileges: [] }, ['prvReadaccount']), []);
});

test('surplusPrivileges_nameCase_isIgnored', () => {
  assert.deepEqual(surplusPrivileges(integration, ['prvReadQdb_Survey_Answer']), ['prvReadQdb_Survey_Answer']);
});
