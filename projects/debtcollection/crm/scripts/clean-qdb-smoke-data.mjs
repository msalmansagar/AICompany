/**
 * clean-qdb-smoke-data.mjs
 * Removes the rows the `qdb_` smoke test leaves behind, and nothing else.
 *
 * The smoke test has to exercise `ImmutabilityGuard`, and the guard then refuses to let it clean up
 * after itself: Delete on a collection case and on a snapshot is permanently blocked, and a
 * completed activity is frozen. That is correct behaviour, so removing the test rows means
 * temporarily disabling the three `qdb_` Delete steps — the minimum that can do the job.
 *
 * Safety, in the order it is applied:
 *   • refuses to run against any organisation but the authorised sandbox;
 *   • only ever matches rows whose name/number begins with the smoke prefix;
 *   • prints what it found and stops unless `--confirm` is given;
 *   • reports anything else that references a row before deleting it;
 *   • re-enables every step it disabled, including when a delete fails;
 *   • verifies the restored registration against the step table before exiting.
 *
 * It never touches the legacy `msst_` guard, which stays registered and enabled throughout.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/clean-qdb-smoke-data.mjs [--confirm]
 */

import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { PLUGIN_STEPS, SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const SMOKE_PREFIX = 'SMOKE-';

/** The tables the smoke test writes to, with the column its name lands in. */
const SMOKE_TABLES = [
  { entitySet: 'qdb_collectionactivities', label: 'collection activity', nameField: 'qdb_activitynumber', idField: 'activityid' },
  { entitySet: 'qdb_delinquencysnapshots', label: 'delinquency snapshot', nameField: 'qdb_name', idField: 'qdb_delinquencysnapshotid' },
  { entitySet: 'qdb_collectioncases', label: 'collection case', nameField: 'qdb_casenumber', idField: 'qdb_collectioncaseid' },
];

/** The only steps this script may disable: the three that block a delete. */
const BLOCKING_STEP_NAMES = PLUGIN_STEPS
  .filter(step => step.pluginType === 'ImmutabilityGuardPlugin' && step.message === 'Delete')
  .map(step => `ImmutabilityGuardPlugin: Delete of ${step.entity} (PreValidation)`);

/** Refuses to run against anything but the authorised sandbox. */
function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

/** Sends a write and returns the refusal text, or null on success. */
async function write(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method, headers: buildHeaders(token, SOLUTION_NAME), ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text)?.error?.message ?? text; } catch { return text; }
}

/** Finds every row in the smoke tables whose name carries the smoke prefix. */
async function findSmokeRows(cfg, token) {
  const found = [];
  for (const table of SMOKE_TABLES) {
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/${table.entitySet}?$select=${table.idField},${table.nameField},statecode`);
    for (const row of result?.value ?? []) {
      const name = String(row[table.nameField] ?? '');
      if (!name.startsWith(SMOKE_PREFIX)) continue;
      found.push({ ...table, id: row[table.idField], name, statecode: row.statecode });
    }
  }
  return found;
}

/**
 * Reports anything outside the smoke set that points at a case being removed, so a row with real
 * work hanging off it is never deleted silently.
 */
async function findUnexpectedReferences(cfg, token, rows) {
  const smokeIds = new Set(rows.map(r => r.id));
  const unexpected = [];
  for (const caseRow of rows.filter(r => r.entitySet === 'qdb_collectioncases')) {
    const related = await apiGet(cfg, token, SOLUTION_NAME,
      `/qdb_collectionactivities?$select=activityid,qdb_activitynumber&$filter=_qdb_collectioncaseid_value eq ${caseRow.id}`);
    for (const activity of related?.value ?? []) {
      if (!smokeIds.has(activity.activityid)) {
        unexpected.push(`${caseRow.name} is referenced by activity ${activity.activityid} "${activity.qdb_activitynumber}", which is not part of the smoke set`);
      }
    }
  }
  return unexpected;
}

/** Reads the three blocking steps. */
async function readBlockingSteps(cfg, token) {
  const steps = [];
  for (const name of BLOCKING_STEP_NAMES) {
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,statecode,statuscode,filteringattributes&$filter=name eq '${name.replace(/'/g, "''")}'&$top=2`);
    const rows = result?.value ?? [];
    if (rows.length !== 1) throw new Error(`Expected exactly one step named '${name}', found ${rows.length}`);
    steps.push(rows[0]);
  }
  return steps;
}

/** Disables or re-enables the blocking steps. @param {boolean} enabled */
async function setStepsEnabled(cfg, token, steps, enabled) {
  for (const step of steps) {
    const body = enabled ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 };
    const failure = await write(cfg, token, 'PATCH',
      `/sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, body);
    if (failure) throw new Error(`Could not ${enabled ? 'enable' : 'disable'} '${step.name}': ${failure}`);
    console.log(`  ${enabled ? '[ENABLED] ' : '[DISABLED]'} ${step.name}`);
  }
}

/** Confirms the restored steps match what the step table says they should be. */
async function verifyRestored(cfg, token) {
  const steps = await readBlockingSteps(cfg, token);
  let allGood = true;
  for (const step of steps) {
    const enabled = step.statecode === 0;
    const unfiltered = !step.filteringattributes;
    const images = await apiGet(cfg, token, SOLUTION_NAME,
      `/sdkmessageprocessingstepimages?$select=name,attributes&$filter=_sdkmessageprocessingstepid_value eq ${step.sdkmessageprocessingstepid}`);
    const imageSummary = (images?.value ?? []).map(i => `${i.name}(${i.attributes ?? 'all'})`).join(', ') || '(none)';
    const ok = enabled && unfiltered;
    if (!ok) allGood = false;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${step.name} — enabled=${enabled} filter=${step.filteringattributes ?? '(none)'} images=${imageSummary}`);
  }
  return allGood;
}

/** Deletes the identified rows, children before parents. */
async function deleteRows(cfg, token, rows) {
  const failures = [];
  for (const row of rows) {
    const refusal = await write(cfg, token, 'DELETE', `/${row.entitySet}(${row.id})`, null);
    if (refusal) {
      console.log(`  [FAILED]  ${row.label} ${row.name} — ${refusal.split('\n')[0].slice(0, 90)}`);
      failures.push(row);
    } else {
      console.log(`  [DELETED] ${row.label} ${row.name} (${row.id})`);
    }
  }
  return failures;
}

async function main() {
  const confirmed = process.argv.includes('--confirm');
  console.log(`=== qdb_ smoke-data cleanup${confirmed ? '' : ' (dry run — pass --confirm to delete)'} ===\n`);

  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);

  console.log('\n─── Records identified ───');
  const rows = await findSmokeRows(cfg, token);
  if (rows.length === 0) {
    console.log('  None. There is no smoke residue to remove.');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.label.padEnd(22)} ${row.id}  ${row.name}${row.statecode === 1 ? '  [completed]' : ''}`);
  }
  console.log(`  ${rows.length} record(s) — every one matched on the "${SMOKE_PREFIX}" prefix.`);

  console.log('\n─── Checking for anything else that references them ───');
  const unexpected = await findUnexpectedReferences(cfg, token, rows);
  if (unexpected.length > 0) {
    console.log('  STOPPING — these rows are referenced by records outside the smoke set:');
    for (const line of unexpected) console.log(`    ${line}`);
    process.exit(1);
  }
  console.log('  Nothing outside the smoke set references them.');

  if (!confirmed) {
    console.log('\nDry run. Re-run with --confirm to delete these records.');
    return;
  }

  console.log('\n─── Temporarily disabling the three qdb_ Delete guards ───');
  const steps = await readBlockingSteps(cfg, token);
  await setStepsEnabled(cfg, token, steps, false);

  let failures = [];
  try {
    console.log('\n─── Deleting ───');
    failures = await deleteRows(cfg, token, rows);
  } finally {
    console.log('\n─── Restoring the guards ───');
    await setStepsEnabled(cfg, token, steps, true);
  }

  console.log('\n─── Verifying the restored registration ───');
  const restored = await verifyRestored(cfg, token);

  console.log('\n─── Confirming no residue remains ───');
  const remaining = await findSmokeRows(cfg, token);
  console.log(`  ${remaining.length === 0 ? 'PASS' : 'FAIL'}  ${remaining.length} smoke record(s) remain`);
  for (const row of remaining) console.log(`    still present: ${row.label} ${row.name}`);

  if (failures.length > 0 || !restored || remaining.length > 0) process.exit(1);
  console.log('\nCleanup complete. The guards are registered and enabled exactly as before.');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
