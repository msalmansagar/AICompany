/**
 * smoke-strategy-reevaluation.mts
 * Proves controlled re-evaluation **against real Dataverse** (WP5).
 *
 * The unit tests reconcile in memory. What they cannot prove is that the input is real: that the
 * case's existing work, its provenance and its state can actually be read back from the platform in
 * the shape reconciliation expects, and that episode isolation holds on ids the platform issued
 * rather than ids a fixture invented.
 *
 * The property this exists to defend is the one that would be worst to get wrong: **re-evaluation
 * must not rewrite history**. So the run deliberately ends with an action dropping out of the plan,
 * and then checks the platform still holds that activity, unchanged and uncancelled.
 *
 *   1. first evaluation           -> NewlyApplicable, created
 *   2. re-evaluation, facts same  -> AlreadyOpen, nothing created
 *   3. activity completed         -> AlreadyCompleted, nothing created (KI-98 held)
 *   4. new episode                -> NewlyApplicable, created; episode 1's work not reused
 *   5. action drops from the plan -> NoLongerApplicable, and the activity is STILL THERE
 *   6. concurrent re-evaluation   -> one record
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-strategy-reevaluation.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import {
  ACTIVITY_ORIGIN_CODES, reevaluate, strategyActivityId,
  type EvaluationContext, type ExistingActivity, type IntendedActivity,
} from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8REEV-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

/** Read from live metadata, not guessed: state 1 is Completed, state 2 is Cancelled. */
const STATUS_COMPLETED = 100000644;

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
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response.status;
}

/**
 * The case's existing work, as reconciliation needs to see it.
 *
 * This is the read the unit tests cannot stand in for. It selects the provenance columns WP2
 * provisioned, and maps `statecode` to the lifecycle the domain models — 0 open, 1 completed,
 * 2 cancelled — rather than inferring state from a status label.
 */
async function readExisting(
  cfg: Config, token: string, caseId: string,
): Promise<ExistingActivity[]> {
  const page = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivities?$select=activityid,statecode,qdb_origin,_qdb_strategyactionid_value'
    + `&$filter=_qdb_collectioncaseid_value eq ${caseId}`);

  return page.value.map(row => {
    const origin = Number(row['qdb_origin']);
    const actionId = row['_qdb_strategyactionid_value'];
    const state = Number(row['statecode']);
    return {
      activityId: String(row['activityid']),
      state: state === 1 ? 'Completed' : state === 2 ? 'Cancelled' : 'Open',
      ...(origin === ACTIVITY_ORIGIN_CODES.StrategyGenerated
        ? { origin: 'StrategyGenerated' as const }
        : origin === ACTIVITY_ORIGIN_CODES.Manual ? { origin: 'Manual' as const } : {}),
      ...(actionId ? { strategyActionId: String(actionId) } : {}),
    };
  });
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

  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,qdb_episodenumber"
    + "&$filter=startswith(qdb_casenumber,'DEMO-HL')&$top=1");
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_isactive eq true&$top=1');
  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name&$top=2');

  const caseId = String(cases.value[0]?.['qdb_collectioncaseid'] ?? '');
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid'] ?? '');
  const actionId = String(actions.value[0]?.['qdb_strategyactionid'] ?? '');
  const episode = Number(cases.value[0]?.['qdb_episodenumber'] ?? 1);

  check('fixtures resolved from existing configuration', Boolean(caseId && typeId && actionId),
    `${cases.value[0]?.['qdb_casenumber']} episode ${episode}`);
  if (!caseId || !typeId || !actionId) process.exit(1);

  const context: EvaluationContext = { caseId, episodeNumber: episode };
  const plan: IntendedActivity[] = [{
    activityId: strategyActivityId(context, actionId),
    strategyActionId: actionId,
    strategyActionName: String(actions.value[0]?.['qdb_name'] ?? ''),
    sequence: 10,
    provenance: { origin: 'StrategyGenerated', strategyActionId: actionId },
  }];

  const body = (subject: string) => ({
    subject,
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${actionId})`,
  });

  /** One evaluation against the platform's current state. */
  const evaluate = async (intended: IntendedActivity[], ctx = context) =>
    reevaluate(intended, await readExisting(cfg, token, caseId), ctx);

  // ── 1. First evaluation ───────────────────────────────────────────────────
  console.log('\n─── 1. First evaluation ───');
  const first = await evaluate(plan);
  check('the action is NewlyApplicable against a case with no such work',
    first.entries.some(e => e.disposition === 'NewlyApplicable'), first.entries.map(e => e.disposition).join(', '));

  const createStatus = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${plan[0]!.activityId})`, body(`${MARKER} generated`),
    { 'If-None-Match': '*' });
  if (createStatus < 400) createdIds.add(plan[0]!.activityId);
  check('the platform accepted the derived create', createStatus < 400, `status ${createStatus}`);

  // ── 2. Re-evaluate with the facts unchanged ───────────────────────────────
  console.log('\n─── 2. Re-evaluation, nothing changed ───');
  const second = await evaluate(plan);
  check('it reads the work back from the platform and reports AlreadyOpen',
    second.entries.some(e => e.disposition === 'AlreadyOpen'),
    second.entries.map(e => e.disposition).join(', '));
  check('and creates nothing', second.toCreate.length === 0);

  // ── 3. Complete the activity, then re-evaluate ────────────────────────────
  console.log('\n─── 3. The officer completes it, then the strategy runs again ───');
  const completed = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${plan[0]!.activityId})`,
    { statecode: 1, statuscode: STATUS_COMPLETED });
  check('the activity was completed on the platform', completed < 400, `status ${completed}`);

  const third = await evaluate(plan);
  check('completed work is reported as AlreadyCompleted, read from statecode',
    third.entries.some(e => e.disposition === 'AlreadyCompleted'),
    third.entries.map(e => e.disposition).join(', '));
  check('and is NOT regenerated, because KI-98 is undecided', third.toCreate.length === 0);

  // ── 4. A new episode ──────────────────────────────────────────────────────
  console.log('\n─── 4. The case cured and re-delinquented ───');
  const nextContext: EvaluationContext = { caseId, episodeNumber: episode + 1 };
  const nextPlan: IntendedActivity[] = [{
    ...plan[0]!, activityId: strategyActivityId(nextContext, actionId),
  }];

  const fourth = await evaluate(nextPlan, nextContext);
  check('the new episode treats its own work as NewlyApplicable',
    fourth.entries.some(e => e.disposition === 'NewlyApplicable'));
  check('and does NOT reuse the previous episode’s completed activity as an obligation',
    fourth.entries.filter(e => e.disposition === 'AlreadyCompleted').length === 0,
    fourth.entries.map(e => e.disposition).join(', '));

  const episodeStatus = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${nextPlan[0]!.activityId})`, body(`${MARKER} episode2`),
    { 'If-None-Match': '*' });
  if (episodeStatus < 400) createdIds.add(nextPlan[0]!.activityId);
  check('the platform accepts the new episode’s work', episodeStatus < 400, `status ${episodeStatus}`);

  // ── 5. The action drops out of the plan ───────────────────────────────────
  console.log('\n─── 5. The strategy stops asking for it ───');
  const fifth = await evaluate([]);
  check('its work is reported NoLongerApplicable',
    fifth.entries.some(e => e.disposition === 'NoLongerApplicable'),
    fifth.entries.map(e => e.disposition).join(', '));
  check('nothing is created', fifth.toCreate.length === 0);

  const survivor = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${plan[0]!.activityId})?$select=activityid,statecode,statuscode`)
    .catch(() => null);
  check('THE ACTIVITY IS STILL THERE — re-evaluation cancelled nothing', survivor !== null);
  check('and its state is untouched: still completed, not cancelled',
    Number(survivor?.['statecode']) === 1 && Number(survivor?.['statuscode']) === STATUS_COMPLETED,
    `statecode=${survivor?.['statecode']} statuscode=${survivor?.['statuscode']}`);

  // ── 6. Concurrent re-evaluation ───────────────────────────────────────────
  console.log('\n─── 6. Two evaluations race ───');
  const raceContext: EvaluationContext = { caseId, episodeNumber: episode + 7 };
  const raceId = strategyActivityId(raceContext, actionId);
  const statuses = await Promise.all([
    write(cfg, token, 'PATCH', `/qdb_collectionactivities(${raceId})`, body(`${MARKER} race`), { 'If-None-Match': '*' }),
    write(cfg, token, 'PATCH', `/qdb_collectionactivities(${raceId})`, body(`${MARKER} race`), { 'If-None-Match': '*' }),
  ]);
  createdIds.add(raceId);
  check('exactly one concurrent re-evaluation wrote',
    statuses.filter(s => s < 400).length === 1, `statuses ${statuses.join(', ')}`);

  await cleanup(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by id, then verified) ───');

  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");

  const setState = async (state: number): Promise<void> => {
    for (const step of steps.value) {
      await write(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`,
        { statecode: state, statuscode: state === 0 ? 1 : 2 });
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
    restored.value.every(step => Number(step['statecode']) === 0),
    `${restored.value.length} step(s)`);

  const residue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'${MARKER}')&$count=true`);
  check('zero smoke residue remains', (residue['@odata.count'] ?? 0) === 0,
    `${residue['@odata.count'] ?? 0} row(s)`);
}

await main();
