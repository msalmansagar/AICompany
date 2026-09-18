/**
 * clean-qdb-smoke-data.mjs
 * Removes the rows the `qdb_` smoke tests leave behind, and nothing else.
 *
 * The smoke tests have to exercise `ImmutabilityGuard`, and the guard then refuses to let them
 * clean up after themselves: Delete on a collection case and on a snapshot is permanently blocked,
 * and a completed activity is frozen. That is correct behaviour, so removing the test rows means
 * temporarily disabling the three `qdb_` Delete steps — the minimum that can do the job.
 *
 * What counts as smoke data is decided per table by the facility number or record number the tests
 * stamp with the smoke marker — never by a free-text match, and never by anything a real MIS feed
 * could produce. Reference data the tests create (a contact, an activity type, a platform
 * configuration row) is matched on the same marker and needs no guard disabled.
 *
 * Safety, in the order it is applied:
 *   • refuses to run against any organisation but the authorised sandbox;
 *   • prints what it found and stops unless `--confirm` is given;
 *   • reports anything outside the smoke set that references a row before deleting it;
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
export const SMOKE_MARKER = 'SMOKE-';

/**
 * The demonstration dataset uses its OWN marker, deliberately.
 *
 * This cleanup removes every row matching the marker it is given — not only the rows the current run
 * created. Sharing a prefix would therefore mean the next smoke test silently deleted the data
 * someone was using to look at the workspace, with a green run and no indication anything had gone.
 */
export const DEMO_MARKER = 'DEMO-';

/** Tables the smoke tests write, the column that carries the marker, and whether a guard blocks Delete. Children before parents. */
const SMOKE_TABLES = [
  { entitySet: 'qdb_collectionactivities', label: 'collection activity', markerField: 'qdb_activitynumber', idField: 'activityid', guarded: true },
  { entitySet: 'qdb_delinquencysnapshots', label: 'delinquency snapshot', markerField: 'qdb_facilitynumber', idField: 'qdb_delinquencysnapshotid', guarded: true },
  { entitySet: 'qdb_identityexceptions', label: 'identity exception', markerField: 'qdb_facilitynumber', idField: 'qdb_identityexceptionid', guarded: false },
  { entitySet: 'qdb_collectioncases', label: 'collection case', markerField: 'qdb_facilitynumber', idField: 'qdb_collectioncaseid', guarded: true },
  { entitySet: 'qdb_strategyactions', label: 'strategy action', markerField: 'qdb_name', idField: 'qdb_strategyactionid', guarded: false },
  { entitySet: 'qdb_collectionstrategies', label: 'collection strategy', markerField: 'qdb_name', idField: 'qdb_collectionstrategyid', guarded: false },
  { entitySet: 'qdb_assignmentconfigurations', label: 'assignment configuration', markerField: 'qdb_name', idField: 'qdb_assignmentconfigurationid', guarded: false },
  { entitySet: 'qdb_collectionactivitytypes', label: 'activity type (reference data)', markerField: 'qdb_code', idField: 'qdb_collectionactivitytypeid', guarded: false },
  { entitySet: 'qdb_platformmappings', label: 'platform mapping (smoke)', markerField: 'qdb_name', idField: 'qdb_platformmappingid', guarded: false },
  { entitySet: 'qdb_platformconfigurations', label: 'platform configuration (smoke)', markerField: 'qdb_environmentcode', idField: 'qdb_platformconfigurationid', guarded: false },
  { entitySet: 'contacts', label: 'contact (smoke customer)', markerField: 'governmentid', idField: 'contactid', guarded: false },
];

/** The only steps this script may disable: the three that block a delete. */
const BLOCKING_STEP_NAMES = PLUGIN_STEPS
  .filter(step => step.pluginType === 'ImmutabilityGuardPlugin' && step.message === 'Delete')
  .map(step => `ImmutabilityGuardPlugin: Delete of ${step.entity} (PreValidation)`);

function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

async function write(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method, headers: buildHeaders(token, SOLUTION_NAME), ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text)?.error?.message ?? text; } catch { return text; }
}

/** Finds every row in the smoke tables whose marker column starts with the marker. */
export async function findSmokeRows(cfg, token, marker = SMOKE_MARKER) {
  const found = [];
  for (const table of SMOKE_TABLES) {
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/${table.entitySet}?$select=${table.idField},${table.markerField}&$filter=startswith(${table.markerField},'${marker}')`);
    for (const row of result?.value ?? []) {
      found.push({ ...table, id: row[table.idField], name: String(row[table.markerField]) });
    }
  }
  return found;
}

/** Reports anything outside the smoke set that points at a case being removed. */
async function findUnexpectedReferences(cfg, token, rows) {
  const smokeIds = new Set(rows.map(r => r.id));
  const unexpected = [];
  for (const caseRow of rows.filter(r => r.entitySet === 'qdb_collectioncases')) {
    for (const [set, idField] of [['qdb_collectionactivities', 'activityid'], ['qdb_delinquencysnapshots', 'qdb_delinquencysnapshotid']]) {
      const related = await apiGet(cfg, token, SOLUTION_NAME, `/${set}?$select=${idField}&$filter=_qdb_collectioncaseid_value eq ${caseRow.id}`);
      for (const child of related?.value ?? []) {
        if (!smokeIds.has(child[idField])) unexpected.push(`case ${caseRow.name} is referenced by ${set} ${child[idField]}, which is not part of the smoke set`);
      }
    }
  }
  return unexpected;
}

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

async function setStepsEnabled(cfg, token, steps, enabled) {
  for (const step of steps) {
    const body = enabled ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 };
    const failure = await write(cfg, token, 'PATCH', `/sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, body);
    if (failure) throw new Error(`Could not ${enabled ? 'enable' : 'disable'} '${step.name}': ${failure}`);
    console.log(`  ${enabled ? '[ENABLED] ' : '[DISABLED]'} ${step.name}`);
  }
}

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

/** Runs the whole cleanup; exported so the Phase 2 smoke can call it as its last step. */
export async function cleanSmokeData({ cfg, token, confirmed, marker = SMOKE_MARKER }) {
  console.log('\n─── Records identified ───');
  const rows = await findSmokeRows(cfg, token, marker);
  if (rows.length === 0) {
    console.log('  None. There is no smoke residue to remove.');
    return { residue: [], deleted: 0 };
  }
  for (const row of rows) console.log(`  ${row.label.padEnd(32)} ${row.id}  ${row.name}`);
  console.log(`  ${rows.length} record(s) — every one matched on the "${marker}" marker.`);

  console.log('\n─── Checking for anything else that references them ───');
  const unexpected = await findUnexpectedReferences(cfg, token, rows);
  if (unexpected.length > 0) {
    console.log('  STOPPING — these rows are referenced by records outside the smoke set:');
    for (const line of unexpected) console.log(`    ${line}`);
    throw new Error('smoke cleanup refused: rows are referenced outside the smoke set');
  }
  console.log('  Nothing outside the smoke set references them.');

  if (!confirmed) {
    console.log('\nDry run. Re-run with --confirm to delete these records.');
    return { residue: rows, deleted: 0 };
  }

  const guarded = rows.filter(r => r.guarded);
  const unguarded = rows.filter(r => !r.guarded);
  let failures = [];

  if (guarded.length > 0) {
    console.log('\n─── Temporarily disabling the three qdb_ Delete guards ───');
    const steps = await readBlockingSteps(cfg, token);
    await setStepsEnabled(cfg, token, steps, false);
    try {
      console.log('\n─── Deleting guarded rows ───');
      failures = await deleteRows(cfg, token, guarded);
    } finally {
      console.log('\n─── Restoring the guards ───');
      await setStepsEnabled(cfg, token, steps, true);
    }
    console.log('\n─── Verifying the restored registration ───');
    if (!(await verifyRestored(cfg, token))) throw new Error('guard registration did not restore cleanly');
  }

  if (unguarded.length > 0) {
    console.log('\n─── Deleting reference data (no guard involved) ───');
    failures = failures.concat(await deleteRows(cfg, token, unguarded));
  }

  console.log('\n─── Confirming no residue remains ───');
  const remaining = await findSmokeRows(cfg, token);
  console.log(`  ${remaining.length === 0 ? 'PASS' : 'FAIL'}  ${remaining.length} smoke record(s) remain`);
  for (const row of remaining) console.log(`    still present: ${row.label} ${row.name}`);
  if (failures.length > 0 || remaining.length > 0) throw new Error('smoke cleanup incomplete');
  console.log('\nCleanup complete. The guards are registered and enabled exactly as before.');
  return { residue: [], deleted: rows.length };
}

const isEntryPoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isEntryPoint) {
  const confirmed = process.argv.includes('--confirm');
  console.log(`=== qdb_ smoke-data cleanup${confirmed ? '' : ' (dry run — pass --confirm to delete)'} ===\n`);
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  cleanSmokeData({ cfg, token, confirmed }).catch((err) => {
    console.error('\n[FATAL]', err.message);
    process.exit(1);
  });
}
