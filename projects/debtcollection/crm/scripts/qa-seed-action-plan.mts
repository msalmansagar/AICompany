/**
 * qa-seed-action-plan.mts
 * Fixtures for WP8's browser journey, and their removal.
 *
 * The Action Plan can only be judged on screen against a case that actually holds the three
 * interesting shapes at once:
 *
 *   1. **Strategy work in progress** — attributed to a planned action, open, with an owner.
 *   2. **Strategy work completed** — attributed to a different planned action, settled.
 *   3. **A look-alike** — the same activity *type* as (1), attributed to nothing. If the screen
 *      shows this against a planned action, KI-71 has returned.
 *
 * Every record is created at an id this script chose, so cleanup is by identity rather than by a
 * subject pattern that could sweep away somebody else's row.
 *
 * Usage:
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-seed-action-plan.mts [--clean]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ACTIVITY_ORIGIN_CODES, strategyActivityId } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';

/**
 * The entity's OWN Completed status, not the native one.
 *
 * `qdb_collectionactivity` carries a custom status set and configured state transitions. Patching
 * the native `statuscode: 2` is refused with *Transition from 'Open' to '2' is not permitted* —
 * which reads like a permissions or plugin problem and is neither. The value below is read from
 * `StatusAttributeMetadata`: 100000644, the option whose State is 1.
 */
const DCP_COMPLETED_STATUS = 100000644;

/**
 * Strategy work must carry its **derived** id, not an id somebody chose.
 *
 * The identity contract puts strategy work at `uuidv5(case | episode | action)`, and the screen
 * proves episode membership by recomputing that and comparing. Seeding an arbitrary id therefore
 * produced fixtures the Action Plan correctly reported as *not current* — every row greyed out of
 * the officer's queue. The fixture was wrong, not the screen, and seeding a realistic id is what
 * makes the browser journey exercise the real shape.
 *
 * The look-alike keeps a fixed id: it belongs to no episode by construction, which is the point.
 */
const LOOKALIKE_ID = 'd8f1a2c0-0003-4f00-9a00-0000000000a3';

/** Ids seeded by earlier revisions of this script, swept so no orphan survives the change. */
const LEGACY_IDS = [
  'd8f1a2c0-0001-4f00-9a00-0000000000a1',
  'd8f1a2c0-0002-4f00-9a00-0000000000a2',
];

const SUBJECTS = {
  openStrategyWork: 'QA-P8 Strategy work in progress',
  completedStrategyWork: 'QA-P8 Strategy work completed',
  lookalike: 'QA-P8 Officer’s own call (no provenance)',
} as const;

interface Config { apiBase: string; orgUrl: string }

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

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

/**
 * The immutability guard blocks the deletes and the completion PATCH.
 *
 * Disabled around the operation and restored immediately, exactly as the WP5–WP7 smokes do, so a
 * failed run cannot leave the organisation's own protection switched off.
 */
async function withGuardDisabled(
  cfg: Config, token: string, operation: () => Promise<void>,
): Promise<boolean> {
  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");

  const setState = async (value: number): Promise<void> => {
    for (const step of steps.value) {
      await write(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`,
        { statecode: value, statuscode: value === 0 ? 1 : 2 });
    }
  };

  await setState(1);
  try {
    await operation();
  } finally {
    await setState(0);
  }

  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
  return restored.value.every(step => Number(step['statecode']) === 0);
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  const cleaning = process.argv.includes('--clean');

  if (cleaning) return clean(cfg, token);
  return seed(cfg, token);
}

async function seed(cfg: Config, token: string): Promise<void> {
  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,_qdb_strategyid_value,'
    + 'qdb_episodenumber'
    + "&$filter=qdb_casenumber eq 'DEMO-HL-1001'&$top=1");
  const caseId = String(cases.value[0]?.['qdb_collectioncaseid']);
  const strategyId = String(cases.value[0]?.['_qdb_strategyid_value']);
  const episodeNumber = Number(cases.value[0]?.['qdb_episodenumber'] ?? 0);

  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name'
    + `&$filter=_qdb_strategyid_value eq ${strategyId} and qdb_isactive eq true&$orderby=qdb_sequence`);
  const first = String(actions.value[0]?.['qdb_strategyactionid']);
  const second = String(actions.value[1]?.['qdb_strategyactionid'] ?? first);

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name'
    + '&$filter=qdb_isactive eq true&$top=1');
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);

  console.log(`  Case ${cases.value[0]?.['qdb_casenumber']} (${caseId})`);
  console.log(`  Actions: ${actions.value.map(a => a['qdb_name']).join(', ')}`);
  console.log(`  Activity type: ${types.value[0]?.['qdb_name']}\n`);

  const bind = (id: string, action?: string) => ({
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    ...(action
      ? { 'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${action})` }
      : {}),
    subject: id,
  });

  const created: string[] = [];
  const create = async (id: string, body: Record<string, unknown>): Promise<void> => {
    const status = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${id})`, body,
      { 'If-None-Match': '*' });
    console.log(`  [CREATE] ${String(body['subject'])} -> ${status}`);
    if (status < 400) created.push(id);
  };

  const context = { caseId, episodeNumber };
  const openId = strategyActivityId(context, first);
  const completedId = strategyActivityId(context, second);
  console.log(`  Episode ${episodeNumber}; derived ids ${openId}, ${completedId}\n`);

  await create(openId, {
    ...bind(SUBJECTS.openStrategyWork, first),
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
  });
  await create(completedId, {
    ...bind(SUBJECTS.completedStrategyWork, second),
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
  });
  // The look-alike carries NO origin at all — the shape every pre-Phase-8 activity has.
  await create(LOOKALIKE_ID, bind(SUBJECTS.lookalike));

  // Completing needs the guard out of the way, as it is a post-create state change.
  const restored = await withGuardDisabled(cfg, token, async () => {
    const status = await write(cfg, token, 'PATCH',
      `/qdb_collectionactivities(${completedId})`,
      { statecode: 1, statuscode: DCP_COMPLETED_STATUS });
    console.log(`  [COMPLETE] ${SUBJECTS.completedStrategyWork} -> ${status}`);
  });
  console.log(`  [GUARD] restored: ${restored}`);

  console.log(`\n  Seeded ${created.length}/3. Case id for the browser: ${caseId}`);
}

async function clean(cfg: Config, token: string): Promise<void> {
  const seeded = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/qdb_collectionactivities?$select=activityid,subject&$filter=startswith(subject,'QA-P8')");
  const ids = [...new Set([
    ...seeded.value.map(row => String(row['activityid'])),
    LOOKALIKE_ID, ...LEGACY_IDS,
  ])];

  const restored = await withGuardDisabled(cfg, token, async () => {
    for (const id of ids) {
      const status = await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`);
      console.log(`  [DELETE] ${id} -> ${status}`);
    }
  });

  const residue = await get<{ '@odata.count'?: number }>(cfg, token,
    "/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'QA-P8')&$count=true");
  const clear = (residue['@odata.count'] ?? 0) === 0;

  console.log(`\n  Guard restored: ${restored}`);
  console.log(`  Residue: ${residue['@odata.count'] ?? 0} row(s)`);
  process.exit(clear && restored ? 0 : 1);
}

await main();
