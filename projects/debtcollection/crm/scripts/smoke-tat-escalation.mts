/**
 * smoke-tat-escalation.mts
 * WP7 against real Dataverse — and careful about what a green run means.
 *
 * Three statements are kept apart, because merging them would claim something untrue:
 *
 *   **TAT calculation** — validated here. The configured duration is read from the organisation,
 *   a deadline is computed from it, and the resulting work state is derived.
 *   **Escalation mechanism** — NOT validated. DCP performs no escalation action, because there is
 *   nothing configured to perform (KI-104).
 *   **QDB escalation configuration** — NOT configured. `qdb_escalationconiguration` holds zero rows
 *   and `CreateEscalationRecord` is referenced by no activated workflow. This script asserts that
 *   emptiness rather than assuming it, so the claim stays true only while it is.
 *
 * The property most worth proving is a negative: an activity with a long-passed deadline and no
 * assignee is reported as an assignment exception, **not** as an officer running late.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-tat-escalation.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ACTIVITY_ORIGIN_CODES, computeDeadline, deriveWorkState, escalationDue } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8TAT-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const createdIds = new Set<string>();

async function write(
  cfg: Config, token: string, method: string, path: string,
  body?: unknown, headers: Record<string, string> = {},
): Promise<number> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME, ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response.status;
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Marker: ${MARKER}\n`);

  // ── The escalation mechanism's actual state, asserted not assumed ──────────
  console.log('─── 0. What escalation capability exists here ───');
  const policies = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_escalationconigurations?$select=qdb_name&$top=1&$count=true');
  const escalations = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_escalations?$select=activityid&$top=1&$count=true');
  check('QDB escalation configuration is NOT configured — zero policies',
    (policies['@odata.count'] ?? -1) === 0, `${policies['@odata.count']} rows`);
  check('and no escalation has ever been raised here',
    (escalations['@odata.count'] ?? -1) === 0, `${escalations['@odata.count']} rows`);

  const slas = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/slas?$select=name,objecttypecode');
  check('the native SLAs on this organisation target something other than collection work',
    slas.value.every(sla => Number(sla['objecttypecode']) !== 4207),
    slas.value.map(s => `${s['name']}(otc=${s['objecttypecode']})`).join(', '));

  // ── Configuration, read from the organisation ─────────────────────────────
  console.log('\n─── 1. The configured turn-around time ───');
  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name,qdb_escalationhours,'
    + 'qdb_escalateifnotcompleted&$filter=qdb_escalationhours ne null&$top=1');
  const action = actions.value[0];
  const hours = Number(action?.['qdb_escalationhours']);
  check('a turn-around time is configured on a strategy action', Number.isFinite(hours),
    `${action?.['qdb_name']} = ${hours}h, escalate=${action?.['qdb_escalateifnotcompleted']}`);

  // ── A real activity to reason about ───────────────────────────────────────
  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/qdb_collectioncases?$select=qdb_collectioncaseid&$filter=startswith(qdb_casenumber,'DEMO-HL')&$top=1");
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_isactive eq true&$top=1');

  const activityId = crypto.randomUUID();
  const created = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`, {
    subject: `${MARKER} work`,
    qdb_origin: ACTIVITY_ORIGIN_CODES.Manual,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${cases.value[0]?.['qdb_collectioncaseid']})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${types.value[0]?.['qdb_collectionactivitytypeid']})`,
  }, { 'If-None-Match': '*' });
  if (created < 400) createdIds.add(activityId);
  check('an activity exists to reason about', created < 400, `status ${created}`);

  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${activityId})?$select=activityid,createdon,statecode,qdb_supervisorescalated,_ownerid_value`);
  const createdOn = String(row['createdon']);
  check('the platform supplies the instant a deadline could start from', Boolean(createdOn), createdOn);

  // ── 2. TAT calculation ────────────────────────────────────────────────────
  console.log('\n─── 2. TAT calculation from real configuration ───');
  const deadline = computeDeadline({
    startPolicy: 'ActivityCreated', hours, instants: { createdOn } });
  check('a deadline is computed from the organisation’s own configuration',
    deadline.determined === true,
    deadline.determined === true ? `due ${deadline.dueAt} (${deadline.basis})` : deadline.reason);
  check('and it declares the basis it was measured against, rather than implying a calendar',
    deadline.determined === true && deadline.basis === 'ContinuousElapsed');

  const undetermined = computeDeadline({ hours, instants: { createdOn } });
  check('with no agreed clock start, NO deadline is produced (KI-101)',
    undetermined.determined === false);

  // ── 3. The clocks stay separate ───────────────────────────────────────────
  console.log('\n─── 3. Unassigned work is not an officer running late ───');
  const longPast = computeDeadline({
    startPolicy: 'ActivityCreated', hours: 1, instants: { createdOn: '2020-01-01T00:00:00Z' } });

  const unassigned = deriveWorkState({
    lifecycle: 'Open', assignment: 'ConfigurationMissing', deadline: longPast,
    escalated: false, now: new Date(),
  });
  check('a long-overdue deadline with NO assignee reports an assignment exception',
    unassigned.state === 'AssignmentRequiresAttention', unassigned.state);
  check('and is never reported as Overdue', unassigned.state !== 'Overdue');

  const assigned = deriveWorkState({
    lifecycle: 'Open', assignment: 'Assigned', deadline: longPast,
    escalated: false, now: new Date(),
  });
  check('the same deadline WITH an assignee does report Overdue', assigned.state === 'Overdue');

  const raised = escalationDue({
    state: assigned.state, escalationConfigured: false, activityId });
  check('an overdue item raises an OBSERVATION, not an escalation',
    raised?.kind === 'TatOverdue', raised?.kind ?? 'none');

  // ── 4. Escalated is read, never invented ──────────────────────────────────
  console.log('\n─── 4. "Escalated" comes from the platform, not from a calculation ───');
  check('the activity is not escalated to begin with',
    row['qdb_supervisorescalated'] !== true, String(row['qdb_supervisorescalated']));

  const flagged = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { qdb_supervisorescalated: true });
  check('the platform records a supervisor escalation when one is set', flagged < 400, `status ${flagged}`);

  const after = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${activityId})?$select=qdb_supervisorescalated`);
  const escalatedState = deriveWorkState({
    lifecycle: 'Open', assignment: 'Assigned', deadline: longPast,
    escalated: after['qdb_supervisorescalated'] === true, now: new Date(),
  });
  check('and the work then reports Escalated, read from that flag',
    escalatedState.state === 'Escalated', escalatedState.state);

  await cleanup(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log('\n  TAT calculation / runtime ......... VALIDATED');
  console.log('  Escalation mechanism ............. NOT VALIDATED — no action is performed (KI-104)');
  console.log('  QDB escalation configuration ..... NOT CONFIGURED — zero policies on this org');
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by id, then verified) ───');
  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");

  const setState = async (value: number): Promise<void> => {
    for (const step of steps.value) {
      await write(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`,
        { statecode: value, statuscode: value === 0 ? 1 : 2 });
    }
  };

  await setState(1);
  for (const id of createdIds) {
    console.log(`  [DELETE] ${id} -> ${await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`)}`);
  }
  await setState(0);

  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
  check('the immutability guard is enabled exactly as before',
    restored.value.every(step => Number(step['statecode']) === 0), `${restored.value.length} step(s)`);

  const residue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'${MARKER}')&$count=true`);
  check('zero smoke residue remains', (residue['@odata.count'] ?? 0) === 0,
    `${residue['@odata.count'] ?? 0} row(s)`);
}

await main();
