/**
 * smoke-strategy-idempotency.mts
 * Proves the Phase 8 identity contract **against real Dataverse**, not against Phase 7's word.
 *
 * Phase 7 proved upsert-by-id on the native `fax` and `email` activities. That does not
 * automatically transfer: `qdb_collectionactivity` is a **custom** activity entity, and it now
 * carries five registered plugin steps on Create — including a provenance guard added this phase at
 * stage 20. A create-only precondition that behaved differently under that pipeline would be
 * invisible to every unit test and catastrophic in production, where it means a customer is called
 * twice.
 *
 * Four properties, each proved by making the platform demonstrate it:
 *
 *   1. **Concurrency** — N simultaneous creates at one derived id produce exactly ONE activity.
 *      Not "check then create", which is race-prone by construction: every worker checks before any
 *      worker writes. The uniqueness comes from the platform's own precondition.
 *   2. **Retry after an uncertain response** — a repeat create is refused, not duplicated.
 *   3. **A new episode is new work** — the same action on episode+1 derives a different id and
 *      legitimately creates a second activity.
 *   4. **Republishing configuration is not new work** — a different ruleset version derives the
 *      SAME id, so nothing is created. This is the defect the WP4 analysis removed from the
 *      identity, proved here rather than asserted.
 *
 * Every record is marked `SMOKE-` and removed by id, and the removal is verified (KI-73).
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-strategy-idempotency.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { strategyActivityId, ACTIVITY_ORIGIN_CODES } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8IDEM-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

/** Enough parallel writers that a race would show. */
const CONCURRENT_WORKERS = 5;

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const createdIds = new Set<string>();

/**
 * A create-only write: `If-None-Match: *` turns the platform's upsert-by-id into create-only.
 *
 * `*` here means "no version at all", i.e. the record must not exist — the exact opposite of
 * `If-Match: *`, which means "any version, so long as it does exist". Both fail with 412, and
 * telling them apart by which request was made rather than by parsing a message is the rule this
 * programme settled in Phase 6 (KI-68).
 */
async function createOnly(
  cfg: Config, token: string, id: string, body: Record<string, unknown>,
): Promise<number> {
  const response = await fetch(`${cfg.apiBase}/qdb_collectionactivities(${id})`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'If-None-Match': '*',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME,
    },
    body: JSON.stringify(body),
  });
  return response.status;
}

async function countAt(cfg: Config, token: string, id: string): Promise<number> {
  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${id})?$select=activityid`).catch(() => null);
  return row ? 1 : 0;
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
    '/qdb_strategyactions?$select=qdb_strategyactionid,qdb_name&$top=1');

  const caseId = String(cases.value[0]?.['qdb_collectioncaseid'] ?? '');
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid'] ?? '');
  const actionId = String(actions.value[0]?.['qdb_strategyactionid'] ?? '');
  const episode = Number(cases.value[0]?.['qdb_episodenumber'] ?? 1);

  check('fixtures resolved from existing configuration', Boolean(caseId && typeId && actionId),
    `${cases.value[0]?.['qdb_casenumber']} episode ${episode}`);
  if (!caseId || !typeId || !actionId) process.exit(1);

  const body = (subject: string) => ({
    subject,
    qdb_origin: ACTIVITY_ORIGIN_CODES.StrategyGenerated,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${actionId})`,
  });

  // ── 1. Concurrency ────────────────────────────────────────────────────────
  console.log(`\n─── 1. ${CONCURRENT_WORKERS} workers evaluate the same case at once ───`);
  const contested = strategyActivityId({ caseId, episodeNumber: episode }, actionId);
  console.log(`  derived id: ${contested}`);

  const statuses = await Promise.all(
    Array.from({ length: CONCURRENT_WORKERS }, () =>
      createOnly(cfg, token, contested, body(`${MARKER} contested`))));
  createdIds.add(contested);

  const accepted = statuses.filter(status => status < 400).length;
  const refused = statuses.filter(status => status === 412).length;
  console.log(`  statuses: ${statuses.join(', ')}`);

  check('exactly one worker was accepted', accepted === 1, `${accepted} accepted`);
  check('every other worker was refused by the platform, not by the caller',
    refused === CONCURRENT_WORKERS - 1, `${refused} refused with 412`);
  check('the platform holds exactly one activity for that intent',
    await countAt(cfg, token, contested) === 1);

  // ── 2. Retry after an uncertain response ──────────────────────────────────
  console.log('\n─── 2. The response was lost; the worker retries ───');
  const retry = await createOnly(cfg, token, contested, body(`${MARKER} retry`));
  check('the retry is refused rather than duplicated', retry === 412, `status ${retry}`);
  check('still exactly one activity', await countAt(cfg, token, contested) === 1);

  // ── 3. A new episode IS new work ──────────────────────────────────────────
  console.log('\n─── 3. The case cured and re-delinquented ───');
  const nextEpisode = strategyActivityId({ caseId, episodeNumber: episode + 1 }, actionId);
  check('a new episode derives a different id', nextEpisode !== contested);

  const episodeStatus = await createOnly(cfg, token, nextEpisode, body(`${MARKER} episode2`));
  if (episodeStatus < 400) createdIds.add(nextEpisode);
  check('and the platform accepts it, because that is genuinely new work',
    episodeStatus < 400, `status ${episodeStatus}`);

  // ── 4. Republishing configuration is NOT new work ─────────────────────────
  console.log('\n─── 4. The ruleset is republished mid-episode ───');
  const republished = strategyActivityId(
    { caseId, episodeNumber: episode, rulesetVersion: '9.9.9' }, actionId);
  check('a new ruleset version derives the SAME id', republished === contested,
    republished === contested ? 'identity ignores the version' : republished);

  const afterPublish = await createOnly(cfg, token, republished, body(`${MARKER} republished`));
  check('so the platform creates nothing for a republish', afterPublish === 412,
    `status ${afterPublish}`);
  check('the case still holds one activity for that action, not two',
    await countAt(cfg, token, contested) === 1);

  await cleanup(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

/** Removes what this run created, by id, then proves it and restores the guard it disabled. */
async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by id, then verified) ───');

  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'Delete of qdb_collectionactivity')");

  const setState = async (state: number): Promise<void> => {
    for (const step of steps.value) {
      await fetch(`${cfg.apiBase}/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
        },
        body: JSON.stringify({ statecode: state, statuscode: state === 0 ? 1 : 2 }),
      });
    }
  };

  await setState(1);
  for (const id of createdIds) {
    const response = await fetch(`${cfg.apiBase}/qdb_collectionactivities(${id})`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'MSCRM.SolutionUniqueName': SOLUTION_NAME },
    });
    console.log(`  [DELETE] ${id} -> ${response.status}`);
  }
  await setState(0);

  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'Delete of qdb_collectionactivity')");
  check('the immutability guard is enabled exactly as before',
    restored.value.every(step => Number(step['statecode']) === 0));

  const residue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'${MARKER}')&$count=true`);
  check('zero smoke residue remains', (residue['@odata.count'] ?? 0) === 0,
    `${residue['@odata.count'] ?? 0} row(s)`);
}

await main();
