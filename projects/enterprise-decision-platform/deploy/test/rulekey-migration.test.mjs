import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadMapping, loadEngineContract, isValidRuleKey, readRules, planBackfill, applyBackfill, evaluateGates,
  planRollback, applyRollback, readUniquenessKey, createUniquenessKey, waitForActive, supportDecision, uniquenessKeyDefinition,
} from '../lib/rulekey-migration.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mapping = loadMapping();
const engineContract = loadEngineContract();
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The 14 rules as they stand before the backfill: approved names, no keys. */
function preBackfillRules() {
  return mapping.entries.map((e, i) => ({ ruleId: e.ruleId, name: e.displayName, ruleKey: null, createdOn: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`, modifiedOn: '2026-08-01T00:00:00Z' }));
}

/** A client over a list of rules and keys; records every write. */
function fakeClient(rules, { keyStatuses = [] } = {}) {
  const writes = [];
  const keys = [];
  const statuses = [...keyStatuses];
  return {
    writes,
    get: async (p) => {
      if (p.startsWith('qdb_edp_rules?')) return { value: rules.map((r) => ({ qdb_edp_ruleid: r.ruleId, qdb_edp_rulename: r.name, qdb_edp_rulekey: r.ruleKey, createdon: r.createdOn, modifiedon: r.modifiedOn })) };
      if (p.includes('/Keys?')) return { value: keys.map((k) => ({ ...k, EntityKeyIndexStatus: statuses.length > 1 ? statuses.shift() : statuses[0] ?? 'Pending' })) };
      throw new Error(`unexpected GET ${p}`);
    },
    patch: async (p, body) => {
      writes.push({ method: 'PATCH', path: p, body });
      const id = p.match(/\(([^)]+)\)/)[1];
      const rule = rules.find((r) => r.ruleId === id);
      rule.ruleKey = body.qdb_edp_rulekey;
      rule.modifiedOn = '2026-10-01T00:00:00Z';
    },
    post: async (p, body, headers) => { writes.push({ method: 'POST', path: p, body, headers }); keys.push({ SchemaName: body.SchemaName, KeyAttributes: body.KeyAttributes }); },
  };
}

// ---- HD-2: the approved mapping ----

test('mapping_EqualsBrdAppendixA_ExactlyAsApproved', () => {
  const brd = readFileSync(path.join(here, '..', '..', 'brd-edp-re-enh-001-release1-contract.md'), 'utf8');
  const appendix = brd.slice(brd.indexOf('## Appendix A'));
  const rows = appendix.split(/\r?\n/).filter((l) => /^\| \d+ \| `[0-9a-f-]{36}`/.test(l)).map((l) => l.split('|').map((c) => c.trim()));
  assert.deepEqual(mapping.entries.map((e) => [e.ruleId, e.displayName, e.ruleKey]), rows.map((c) => [c[2].replace(/`/g, ''), c[3], c[5].replace(/`/g, '')]));
});

test('mapping_EveryKey_IsValidLowerCaseAndUnique', () => {
  assert.equal(mapping.entries.length, 14);
  assert.ok(mapping.entries.every((e) => isValidRuleKey(e.ruleKey, engineContract) && e.ruleKey === e.ruleKey.toLowerCase()));
  assert.equal(new Set(mapping.entries.map((e) => e.ruleKey.toLowerCase())).size, 14);
});

test('mapping_NoKey_ContainsAnEnvironmentNameGuidOrDate', () => {
  assert.deepEqual(mapping.entries.filter((e) => /(dev|test-env|prod|uat|sandbox|org[0-9a-f]{6,}|[0-9a-f]{8}-|20\d\d)/.test(e.ruleKey)).map((e) => e.ruleKey), []);
});

test('isValidRuleKey_UpperCase_IsRejectedNotNormalised', () => {
  assert.equal(isValidRuleKey('Demo.Risk-Tier', engineContract), false);
});

// ---- backfill plan ----

test('planBackfill_FourteenUnkeyedRules_PlansFourteenWritesAndNoProblems', () => {
  const result = planBackfill(mapping, preBackfillRules(), engineContract);
  assert.deepEqual([result.writes.length, result.problems], [14, []]);
});

test('planBackfill_RuleHoldingADifferentKey_IsAProblemNotAnOverwrite', () => {
  const rules = preBackfillRules();
  rules[3].ruleKey = 'something.else';
  const result = planBackfill(mapping, rules, engineContract);
  assert.equal(result.problems.length, 1);
  assert.ok(!result.writes.some((w) => w.ruleId === rules[3].ruleId));
});

test('planBackfill_RenamedRule_IsAProblem', () => {
  const rules = preBackfillRules();
  rules[0].name = 'Renamed';
  assert.match(planBackfill(mapping, rules, engineContract).problems[0], /must be re-approved/);
});

test('planBackfill_MissingRule_IsAProblem', () => {
  assert.match(planBackfill(mapping, preBackfillRules().slice(1), engineContract).problems[0], /does not exist/);
});

test('planBackfill_ApprovedKeyHeldByANewRule_IsAProblem', () => {
  const rules = [...preBackfillRules(), { ruleId: 'new-rule', name: 'New', ruleKey: 'demo.risk-tier', createdOn: '2026-10-01', modifiedOn: '2026-10-01' }];
  assert.match(planBackfill(mapping, rules, engineContract).problems.join(), /already held by unmapped rule new-rule/);
});

test('planBackfill_AlreadyBackfilled_PlansNoWrites', () => {
  const rules = preBackfillRules().map((r, i) => ({ ...r, ruleKey: mapping.entries[i].ruleKey }));
  assert.deepEqual(planBackfill(mapping, rules, engineContract).writes, []);
});

test('applyBackfill_WithProblems_WritesNothing', async () => {
  const client = fakeClient(preBackfillRules());
  await assert.rejects(applyBackfill(client, { writes: [{ ruleId: 'x', ruleKey: 'a.b' }], problems: ['conflict'] }, () => {}), /refused/);
  assert.deepEqual(client.writes, []);
});

test('applyBackfill_CleanPlan_WritesOnlyTheRuleKeyOfTheMappedRules', async () => {
  const rules = preBackfillRules();
  const client = fakeClient(rules);
  await applyBackfill(client, planBackfill(mapping, await readRules(client), engineContract), () => {});
  assert.deepEqual(client.writes.map((w) => Object.keys(w.body)), Array(14).fill(['qdb_edp_rulekey']));
  assert.deepEqual(client.writes.map((w) => w.path), mapping.entries.map((e) => `qdb_edp_rules(${e.ruleId})`));
});

// ---- gates ----

async function backfilled(extraRules = []) {
  const rules = [...preBackfillRules(), ...extraRules];
  const client = fakeClient(rules);
  const snapshot = { rules: clone(await readRules(client)) };
  await applyBackfill(client, planBackfill(mapping, await readRules(client), engineContract), () => {});
  return { client, rules, snapshot };
}

test('evaluateGates_CleanBackfill_Passes', async () => {
  const { client, snapshot } = await backfilled();
  assert.deepEqual(evaluateGates({ rules: await readRules(client), mapping, engineContract, snapshot }), { passed: true, failures: [] });
});

test('evaluateGates_ARuleWithoutAKey_FailsCompleteness', async () => {
  const { client, snapshot } = await backfilled([{ ruleId: 'late', name: 'Late', ruleKey: null, createdOn: '2026-10-01', modifiedOn: '2026-10-01' }]);
  assert.match(evaluateGates({ rules: await readRules(client), mapping, engineContract, snapshot }).failures.join(), /completeness: rule late/);
});

test('evaluateGates_UpperCaseKey_FailsFormat', async () => {
  const { client, snapshot } = await backfilled([{ ruleId: 'upper', name: 'U', ruleKey: 'Demo.Upper', createdOn: '2026-10-01', modifiedOn: '2026-10-01' }]);
  assert.match(evaluateGates({ rules: await readRules(client), mapping, engineContract, snapshot }).failures.join(), /format: rule upper/);
});

test('evaluateGates_KeysDifferingOnlyByCase_FailUniqueness', async () => {
  const { client, rules, snapshot } = await backfilled();
  rules.push({ ruleId: 'dup', name: 'D', ruleKey: 'DEMO.RISK-TIER', createdOn: '2026-10-01', modifiedOn: '2026-10-01' });
  assert.match(evaluateGates({ rules: await readRules(client), mapping, engineContract, snapshot }).failures.join(), /uniqueness: key "demo.risk-tier"/);
});

test('evaluateGates_UnmappedRuleChangedDuringTheRun_Fails', async () => {
  const { client, rules, snapshot } = await backfilled([{ ruleId: 'other', name: 'Other', ruleKey: 'demo.other', createdOn: '2026-10-01', modifiedOn: '2026-10-01' }]);
  rules.find((r) => r.ruleId === 'other').modifiedOn = '2026-10-02';
  assert.match(evaluateGates({ rules: await readRules(client), mapping, engineContract, snapshot }).failures.join(), /unmapped rule other changed/);
});

// ---- rollback ----

test('planRollback_ClearsOnlyKeysStillHoldingWhatThisRunWrote', async () => {
  const log = [];
  const rules = preBackfillRules();
  const client = fakeClient(rules);
  await applyBackfill(client, planBackfill(mapping, await readRules(client), engineContract), (e) => log.push(e));
  rules[0].ruleKey = 'changed.since';
  const steps = planRollback(log, await readRules(client));
  assert.deepEqual([steps.length, steps.every((s) => s.restore === null), steps.some((s) => s.ruleId === rules[0].ruleId)], [13, true, false]);
});

test('applyRollback_RestoresEmptyKeys', async () => {
  const log = [];
  const rules = preBackfillRules();
  const client = fakeClient(rules);
  await applyBackfill(client, planBackfill(mapping, await readRules(client), engineContract), (e) => log.push(e));
  await applyRollback(client, planRollback(log, await readRules(client)), () => {});
  assert.ok(rules.every((r) => r.ruleKey === null));
});

// ---- uniqueness key and the support decision ----

test('uniquenessKeyDefinition_IsASingleColumnKeyOnRuleKey', () => {
  assert.deepEqual(uniquenessKeyDefinition().KeyAttributes, ['qdb_edp_rulekey']);
});

test('createUniquenessKey_IsCreatedInsideTheRuleEngineSolution', async () => {
  const client = fakeClient(preBackfillRules());
  await createUniquenessKey(client, () => {});
  assert.deepEqual(client.writes[0].headers, { 'MSCRM.SolutionUniqueName': 'BusinessRuleEngine' });
});

test('waitForActive_PendingThenActive_ReturnsActive', async () => {
  const client = fakeClient(preBackfillRules(), { keyStatuses: ['Pending', 'InProgress', 'Active'] });
  await createUniquenessKey(client, () => {});
  assert.equal(await waitForActive(client, { attempts: 5, intervalMs: 0, sleep: async () => {} }), 'Active');
});

test('waitForActive_Failed_ReturnsFailed', async () => {
  const client = fakeClient(preBackfillRules(), { keyStatuses: ['Pending', 'Failed'] });
  await createUniquenessKey(client, () => {});
  assert.equal(await waitForActive(client, { attempts: 5, intervalMs: 0, sleep: async () => {} }), 'Failed');
});

test('waitForActive_NeverActive_ReportsTheLastStatus', async () => {
  const client = fakeClient(preBackfillRules(), { keyStatuses: ['Pending'] });
  await createUniquenessKey(client, () => {});
  assert.equal(await waitForActive(client, { attempts: 3, intervalMs: 0, sleep: async () => {} }), 'Pending');
});

test('supportDecision_KeyPending_IsNotSupported', async () => {
  const client = fakeClient(preBackfillRules(), { keyStatuses: ['Pending'] });
  await createUniquenessKey(client, () => {});
  assert.equal(supportDecision({ passed: true, failures: [] }, await readUniquenessKey(client)).supported, false);
});

test('supportDecision_NoKey_IsNotSupported', () => {
  assert.deepEqual(supportDecision({ passed: true, failures: [] }, null), { supported: false, reasons: ['the uniqueness key does not exist'] });
});

test('supportDecision_GatesPassAndKeyActive_IsSupported', () => {
  assert.equal(supportDecision({ passed: true, failures: [] }, { schemaName: 'k', status: 'Active' }).supported, true);
});

test('supportDecision_GateFailure_IsNotSupportedEvenWhenActive', () => {
  assert.equal(supportDecision({ passed: false, failures: ['uniqueness'] }, { schemaName: 'k', status: 'Active' }).supported, false);
});
