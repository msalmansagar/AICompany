// Table auditing on tables that already exist (CEO 2026-11-14, audit AUD-01): turned on, published and read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureTableAuditing } from '../lib/schema-steps.mjs';

/** A client whose tables report auditing from `state`; a PUT turns it on; every call is recorded. */
function fakeClient(state) {
  const calls = [];
  const definition = (table) => ({ MetadataId: `id-${table}`, LogicalName: table, IsAuditEnabled: { Value: state[table], CanBeChanged: true } });
  const tableOf = (path) => path.match(/LogicalName='([^']+)'/)?.[1];
  return {
    calls,
    client: {
      send: async (method, path) => { calls.push(`${method} ${path.split('?')[0]}`); return { json: method === 'GET' ? definition(tableOf(path)) : null }; },
      putMetadata: async (path, body) => { calls.push(`PUT ${path}`); state[tableOf(path)] = body.IsAuditEnabled.Value; },
    },
  };
}

const run = (client, tables, isApply = true) => ensureTableAuditing({ client, tables, isApply, report: () => {} });

test('ensureTableAuditing_alreadyOn_changesNothing', async () => {
  const { client, calls } = fakeClient({ qdb_survey_setup: true });

  await run(client, [{ name: 'qdb_survey_setup', isAuditEnabled: true }]);

  assert.deepEqual(calls.filter((call) => !call.startsWith('GET')), []);
});

test('ensureTableAuditing_off_isTurnedOnPublishedAndReadBack', async () => {
  const { client, calls } = fakeClient({ qdb_survey_setup: false });

  await run(client, [{ name: 'qdb_survey_setup', isAuditEnabled: true }]);

  assert.deepEqual(calls, [
    "GET EntityDefinitions(LogicalName='qdb_survey_setup')", "GET EntityDefinitions(LogicalName='qdb_survey_setup')",
    "PUT EntityDefinitions(LogicalName='qdb_survey_setup')", 'POST PublishXml', "GET EntityDefinitions(LogicalName='qdb_survey_setup')",
  ]);
});

test('ensureTableAuditing_unauditedTable_isLeftAlone', async () => {
  const { client, calls } = fakeClient({ qdb_survey_answer: false });

  await run(client, [{ name: 'qdb_survey_answer' }]);

  assert.deepEqual(calls, []);
});

test('ensureTableAuditing_planMode_writesNothing', async () => {
  const { client, calls } = fakeClient({ qdb_survey_setup: false });

  await run(client, [{ name: 'qdb_survey_setup', isAuditEnabled: true }], false);

  assert.deepEqual(calls, ["GET EntityDefinitions(LogicalName='qdb_survey_setup')"]);
});

test('ensureTableAuditing_stillOffAfterPublish_throws', async () => {
  const { client } = fakeClient({ qdb_survey_setup: false });
  client.putMetadata = async () => {};

  await assert.rejects(run(client, [{ name: 'qdb_survey_setup', isAuditEnabled: true }]), /qdb_survey_setup.*still off/);
});
