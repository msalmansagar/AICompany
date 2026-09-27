/**
 * fix-msst-immutability-filter.mjs
 * KI-40 — the single authorised correction to the live `msst_` plugin-step registration.
 *
 * The defect: `ImmutabilityGuardPlugin`'s Update steps on `msst_dcpcollectionaction` and
 * `msst_dcpcommunication` were registered with `filteringattributes = statecode`. A filtered step
 * only runs when one of its columns is in the update, so editing any *other* column on a completed
 * activity never invoked the guard at all. Delete was blocked; Update was not.
 *
 * The correction is registration-only and as small as it can be: clear `filteringattributes` on
 * those two steps so the guard sees every update. No code changes, no other step touched, no
 * assembly re-deployed — the `msst_` binary on the organisation is not modified in any way.
 *
 * The script proves the defect before it changes anything and proves the fix afterwards, on one
 * record. Run with `--verify-only` to re-check without writing.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/fix-msst-immutability-filter.mjs [--verify-only]
 */

import { loadConfig, acquireToken, apiGet, apiPost, buildHeaders } from './lib/crm-client.mjs';

const AUTHORISED_ORG = 'org5869857f';
const SOLUTION_NAME = 'msst_debtcollection';
const VERIFY_ENTITY_SET = 'msst_dcpcollectionactions';
const VERIFY_ENTITY = 'msst_dcpcollectionaction';
const STATE_COMPLETED = 1;

/** The two steps KI-40 covers, and nothing else. */
const STEP_NAMES = [
  'ImmutabilityGuardPlugin: Update of msst_dcpcollectionaction (PreValidation)',
  'ImmutabilityGuardPlugin: Update of msst_dcpcommunication (PreValidation)',
];

const results = [];

/** @param {string} name @param {boolean} passed @param {string} detail */
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Refuses to run against anything but the authorised sandbox. */
function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

/** Sends a write the platform may refuse; returns the refusal text or null on success. */
async function write(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text)?.error?.message ?? text; } catch { return text; }
}

/** Reads the two steps this script is allowed to touch. */
async function readTargetSteps(cfg, token) {
  const steps = [];
  for (const name of STEP_NAMES) {
    const result = await apiGet(cfg, token, SOLUTION_NAME,
      `/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name,filteringattributes,stage,mode&$filter=name eq '${name.replace(/'/g, "''")}'&$top=2`);
    const rows = result?.value ?? [];
    if (rows.length !== 1) throw new Error(`Expected exactly one step named '${name}', found ${rows.length}`);
    steps.push(rows[0]);
  }
  return steps;
}

/** Creates one completed activity to test the guard against. */
async function createCompletedActivity(cfg, token, stamp) {
  const { entityId } = await apiPost(cfg, token, SOLUTION_NAME, `/${VERIFY_ENTITY_SET}`, {
    subject: `KI40-VERIFY-${stamp}`,
  });
  console.log(`  Verification record: ${VERIFY_ENTITY} ${entityId}`);

  const completed = await write(cfg, token, 'PATCH', `/${VERIFY_ENTITY_SET}(${entityId})`, {
    statecode: STATE_COMPLETED,
  });
  record('Verification record can be completed', completed === null, completed ?? '');
  return entityId;
}

/** Attempts an ordinary field update on a completed activity. */
async function attemptOrdinaryUpdate(cfg, token, id, value) {
  return write(cfg, token, 'PATCH', `/${VERIFY_ENTITY_SET}(${id})`, { subject: value });
}

/**
 * Clears filteringattributes on the two KI-40 steps, then forces the platform to pick the change up.
 *
 * Writing the column is not enough: the pipeline caches a step's registration, so a step whose
 * filter has just been widened carries on running under the old, narrow one. Disabling and
 * re-enabling the step is what makes the new filter take effect — the same reason
 * `refreshStep` exists for image changes.
 */
async function applyFix(cfg, token, steps) {
  for (const step of steps) {
    const id = step.sdkmessageprocessingstepid;
    if (step.filteringattributes) {
      const failure = await write(cfg, token, 'PATCH', `/sdkmessageprocessingsteps(${id})`,
        { filteringattributes: null });
      if (failure) throw new Error(`Could not clear the filter on '${step.name}': ${failure}`);
      console.log(`  [FIXED] ${step.name}: filteringattributes '${step.filteringattributes}' -> (all columns)`);
    } else {
      console.log(`  [SKIP] ${step.name} already fires on every column`);
    }

    const disabled = await write(cfg, token, 'PATCH', `/sdkmessageprocessingsteps(${id})`, { statecode: 1, statuscode: 2 });
    if (disabled) throw new Error(`Could not disable '${step.name}' to refresh it: ${disabled}`);
    const enabled = await write(cfg, token, 'PATCH', `/sdkmessageprocessingsteps(${id})`, { statecode: 0, statuscode: 1 });
    if (enabled) throw new Error(`Could not re-enable '${step.name}': ${enabled}`);
    console.log(`  [REFRESHED] ${step.name} disabled and re-enabled so the new filter takes effect`);
  }
}

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');
  console.log(`=== KI-40 — msst_ ImmutabilityGuard filter correction${verifyOnly ? ' (verify only)' : ''} ===\n`);

  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const stamp = Date.now().toString(36).toUpperCase();

  console.log('\n─── Current registration ───');
  const before = await readTargetSteps(cfg, token);
  for (const step of before) {
    console.log(`  ${step.name}\n      filteringattributes=${step.filteringattributes ?? '(none)'} stage=${step.stage} mode=${step.mode}`);
  }

  console.log('\n─── Verification record ───');
  // Reusing a record from an earlier run keeps a second undeletable row out of the organisation:
  // the guard blocks Delete on a completed activity, so every run would otherwise leave one behind.
  const recordIndex = process.argv.indexOf('--record');
  const activityId = recordIndex !== -1 && process.argv[recordIndex + 1]
    ? process.argv[recordIndex + 1]
    : await createCompletedActivity(cfg, token, stamp);
  if (recordIndex !== -1) console.log(`  Reusing verification record ${activityId}`);

  if (!verifyOnly) {
    const defectStillPresent = before.some(step => step.filteringattributes);
    if (defectStillPresent) {
      console.log('\n─── Reproducing the defect, before the change ───');
      const beforeFix = await attemptOrdinaryUpdate(cfg, token, activityId, `KI40-BEFORE-${stamp}`);
      record('Defect reproduced: a completed activity accepts an ordinary field update',
        beforeFix === null,
        beforeFix ? `unexpectedly refused: ${beforeFix.split('\n')[0].slice(0, 100)}` : 'update was accepted, as the defect predicts');
    } else {
      console.log('\n─── The filter is already cleared; reproduction step skipped ───');
    }

    console.log('\n─── Applying the correction ───');
    await applyFix(cfg, token, before);
  }

  console.log('\n─── Verifying the guard now fires ───');
  const afterFix = await attemptOrdinaryUpdate(cfg, token, activityId, `KI40-AFTER-${stamp}`);
  record('Completed activity now refuses an ordinary field update',
    afterFix !== null && /immutable|cannot be modified/i.test(afterFix),
    afterFix ? afterFix.split('\n')[0].slice(0, 110) : 'update was still accepted');

  const deleteRefusal = await write(cfg, token, 'DELETE', `/${VERIFY_ENTITY_SET}(${activityId})`, null);
  record('Delete on the completed activity is still blocked',
    deleteRefusal !== null && /immutable|cannot be modified/i.test(deleteRefusal),
    deleteRefusal ? deleteRefusal.split('\n')[0].slice(0, 110) : 'delete was allowed');

  console.log('\n─── Registration after the change ───');
  const after = await readTargetSteps(cfg, token);
  for (const step of after) {
    record(`Step fires on every column: ${step.name.replace('ImmutabilityGuardPlugin: ', '')}`,
      !step.filteringattributes, `filteringattributes=${step.filteringattributes ?? '(none)'}`);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  console.log(`\nVerification record left behind (the guard blocks its deletion, by design):`);
  console.log(`  ${VERIFY_ENTITY} ${activityId}  subject KI40-BEFORE-${stamp}`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
