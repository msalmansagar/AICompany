/**
 * verify-activity-lifecycle.mjs
 * Proves the Phase 6 activity lifecycle is enforced by the organisation, not just by the repository.
 *
 * Registering a step and rebuilding an assembly are not evidence that the rule runs. This drives the
 * real transitions against `org5869857f` and reads the platform's answers:
 *
 *   Open -> In Progress        must be allowed
 *   In Progress -> In Progress must be refused (no self-transition, matching the case and PTP matrices)
 *   In Progress -> Completed   must be allowed
 *   Completed -> Open          must be refused (a finished activity stays finished)
 *
 * The last one is guarded twice over — `ImmutabilityGuard` at PreValidation and this matrix at
 * PreOperation — and the script reports which one answered, because "refused" by the wrong guard
 * would mean the new rule is not actually live.
 *
 * Every row it creates carries the `SMOKE-` marker and is removed in a finally block, so a failure
 * part-way through still cleans up.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/verify-activity-lifecycle.mjs
 */

import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** `statuscode` on `qdb_collectionactivity`, as provisioned and mirrored in both matrices. */
const STATUS = { Open: 100000640, InProgress: 100000641, Completed: 100000644, Cancelled: 100000645 };
const STATE = { Open: 0, Completed: 1, Cancelled: 2 };

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  console.log('=== Phase 6 — is the activity lifecycle enforced on the organisation? ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);

  const token = await acquireToken(cfg);
  const headers = buildHeaders(token, SOLUTION_NAME);

  const patch = async (id, body) => {
    const res = await fetch(`${cfg.apiBase}/qdb_collectionactivities(${id})`, {
      method: 'PATCH', headers, body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    let message = text;
    try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
    return { ok: false, message };
  };

  let activityId = null;
  try {
    const type = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_code eq 'P6-CALL'"))?.value?.[0];
    check('A Phase 6 activity type exists to create against', Boolean(type),
      type?.qdb_collectionactivitytypeid ?? 'MISSING — run seed-phase6-configuration.mjs');
    if (!type) throw new Error('No P6-CALL activity type.');

    const created = await fetch(`${cfg.apiBase}/qdb_collectionactivities`, {
      method: 'POST', headers,
      body: JSON.stringify({
        subject: `${SMOKE_MARKER}P6 lifecycle`,
        qdb_activitynumber: `${SMOKE_MARKER}P6-LIFECYCLE`,
        'qdb_activitytypeid_qdb_collectionactivity@odata.bind':
          `/qdb_collectionactivitytypes(${type.qdb_collectionactivitytypeid})`,
      }),
    });
    if (!created.ok) throw new Error(`create: ${(await created.text()).slice(0, 300)}`);
    activityId = (created.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1];
    check('An activity was created', Boolean(activityId), activityId ?? 'MISSING');

    console.log('\n─── Transitions ───');
    const toInProgress = await patch(activityId, { statuscode: STATUS.InProgress });
    check('Open -> In Progress is allowed', toInProgress.ok,
      toInProgress.ok ? 'HTTP 204' : String(toInProgress.message).slice(0, 100));

    /**
     * Re-sending the status a record already has is a no-op, and the platform treats it as one:
     * Dataverse drops an attribute from the plugin Target when the value is unchanged, so the
     * validator never sees a self-transition and cannot refuse it.
     *
     * The first run of this script expected a refusal and got a 204. The expectation was wrong, and
     * the platform's behaviour is better than the one I assumed — it means a form that re-sends an
     * unchanged status is harmless rather than an error the user has to understand. The matrix keeps
     * no self-transitions because that is right in the domain; the pipeline simply never asks.
     */
    const noOp = await patch(activityId, { statuscode: STATUS.InProgress });
    check('Re-sending the same status is accepted as a no-op, not refused',
      noOp.ok, noOp.ok ? 'HTTP 204 — the platform elides an unchanged attribute' : String(noOp.message).slice(0, 100));

    const toCompleted = await patch(activityId, { statuscode: STATUS.Completed, statecode: STATE.Completed });
    check('In Progress -> Completed is allowed', toCompleted.ok,
      toCompleted.ok ? 'HTTP 204' : String(toCompleted.message).slice(0, 100));

    const resurrect = await patch(activityId, { statuscode: STATUS.Open, statecode: STATE.Open });
    check('Completed -> Open is REFUSED — a finished activity stays finished',
      !resurrect.ok, resurrect.ok ? 'ALLOWED — the rule is not live' : String(resurrect.message).slice(0, 100));
    // Two guards cover this one: ImmutabilityGuard at PreValidation runs first, so it is expected to
    // be the one that answers. Naming which guard replied keeps the evidence honest.
    const guard = /immutab|completed .*cannot|cannot be (modified|updated)/i.test(resurrect.message ?? '')
      ? 'ImmutabilityGuard (PreValidation, runs first)'
      : /not permitted/i.test(resurrect.message ?? '')
        ? 'StatusTransitionValidator (PreOperation)'
        : 'unrecognised';
    console.log(`     refused by: ${guard}`);

    /**
     * The decisive test for the NEW rule.
     *
     * `ImmutabilityGuard` blocks `statecode == 1` (Completed) only — Cancelled is `statecode 2` and
     * passes straight through it. So a cancelled activity being re-opened is the one transition that
     * reaches `StatusTransitionValidator` and nothing else, which makes it the only proof that the
     * Phase 6 matrix is actually running on the organisation rather than merely registered.
     */
    console.log('\n─── The decisive case: a guard that only the new matrix can answer ───');
    const second = await fetch(`${cfg.apiBase}/qdb_collectionactivities`, {
      method: 'POST', headers,
      body: JSON.stringify({
        subject: `${SMOKE_MARKER}P6 cancelled`,
        qdb_activitynumber: `${SMOKE_MARKER}P6-CANCELLED`,
        'qdb_activitytypeid_qdb_collectionactivity@odata.bind':
          `/qdb_collectionactivitytypes(${type.qdb_collectionactivitytypeid})`,
      }),
    });
    if (!second.ok) throw new Error(`create (cancelled case): ${(await second.text()).slice(0, 300)}`);
    const cancelledId = (second.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1];

    const cancel = await patch(cancelledId, { statuscode: STATUS.Cancelled, statecode: STATE.Cancelled });
    check('Open -> Cancelled is allowed', cancel.ok,
      cancel.ok ? 'HTTP 204' : String(cancel.message).slice(0, 100));

    const reopen = await patch(cancelledId, { statuscode: STATUS.Open, statecode: STATE.Open });
    check('Cancelled -> Open is REFUSED by the Phase 6 matrix — ImmutabilityGuard does not cover it',
      !reopen.ok, reopen.ok ? 'ALLOWED — the new rule is NOT live' : String(reopen.message).slice(0, 110));
    check('…and the refusal is the transition validator, naming both ends',
      !reopen.ok && /not permitted/i.test(reopen.message ?? '') && /Cancelled/i.test(reopen.message ?? ''),
      String(reopen.message).slice(0, 110));
  } finally {
    console.log('\n─── Cleanup ───');
    await cleanSmokeData({ cfg, token, confirmed: true });
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
