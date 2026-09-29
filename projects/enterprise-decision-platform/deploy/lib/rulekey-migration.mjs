// RuleKey migration for Release 1, Order Y (HD-9): after 1.1.0 is deployed, backfill the approved
// keys (HD-2), prove the gates, create the uniqueness key, wait for Active, prove again. Only then
// may RuleKey be declared a supported consumer identity (FR-B3-16).
//
// Everything here is either a pure answer (plan, gates) or one explicit write the caller asked for.
// Nothing deletes; a removal of the uniqueness key is a manual, separately authorised step.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const RULE_SET = 'qdb_edp_rules';
const KEY_ATTRIBUTE = 'qdb_edp_rulekey';
export const UNIQUENESS_KEY_SCHEMA_NAME = 'qdb_edp_rulekey_uniqueness';

// FR-B3-11: the key is created inside the solution that owns qdb_edp_rule, so it travels with
// solution export/import. Key VALUES are rule data and travel with the rule records.
export const RULE_ENGINE_SOLUTION = 'BusinessRuleEngine';

export function loadMapping(file = path.join(here, '..', 'registration', 'rulekey-mapping.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadEngineContract(file = path.join(here, '..', '..', 'contract', 'rule-engine-contract.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** True when a key matches the contract exactly (pattern and length); never normalised. */
export function isValidRuleKey(key, engineContract) {
  const { pattern, minLength, maxLength } = engineContract.ruleKey;
  return typeof key === 'string' && key.length >= minLength && key.length <= maxLength && new RegExp(pattern).test(key);
}

/** Every rule with the fields the migration reads, in a stable order. */
export async function readRules(client) {
  const rows = [];
  let page = await client.get(`${RULE_SET}?$select=qdb_edp_ruleid,qdb_edp_rulename,${KEY_ATTRIBUTE},createdon,modifiedon&$orderby=createdon asc,qdb_edp_ruleid asc`);
  rows.push(...page.value);
  while (page['@odata.nextLink']) {
    page = await client.get(page['@odata.nextLink'].replace(/^.*\/api\/data\/v9\.2\//, ''));
    rows.push(...page.value);
  }
  return rows.map((r) => ({ ruleId: r.qdb_edp_ruleid, name: r.qdb_edp_rulename, ruleKey: r[KEY_ATTRIBUTE] ?? null, createdOn: r.createdon, modifiedOn: r.modifiedon }));
}

/**
 * The backfill plan. Answers { writes, unchanged, problems }. A problem stops the whole backfill:
 * a mapped rule that is missing, renamed, or already holds a DIFFERENT key; an approved key that
 * is malformed, duplicated in the mapping, or already held by another rule.
 */
export function planBackfill(mapping, rules, engineContract) {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  const problems = [...mappingProblems(mapping, engineContract), ...keyHeldElsewhere(mapping, rules)];
  const writes = [];
  const unchanged = [];
  for (const entry of mapping.entries) {
    const rule = byId.get(entry.ruleId);
    const problem = entryProblem(entry, rule);
    if (problem) problems.push(problem);
    else if (rule.ruleKey === entry.ruleKey) unchanged.push(entry);
    else writes.push({ ruleId: entry.ruleId, ruleKey: entry.ruleKey, before: rule.ruleKey });
  }
  return { writes, unchanged, problems };
}

function entryProblem(entry, rule) {
  if (!rule) return `rule ${entry.ruleId} (${entry.ruleKey}) does not exist`;
  if (rule.name !== entry.displayName) return `rule ${entry.ruleId} is now named "${rule.name}", not "${entry.displayName}"; the mapping must be re-approved`;
  if (rule.ruleKey && rule.ruleKey !== entry.ruleKey) return `rule ${entry.ruleId} already holds key "${rule.ruleKey}", not the approved "${entry.ruleKey}"`;
  return null;
}

function mappingProblems(mapping, engineContract) {
  const problems = mapping.entries.filter((e) => !isValidRuleKey(e.ruleKey, engineContract)).map((e) => `approved key "${e.ruleKey}" does not match the key format`);
  const lower = mapping.entries.map((e) => e.ruleKey.toLowerCase());
  const duplicated = [...new Set(lower.filter((k, i) => lower.indexOf(k) !== i))];
  return [...problems, ...duplicated.map((k) => `approved key "${k}" appears more than once`)];
}

function keyHeldElsewhere(mapping, rules) {
  const mappedIds = new Set(mapping.entries.map((e) => e.ruleId));
  const approved = new Set(mapping.entries.map((e) => e.ruleKey.toLowerCase()));
  return rules.filter((r) => !mappedIds.has(r.ruleId) && r.ruleKey && approved.has(r.ruleKey.toLowerCase()))
    .map((r) => `approved key "${r.ruleKey}" is already held by unmapped rule ${r.ruleId}`);
}

/**
 * The gates before the uniqueness key may be created (BRD §9, HD-9): completeness, format,
 * case-insensitive uniqueness, and — against the snapshot taken before the backfill — that no
 * record other than the mapped ones changed and the mapped ones changed only their key.
 */
export function evaluateGates({ rules, mapping, engineContract, snapshot }) {
  const failures = [
    ...rules.filter((r) => !r.ruleKey).map((r) => `completeness: rule ${r.ruleId} ("${r.name}") has no key`),
    ...rules.filter((r) => r.ruleKey && !isValidRuleKey(r.ruleKey, engineContract)).map((r) => `format: rule ${r.ruleId} key "${r.ruleKey}" is invalid`),
    ...duplicateKeys(rules).map((k) => `uniqueness: key "${k}" is held by more than one rule (case-insensitive)`),
    ...mappedKeyDrift(rules, mapping),
    ...(snapshot ? unexpectedModifications(rules, mapping, snapshot) : []),
  ];
  return { passed: failures.length === 0, failures };
}

function duplicateKeys(rules) {
  const keys = rules.filter((r) => r.ruleKey).map((r) => r.ruleKey.toLowerCase());
  return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
}

function mappedKeyDrift(rules, mapping) {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  return mapping.entries.filter((e) => byId.get(e.ruleId)?.ruleKey !== e.ruleKey)
    .map((e) => `mapping: rule ${e.ruleId} holds "${byId.get(e.ruleId)?.ruleKey ?? '(missing)'}", approved "${e.ruleKey}"`);
}

function unexpectedModifications(rules, mapping, snapshot) {
  const mappedIds = new Set(mapping.entries.map((e) => e.ruleId));
  const before = new Map(snapshot.rules.map((r) => [r.ruleId, r]));
  return rules.filter((r) => before.has(r.ruleId)).flatMap((r) => {
    const prior = before.get(r.ruleId);
    if (r.name !== prior.name) return [`modified: rule ${r.ruleId} was renamed during the migration`];
    if (!mappedIds.has(r.ruleId) && r.modifiedOn !== prior.modifiedOn) return [`modified: unmapped rule ${r.ruleId} changed during the migration`];
    return [];
  });
}

/** Write the planned keys one by one, logging each before/after so the run can be rolled back. */
export async function applyBackfill(client, plan, log) {
  if (plan.problems.length > 0) throw new Error(`backfill refused: ${plan.problems.length} problem(s)`);
  for (const write of plan.writes) {
    await client.patch(`${RULE_SET}(${write.ruleId})`, { [KEY_ATTRIBUTE]: write.ruleKey });
    log({ action: 'set-rulekey', ruleId: write.ruleId, before: write.before, after: write.ruleKey });
  }
}

/** Clear only keys this run wrote and that still hold the value it wrote. */
export function planRollback(runLog, rules) {
  const byId = new Map(rules.map((r) => [r.ruleId, r]));
  return runLog.filter((e) => e.action === 'set-rulekey' && byId.get(e.ruleId)?.ruleKey === e.after)
    .map((e) => ({ ruleId: e.ruleId, restore: e.before ?? null }));
}

export async function applyRollback(client, rollback, log) {
  for (const step of rollback) {
    await client.patch(`${RULE_SET}(${step.ruleId})`, { [KEY_ATTRIBUTE]: step.restore });
    log({ action: 'restore-rulekey', ruleId: step.ruleId, after: step.restore });
  }
}

/** The uniqueness key's current state, or null when it does not exist. */
export async function readUniquenessKey(client) {
  const keys = (await client.get(`EntityDefinitions(LogicalName='qdb_edp_rule')/Keys?$select=SchemaName,KeyAttributes,EntityKeyIndexStatus`)).value;
  const key = keys.find((k) => (k.KeyAttributes ?? []).length === 1 && k.KeyAttributes[0] === KEY_ATTRIBUTE);
  return key ? { schemaName: key.SchemaName, status: key.EntityKeyIndexStatus } : null;
}

export function uniquenessKeyDefinition() {
  const label = { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: 'Rule Key (unique)', LanguageCode: 1033 }] };
  return { SchemaName: UNIQUENESS_KEY_SCHEMA_NAME, DisplayName: label, KeyAttributes: [KEY_ATTRIBUTE] };
}

export async function createUniquenessKey(client, log) {
  await client.post(`EntityDefinitions(LogicalName='qdb_edp_rule')/Keys`, uniquenessKeyDefinition(), { 'MSCRM.SolutionUniqueName': RULE_ENGINE_SOLUTION });
  log({ action: 'create-uniqueness-key', schemaName: UNIQUENESS_KEY_SCHEMA_NAME });
}

/**
 * Poll until the key's index is Active (or Failed, or the attempts run out). Answers the last
 * status seen; the caller decides. `sleep` is injected so tests do not wait.
 */
export async function waitForActive(client, { attempts, intervalMs, sleep }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const key = await readUniquenessKey(client);
    if (key?.status === 'Active' || key?.status === 'Failed') return key.status;
    if (attempt < attempts) await sleep(intervalMs);
  }
  return (await readUniquenessKey(client))?.status ?? 'Missing';
}

/** FR-B3-16: RuleKey may be declared supported only when every gate passes and the key is Active. */
export function supportDecision(gates, uniquenessKey) {
  const reasons = [...gates.failures];
  if (!uniquenessKey) reasons.push('the uniqueness key does not exist');
  else if (uniquenessKey.status !== 'Active') reasons.push(`the uniqueness key is ${uniquenessKey.status}, not Active`);
  return { supported: reasons.length === 0, reasons };
}
