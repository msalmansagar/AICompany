/**
 * smoke-qdb-plugins.mjs
 * Runtime proof that the Phase 1 plugin steps behave on the canonical `qdb_` schema.
 *
 * Every assertion exercises a real step against the live organisation — the unit tests prove the
 * logic, this proves the registration. Separate from `smoke-plugins.mjs`, which targets the
 * earlier `msst_` schema and must keep working untouched.
 *
 * 🔴 Two of the tables it writes to are protected by ImmutabilityGuard by design
 * (`qdb_collectioncase` Delete is permanently blocked, `qdb_delinquencysnapshot` is append-only),
 * so the rows this script creates CANNOT be cleaned up while the guard is registered. It creates
 * the minimum — one case, one snapshot, a handful of activities — and prints their ids so the
 * residue is known rather than discovered later. Everything it creates is named `SMOKE-...`.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/smoke-qdb-plugins.mjs
 */

import { loadConfig, acquireToken, apiGet, apiPost, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Status codes read back from the provisioned schema, not assumed. */
const STATUS = {
  caseNew: 100000600,
  caseAssigned: 100000601,
  caseSettled: 100000613,
  caseInProgress: 100000602,
  activityOpen: 100000640,
  activityCompleted: 100000644,
  ptpActive: 100000080,
  ptpKept: 100000081,
};

const CATEGORY_COMMITMENT = 100000462;
const BUCKET_FIRST_OPTION = 100000000;
const CUSTOMER_TYPE_FIRST = 100000020;
const ORG_CODE_FIRST = 100000140;
const ELIGIBILITY_FIRST = 100000260;
const STATE_COMPLETED = 1;

const results = [];
const created = [];

/** Records one assertion result. @param {string} name @param {boolean} passed @param {string} detail */
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Refuses to run against anything but the authorised sandbox. @param {object} cfg */
function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
}

/** Creates a record and remembers it for the residue report. */
async function create(cfg, token, entitySet, body, label) {
  const { entityId } = await apiPost(cfg, token, SOLUTION_NAME, `/${entitySet}`, body);
  created.push({ entitySet, id: entityId, label });
  return entityId;
}

/**
 * Sends a write the platform may refuse and returns the refusal text, or <c>null</c> on success.
 * A plugin refusal arrives as a normal HTTP error, so the caller decides whether that is the pass.
 * @returns {Promise<string|null>}
 */
async function writeExpectingPossibleRefusal(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) return null;
  const text = await res.text();
  try {
    return JSON.parse(text)?.error?.message ?? text;
  } catch {
    return text;
  }
}

/** Patches a record, allowing the caller to handle refusal. */
async function patch(cfg, token, entitySet, id, body) {
  return writeExpectingPossibleRefusal(cfg, token, 'PATCH', `/${entitySet}(${id})`, body);
}

/** Deletes a record, allowing the caller to handle refusal. */
async function remove(cfg, token, entitySet, id) {
  return writeExpectingPossibleRefusal(cfg, token, 'DELETE', `/${entitySet}(${id})`, null);
}

// ── Scenarios ────────────────────────────────────────────────────────────────

/** DefaultStatusAssigner opens a new case at New rather than the platform sentinel. */
async function checkCaseDefaultStatus(cfg, token, stamp) {
  const caseId = await create(cfg, token, 'qdb_collectioncases', {
    qdb_casenumber: `SMOKE-CASE-${stamp}`,
    qdb_customerbusinessid: 'SMOKE-QID',
    qdb_facilitynumber: 'SMOKE-FACILITY',
    qdb_customertype: CUSTOMER_TYPE_FIRST,
    qdb_organizationcode: ORG_CODE_FIRST,
    qdb_opendate: new Date().toISOString(),
    qdb_episodenumber: 1,
  }, 'collection case');

  const row = await apiGet(cfg, token, SOLUTION_NAME, `/qdb_collectioncases(${caseId})?$select=statuscode`);
  record('Case opens at New (DefaultStatusAssigner)', row?.statuscode === STATUS.caseNew,
    `statuscode=${row?.statuscode}`);
  return caseId;
}

/**
 * StatusTransitionValidator permits New → Assigned and refuses New → In Progress.
 *
 * The refusal used to be New → Settled. KI-46 made Settled a universal target — MIS determines
 * financial cure, and a case may be cured from any working state — so the transition that still
 * proves the matrix is one that skips assignment. The Settled path itself is exercised live by the
 * Phase 2 smoke, which records a cure and reads the resolution back.
 */
async function checkCaseTransitions(cfg, token, caseId) {
  const refusedJump = await patch(cfg, token, 'qdb_collectioncases', caseId, { statuscode: STATUS.caseInProgress });
  record('Case New → In Progress refused, assignment cannot be skipped (StatusTransitionValidator)',
    refusedJump !== null && /not permitted/i.test(refusedJump),
    refusedJump ? refusedJump.split('\n')[0].slice(0, 120) : 'no error raised');

  const allowed = await patch(cfg, token, 'qdb_collectioncases', caseId, { statuscode: STATUS.caseAssigned });
  record('Case New → Assigned permitted', allowed === null, allowed ?? '');
}

/** ImmutabilityGuard blocks Delete on a collection case, sysadmin included. */
async function checkCaseDeleteBlocked(cfg, token, caseId) {
  const refused = await remove(cfg, token, 'qdb_collectioncases', caseId);
  record('Case Delete blocked (ImmutabilityGuard)',
    refused !== null && /immutable/i.test(refused),
    refused ? refused.split('\n')[0].slice(0, 120) : 'delete was allowed');
}

/** ActivitySubjectComposer names the activity after its type; DefaultStatusAssigner opens it. */
async function checkActivityCreate(cfg, token, caseId, typeId, stamp) {
  const activityId = await create(cfg, token, 'qdb_collectionactivities', {
    qdb_activitynumber: `SMOKE-ACT-${stamp}`,
    qdb_activitydate: new Date().toISOString(),
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
  }, 'collection activity');

  const row = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities(${activityId})?$select=subject,statuscode`);
  record('Activity opens at Open (DefaultStatusAssigner)', row?.statuscode === STATUS.activityOpen,
    `statuscode=${row?.statuscode}`);
  record('Activity subject composed from its type (ActivitySubjectComposer)',
    typeof row?.subject === 'string' && row.subject.includes('SMOKE Promise'),
    `subject="${row?.subject}"`);
  return activityId;
}

/** A promise date opens the promise lifecycle, and the PTP matrix is enforced. */
async function checkPromiseLifecycle(cfg, token, caseId, typeId, stamp) {
  const promiseId = await create(cfg, token, 'qdb_collectionactivities', {
    qdb_activitynumber: `SMOKE-PTP-${stamp}`,
    qdb_activitydate: new Date().toISOString(),
    qdb_ptpdate: new Date(Date.now() + 7 * 86400000).toISOString(),
    qdb_promisedamount: 1000,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
  }, 'promise to pay');

  const row = await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_collectionactivities(${promiseId})?$select=qdb_ptpstatus`);
  record('Promise opens at Active (DefaultStatusAssigner)', row?.qdb_ptpstatus === STATUS.ptpActive,
    `qdb_ptpstatus=${row?.qdb_ptpstatus}`);

  const kept = await patch(cfg, token, 'qdb_collectionactivities', promiseId, { qdb_ptpstatus: STATUS.ptpKept });
  record('Promise Active → Kept permitted', kept === null, kept ?? '');

  const reopened = await patch(cfg, token, 'qdb_collectionactivities', promiseId, { qdb_ptpstatus: STATUS.ptpActive });
  record('Promise Kept → Active refused (StatusTransitionValidator)',
    reopened !== null && /not permitted/i.test(reopened),
    reopened ? reopened.split('\n')[0].slice(0, 120) : 'no error raised');
}

/** A completed activity is immutable. */
async function checkCompletedActivityImmutable(cfg, token, activityId) {
  const completed = await patch(cfg, token, 'qdb_collectionactivities', activityId, {
    statecode: STATE_COMPLETED, statuscode: STATUS.activityCompleted,
  });
  if (completed !== null) {
    record('Activity can be completed', false, completed.split('\n')[0].slice(0, 120));
    return;
  }
  record('Activity can be completed', true, '');

  const refused = await patch(cfg, token, 'qdb_collectionactivities', activityId, { qdb_brokenreason: 'SMOKE' });
  record('Completed activity is immutable (ImmutabilityGuard)',
    refused !== null && /immutable|cannot be modified/i.test(refused),
    refused ? refused.split('\n')[0].slice(0, 120) : 'update was allowed');
}

/** The snapshot table is append-only. */
async function checkSnapshotImmutable(cfg, token, stamp) {
  const snapshotId = await create(cfg, token, 'qdb_delinquencysnapshots', {
    qdb_name: `SMOKE-SNAP-${stamp}`,
    qdb_snapshotkey: `SMOKE-${stamp}`,
    qdb_customerbusinessid: 'SMOKE-QID',
    qdb_facilitynumber: 'SMOKE-FACILITY',
    qdb_snapshotdate: new Date().toISOString(),
    qdb_receivedon: new Date().toISOString(),
    qdb_integrationbatchid: `SMOKE-BATCH-${stamp}`,
    qdb_dpd: 30,
    qdb_arrearbucket: BUCKET_FIRST_OPTION,
    qdb_loanbalance: 100000,
    qdb_totalarrears: 5000,
    qdb_eligibilityoutcome: ELIGIBILITY_FIRST,
  }, 'delinquency snapshot');

  const refusedUpdate = await patch(cfg, token, 'qdb_delinquencysnapshots', snapshotId, { qdb_dpd: 31 });
  record('Snapshot Update blocked (ImmutabilityGuard)',
    refusedUpdate !== null && /immutable/i.test(refusedUpdate),
    refusedUpdate ? refusedUpdate.split('\n')[0].slice(0, 120) : 'update was allowed');

  const refusedDelete = await remove(cfg, token, 'qdb_delinquencysnapshots', snapshotId);
  record('Snapshot Delete blocked (ImmutabilityGuard)',
    refusedDelete !== null && /immutable/i.test(refusedDelete),
    refusedDelete ? refusedDelete.split('\n')[0].slice(0, 120) : 'delete was allowed');
}

/** Reference data the activities need; org-owned and deletable, so it is cleaned up. */
async function ensureSmokeActivityType(cfg, token, stamp) {
  return create(cfg, token, 'qdb_collectionactivitytypes', {
    qdb_name: 'SMOKE Promise to Pay',
    qdb_code: `SMOKE-PTP-${stamp}`,
    qdb_category: CATEGORY_COMMITMENT,
    qdb_requiresapproval: false,
    qdb_requiresfollowup: false,
    qdb_amountrequired: false,
    qdb_notesrequired: false,
    qdb_attachmentallowed: false,
    qdb_requiresmisrevalidation: false,
    qdb_isactive: true,
  }, 'activity type (reference data)');
}

/**
 * Removes every record the run created that the guard permits, newest first so children go before
 * their parents. What survives is reported rather than silently left behind.
 * @returns {Promise<{entitySet: string, id: string, label: string}[]>} the records that remain
 */
async function deleteWhatTheGuardAllows(cfg, token) {
  const residue = [];
  for (const row of [...created].reverse()) {
    const refusal = await remove(cfg, token, row.entitySet, row.id);
    if (refusal === null) {
      console.log(`  removed  ${row.entitySet} ${row.id}`);
    } else {
      console.log(`  kept     ${row.entitySet} ${row.id} — ${refusal.split('\n')[0].slice(0, 90)}`);
      residue.push(row);
    }
  }
  return residue;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== qdb_ plugin smoke test ===\n');
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const stamp = Date.now().toString(36).toUpperCase();

  console.log('\n─── Reference data ───');
  const typeId = await ensureSmokeActivityType(cfg, token, stamp);

  console.log('\n─── Collection case ───');
  const caseId = await checkCaseDefaultStatus(cfg, token, stamp);
  await checkCaseTransitions(cfg, token, caseId);
  await checkCaseDeleteBlocked(cfg, token, caseId);

  console.log('\n─── Collection activity ───');
  const activityId = await checkActivityCreate(cfg, token, caseId, typeId, stamp);
  await checkCompletedActivityImmutable(cfg, token, activityId);

  console.log('\n─── Promise to pay ───');
  await checkPromiseLifecycle(cfg, token, caseId, typeId, stamp);

  console.log('\n─── Delinquency snapshot ───');
  await checkSnapshotImmutable(cfg, token, stamp);

  console.log('\n─── Cleanup ───');
  const residue = await deleteWhatTheGuardAllows(cfg, token);

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);

  if (residue.length === 0) {
    console.log('\nNo residue: every record created was removed.');
  } else {
    console.log('\nResidue — protected by ImmutabilityGuard, cannot be removed while it is registered:');
    for (const row of residue) console.log(`  ${row.entitySet.padEnd(30)} ${row.id}  ${row.label}`);
  }

  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
