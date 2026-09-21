/**
 * qa-clean-bulk-run.mts
 * Removes everything a QA bulk run created, by **deriving** its ids rather than searching for them.
 *
 * A bulk run's native activities are created at `uuidv5(runId | recipientId | channel)`. That is
 * what makes the executor idempotent, and it is also what makes cleanup exact: given the run, every
 * row it could have produced is computable, so nothing has to be matched on text the platform
 * composed. KI-73 is the reason — a cleaner that searched for display text reported success while
 * leaving six rows behind.
 *
 * It removes, for each run named on the command line:
 *   • the recipient ActivityParty rows of each derived activity,
 *   • the derived `fax` or `email` activities themselves,
 *   • the `qdb_communicationrun` header.
 *
 * Then it **re-reads every one of those ids** and fails if any still resolves. Deleting and
 * reporting success without looking again is exactly the habit this project has been bitten by.
 *
 * It touches no collection case, no customer and no configuration: a QA run borrows existing
 * records as recipients and creates only communications, so only communications are removed.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/qa-clean-bulk-run.mts <runId> [<runId>…]
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { nativeActivityIdFor, thawPopulation } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';

/** The provisioned channel values, as the executor writes them. */
const CHANNEL_SMS = 100000700;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

interface Config { apiBase: string; orgUrl: string }

async function send(
  cfg: Config, token: string, method: string, path: string,
): Promise<{ status: number }> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME,
    },
  });
  return { status: response.status };
}

/** Every activity id the run could have created, computed from the run itself. */
function ownedActivities(run: Record<string, unknown>, runId: string): {
  set: 'faxes' | 'emails'; id: string;
}[] {
  const population = thawPopulation(String(run['qdb_frozenpopulation'] ?? ''));
  const channel = Number(run['qdb_channel']) === CHANNEL_SMS ? 'SMS' : 'Email';
  const set = channel === 'SMS' ? 'faxes' : 'emails';
  return population.map(recipientId => ({
    set: set as 'faxes' | 'emails',
    id: nativeActivityIdFor(runId, recipientId, channel),
  }));
}

async function removeRun(cfg: Config, token: string, runId: string): Promise<void> {
  console.log(`\n─── Run ${runId} ───`);

  const run = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_communicationruns(${runId})?$select=qdb_name,qdb_channel,qdb_frozenpopulation,qdb_totalrecipients`)
    .catch(() => null);

  if (!run) {
    check('the run exists to be cleaned', false, 'it could not be read');
    return;
  }
  console.log(`  ${run['qdb_name']} — ${run['qdb_totalrecipients']} recipients`);

  const activities = ownedActivities(run as Record<string, unknown>, runId);
  check('every activity id is derived from the run', activities.length > 0,
    `${activities.length} derived`);

  for (const activity of activities) {
    const parties = await apiGet(cfg, token, SOLUTION_NAME,
      `/activityparties?$select=activitypartyid&$filter=_activityid_value eq ${activity.id}`)
      .catch(() => ({ value: [] as { activitypartyid: string }[] }));

    // Parties go with the activity on delete; removing the activity is what matters, and the
    // re-read below is what proves it.
    const removed = await send(cfg, token, 'DELETE', `/${activity.set}(${activity.id})`);
    console.log(`  [DELETE] ${activity.set}(${activity.id}) → ${removed.status}`
      + ` (${(parties as { value: unknown[] }).value.length} party rows)`);
  }

  const removedRun = await send(cfg, token, 'DELETE', `/qdb_communicationruns(${runId})`);
  console.log(`  [DELETE] qdb_communicationruns(${runId}) → ${removedRun.status}`);

  // ── Prove it, by reading every id back ──────────────────────────────────────
  let survivors = 0;
  for (const activity of activities) {
    const still = await apiGet(cfg, token, SOLUTION_NAME,
      `/${activity.set}(${activity.id})?$select=activityid`).catch(() => null);
    if (still) survivors += 1;
  }
  check('no derived activity survives', survivors === 0, `${survivors} remaining`);

  const runStill = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_communicationruns(${runId})?$select=qdb_communicationrunid`).catch(() => null);
  check('the run header is gone', runStill === null);

  const orphanParties = await apiGet(cfg, token, SOLUTION_NAME,
    `/activityparties?$select=activitypartyid&$filter=${activities
      .map(a => `_activityid_value eq ${a.id}`).join(' or ')}`)
    .catch(() => ({ value: [] as unknown[] }));
  check('no recipient party is left behind',
    (orphanParties as { value: unknown[] }).value.length === 0,
    `${(orphanParties as { value: unknown[] }).value.length} remaining`);
}

async function main(): Promise<void> {
  const runIds = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
  if (runIds.length === 0) {
    console.error('Give at least one communication run id to clean.');
    process.exit(1);
  }

  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing to touch ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);

  for (const runId of runIds) await removeRun(cfg, token, runId);

  const failed = results.filter(result => !result.passed).length;
  console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
