#!/usr/bin/env node
// Cloud validation of Rule Engine 1.1.0 (Release 1, B1–B4) against a deployed org.
// It never changes a rule, a version, metadata or a registration. EvaluateDecision and
// ExecuteRuleSet append execution-log rows by design (ADR-13); every other call is read-only.
// TestRule (used for the replay) writes nothing.
//
//   node deploy/verify-release1.mjs [--out <report.json>] [--expect-rulekeys]
//
// --expect-rulekeys  run the RuleKey checks that only pass after the backfill (a7-rulekey.mjs).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDataverseClient } from './lib/dataverse-client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => JSON.parse(readFileSync(path.join(here, '..', relative), 'utf8'));
const argument = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const EXPECT_RULEKEYS = process.argv.includes('--expect-rulekeys');

const fixtures = read('runtime/tests/replay/live-rule-versions.json');
const goldens = read('runtime/tests/replay/replay-cases.json');
const vectors = read('contract/content-hash-vectors.json');
const expectedHashes = read('deploy/test/live-content-hashes.json');

// ---- ad-hoc rules (inline PCRM; never stored) ----------------------------------------------

const STRICT = JSON.stringify({
  schemaVersion: '1.1', inputContract: 'strict', name: 'R1 validation (inline)',
  inputs: [
    { name: 'amount', type: 'Decimal', required: true, nullable: false, source: 'declared' },
    { name: 'count', type: 'WholeNumber', source: 'declared' },
    { name: 'flag', type: 'Boolean', source: 'declared' },
    { name: 'start', type: 'Date', source: 'declared' },
  ],
  outputs: [{ name: 'decision', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [{ field: 'amount', operator: 'GreaterThanOrEqual', value: 1000 }] }, then: { decision: 'approve' } }] },
});
const LENIENT = JSON.stringify({
  name: 'R1 lenient validation (inline)', inputs: [{ name: 'amount', type: 'Decimal' }], outputs: [{ name: 'decision', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [{ field: 'amount', operator: 'GreaterThanOrEqual', value: 1000 }] }, then: { decision: 'approve' } }], otherwise: { decision: 'refer' } },
});
const ENGINE_FAILURE = JSON.stringify({
  schemaVersion: '1.1', inputContract: 'strict', name: 'R1 engine-error probe (inline)',
  inputs: [{ name: 'amount', type: 'Decimal', source: 'declared' }],
  variables: [{ name: 'boom', type: 'Decimal', formula: 'NoSuchFunction(amount)' }],
  outputs: [{ name: 'o', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [{ field: 'boom', operator: 'GreaterThan', value: 0 }] }, then: { o: 'x' } }] },
});
const recordNameProbe = (name) => JSON.stringify({
  name: 'R1 declared-fact record probe (inline)', targetEntity: 'account',
  inputs: [{ name: 'name', type: 'Text' }], outputs: [{ name: 'read', type: 'Text' }],
  logic: { type: 'conditionSet', rules: [{ when: { op: 'and', conditions: [{ field: 'name', operator: 'Equals', value: name }] }, then: { read: 'column-read' } }], otherwise: { read: 'column-not-read' } },
});

// ---- helpers --------------------------------------------------------------------------------

function createCaller(client) {
  const call = async (method, pathAndQuery, body) => {
    try { return { ok: true, body: await client[method](pathAndQuery, body) }; }
    catch (error) { return { ok: false, status: Number((error.message.match(/HTTP (\d{3})/) ?? [])[1]), message: error.message }; }
  };
  return {
    evaluate: (parameters) => call('post', 'qdb_edp_EvaluateDecision', parameters),
    action: (name, parameters) => call('post', name, parameters),
    fn: (name, parameters) => {
      const entries = Object.entries(parameters);
      const signature = entries.map(([k], i) => `${k}=@p${i}`).join(',');
      const values = entries.map(([, v], i) => `@p${i}=${encodeURIComponent(`'${String(v).replace(/'/g, "''")}'`)}`).join('&');
      return call('get', `${name}(${signature})${values ? `?${values}` : ''}`);
    },
  };
}

const provenanceOf = (response) => JSON.parse(response.body.ProvenanceJson ?? 'null') ?? {};
const resultOf = (response) => JSON.parse(response.body.ResultJson ?? 'null');
const errorCodes = (response) => JSON.parse(response.body.DiagnosticsJson ?? '[]').filter((d) => d.severity === 'Error').map((d) => d.code);
const diagnosticCodes = (response) => JSON.parse(response.body.DiagnosticsJson ?? '[]').map((d) => d.code);

function sameJson(a, b) {
  const normalise = (value) => JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v));
  return normalise(a) === normalise(b);
}

// ---- checks ---------------------------------------------------------------------------------

async function replay(caller) {
  const differences = [];
  let cases = 0;
  for (const version of goldens.versions) {
    for (const replayCase of version.cases) {
      cases++;
      const response = await caller.action('qdb_edp_TestRule', { RuleVersionId: version.ruleVersionId, InputsJson: JSON.stringify(replayCase.inputs) });
      const actual = response.ok ? resultOf(response) : { error: response.message.slice(0, 200) };
      const expected = replayCase.expected;
      const same = response.ok && actual.success === expected.success && actual.matched === expected.matched
        && sameJson(actual.outputs, expected.outputs) && sameJson(actual.reasonCodes, expected.reasonCodes);
      if (!same) differences.push({ ruleVersionId: version.ruleVersionId, inputs: replayCase.inputs, expected, actual });
    }
  }
  return { pass: differences.length === 0, evidence: `${cases} cases, ${differences.length} differences`, differences };
}

async function outcomeChecks(caller) {
  const run = (inputs, pcrm = STRICT, extra = {}) => caller.evaluate({ PcrmJson: pcrm, InputsJson: JSON.stringify(inputs), ...extra });
  const expectOutcome = async (label, response, outcome, code) => ({
    name: label,
    pass: response.ok && response.body.Outcome === outcome && (!code || errorCodes(response).includes(code)),
    evidence: response.ok ? `${response.body.Outcome} ${JSON.stringify(errorCodes(response))}` : response.message.slice(0, 160),
  });
  return [
    await expectOutcome('B2 strict valid input → MATCHED', await run({ amount: 5000, count: 2, flag: true, start: '2026-12-31' }), 'MATCHED'),
    await expectOutcome('B2 strict below threshold → NO_MATCH', await run({ amount: 10 }), 'NO_MATCH'),
    await expectOutcome('B2 missing required → INPUT_REJECTED EDP060', await run({ count: 1 }), 'INPUT_REJECTED', 'EDP060'),
    await expectOutcome('B2 null not nullable → EDP061', await run({ amount: null }), 'INPUT_REJECTED', 'EDP061'),
    await expectOutcome('B2 numeric string → EDP062', await run({ amount: '5000' }), 'INPUT_REJECTED', 'EDP062'),
    await expectOutcome('B2 numeric overflow → EDP062', await caller.evaluate({ PcrmJson: STRICT, InputsJson: '{"amount":1e400}' }), 'INPUT_REJECTED', 'EDP062'),
    await expectOutcome('B2 fractional whole number → EDP063', await run({ amount: 5000, count: 2.5 }), 'INPUT_REJECTED', 'EDP063'),
    await expectOutcome('B2 boolean as string → EDP062', await run({ amount: 5000, flag: 'true' }), 'INPUT_REJECTED', 'EDP062'),
    await expectOutcome('B2 non-ISO date → EDP062', await run({ amount: 5000, start: '31/12/2026' }), 'INPUT_REJECTED', 'EDP062'),
    await expectOutcome('B2 array for scalar → EDP062', await run({ amount: [5000] }), 'INPUT_REJECTED', 'EDP062'),
    await expectOutcome('Outcome ENGINE_ERROR (formula failure)', await run({ amount: 5 }, ENGINE_FAILURE), 'ENGINE_ERROR'),
    await (async () => {
      const response = await run({ amount: 5000, unexpected: 1 });
      return { name: 'B2 extra input → EDP067 notice, still MATCHED', pass: response.ok && response.body.Outcome === 'MATCHED' && diagnosticCodes(response).includes('EDP067'), evidence: response.ok ? `${response.body.Outcome} ${JSON.stringify(diagnosticCodes(response))}` : response.message };
    })(),
    await (async () => {
      const response = await run({ amount: 'abc' }, LENIENT);
      return { name: 'Legacy lenient rule given "abc" evaluates with EDP062 warning', pass: response.ok && response.body.Success === true && diagnosticCodes(response).includes('EDP062'), evidence: response.ok ? `${response.body.Outcome} ${JSON.parse(response.body.OutputsJson).decision} ${JSON.stringify(diagnosticCodes(response))}` : response.message };
    })(),
    await (async () => {
      const response = await caller.evaluate({ PcrmJson: STRICT, InputsJson: '{not json' });
      return { name: 'Unparseable InputsJson → HTTP 400', pass: !response.ok && response.status === 400, evidence: response.ok ? 'accepted' : `HTTP ${response.status}` };
    })(),
    await (async () => {
      const response = await run({ amount: 5000 });
      const success = response.body?.Success, matched = response.body?.Matched;
      return { name: 'Success/Matched derived from Outcome', pass: response.ok && success === true && matched === true, evidence: `Success=${success} Matched=${matched}` };
    })(),
  ];
}

async function declaredFactChecks(caller, client) {
  const account = (await client.get('accounts?$select=accountid,name&$filter=name ne null&$top=1')).value[0];
  const recordProbe = await caller.evaluate({ PcrmJson: recordNameProbe(account.name), TargetRef: { '@odata.type': 'Microsoft.Dynamics.CRM.account', accountid: account.accountid } });
  const caller1 = await caller.evaluate({ PcrmJson: STRICT, InputsJson: JSON.stringify({ amount: 2000 }) });
  const set = await caller.action('qdb_edp_ExecuteRuleSet', {
    RuleVersionIdsJson: JSON.stringify(['f55c2e51-da7d-f111-ab0e-70a8a55bc6a5', 'e4e1a94f-da7d-f111-ab0e-000d3abcf32d']),
    InputsJson: JSON.stringify({ creditonhold: false, revenue: 2000000, numberofemployees: 500 }),
  });
  const members = set.ok ? resultOf(set).results : [];
  return [
    { name: 'B1 declared fact is never read from a same-named record column (TargetRef)', pass: recordProbe.ok && JSON.parse(recordProbe.body.OutputsJson).read === 'column-not-read', evidence: recordProbe.ok ? JSON.parse(recordProbe.body.OutputsJson).read : recordProbe.message.slice(0, 160) },
    { name: 'B1 caller-provided declared fact evaluates', pass: caller1.ok && caller1.body.Outcome === 'MATCHED', evidence: caller1.ok ? caller1.body.Outcome : caller1.message.slice(0, 160) },
    { name: 'B1 chained rule set: upstream output feeds the downstream declared fact (live demo chain)', pass: set.ok && members.length === 2 && members.every((m) => m.success === true), evidence: set.ok ? JSON.stringify(members.map((m) => [m.outcome, m.outputs])) : set.message.slice(0, 160) },
  ];
}

async function identityChecks(caller) {
  const history = await caller.fn('qdb_edp_GetRuleHistory', { RuleName: 'All Node Types — Sample' });
  const byVersion = await caller.fn('qdb_edp_GetRuleMetadata', { RuleVersionId: '1a4a23bd-4f77-f111-ab0e-000d3abcff60' });
  const byId = await caller.fn('qdb_edp_GetRuleHistory', { RuleId: 'c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5' });
  const conflict = await caller.fn('qdb_edp_GetRuleHistory', { RuleId: 'c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5', RuleName: 'Credit vs Revenue' });
  const malformed = await caller.fn('qdb_edp_GetRuleHistory', { RuleKey: 'Demo.Risk-Tier' });
  const orphan = await caller.fn('qdb_edp_GetInputSchema', { RuleVersionId: fixtures.versions.find((v) => !v.ruleId).ruleVersionId });
  const effective = await caller.fn('qdb_edp_ResolveEffectiveVersion', { RuleId: 'cd0591cd-1f7b-f111-ab0e-70a8a55bc6a5' });
  const h = history.ok ? resultOf(history) : {};
  const checks = [
    { name: 'B3 duplicate name resolves deterministically to the earliest rule and reports ambiguity', pass: history.ok && h.ruleId === '113121d0-5177-f111-ab0e-000d3abcff60' && h.nameIsAmbiguous === true && h.matchCount === 5, evidence: JSON.stringify({ ruleId: h.ruleId, nameIsAmbiguous: h.nameIsAmbiguous, matchCount: h.matchCount }) },
    { name: 'B3 RuleVersionId resolution', pass: byVersion.ok && resultOf(byVersion).ruleId === 'c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5', evidence: byVersion.ok ? resultOf(byVersion).ruleId : byVersion.message.slice(0, 160) },
    { name: 'B3 RuleId resolution', pass: byId.ok && resultOf(byId).versionCount >= 1, evidence: byId.ok ? `${resultOf(byId).versionCount} versions` : byId.message.slice(0, 160) },
    { name: 'B3 conflicting identifiers → HTTP 400 EDP070', pass: !conflict.ok && conflict.status === 400 && conflict.message.includes('EDP070'), evidence: conflict.ok ? 'accepted' : `HTTP ${conflict.status}` },
    { name: 'B3 malformed (upper-case) RuleKey → HTTP 400 EDP071', pass: !malformed.ok && malformed.status === 400 && malformed.message.includes('EDP071'), evidence: malformed.ok ? 'accepted' : `HTTP ${malformed.status}` },
    { name: 'B3 orphaned version still resolves by RuleVersionId', pass: orphan.ok, evidence: orphan.ok ? `${resultOf(orphan).inputs.length} inputs` : orphan.message.slice(0, 160) },
    { name: 'B4 ResolveEffectiveVersion returns identity, no contentHash', pass: effective.ok && !('contentHash' in resultOf(effective)) && 'ruleKey' in resultOf(effective), evidence: effective.ok ? JSON.stringify({ ruleKey: resultOf(effective).ruleKey, resolved: !!resultOf(effective).resolved }) : effective.message.slice(0, 160) },
  ];
  checks.push(...(EXPECT_RULEKEYS ? await ruleKeyChecks(caller) : []));
  return checks;
}

async function ruleKeyChecks(caller) {
  const mapping = read('deploy/registration/rulekey-mapping.json').entries;
  const results = [];
  for (const entry of mapping) {
    const response = await caller.fn('qdb_edp_GetRuleHistory', { RuleKey: entry.ruleKey });
    results.push({ name: `B3 RuleKey ${entry.ruleKey} resolves to ${entry.ruleId.slice(0, 8)}`, pass: response.ok && resultOf(response).ruleId === entry.ruleId && resultOf(response).ruleKey === entry.ruleKey, evidence: response.ok ? resultOf(response).ruleId : response.message.slice(0, 160) });
  }
  const keyAndId = await caller.fn('qdb_edp_GetRuleHistory', { RuleKey: 'demo.risk-tier', RuleId: 'c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5' });
  results.push({ name: 'B3 RuleKey + a different RuleId → HTTP 400 EDP070', pass: !keyAndId.ok && keyAndId.status === 400 && keyAndId.message.includes('EDP070'), evidence: keyAndId.ok ? 'accepted' : `HTTP ${keyAndId.status}` });
  return results;
}

async function provenanceChecks(caller) {
  const versionId = '08ad23cc-1f7b-f111-ab0e-000d3abd8313';
  const correlationId = `r1-validation-${Date.now()}`;
  const stored = await caller.evaluate({ RuleVersionId: versionId, InputsJson: JSON.stringify({ creditlimit: 1000, revenue: '5' }), CorrelationId: correlationId });
  const p = stored.ok ? provenanceOf(stored) : {};
  const longId = await caller.evaluate({ PcrmJson: STRICT, InputsJson: '{"amount":5000}', CorrelationId: 'x'.repeat(101) });
  const maxId = await caller.evaluate({ PcrmJson: STRICT, InputsJson: '{"amount":5000}', CorrelationId: 'y'.repeat(100) });
  const [d1, d2] = ['d1-strict-variant', 'd2-lenient-variant'].map((id) => vectors.vectors.find((v) => v.id === id));
  const strictRun = await caller.evaluate({ PcrmJson: d1.pcrm, InputsJson: '{"amount":5}' });
  const lenientRun = await caller.evaluate({ PcrmJson: d2.pcrm, InputsJson: '{"amount":5}' });
  const reordered = vectors.vectors.find((v) => v.id === 'c-every-input-type-reordered');
  const reorderedRun = await caller.evaluate({ PcrmJson: reordered.pcrm, InputsJson: '{"note":"x","amount":1}' });
  const ph = (r) => (r.ok ? provenanceOf(r).contentHash : r.message.slice(0, 80));
  return [
    { name: 'B4 EvaluateDecision returns Outcome, ExecutionId and every provenance field', pass: stored.ok && !!stored.body.Outcome && !!stored.body.ExecutionId && ['executionId', 'ruleId', 'ruleKey', 'ruleVersionId', 'versionNumber', 'contentHash', 'evaluatedOnUtc', 'correlationId'].every((k) => k in p), evidence: stored.ok ? JSON.stringify(p) : stored.message.slice(0, 200) },
    { name: 'B4 provenance identity is the stored version', pass: p.ruleVersionId === versionId && p.ruleId === 'cd0591cd-1f7b-f111-ab0e-70a8a55bc6a5' && p.versionNumber === 1 && p.executionId === stored.body?.ExecutionId, evidence: JSON.stringify({ ruleVersionId: p.ruleVersionId, ruleId: p.ruleId, versionNumber: p.versionNumber }) },
    { name: 'B4 ContentHash equals the independently computed hash of the stored PCRM', pass: p.contentHash === expectedHashes[versionId], evidence: `${p.contentHash} vs ${expectedHashes[versionId]}` },
    { name: 'B4 CorrelationId echoed verbatim', pass: p.correlationId === correlationId, evidence: p.correlationId },
    { name: 'B4 evaluatedOnUtc is an ISO instant', pass: typeof p.evaluatedOnUtc === 'string' && !Number.isNaN(Date.parse(p.evaluatedOnUtc)), evidence: p.evaluatedOnUtc },
    { name: 'B4 CorrelationId of 101 characters → HTTP 400', pass: !longId.ok && longId.status === 400, evidence: longId.ok ? 'accepted' : `HTTP ${longId.status}` },
    { name: 'B4 CorrelationId of 100 characters accepted', pass: maxId.ok && provenanceOf(maxId).correlationId?.length === 100, evidence: maxId.ok ? 'accepted' : maxId.message.slice(0, 120) },
    { name: 'ContentHash strict vs lenient variants differ and equal the shared vectors', pass: ph(strictRun) === d1.sha256 && ph(lenientRun) === d2.sha256 && d1.sha256 !== d2.sha256, evidence: `${ph(strictRun)} / ${ph(lenientRun)}` },
    { name: 'ContentHash of a reordered rule equals the vector (same as the original)', pass: ph(reorderedRun) === reordered.sha256, evidence: ph(reorderedRun) },
    { name: 'No InputsDigest anywhere in the response', pass: stored.ok && !JSON.stringify(stored.body).toLowerCase().includes('digest'), evidence: 'checked response body' },
  ];
}

async function analyticsCheck(caller) {
  const before = await caller.fn('qdb_edp_GetRuleAnalytics', {});
  await caller.evaluate({ PcrmJson: STRICT, InputsJson: '{"amount":"5000"}' });
  const after = await caller.fn('qdb_edp_GetRuleAnalytics', {});
  const count = (r) => (r.ok ? resultOf(r).rejected : undefined);
  return [{ name: 'Analytics reports a rejected count that includes a fresh INPUT_REJECTED', pass: typeof count(before) === 'number' && count(after) >= count(before) + 1, evidence: `${count(before)} → ${count(after)}` }];
}

async function main() {
  const client = await createDataverseClient();
  const caller = createCaller(client);
  const replayResult = await replay(caller);
  const checks = [
    { name: 'Legacy replay through the deployed runtime (TestRule, no writes)', pass: replayResult.pass, evidence: replayResult.evidence },
    ...(await declaredFactChecks(caller, client)),
    ...(await outcomeChecks(caller)),
    ...(await identityChecks(caller)),
    ...(await provenanceChecks(caller)),
    ...(await analyticsCheck(caller)),
  ];
  checks.forEach((c) => console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  — ${c.evidence}`));
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  const out = argument('--out');
  if (out) writeFileSync(out, JSON.stringify({ atUtc: new Date().toISOString(), org: client.orgUrl, checks, replayDifferences: replayResult.differences }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
