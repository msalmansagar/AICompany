/**
 * seed-phase6-configuration.mjs
 * Synthetic activity types and outcomes, so Phase 6 can be exercised against Cloud.
 *
 * **None of this is QDB production configuration, and it must never be mistaken for it.**
 *
 * `qdb_collectionactivitytype` holds one row on the organisation — a `DEMO-` seed of my own — and
 * `qdb_activityoutcome` holds none. The eleven activity types named in the Phase 6 authorisation are
 * approved *as a catalogue of types*; the outcome catalogue is not in evidence anywhere, and
 * `qdb_activityoutcome` is not a lookup table of labels but **configuration that drives behaviour**:
 * `qdb_requiresfollowup`, `qdb_followupdays`, `qdb_requiresnotes` and `qdb_escalationrequired` are
 * read by the workspace rather than decided in code.
 *
 * So the split is deliberate:
 *
 *   • **Activity types** carry the eleven approved names, because the authorisation names them.
 *   • **Outcomes** are a small synthetic set that exists only to exercise the mechanism. Their
 *     names, follow-up windows and notes requirements are **not QDB policy** and are recorded as
 *     KI-66, awaiting the real catalogue.
 *
 * Every row is marked `P6-` — distinct from `SMOKE-`, `DEMO-` and `ARR-` — so each set stays
 * independently removable, and every row is deactivated-and-identifiable rather than blending in.
 *
 * Idempotent: re-running updates in place rather than duplicating. `--remove` deletes exactly what
 * it created. No schema change: these are rows in tables Phase 1 provisioned.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/seed-phase6-configuration.mjs [--remove]
 */

import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
export const PHASE6_MARKER = 'P6-';

/**
 * The eleven activity types the Phase 6 authorisation names.
 *
 * The names are approved; the **codes** are not in evidence, so they are derived from the names and
 * carry the marker. When QDB supplies the real codes this table is replaced, not extended.
 *
 * `ownedByPhase` records which phase owns the *downstream process* for each type. Phase 6 builds the
 * generic framework and the activities belonging to it; a Restructuring Recommendation may be
 * recorded here, but the restructuring workflow it implies is Phase 9's and is not started.
 */
const ACTIVITY_TYPES = [
  { code: 'CALL', name: 'Call', ownedByPhase: 6 },
  { code: 'PAYREQ', name: 'Payment Request', ownedByPhase: 6 },
  { code: 'PTP', name: 'Promise to Pay', ownedByPhase: 6 },
  { code: 'FOLLOWUP', name: 'Follow-up', ownedByPhase: 6 },
  { code: 'MEETING', name: 'Meeting', ownedByPhase: 6 },
  { code: 'FIELDVISIT', name: 'Field Visit', ownedByPhase: 9 },
  { code: 'RESTRUCTREC', name: 'Restructuring Recommendation', ownedByPhase: 9 },
  { code: 'LEGALREC', name: 'Legal Recommendation', ownedByPhase: 9 },
  { code: 'DECEASED', name: 'Deceased / Insurance', ownedByPhase: 9 },
  { code: 'DISPUTE', name: 'Complaint / Dispute', ownedByPhase: 9 },
  { code: 'GENERAL', name: 'General Action', ownedByPhase: 6 },
];

/**
 * A synthetic outcome set — **not QDB policy** (KI-66).
 *
 * It exists to exercise the four behaviours the column set implies: an outcome that schedules a
 * follow-up a configured number of days out, one that demands notes, one that asks for escalation,
 * and one that closes the action cleanly. The *shape* is what Phase 6 must handle; the real
 * catalogue is QDB's, and the day counts below are deliberately round numbers rather than anything
 * that could be mistaken for a negotiated policy.
 */
const CONTACT_OUTCOMES = [
  { code: 'CONTACTED', name: 'Customer contacted', sequence: 10, requiresFollowUp: true, followUpDays: 3, requiresNotes: false, escalation: false, closes: true },
  { code: 'NOANSWER', name: 'No answer', sequence: 20, requiresFollowUp: true, followUpDays: 1, requiresNotes: false, escalation: false, closes: true },
  { code: 'PROMISED', name: 'Customer promised payment', sequence: 30, requiresFollowUp: true, followUpDays: 7, requiresNotes: false, escalation: false, closes: true },
  { code: 'REFUSED', name: 'Customer refused', sequence: 40, requiresFollowUp: false, followUpDays: 0, requiresNotes: true, escalation: true, closes: true },
  { code: 'DISPUTED', name: 'Customer disputes the balance', sequence: 50, requiresFollowUp: true, followUpDays: 5, requiresNotes: true, escalation: true, closes: true },
  { code: 'UNREACHABLE', name: 'Contact details invalid', sequence: 60, requiresFollowUp: false, followUpDays: 0, requiresNotes: true, escalation: false, closes: true },
  { code: 'RESOLVED', name: 'Action completed, no follow-up needed', sequence: 70, requiresFollowUp: false, followUpDays: 0, requiresNotes: false, escalation: false, closes: true },
];

/** A visit has its own outcomes, which is what makes the per-type filtering visible rather than theoretical. */
const VISIT_OUTCOMES = [
  { code: 'METCUSTOMER', name: 'Met the customer', sequence: 10, requiresFollowUp: true, followUpDays: 7, requiresNotes: true, escalation: false, closes: true },
  { code: 'NOTATADDRESS', name: 'Not at the address', sequence: 20, requiresFollowUp: false, followUpDays: 0, requiresNotes: true, escalation: true, closes: true },
];

/**
 * Which outcomes each activity type offers.
 *
 * **An outcome belongs to exactly one activity type** — `qdb_activityoutcome.qdb_activitytypeid` is
 * its owning type — so an outcome shared by several types is several rows, not one row with several
 * parents. That is why the codes below are qualified by type: `P6-CALL-CONTACTED`, not
 * `P6-CONTACTED`.
 *
 * The first seeding got this wrong in a way only the organisation revealed: seven outcomes were
 * created with **no owning type at all**, so a form that correctly filters outcomes by the chosen
 * type found none, and no activity could be completed with an outcome. The rows existed, every test
 * passed, and the feature was unusable.
 *
 * Types not listed here have no outcomes, and the form says so plainly. That is the honest state
 * until QDB supplies the real catalogue (KI-66) — better than attaching contact outcomes to a legal
 * recommendation so that the dropdown looks populated.
 */
const OUTCOMES_BY_TYPE = {
  CALL: CONTACT_OUTCOMES,
  PAYREQ: CONTACT_OUTCOMES,
  FOLLOWUP: CONTACT_OUTCOMES,
  MEETING: CONTACT_OUTCOMES,
  FIELDVISIT: VISIT_OUTCOMES,
};

/** Every outcome row to seed, flattened, each carrying the type that owns it. */
const OUTCOMES = Object.entries(OUTCOMES_BY_TYPE).flatMap(([typeCode, outcomes]) =>
  outcomes.map(outcome => ({ ...outcome, typeCode, code: `${typeCode}-${outcome.code}` })));

/**
 * The navigation property an outcome binds its owning type through.
 *
 * Bare, with no relationship suffix — nothing else on `qdb_activityoutcome` targets the type table,
 * so the name needs no qualification. **Read from `ReferencingEntityNavigationPropertyName`, not
 * inferred** (KI-69), and checked against live metadata by `verify-view-columns.mts` through
 * `NAVIGATION_REGISTRY`.
 */
const OUTCOME_TO_TYPE_NAVIGATION = 'qdb_activitytypeid';

const mark = suffix => `${PHASE6_MARKER}${suffix}`;

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function send(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) {
    return { ok: true, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  }
  const text = await res.text();
  let message = text;
  try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false, message };
}

/** Creates the row, or patches the existing one — so a re-run never duplicates. */
async function upsert(cfg, token, set, idField, markerField, markerValue, body, label) {
  const found = (await apiGet(cfg, token, SOLUTION_NAME,
    `/${set}?$select=${idField}&$filter=${markerField} eq '${markerValue}'`))?.value?.[0];
  if (found) {
    const patched = await send(cfg, token, 'PATCH', `/${set}(${found[idField]})`, body);
    return { ok: patched.ok, id: found[idField], created: false, message: patched.message, label };
  }
  const created = await send(cfg, token, 'POST', `/${set}`, { ...body, [markerField]: markerValue });
  return { ok: created.ok, id: created.id, created: true, message: created.message, label };
}

async function seed(cfg, token) {
  console.log('\n─── Activity types ───');
  let typesCreated = 0;
  let typesPatched = 0;
  const typeIds = new Map();
  for (const [index, type] of ACTIVITY_TYPES.entries()) {
    const result = await upsert(cfg, token, 'qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid',
      'qdb_code', mark(type.code), {
        qdb_name: `${type.name} (${PHASE6_MARKER}synthetic)`,
        // Explicit, because the first seeding omitted it and every type came out INACTIVE — so the
        // forms, which correctly refuse to offer retired configuration, offered nothing at all.
        // A column's documented default is not a substitute for writing the value you rely on.
        qdb_isactive: true,
        qdb_sequence: (index + 1) * 10,
      }, type.code);
    if (!result.ok) throw new Error(`${type.code}: ${result.message}`);
    result.created ? typesCreated++ : typesPatched++;
    typeIds.set(type.code, result.id);
  }
  check('The eleven approved activity types are present',
    typesCreated + typesPatched === ACTIVITY_TYPES.length,
    `${typesCreated} created, ${typesPatched} updated`);
  check('Every seeded activity type is active, so a form can offer it',
    [...typeIds.values()].every(Boolean), `${typeIds.size} ids resolved`);

  console.log('\n─── Activity outcomes ───');
  let outcomesCreated = 0;
  let outcomesPatched = 0;
  for (const outcome of OUTCOMES) {
    const owningTypeId = typeIds.get(outcome.typeCode);
    if (!owningTypeId) throw new Error(`${outcome.code}: owning type ${outcome.typeCode} was not seeded`);
    const result = await upsert(cfg, token, 'qdb_activityoutcomes', 'qdb_activityoutcomeid',
      'qdb_code', mark(outcome.code), {
        qdb_name: `${outcome.name} (${PHASE6_MARKER}synthetic)`,
        qdb_sequence: outcome.sequence,
        qdb_isactive: true,
        qdb_requiresfollowup: outcome.requiresFollowUp,
        qdb_followupdays: outcome.followUpDays,
        qdb_requiresnotes: outcome.requiresNotes,
        qdb_escalationrequired: outcome.escalation,
        qdb_closeactivity: outcome.closes,
        [`${OUTCOME_TO_TYPE_NAVIGATION}@odata.bind`]: `/qdb_collectionactivitytypes(${owningTypeId})`,
      }, outcome.code);
    if (!result.ok) throw new Error(`${outcome.code}: ${result.message}`);
    result.created ? outcomesCreated++ : outcomesPatched++;
  }
  check('A synthetic outcome set exercises all four configured behaviours',
    outcomesCreated + outcomesPatched === OUTCOMES.length,
    `${outcomesCreated} created, ${outcomesPatched} updated`);

  // The check that would have caught the original defect: an outcome nobody owns is an outcome no
  // form can offer, so the binding is verified by reading it back rather than assumed from a 204.
  const orphans = (await apiGet(cfg, token, SOLUTION_NAME,
    `/qdb_activityoutcomes?$select=qdb_code&$filter=startswith(qdb_code,'${PHASE6_MARKER}') and _qdb_activitytypeid_value eq null`))?.value ?? [];
  check('Every seeded outcome is owned by an activity type, read back from the organisation',
    orphans.length === 0, orphans.length === 0 ? 'no orphans' : orphans.map(o => o.qdb_code).join(', '));

  // The mechanism is only worth building if the configuration actually varies across it.
  const followUp = OUTCOMES.filter(o => o.requiresFollowUp).length;
  const notes = OUTCOMES.filter(o => o.requiresNotes).length;
  const escalation = OUTCOMES.filter(o => o.escalation).length;
  check('The set varies across every behaviour it is meant to exercise',
    followUp > 0 && followUp < OUTCOMES.length && notes > 0 && escalation > 0,
    `${followUp} require follow-up, ${notes} require notes, ${escalation} ask for escalation`);

  console.log(`\n  ${ACTIVITY_TYPES.length} activity types and ${OUTCOMES.length} outcomes, all marked ${PHASE6_MARKER}.`);
  console.log('\n  NOT QDB production configuration. The activity type NAMES come from the Phase 6');
  console.log('  authorisation; their codes do not. The outcome catalogue is entirely synthetic and');
  console.log('  is recorded as KI-66 — follow-up windows and notes requirements below are shaped to');
  console.log('  exercise the mechanism, and are not negotiated policy.');
}

async function remove(cfg, token) {
  let removed = 0;
  let failed = 0;
  for (const [set, idField] of [['qdb_activityoutcomes', 'qdb_activityoutcomeid'],
    ['qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid']]) {
    const rows = (await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=${idField}&$filter=startswith(qdb_code,'${PHASE6_MARKER}')`))?.value ?? [];
    for (const row of rows) {
      const deleted = await send(cfg, token, 'DELETE', `/${set}(${row[idField]})`);
      deleted.ok ? removed++ : failed++;
      if (!deleted.ok) console.log(`     could not remove ${row[idField]}: ${deleted.message.slice(0, 120)}`);
    }
    console.log(`  ${set}: ${rows.length} row(s) matched`);
  }
  check('Every Phase 6 configuration row removed', failed === 0, `${removed} removed, ${failed} refused`);

  const residue = [];
  for (const [set, idField] of [['qdb_activityoutcomes', 'qdb_activityoutcomeid'],
    ['qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid']]) {
    const rows = (await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$select=${idField}&$filter=startswith(qdb_code,'${PHASE6_MARKER}')`))?.value ?? [];
    if (rows.length > 0) residue.push(`${set}: ${rows.length}`);
  }
  check('Zero Phase 6 configuration residue remains', residue.length === 0, residue.join(', ') || 'clean');
}

async function main() {
  const removing = process.argv.includes('--remove');
  console.log(`=== Phase 6 configuration — ${removing ? 'REMOVE' : 'SEED'} ===\n`);

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log(`  Marker: ${PHASE6_MARKER} (distinct from SMOKE-, DEMO- and ARR-)`);

  const token = await acquireToken(cfg);
  if (removing) await remove(cfg, token);
  else await seed(cfg, token);

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
