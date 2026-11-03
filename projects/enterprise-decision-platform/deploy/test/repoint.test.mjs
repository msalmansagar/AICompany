import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContract } from '../lib/registration-contract.mjs';
import { prepareMigration, applyMigration, prepareRollback, applyRollback } from '../lib/repoint-run.mjs';
import { createChangeLog } from '../lib/repoint-executor.mjs';
import { SIDES } from '../lib/repoint-plan.mjs';
import { seedPreA7Org, createFakeClient, FAKE_IDS } from './fake-dataverse.mjs';

const contract = loadContract();
const DRIFTED = ['ChildCollectionName', 'ChildResultsJson', 'ExecutionId'];

// The org as found on 2026-09-27: EvaluateDecision lacks the three drifted arguments.
function preA7Org(options) {
  const state = seedPreA7Org(contract, options);
  const evaluate = state.customApis.find((a) => a.uniquename === 'qdb_edp_EvaluateDecision');
  evaluate.request = evaluate.request.filter((p) => !DRIFTED.includes(p.uniquename));
  evaluate.response = evaluate.response.filter((p) => !DRIFTED.includes(p.uniquename));
  return state;
}

const run = async (state, fakeOptions) => {
  const { client, sleep } = createFakeClient(state, fakeOptions);
  const changeLog = createChangeLog();
  return { client, sleep, changeLog };
};

test('prepareMigration_DryRun_WritesNothing', async () => {
  const { client } = await run(preA7Org());
  await prepareMigration(client, contract);
  assert.equal(client.writes.length, 0);
});

test('prepareMigration_PreA7Org_PlansMetadataThenEveryLegacyRegistration', async () => {
  const { client } = await run(preA7Org());
  const prepared = await prepareMigration(client, contract);
  assert.deepEqual(prepared.problems, []);
  assert.deepEqual(prepared.metadata.creates.map((c) => c.name), ['ChildCollectionName', 'ChildResultsJson', 'ExecutionId']);
  assert.equal(prepared.moves.filter((m) => m.action === 'move').length, contract.operations.length - 1 + contract.entitySteps.length);
  assert.equal(prepared.moves.find((m) => m.key === 'qdb_edp_ValidateRule').action, 'unchanged');
});

test('prepareMigration_CalledTwice_ProducesIdenticalPlans', async () => {
  const { client } = await run(preA7Org());
  const first = await prepareMigration(client, contract);
  const second = await prepareMigration(client, contract);
  assert.deepEqual(second.moves, first.moves);
});

test('applyMigration_PreA7Org_RegistersMetadataBeforeMovingAnyBinding', async () => {
  const { client, sleep, changeLog } = await run(preA7Org());
  await applyMigration({ client, contract, prepared: await prepareMigration(client, contract), changeLog, sleep });
  const firstPatch = client.writes.findIndex((w) => w.method === 'PATCH');
  const lastPost = client.writes.map((w) => w.method).lastIndexOf('POST');
  assert.ok(lastPost < firstPatch, 'every metadata POST precedes the first binding PATCH');
});

test('applyMigration_PreA7Org_BindsEveryItemToTheActiveAssemblyAndVerifies', async () => {
  const state = preA7Org();
  const { client, sleep, changeLog } = await run(state);
  const result = await applyMigration({ client, contract, prepared: await prepareMigration(client, contract), changeLog, sleep });
  assert.deepEqual(result.unverified, []);
  const legacyBound = [...state.customApis.map((a) => a._plugintypeid_value), ...state.steps.map((s) => s._eventhandler_value)].filter((id) => id.startsWith('t-legacy'));
  assert.deepEqual(legacyBound, []);
});

test('applyMigration_EveryMove_IsRecordedInTheChangeLog', async () => {
  const { client, sleep, changeLog } = await run(preA7Org());
  const prepared = await prepareMigration(client, contract);
  await applyMigration({ client, contract, prepared, changeLog, sleep });
  const moved = changeLog.entries.filter((e) => e.result === 'moved');
  assert.equal(moved.length, prepared.moves.filter((m) => m.action === 'move').length);
  assert.ok(moved.every((e) => e.fromPluginTypeId && e.toPluginTypeId && e.at));
});

test('applyMigration_SecondRun_IsIdempotent', async () => {
  const state = preA7Org();
  const first = await run(state);
  await applyMigration({ ...first, contract, prepared: await prepareMigration(first.client, contract) });
  const second = await run(state);
  const prepared = await prepareMigration(second.client, contract);
  await applyMigration({ ...second, contract, prepared });
  assert.equal(second.client.writes.length, 0);
});

test('applyMigration_FailureMidRun_StopsAndLeavesAResumablePartialState', async () => {
  const state = preA7Org();
  const failing = await run(state, { failPatchOn: (path) => path.includes('c-qdb_edp_GetInputSchema') });
  await assert.rejects(applyMigration({ ...failing, contract, prepared: await prepareMigration(failing.client, contract) }), /simulated failure/);
  assert.equal(failing.changeLog.entries.at(-1).result, 'failed');
  const resumed = await run(state);
  const prepared = await prepareMigration(resumed.client, contract);
  assert.deepEqual(prepared.problems, [], 'a partially migrated org is a supported state');
  assert.equal(prepared.metadata.creates.length, 0, 'metadata from the failed run is already in place');
  const result = await applyMigration({ ...resumed, contract, prepared });
  assert.deepEqual(result.unverified, []);
});

test('applyMigration_PropagationLag_WaitsBeforeVerifying', async () => {
  const { client, sleep, changeLog } = await run(preA7Org(), { propagationLag: true });
  let waitedMs = null;
  const recordingSleep = async (ms) => { waitedMs = ms; await sleep(); };
  const result = await applyMigration({ client, contract, prepared: await prepareMigration(client, contract), changeLog, sleep: recordingSleep });
  assert.equal(waitedMs, 20_000);
  assert.deepEqual(result.unverified, []);
});

test('applyMigration_NoWrite_EverUsesDelete', async () => {
  const { client, sleep, changeLog } = await run(preA7Org());
  await applyMigration({ client, contract, prepared: await prepareMigration(client, contract), changeLog, sleep });
  assert.ok(client.writes.every((w) => w.method === 'POST' || w.method === 'PATCH'));
});

test('applyRollback_FromPreChangeSnapshot_RestoresEveryOriginalBinding', async () => {
  const state = preA7Org();
  const snapshotRun = await run(state);
  const before = await prepareMigration(snapshotRun.client, contract);
  await applyMigration({ ...snapshotRun, contract, prepared: before });
  const back = await run(state);
  const result = await applyRollback({ ...back, contract, prepared: await prepareRollback(back.client, contract, before.inventory) });
  assert.deepEqual(result.unverified, []);
  const restored = new Map(state.customApis.map((a) => [a.customapiid, a._plugintypeid_value]));
  for (const api of before.inventory.customApis) assert.equal(restored.get(api.id), api.pluginTypeId);
});

test('applyRollback_AfterPartialMigration_MovesOnlyWhatChanged', async () => {
  const state = preA7Org();
  const snapshotRun = await run(state);
  const before = await prepareMigration(snapshotRun.client, contract);
  const failing = await run(state, { failPatchOn: (path) => path.includes('c-qdb_edp_GetInputSchema') });
  await assert.rejects(applyMigration({ ...failing, contract, prepared: before }));
  const back = await run(state);
  const prepared = await prepareRollback(back.client, contract, before.inventory);
  const moved = failing.changeLog.entries.filter((e) => e.result === 'moved').length;
  assert.equal(prepared.moves.filter((m) => m.action === 'move').length, moved);
  const result = await applyRollback({ ...back, contract, prepared });
  assert.deepEqual(result.unverified, []);
});

test('applyRollback_LeavesRegisteredMetadataInPlace', async () => {
  const state = preA7Org();
  const first = await run(state);
  const before = await prepareMigration(first.client, contract);
  await applyMigration({ ...first, contract, prepared: before });
  const back = await run(state);
  await applyRollback({ ...back, contract, prepared: await prepareRollback(back.client, contract, before.inventory) });
  const evaluate = state.customApis.find((a) => a.uniquename === 'qdb_edp_EvaluateDecision');
  assert.ok(evaluate.response.some((p) => p.uniquename === 'ExecutionId'), 'additive metadata is harmless under 1.0.23 and is not removed');
});

test('prepareMigration_ToLegacy_PlansEverythingBackToTheSignedAssembly', async () => {
  const state = preA7Org();
  const first = await run(state);
  await applyMigration({ ...first, contract, prepared: await prepareMigration(first.client, contract) });
  const back = await run(state);
  const prepared = await prepareMigration(back.client, contract, SIDES.LEGACY);
  const moves = prepared.moves.filter((m) => m.action === 'move');
  assert.equal(moves.length, contract.operations.length + contract.entitySteps.length);
  assert.ok(moves.every((m) => m.targetTypeId.startsWith('t-legacy')));
});

test('prepareRollback_ItemMissingFromSnapshot_IsRefused', async () => {
  const state = preA7Org();
  const { client } = await run(state);
  const before = await prepareMigration(client, contract);
  const trimmed = { ...before.inventory, customApis: before.inventory.customApis.filter((a) => a.uniqueName !== 'qdb_edp_TestRule') };
  const prepared = await prepareRollback(client, contract, trimmed);
  assert.ok(prepared.problems.some((p) => p.includes('qdb_edp_TestRule') && p.includes('not in the snapshot')));
});

test('prepareRollback_OtherProblemsPresent_StillReportsItemsMissingFromTheSnapshot', async () => {
  const state = preA7Org();
  const { client } = await run(state);
  const before = await prepareMigration(client, contract);
  state.steps.find((s) => s.sdkmessageprocessingstepid === 's-entity-0').statecode = 1;
  const trimmed = { ...before.inventory, customApis: before.inventory.customApis.filter((a) => a.uniqueName !== 'qdb_edp_TestRule') };
  const prepared = await prepareRollback(client, contract, trimmed);
  assert.ok(prepared.problems.some((p) => p.includes('disabled')));
  assert.ok(prepared.problems.some((p) => p.includes('qdb_edp_TestRule') && p.includes('not in the snapshot')));
  assert.deepEqual(prepared.moves, []);
});

// ---- refusals: each unsafe state must block --apply ----

const refusalCases = [
  ['a plugin type from an assembly the contract does not name', (s) => s.pluginTypes.push({ plugintypeid: 't-foreign', typename: 'EDP.RuleRuntime.Crm.RuleServicePlugin', _pluginassemblyid_value: 'someone-else' }), /does not name/],
  ['an entity step registered twice (it would run twice)', (s) => s.steps.push({ ...s.steps.find((x) => x.stage === 10), sdkmessageprocessingstepid: 's-dup', _eventhandler_value: FAKE_IDS.typeId('active', 'AppendOnlyGuardPlugin') }), /registered 2 times/],
  ['a step image the contract does not expect', (s) => s.images.push({ sdkmessageprocessingstepimageid: 'img', _sdkmessageprocessingstepid_value: 's-entity-0' }), /image/],
  ['a disabled entity step', (s) => { s.steps.find((x) => x.sdkmessageprocessingstepid === 's-entity-0').statecode = 1; }, /disabled/],
  ['a Custom API bound to the wrong plugin type', (s) => { s.customApis.find((a) => a.uniquename === 'qdb_edp_TestRule')._plugintypeid_value = FAKE_IDS.typeId('legacy', 'RuleAnalysisPlugin'); }, /contract says/],
  ['a contract operation missing from the org', (s) => { s.customApis = s.customApis.filter((a) => a.uniquename !== 'qdb_edp_CompareVersions'); }, /does not exist/],
  ['an active assembly outside a plug-in package', (s) => { s.assemblies.find((a) => a.sourcetype === 4)._packageid_value = null; }, /plug-in package/],
  ['an implementation step disagreeing with its API', (s) => { s.steps.find((x) => x.message === 'qdb_edp_TestRule')._eventhandler_value = FAKE_IDS.typeId('active', 'RuleServicePlugin'); }, /implementation step/],
  ['an unexpected step on an EDP plugin type', (s) => s.steps.push({ sdkmessageprocessingstepid: 's-extra', stage: 40, mode: 1, statecode: 0, _eventhandler_value: FAKE_IDS.typeId('legacy', 'DeleteAuditPlugin'), message: 'Create', entity: 'account' }), /unexpected step/],
  ['a duplicate assembly registration', (s) => s.assemblies.push({ ...s.assemblies[0], pluginassemblyid: 'a-dup' }), /registered 2 times/],
];

for (const [description, corrupt, reason] of refusalCases) {
  test(`applyMigration_${description.replace(/\W+/g, '_')}_IsRefusedWithNoWrites`, async () => {
    const state = preA7Org();
    corrupt(state);
    const { client, sleep, changeLog } = await run(state);
    const prepared = await prepareMigration(client, contract);
    assert.ok(prepared.problems.some((p) => reason.test(p)), `expected a problem matching ${reason}, got:\n${prepared.problems.join('\n')}`);
    await assert.rejects(applyMigration({ client, contract, prepared, changeLog, sleep }), /Refusing/);
    assert.equal(client.writes.length, 0);
  });
}

test('applyMigration_ExistingParameterWithWrongType_IsRefusedWithNoWrites', async () => {
  const state = preA7Org();
  state.customApis.find((a) => a.uniquename === 'qdb_edp_EvaluateDecision').response.push({ customapiresponsepropertyid: 'x', uniquename: 'ExecutionId', type: 12 });
  const { client, sleep, changeLog } = await run(state);
  const prepared = await prepareMigration(client, contract);
  assert.ok(prepared.metadata.incompatibilities.some((f) => f.kind === 'type-mismatch' && f.argument === 'ExecutionId'));
  await assert.rejects(applyMigration({ client, contract, prepared, changeLog, sleep }), /Refusing/);
  assert.equal(client.writes.length, 0);
});
