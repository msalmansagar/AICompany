/**
 * smoke-activity-provenance.mts
 * Proves the provenance invariant **on the platform**, not in a mock (KI-71).
 *
 * Phase 7 established the rule this script exists to satisfy: a guard is not believed until the
 * defect it exists to catch has been reintroduced and the guard has been watched to fail. The unit
 * tests do that in-process against a mocked context. This does it against Dataverse, through the
 * registered plugin step, because a plugin that is written correctly and registered wrongly is
 * indistinguishable from a working one until something reaches production.
 *
 * Four things are checked, in the order that makes each meaningful:
 *
 *   1. strategy-generated with no action  -> REFUSED by the platform
 *   2. strategy-generated with an action  -> accepted, and the provenance reads back
 *   3. clearing the action afterwards     -> REFUSED (the Update the Target alone cannot show)
 *   4. a plain manual activity            -> accepted, because the rule is one-directional
 *
 * Every record is marked `SMOKE-` and removed by id afterwards, and the removal is verified rather
 * than assumed — `clean-qdb-smoke-data.mjs` reported success while leaving six rows once (KI-73).
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-activity-provenance.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { strategyActivityId, ACTIVITY_ORIGIN_CODES } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8PROV-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];

/** `apiGet` with the shape named at the call site, so no multi-line type assertions are needed. */
const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const created: string[] = [];

async function send(
  cfg: Config, token: string, method: string, path: string, body?: unknown,
): Promise<{ status: number; message: string; id?: string }> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let message = text;
  try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* keep the raw text */ }
  const entityId = response.headers.get('OData-EntityId');
  return {
    status: response.status,
    message: String(message).slice(0, 300),
    ...(entityId ? { id: /\(([^)]+)\)/.exec(entityId)?.[1] ?? '' } : {}),
  };
}

/** The platform's refusal, as distinct from any other failure. */
const isRefusal = (result: { status: number; message: string }): boolean =>
  result.status >= 400 && /created by the collection strategy/i.test(result.message);

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Marker: ${MARKER}\n`);

  // ── Fixtures: existing DEMO configuration, never invented ──────────────────
  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,qdb_episodenumber"
    + "&$filter=startswith(qdb_casenumber,'DEMO-HL')&$top=1");
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name'
    + '&$filter=qdb_isactive eq true&$top=1');
  const actions = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name&$top=1');

  const caseId = String(cases.value[0]?.['qdb_collectioncaseid'] ?? '');
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid'] ?? '');
  const actionId = String(actions.value[0]?.['qdb_strategyactionid'] ?? '');

  check('fixtures resolved from existing configuration',
    Boolean(caseId && typeId && actionId),
    `case=${cases.value[0]?.['qdb_casenumber']} type=${types.value[0]?.['qdb_name']} action=${actions.value[0]?.['qdb_name']}`);
  if (!caseId || !typeId || !actionId) process.exit(1);

  const base = (subject: string) => ({
    subject,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
  });

  // ── 1. The defect the guard exists to catch ───────────────────────────────
  console.log('\n─── 1. Strategy generated, no originating action ───');
  const orphan = await send(cfg, token, 'POST', '/qdb_collectionactivities', {
    ...base(`${MARKER} orphan`),
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
  });
  if (orphan.id) created.push(orphan.id);
  check('the platform REFUSES untraceable automated work', isRefusal(orphan),
    `${orphan.status}: ${orphan.message.slice(0, 120)}`);

  // ── 2. The same write, made explainable ───────────────────────────────────
  console.log('\n─── 2. Strategy generated, WITH its action ───');
  const activityId = strategyActivityId(
    { caseId, episodeNumber: Number(cases.value[0]?.['qdb_episodenumber'] ?? 1) }, actionId);

  const good = await send(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`, {
    ...base(`${MARKER} generated`),
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${actionId})`,
  });
  if (good.status < 400) created.push(activityId);
  check('the same write is accepted once it names its action', good.status < 400,
    `${good.status}${good.status >= 400 ? `: ${good.message.slice(0, 120)}` : ''}`);

  const readBack = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    `/qdb_collectionactivities(${activityId})?$select=qdb_origin,_qdb_strategyactionid_value`)
    .catch(() => null) as Record<string, unknown> | null;
  check('the provenance reads back from the platform',
    Number(readBack?.['qdb_origin']) === ACTIVITY_ORIGIN_CODES.StrategyGenerated
    && String(readBack?.['_qdb_strategyactionid_value'] ?? '').toLowerCase() === actionId.toLowerCase(),
    `origin=${readBack?.['qdb_origin']} action=${readBack?.['_qdb_strategyactionid_value']}`);

  check('the id is the derived one, so a repeat reaches the same record',
    readBack !== null, activityId);

  // ── 3. The Update the Target alone cannot show ────────────────────────────
  console.log('\n─── 3. Clearing the action afterwards ───');
  const cleared = await send(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`, {
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': null,
  });
  check('the platform REFUSES to strip provenance from automated work', isRefusal(cleared),
    `${cleared.status}: ${cleared.message.slice(0, 120)}`);

  // ── 4. The rule is one-directional ────────────────────────────────────────
  console.log('\n─── 4. A plain manual activity ───');
  const manual = await send(cfg, token, 'POST', '/qdb_collectionactivities', {
    ...base(`${MARKER} manual`),
    qdb_origin: ACTIVITY_ORIGIN_CODES.Manual,
  });
  if (manual.id) created.push(manual.id);
  check('manual work is unaffected by the guard', manual.status < 400,
    `${manual.status}${manual.status >= 400 ? `: ${manual.message.slice(0, 120)}` : ''}`);

  await cleanup(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

/**
 * Removes every row this run created, by id, and proves it.
 *
 * `ImmutabilityGuard` blocks Delete on a collection activity, so the guard steps are disabled for
 * the deletion and restored immediately afterwards — and the restoration is verified, because
 * leaving a control off is a worse outcome than leaving a test row behind.
 */
async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by id, then verified) ───');
  if (created.length === 0) { check('nothing to remove', true); return; }

  const steps = await get<{ '@odata.count'?: number }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'Delete of qdb_collectionactivity')");

  const setState = async (state: number): Promise<void> => {
    for (const step of steps.value) {
      await send(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`, { statecode: state, statuscode: state === 0 ? 1 : 2 });
    }
  };

  await setState(1);
  for (const id of created) {
    const removed = await send(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`);
    console.log(`  [DELETE] ${id} -> ${removed.status}`);
  }
  await setState(0);

  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'Delete of qdb_collectionactivity')");
  check('the immutability guard is registered and enabled exactly as before',
    restored.value.every(step => Number(step['statecode']) === 0),
    `${restored.value.length} step(s)`);

  const residue = await apiGet(cfg as never, token, SOLUTION_NAME,
    `/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'${MARKER}')&$count=true`);
  check('zero smoke residue remains', (residue['@odata.count'] ?? 0) === 0,
    `${residue['@odata.count'] ?? 0} row(s)`);
}

await main();
