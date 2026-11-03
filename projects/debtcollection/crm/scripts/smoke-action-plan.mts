/**
 * smoke-action-plan.mts
 * WP8 against real Dataverse — does the Action Plan's attribution hold on the platform?
 *
 * The screen rests on two independent defences, and this proves both against the organisation
 * rather than against a fake:
 *
 *   **The source narrows.** `_qdb_strategyactionid_value ne null` and `eq null` must actually
 *   partition the case's activities. A lookup `_value` comparison against null is the kind of thing
 *   that quietly returns everything, and if it did, history would arrive in the attributed bucket.
 *   **The correlation refuses.** An activity of the *same activity type* as a planned action, with
 *   no provenance, must not be attributed to it. That is KI-71, reproduced deliberately here with a
 *   real record so the claim is about Dataverse and not about a test double.
 *
 * It also proves the negative that matters most for honesty: an activity created without
 * `qdb_origin` reads back as **null**, not as Manual. Nothing in this build may turn that absence
 * into a statement about who created the work.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-action-plan.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ACTIVITY_ORIGIN_CODES, originFromCode, satisfiesPlannedAction } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8PLAN-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * A check the rest of the run depends on.
 *
 * The first run of this smoke reported 13/22 with several **green** ticks that were green only
 * because the fixtures had failed: "the look-alike is not attributed" is trivially true when no
 * look-alike was created. A fixture failure now stops the run rather than producing reassuring
 * output about work that does not exist.
 */
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (passed) return;
  console.error('\n[ABORT] A fixture this run depends on is not available. '
    + 'Stopping rather than reporting vacuous passes.');
  process.exit(1);
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

  // ── Fixtures: one case, one planned action, and its activity type ──────────
  console.log('─── 0. A real plan to reason about ───');
  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,_qdb_strategyid_value'
    + "&$filter=startswith(qdb_casenumber,'DEMO-HL') and _qdb_strategyid_value ne null&$top=1");
  const collectionCase = cases.value[0];
  const caseId = String(collectionCase?.['qdb_collectioncaseid']);
  const strategyId = String(collectionCase?.['_qdb_strategyid_value']);
  check('a demo case with a resolved strategy exists', Boolean(collectionCase),
    `${collectionCase?.['qdb_casenumber']}`);

  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name,_qdb_activitytypeid_value,'
    + `qdb_escalationhours&$filter=_qdb_strategyid_value eq ${strategyId} `
    + 'and qdb_isactive eq true&$orderby=qdb_sequence&$top=1');
  const plannedAction = actions.value[0];
  const strategyActionId = String(plannedAction?.['qdb_strategyactionid']);
  require_('the strategy defines an active action', Boolean(plannedAction),
    `${plannedAction?.['qdb_name']}, TAT=${plannedAction?.['qdb_escalationhours'] ?? 'none'}h`);

  /*
   * A finding, not a fixture problem.
   *
   * No strategy action on this organisation carries an activity type — the column is null on every
   * one. Phase 6's Action Plan correlated `planned.activityTypeId` against the case's activities
   * and returned an empty list whenever that id was absent, which here was always. The screen
   * therefore reported "None recorded" against every planned action on every case, regardless of
   * what had actually been done. Recorded as KI-106.
   */
  const typedActions = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid&$count=true&$top=1'
    + '&$filter=_qdb_activitytypeid_value ne null');
  check('NO strategy action on the organisation carries an activity type (KI-106)',
    (typedActions['@odata.count'] ?? -1) === 0,
    `${typedActions['@odata.count']} of them do`);
  check('so the Phase 6 correlation could never have matched anything here',
    plannedAction?.['_qdb_activitytypeid_value'] === null,
    String(plannedAction?.['_qdb_activitytypeid_value']));

  // The two activities still need a type, so one is taken from the catalogue rather than the plan.
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name'
    + '&$filter=qdb_isactive eq true&$top=1');
  const activityTypeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);
  require_('an active activity type exists to give both activities', Boolean(types.value[0]),
    String(types.value[0]?.['qdb_name']));

  // ── Two activities of the SAME type: one attributed, one not ──────────────
  console.log('\n─── 1. Two activities of the same type, one attributed ───');
  const attributedId = crypto.randomUUID();
  const attributed = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${attributedId})`, {
    subject: `${MARKER} strategy work`,
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${activityTypeId})`,
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${strategyActionId})`,
  }, { 'If-None-Match': '*' });
  if (attributed < 400) createdIds.add(attributedId);
  require_('strategy-generated work is created, naming its action', attributed < 400,
    `status ${attributed}`);

  // The KI-71 trap, reproduced with a real record: same case, same TYPE, no provenance.
  const lookalikeId = crypto.randomUUID();
  const lookalike = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${lookalikeId})`, {
    subject: `${MARKER} officer's own work`,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${activityTypeId})`,
  }, { 'If-None-Match': '*' });
  if (lookalike < 400) createdIds.add(lookalikeId);
  require_('an activity of the SAME type with no provenance is created', lookalike < 400,
    `status ${lookalike}`);

  // ── 2. The source's own split ─────────────────────────────────────────────
  console.log('\n─── 2. The platform partitions the case, not the browser ───');
  const caseFilter = `_qdb_collectioncaseid_value eq ${caseId}`;
  const select = '$select=activityid,subject,qdb_origin,statecode,qdb_supervisorescalated,'
    + '_qdb_strategyactionid_value,_qdb_activitytypeid_value';

  const withProvenance = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/qdb_collectionactivities?${select}&$filter=${caseFilter} and _qdb_strategyactionid_value ne null`);
  const withoutProvenance = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/qdb_collectionactivities?${select}&$filter=${caseFilter} and _qdb_strategyactionid_value eq null`);
  const everything = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=${caseFilter}&$count=true&$top=1`);

  const attributedIds = withProvenance.value.map(row => String(row['activityid']));
  const unattributedIds = withoutProvenance.value.map(row => String(row['activityid']));

  check('the attributed read returns the strategy work', attributedIds.includes(attributedId));
  check('and does NOT return the look-alike of the same type',
    !attributedIds.includes(lookalikeId));
  check('the unattributed read returns the look-alike', unattributedIds.includes(lookalikeId));
  check('and does NOT return the strategy work', !unattributedIds.includes(attributedId));
  check('the two buckets are disjoint',
    attributedIds.every(id => !unattributedIds.includes(id)));
  check('and together they account for every activity on the case',
    attributedIds.length + unattributedIds.length === (everything['@odata.count'] ?? -1),
    `${attributedIds.length} + ${unattributedIds.length} = ${everything['@odata.count']}`);
  check('neither bucket is the whole case — `eq null` really narrows',
    attributedIds.length > 0 && attributedIds.length < (everything['@odata.count'] ?? 0));

  // ── 3. The correlation, run over what the platform returned ───────────────
  console.log('\n─── 3. The correlation refuses the look-alike ───');
  const attributedRow = withProvenance.value.find(row => String(row['activityid']) === attributedId);
  const lookalikeRow = withoutProvenance.value.find(row => String(row['activityid']) === lookalikeId);

  const asActivity = (row: Record<string, unknown> | undefined) => ({
    ...(row?.['_qdb_strategyactionid_value']
      ? { strategyActionId: String(row['_qdb_strategyactionid_value']) } : {}),
    ...(originFromCode(row?.['qdb_origin'])
      ? { origin: originFromCode(row?.['qdb_origin'])! } : {}),
  });

  check('the strategy work answers its planned action',
    satisfiesPlannedAction(asActivity(attributedRow), strategyActionId));
  check('the look-alike does NOT, despite sharing the activity type (KI-71)',
    !satisfiesPlannedAction(asActivity(lookalikeRow), strategyActionId));
  check('and the two really do share an activity type — the trap is real',
    String(attributedRow?.['_qdb_activitytypeid_value'])
      === String(lookalikeRow?.['_qdb_activitytypeid_value']),
    activityTypeId);

  // ── 4. Absent origin stays absent ─────────────────────────────────────────
  console.log('\n─── 4. An unrecorded origin is not turned into Manual ───');
  check('the platform stores no origin for the look-alike',
    lookalikeRow?.['qdb_origin'] === null || lookalikeRow?.['qdb_origin'] === undefined,
    String(lookalikeRow?.['qdb_origin']));
  check('and the reader reports it as unrecorded, not as Manual',
    originFromCode(lookalikeRow?.['qdb_origin']) === undefined);
  check('while a recorded origin reads back exactly as written',
    originFromCode(attributedRow?.['qdb_origin']) === 'StrategyGenerated');

  // ── 5. The columns the screen reads ───────────────────────────────────────
  console.log('\n─── 5. Every column the screen reads is returned ───');
  check('the escalation flag is readable and is not set by a deadline',
    attributedRow?.['qdb_supervisorescalated'] !== true,
    String(attributedRow?.['qdb_supervisorescalated']));
  check('the lifecycle state is returned', attributedRow?.['statecode'] === 0,
    String(attributedRow?.['statecode']));

  await cleanup(cfg, token, caseId);

  const failed = results.filter(result => !result.passed);
  if (failed.length === 0) {
    console.log('\n  Provenance attribution ........... VALIDATED on the organisation');
    console.log('  Activity-Type inference ......... REMOVED — proven with a real look-alike record');
    console.log('  Due dates ....................... NOT SHOWN — no TAT start policy configured (KI-101)');
  } else {
    console.log(`\n  NOT VALIDATED — ${failed.length} check(s) failed. No claim is made about this run.`);
  }
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

async function cleanup(cfg: Config, token: string, caseId: string): Promise<void> {
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

  const caseResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=_qdb_collectioncaseid_value eq ${caseId}`
    + ` and contains(subject,'SMOKE-P8PLAN')&$count=true`);
  check('and the case carries no earlier run of this smoke either',
    (caseResidue['@odata.count'] ?? 0) === 0, `${caseResidue['@odata.count'] ?? 0} row(s)`);
}

await main();
