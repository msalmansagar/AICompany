#!/usr/bin/env node
// RuleKey migration, Release 1 Order Y (HD-9). Run ONLY after 1.1.0 is deployed, and each --apply
// step only with its own explicit human authorisation (BRD §9). EVERY COMMAND IS A DRY RUN unless
// --apply is given; `verify` and `status` never write.
//
//   node deploy/a7-rulekey.mjs plan                           what the backfill would write, and any conflict
//   node deploy/a7-rulekey.mjs backfill --apply --log <file>  write the approved keys; snapshot + change log to <file>
//   node deploy/a7-rulekey.mjs verify --log <file>            the gates (completeness, format, uniqueness, no unexpected change)
//   node deploy/a7-rulekey.mjs create-key --apply --log <file> gates, then create the uniqueness key and wait for Active
//   node deploy/a7-rulekey.mjs status --log <file>            may RuleKey be declared supported? (FR-B3-16)
//   node deploy/a7-rulekey.mjs rollback --apply --log <file>  clear the keys this run wrote (the key itself is removed by hand)
//
// Until `status` answers "supported", RuleKey MUST NOT be advertised as a consumer identity.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import {
  loadMapping, loadEngineContract, readRules, planBackfill, applyBackfill, evaluateGates,
  planRollback, applyRollback, readUniquenessKey, createUniquenessKey, waitForActive, supportDecision,
} from './lib/rulekey-migration.mjs';

const ACTIVE_WAIT = { attempts: 60, intervalMs: 10_000, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

const argument = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const isApply = process.argv.includes('--apply');

function readRunFile(file) {
  if (!file || !existsSync(file)) throw new Error('--log <file> from the backfill run is required');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function runFileWriter(file, snapshot) {
  const run = { snapshot, log: [] };
  writeFileSync(file, JSON.stringify(run, null, 2));
  return (entry) => { run.log.push({ ...entry, atUtc: new Date().toISOString() }); writeFileSync(file, JSON.stringify(run, null, 2)); console.log(JSON.stringify(entry)); };
}

async function plan(client, context) {
  const result = planBackfill(context.mapping, await readRules(client), context.engineContract);
  result.writes.forEach((w) => console.log(`+ ${w.ruleId} -> ${w.ruleKey}`));
  result.unchanged.forEach((e) => console.log(`= ${e.ruleId} already ${e.ruleKey}`));
  result.problems.forEach((p) => console.log(`! ${p}`));
  return result;
}

async function backfill(client, context) {
  const rules = await readRules(client);
  const result = await plan(client, context);
  if (result.problems.length > 0) { process.exitCode = 1; return console.error('Conflicts found — nothing written. Report them; do not edit the approved mapping silently.'); }
  if (!isApply) return console.log(`DRY RUN — ${result.writes.length} key(s) would be written.`);
  const logFile = argument('--log') ?? `rulekey-run-${Date.now()}.json`;
  await applyBackfill(client, result, runFileWriter(logFile, { takenOnUtc: new Date().toISOString(), rules }));
  console.log(`Wrote ${result.writes.length} key(s). Run file: ${logFile}. Next: verify --log ${logFile}`);
}

async function verify(client, context) {
  const run = readRunFile(argument('--log'));
  const gates = evaluateGates({ rules: await readRules(client), mapping: context.mapping, engineContract: context.engineContract, snapshot: run.snapshot });
  gates.failures.forEach((f) => console.log(`! ${f}`));
  console.log(gates.passed ? 'GATES PASSED' : 'GATES FAILED');
  if (!gates.passed) process.exitCode = 1;
  return gates;
}

async function createKey(client, context) {
  const gates = await verify(client, context);
  if (!gates.passed) return console.error('Gates failed — the uniqueness key will not be created.');
  const existing = await readUniquenessKey(client);
  if (existing) return console.log(`The uniqueness key already exists (${existing.status}).`);
  if (!isApply) return console.log('DRY RUN — the uniqueness key would be created on qdb_edp_rulekey.');
  const run = readRunFile(argument('--log'));
  const log = (entry) => { run.log.push({ ...entry, atUtc: new Date().toISOString() }); writeFileSync(argument('--log'), JSON.stringify(run, null, 2)); console.log(JSON.stringify(entry)); };
  await createUniquenessKey(client, log);
  const status = await waitForActive(client, ACTIVE_WAIT);
  log({ action: 'uniqueness-key-status', status });
  if (status !== 'Active') { process.exitCode = 1; return console.error(`The key is ${status}, not Active. RuleKey is NOT supported.`); }
  await reportSupport(client, context);
}

async function reportSupport(client, context) {
  const run = readRunFile(argument('--log'));
  const gates = evaluateGates({ rules: await readRules(client), mapping: context.mapping, engineContract: context.engineContract, snapshot: run.snapshot });
  const decision = supportDecision(gates, await readUniquenessKey(client));
  decision.reasons.forEach((r) => console.log(`! ${r}`));
  console.log(decision.supported ? 'SUPPORTED — RuleKey may now be declared a consumer identity.' : 'NOT SUPPORTED — do not advertise RuleKey.');
}

async function rollback(client) {
  const run = readRunFile(argument('--log'));
  const steps = planRollback(run.log, await readRules(client));
  steps.forEach((s) => console.log(`- ${s.ruleId} -> ${s.restore ?? '(empty)'}`));
  if (!isApply) return console.log(`DRY RUN — ${steps.length} key(s) would be cleared. A created uniqueness key is removed by hand.`);
  await applyRollback(client, steps, (entry) => console.log(JSON.stringify(entry)));
}

const COMMANDS = { plan, backfill, verify, 'create-key': createKey, status: reportSupport, rollback };

async function main() {
  const command = COMMANDS[process.argv[2] ?? 'plan'];
  if (!command) throw new Error(`unknown command; use one of: ${Object.keys(COMMANDS).join(', ')}`);
  const context = { mapping: loadMapping(), engineContract: loadEngineContract() };
  await command(await createDataverseClient(), context);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
