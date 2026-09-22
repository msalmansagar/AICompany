/**
 * smoke-assignment-ownership.mts
 * Proves **native Dynamics ownership** against real Dataverse (WP6).
 *
 * Read the title carefully, because the distinction is the point of the script.
 *
 *   **Native Dynamics ownership assignment** — what this proves. Setting `ownerid` on a collection
 *   activity to a user or a team, and the platform's behaviour around reassignment, invalid targets
 *   and concurrency.
 *
 *   **QDB Smart Assignment** — what this does NOT prove and does not touch. No general contract has
 *   been located (KI-09); the only live QDB routing is `Plugins.RoundRobin` on Create of `qdb_task`,
 *   which is a Process Engine capability. Nothing here invokes it, and no `qdb_task` is manufactured
 *   to borrow it.
 *
 * A green run here means ownership works. It does not mean routing works, and the closure report
 * must keep saying so.
 *
 * Proved on this organisation:
 *   1. PATCH on the metadata-derived owner navigation property IS the mechanism (204)
 *   2. an assignee who lacks privileges on the entity is REFUSED — TargetUnavailable is real
 *   3. a team with no privileges is refused the same way
 *   4. an unknown target is refused, with no partial write
 *   5. concurrent assignment is arbitrated by row version, not last-write-wins
 *   6. a retry after an uncertain response assigns the SAME activity, creating nothing
 *
 * NOT proved here, and not claimed: assignment to a real collection officer, or to an owner team.
 * No user or team on org5869857f holds collection privileges, so the platform refuses them — a
 * security-role configuration gap recorded as KI-100, not a defect in this code. The Web API has
 * no bound `Assign` action either (404); PATCH is the supported path and is what is used.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-assignment-ownership.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { ACTIVITY_ORIGIN_CODES, decideAssignment, shouldWriteAssignment } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P8ASSIGN-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

/** Read from metadata, not derived: the SAME attribute binds differently on the two entities. */
const ACTIVITY_OWNER_NAV = 'ownerid_qdb_collectionactivity';

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
): Promise<{ status: number; etag?: string }> {
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
  return { status: response.status, ...(response.headers.get('ETag') ? { etag: response.headers.get('ETag')! } : {}) };
}

/** The activity's current owner and row version, as one read. */
async function readOwner(
  cfg: Config, token: string, id: string,
): Promise<{ ownerId: string; etag: string } | null> {
  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${id})?$select=activityid,_ownerid_value`).catch(() => null);
  if (!row) return null;
  return {
    ownerId: String(row['_ownerid_value'] ?? '').toLowerCase(),
    etag: String(row['@odata.etag'] ?? ''),
  };
}

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Marker: ${MARKER}`);
  console.log('  Scope: NATIVE DYNAMICS OWNERSHIP. QDB Smart Assignment is not invoked (KI-09).\n');

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const cases = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber"
    + "&$filter=startswith(qdb_casenumber,'DEMO-HL')&$top=1");
  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_isactive eq true&$top=1');
  // The caller is the only principal on this organisation that holds collection privileges.
  // Assignment is refused by the platform when the TARGET cannot read the entity, so an ordinary
  // user is used below to prove the refusal, not to prove success (KI-100).
  const me = await get<{ UserId: string }>(cfg, token, '/WhoAmI()');
  const users = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/systemusers?$select=systemuserid,fullname&$filter=isdisabled eq false&$top=1');
  const teams = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/teams?$select=teamid,name&$top=1');

  const caseId = String(cases.value[0]?.['qdb_collectioncaseid'] ?? '');
  const typeId = String(types.value[0]?.['qdb_collectionactivitytypeid'] ?? '');
  const privileged = String(me.UserId).toLowerCase();
  const unprivileged = String(users.value[0]?.['systemuserid'] ?? '').toLowerCase();
  const teamId = String(teams.value[0]?.['teamid'] ?? '').toLowerCase();

  check('fixtures resolved', Boolean(caseId && typeId && privileged && unprivileged && teamId));
  if (!caseId || !typeId || !privileged || !unprivileged || !teamId) process.exit(1);

  const activityId = crypto.randomUUID();
  const created = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`, {
    subject: `${MARKER} work`,
    qdb_origin: ACTIVITY_ORIGIN_CODES.Manual,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
  }, { 'If-None-Match': '*' });
  if (created.status < 400) createdIds.add(activityId);
  check('a piece of work exists to assign', created.status < 400, `status ${created.status}`);

  // ── 1. The mechanism ──────────────────────────────────────────────────────
  console.log('\n─── 1. Assign to a privileged USER ───');
  const toUser = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${privileged})` });
  check('PATCH on the metadata-derived owner navigation property is the mechanism',
    toUser.status < 400, `status ${toUser.status}`);
  check('and the owner reads back as that user',
    (await readOwner(cfg, token, activityId))?.ownerId === privileged);

  // ── 2. A target who cannot receive the work ───────────────────────────────
  console.log('\n─── 2. A target who lacks privileges on collection work ───');
  const refusedUser = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${unprivileged})` });
  // The platform refuses on the ASSIGNEE's privileges, not the caller's. This is what
  // `TargetUnavailable` models, and it is a security-model fact rather than a defect (KI-100).
  check('the platform REFUSES an assignee who cannot read the entity',
    refusedUser.status >= 400, `status ${refusedUser.status}`);
  check('and the previous owner is untouched — no partial write',
    (await readOwner(cfg, token, activityId))?.ownerId === privileged);

  console.log('\n─── 3. An owner TEAM with no privileges ───');
  const refusedTeam = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/teams(${teamId})` });
  check('a team with no collection privileges is refused the same way',
    refusedTeam.status >= 400, `status ${refusedTeam.status}`);
  check('the owner is still unchanged',
    (await readOwner(cfg, token, activityId))?.ownerId === privileged);

  // ── 3b. A human decision is not seized back ───────────────────────────────
  const decision = decideAssignment(
    { id: crypto.randomUUID(), name: 'Configured', method: 'Manual', priority: 10, effective: {}, isActive: true },
    { defaultUserId: unprivileged });
  const verdict = shouldWriteAssignment(decision, privileged);
  check('configuration pointing elsewhere does NOT take the work back from its holder',
    verdict.write === false && verdict.status === 'AlreadyAssigned', verdict.status);

  // ── 4. An unknown target ──────────────────────────────────────────────────
  console.log('\n─── 4. A target that does not exist ───');
  const ghost = '00000000-0000-0000-0000-0000000000ff';
  const invalid = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${ghost})` });
  check('an unknown owner is refused rather than silently ignored',
    invalid.status >= 400, `status ${invalid.status}`);
  check('and the owner is still untouched',
    (await readOwner(cfg, token, activityId))?.ownerId === privileged);

  // ── 5. Concurrency ────────────────────────────────────────────────────────
  console.log('\n─── 5. Two assignments race, arbitrated by row version ───');
  const before = await readOwner(cfg, token, activityId);
  const etag = before?.etag ?? '';
  const [raceA, raceB] = await Promise.all([
    write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
      { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${privileged})` }, { 'If-Match': etag }),
    write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
      { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${privileged})` }, { 'If-Match': etag }),
  ]);
  const statuses = [raceA.status, raceB.status];
  check('exactly one concurrent assignment was accepted',
    statuses.filter(status => status < 400).length === 1, `statuses ${statuses.join(', ')}`);

  /**
   * And the arbitration is on the row version, proved deterministically.
   *
   * The race above says one writer lost; it does not say *why*, and under contention the platform
   * may refuse with a generic 400 rather than a precondition failure — which is what it did here.
   * Racing again would be guessing at timing. So the property is proved directly: hold a row
   * version, let the record move on, then write with the version you held.
   *
   * This is what stops assignment being last-write-wins: a worker acting on a stale view of who
   * owns the work is refused rather than silently overwriting an officer's decision.
   */
  const stale = (await readOwner(cfg, token, activityId))?.etag ?? '';
  await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { subject: `${MARKER} work (touched)` });
  const staleWrite = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: `/systemusers(${privileged})` }, { 'If-Match': stale });
  check('a write holding a STALE row version is refused with a precondition failure',
    staleWrite.status === 412, `status ${staleWrite.status}`);

  // ── 6. Retry after an uncertain response ──────────────────────────────────
  console.log('\n─── 6. The response was lost; the worker retries the assignment ───');
  const owner = (await readOwner(cfg, token, activityId))?.ownerId ?? '';
  const repeat = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${activityId})`,
    { [`${ACTIVITY_OWNER_NAV}@odata.bind`]: owner === teamId ? `/teams(${owner})` : `/systemusers(${owner})` });
  check('re-assigning to the SAME owner is accepted and changes nothing', repeat.status < 400,
    `status ${repeat.status}`);
  check('the owner is unchanged', (await readOwner(cfg, token, activityId))?.ownerId === owner);

  const stillOne = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$filter=startswith(subject,'${MARKER}')&$count=true`);
  check('an assignment retry created NO replacement activity',
    (stillOne['@odata.count'] ?? 0) === 1, `${stillOne['@odata.count']} activity`);

  await cleanup(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log('\n  Native Dynamics ownership assignment — runtime validated above.');
  console.log('  QDB Smart Assignment — NOT validated: no general contract located (KI-09).');
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
    console.log(`  [DELETE] ${id} -> ${(await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`)).status}`);
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
