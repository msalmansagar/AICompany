/**
 * verify-phase8-residue.mts
 * Phase 8 closure — an independent answer to "did the live regression leave anything behind?".
 *
 * **Read-only, and deliberately not part of any smoke.** Each smoke verifies its own cleanup, which
 * is necessary and not sufficient: a script that both creates and checks can agree with itself
 * about a marker it never used. This sweep knows nothing about which run created what. It asks the
 * organisation, across every entity Phase 8 writes to, whether *any* synthetic marker survives.
 *
 * It also checks the two things a residue sweep must not overlook:
 *
 *   **The guards are still armed.** Cleanup disables an immutability step and restores it. A run
 *   that died between the two would leave the organisation unprotected and every row looking clean.
 *   **The demonstration data is still there.** "Zero residue" achieved by deleting the `DEMO-`
 *   fixtures would pass a naive count and destroy the browser evidence.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/verify-phase8-residue.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

type Config = ReturnType<typeof loadConfig>;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const rowsOf = async (cfg: Config, token: string, path: string): Promise<unknown[]> => {
  const body = await apiGet(cfg, token, SOLUTION_NAME, path) as { value?: unknown[] };
  return body.value ?? [];
};

/**
 * Every entity a Phase 8 run can write to, and the column a synthetic marker would land in.
 *
 * `SMOKE-` marks the regression fixtures, `QA-` the browser-gate ones, and the work-package
 * prefixes the rest. Every prefix is swept, because a package that seeded under its own name and
 * cleaned under the shared one would otherwise leave rows that nothing looks for.
 */
const SWEPT = [
  { set: 'qdb_collectionactivities', column: 'subject' },
  { set: 'qdb_collectioncases', column: 'qdb_casenumber' },
  { set: 'qdb_collectionstrategies', column: 'qdb_name' },
  { set: 'qdb_strategyactions', column: 'qdb_name' },
  { set: 'qdb_collectionactivitytypes', column: 'qdb_name' },
  { set: 'qdb_activityoutcomes', column: 'qdb_name' },
  { set: 'qdb_identityexceptions', column: 'qdb_facilitynumber' },
  { set: 'qdb_communicationruns', column: 'qdb_name' },
  { set: 'contacts', column: 'lastname' },
  { set: 'accounts', column: 'name' },
  { set: 'incidents', column: 'title' },
] as const;

const MARKERS = ['SMOKE-', 'QA-', 'WP17-', 'CLOSURE-'] as const;

async function sweepSyntheticResidue(cfg: Config, token: string): Promise<void> {
  console.log('─── 1. Synthetic markers, across every entity Phase 8 writes to ───');

  for (const target of SWEPT) {
    const clauses = MARKERS.map(marker => `startswith(${target.column},'${marker}')`);
    const found = await rowsOf(cfg, token,
      `/${target.set}?$select=${target.column}&$filter=${encodeURIComponent(clauses.join(' or '))}&$top=5`);
    check(`no synthetic residue in ${target.set}`, found.length === 0, `${found.length} row(s)`);
  }
}

/**
 * The Litigation Requests and Complaint Cases a Legal or Complaint run can create.
 *
 * These are swept separately and by a different question: they are the two records that reach a
 * process **QDB owns**, so residue here is not untidiness — it is work appearing in someone else's
 * queue. The demonstration records are named, and anything else carrying a marker is residue.
 */
async function sweepDownstreamRecords(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 2. Records that would reach a QDB-owned process ───');

  const litigation = await rowsOf(cfg, token,
    `/qdb_qdblegals?$select=qdb_name&$filter=${encodeURIComponent("startswith(qdb_name,'SMOKE-')")}&$top=5`);
  check('no synthetic Litigation Request remains in QDB Legal', litigation.length === 0,
    `${litigation.length} row(s)`);

  const complaints = await rowsOf(cfg, token,
    `/incidents?$select=title&$filter=${encodeURIComponent("startswith(title,'SMOKE-')")}&$top=5`);
  check('no synthetic Complaint Case remains', complaints.length === 0, `${complaints.length} row(s)`);
}

/** Cleanup disables an immutability step to delete a fixture. It must put it back. */
async function guardsAreArmed(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 3. The immutability guards are registered and enabled ───');

  const steps = await rowsOf(cfg, token,
    '/sdkmessageprocessingsteps?$select=name,statecode'
    + `&$filter=${encodeURIComponent("contains(name,'ImmutabilityGuardPlugin')")}`) as
    { name: string; statecode: number }[];

  check('the immutability guard steps are registered', steps.length > 0, `${steps.length} step(s)`);
  const disabled = steps.filter(step => step.statecode !== 0);
  check('every one of them is enabled — none left disabled by a cleanup', disabled.length === 0,
    disabled.map(step => step.name).join(', ') || 'none disabled');
}

/** Zero residue must not have been achieved by deleting the demonstration data. */
async function demonstrationDataSurvives(cfg: Config, token: string): Promise<void> {
  console.log('\n─── 4. The demonstration and configuration data is untouched ───');

  const demoCases = await rowsOf(cfg, token,
    `/qdb_collectioncases?$select=qdb_casenumber&$filter=${encodeURIComponent("startswith(qdb_casenumber,'DEMO-')")}`);
  check('the DEMO- collection cases are still present', demoCases.length > 0,
    `${demoCases.length} case(s)`);

  const snapshots = await rowsOf(cfg, token,
    '/qdb_delinquencysnapshots?$select=qdb_delinquencysnapshotid&$top=1&$count=true');
  check('the historical MIS snapshots are still present', snapshots.length > 0);

  const outcomes = await rowsOf(cfg, token, '/qdb_activityoutcomes?$select=qdb_name');
  check('the activity-outcome configuration is still present', outcomes.length > 0,
    `${outcomes.length} outcome(s)`);
}

async function main(): Promise<void> {
  console.log('=== Phase 8 closure — independent residue and invariant sweep ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}  (read-only)\n`);

  const token = await acquireToken(cfg);
  await sweepSyntheticResidue(cfg, token);
  await sweepDownstreamRecords(cfg, token);
  await guardsAreArmed(cfg, token);
  await demonstrationDataSurvives(cfg, token);

  const failed = results.filter(result => !result.passed);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
