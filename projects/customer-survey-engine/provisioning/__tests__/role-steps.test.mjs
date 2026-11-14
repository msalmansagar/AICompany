// Role provisioning against a fake Web API client: what is created, granted and verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureRoles } from '../lib/role-steps.mjs';

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
