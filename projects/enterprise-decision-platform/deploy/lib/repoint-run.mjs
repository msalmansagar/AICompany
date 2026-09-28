// Orchestrates one A7 run. The client and the sleep function are injected so the whole flow
// — dry run, apply, verify, rollback — runs against an in-memory org in tests.

import { takeInventory } from './registration-inventory.mjs';
import { classifyRegistrations, indexPluginTypes, planMoves, planRollback, SIDES } from './repoint-plan.mjs';
import { planMetadata } from './metadata-plan.mjs';
import { applyMetadataCreates, applyMoves, findUnverifiedItems } from './repoint-executor.mjs';

export const DEFAULT_PROPAGATION_WAIT_SECONDS = 20;

/** Inventory + classify + plan. Read-only. Answers everything a dry run prints. */
export async function prepareMigration(client, contract, targetSide = SIDES.ACTIVE) {
  const inventory = await takeInventory(client, contract);
  const { items, problems } = classifyRegistrations(inventory, contract);
  const types = indexPluginTypes(inventory, contract);
  const metadata = planMetadata(contract, inventory);
  const moves = problems.length === 0 ? planMoves(items, types, targetSide) : [];
  return { inventory, items, problems, metadata, moves };
}

/**
 * Apply a prepared migration. Refuses on any classification problem or metadata
 * incompatibility. Metadata is registered BEFORE any binding moves: EvaluateDecision writes
 * ExecutionId unconditionally, so the property must exist before new code serves the API.
 */
export async function applyMigration({ client, contract, prepared, changeLog, sleep, waitSeconds = DEFAULT_PROPAGATION_WAIT_SECONDS }) {
  refuseIfUnsafe(prepared);
  await applyMetadataCreates(client, prepared.metadata.creates, changeLog);
  await applyMoves(client, prepared.moves, changeLog, 'repoint');
  return verifyAfterWait({ client, contract, plan: prepared.moves, changeLog, sleep, waitSeconds });
}

/** Roll back to a captured snapshot. Tolerates partial migration; never deletes anything. */
export async function prepareRollback(client, contract, snapshot) {
  const inventory = await takeInventory(client, contract);
  const { items, problems } = classifyRegistrations(inventory, contract);
  // Report items the snapshot does not know about even when other problems already block the
  // rollback: a snapshot that does not match the org is itself a finding the operator needs.
  const candidateMoves = planRollback(items, snapshot);
  const unknown = candidateMoves.filter((m) => m.action === 'not-in-snapshot').map((m) => `${m.key} is not in the snapshot`);
  const allProblems = [...problems, ...unknown];
  return { inventory, items, problems: allProblems, metadata: { creates: [], incompatibilities: [] }, moves: allProblems.length === 0 ? candidateMoves : [] };
}

export async function applyRollback({ client, contract, prepared, changeLog, sleep, waitSeconds = DEFAULT_PROPAGATION_WAIT_SECONDS }) {
  refuseIfUnsafe(prepared);
  await applyMoves(client, prepared.moves, changeLog, 'rollback');
  return verifyAfterWait({ client, contract, plan: prepared.moves, changeLog, sleep, waitSeconds });
}

function refuseIfUnsafe(prepared) {
  const reasons = [...prepared.problems, ...prepared.metadata.incompatibilities.map((f) => `metadata ${f.kind}: ${f.operation}.${f.argument ?? ''}`)];
  if (reasons.length > 0) throw new Error(`Refusing to change the org:\n - ${reasons.join('\n - ')}`);
}

// A re-point is not effective the instant the PATCH returns (observed during ADR-18 P1);
// verifying too early reports a false failure, so wait before re-reading.
async function verifyAfterWait({ client, contract, plan, changeLog, sleep, waitSeconds }) {
  if (plan.some((p) => p.action === 'move')) await sleep(waitSeconds * 1000);
  const fresh = await takeInventory(client, contract);
  const { items } = classifyRegistrations(fresh, contract);
  const unverified = findUnverifiedItems(plan, items);
  changeLog.record({ phase: 'verify', result: unverified.length === 0 ? 'verified' : 'mismatch', unverified });
  return { inventory: fresh, unverified };
}
