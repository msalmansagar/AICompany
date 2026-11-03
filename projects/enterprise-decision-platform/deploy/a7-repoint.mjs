#!/usr/bin/env node
// A7 — move the Rule Engine's cloud registrations from the retired signed assembly to the
// plug-in package assembly (ADR-18), registering missing Custom API metadata first.
//
// DEFAULT IS A DRY RUN. Nothing is written to the org without --apply.
//
//   node deploy/a7-repoint.mjs                        dry run: inventory, snapshot, plan
//   node deploy/a7-repoint.mjs --apply                metadata first, then moves, then verify
//   node deploy/a7-repoint.mjs --rollback <snap.json> dry run of a rollback to that snapshot
//   node deploy/a7-repoint.mjs --rollback <snap.json> --apply
//   node deploy/a7-repoint.mjs --to-legacy [--apply]  move everything back to the signed assembly
//   node deploy/a7-repoint.mjs --smoke                read-only smoke checks only
//   options: --wait <seconds> (default 20)  --out <dir> (default deploy/.a7-runs)
//
// Credentials: EDP_ENV_PATH=<.env with AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET/DATAVERSE_URL>

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createDataverseClient } from './lib/dataverse-client.mjs';
import { loadContract } from './lib/registration-contract.mjs';
import { prepareMigration, applyMigration, prepareRollback, applyRollback, DEFAULT_PROPAGATION_WAIT_SECONDS } from './lib/repoint-run.mjs';
import { createChangeLog } from './lib/repoint-executor.mjs';
import { runSmoke } from './lib/smoke.mjs';
import { SIDES } from './lib/repoint-plan.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const runDirectory = path.join(option('--out', path.join(path.dirname(fileURLToPath(import.meta.url)), '.a7-runs')), new Date().toISOString().replace(/[:.]/g, '-'));
const waitSeconds = Number(option('--wait', DEFAULT_PROPAGATION_WAIT_SECONDS));

function printPrepared(prepared) {
  const moves = prepared.moves.filter((m) => m.action === 'move');
  console.log(`\nregistrations: ${prepared.items.length} (${prepared.items.filter((i) => i.kind === 'customapi').length} Custom APIs, ${prepared.items.filter((i) => i.kind === 'step').length} entity steps)`);
  console.log(`metadata to create: ${prepared.metadata.creates.length}`);
  prepared.metadata.creates.forEach((c) => console.log(`  + ${c.operation} ${c.direction} ${c.name}: ${c.definition.type}`));
  console.log(`metadata incompatibilities: ${prepared.metadata.incompatibilities.length}`);
  prepared.metadata.incompatibilities.forEach((f) => console.log(`  ! ${f.kind} ${f.operation}.${f.argument ?? ''}`));
  console.log(`moves: ${moves.length}, already in place: ${prepared.moves.length - moves.length}`);
  moves.forEach((m) => console.log(`  ~ ${m.kind.padEnd(9)} ${m.key}  ${m.currentTypeId} -> ${m.targetTypeId}`));
  console.log(`problems (any problem blocks --apply): ${prepared.problems.length}`);
  prepared.problems.forEach((p) => console.log(`  ✗ ${p}`));
}

async function main() {
  const contract = loadContract();
  const client = await createDataverseClient();
  mkdirSync(runDirectory, { recursive: true });
  const changeLog = createChangeLog((entry) => appendFileSync(path.join(runDirectory, 'changelog.jsonl'), `${JSON.stringify(entry)}\n`));

  if (flag('--smoke')) return reportSmoke(await runSmoke(client));

  const rollbackSnapshot = option('--rollback', null);
  const prepared = rollbackSnapshot
    ? await prepareRollback(client, contract, JSON.parse(readFileSync(rollbackSnapshot, 'utf8')))
    : await prepareMigration(client, contract, flag('--to-legacy') ? SIDES.LEGACY : SIDES.ACTIVE);
  writeFileSync(path.join(runDirectory, 'snapshot.json'), JSON.stringify(prepared.inventory, null, 2));
  console.log(`snapshot written: ${path.join(runDirectory, 'snapshot.json')}`);
  printPrepared(prepared);

  if (!flag('--apply')) { console.log('\nDRY RUN — nothing was written. Re-run with --apply to change the org.'); return; }
  const apply = rollbackSnapshot ? applyRollback : applyMigration;
  const result = await apply({ client, contract, prepared, changeLog, sleep, waitSeconds });
  console.log(result.unverified.length === 0 ? '\nVERIFIED: every item is bound as planned.' : `\nMISMATCH after ${waitSeconds}s:\n${JSON.stringify(result.unverified, null, 2)}`);
  if (result.unverified.length > 0) process.exitCode = 2;
}

function reportSmoke(results) {
  results.forEach((r) => console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  ${r.evidence}`));
  if (results.some((r) => !r.passed)) process.exitCode = 3;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
