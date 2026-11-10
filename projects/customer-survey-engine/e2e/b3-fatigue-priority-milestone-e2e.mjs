/**
 * B3 end-to-end test on a live (test) org (FR-CSE-034..041, 043). Two fresh customers per run:
 *
 *   Customer B (fatigue)   D1 LC completes  -> completion invitation, Pending
 *                          D2 LC completes  -> 2nd qualifying = milestone; customer fatigued:
 *                                              completion dropped (Fatigue), milestone Postponed (M1)
 *   Customer C (priority)  D1 Remittance    -> counts for the milestone only; nothing sent
 *                          D2 LC completes  -> completion + milestone fire together; milestone
 *                                              wins (Pending, M1), completion logged PriorityLost
 *
 * Uses the B2 completion setup plus a milestone setup with N = 2. Temporarily activates the
 * Disbursements source, both setups and the Update step; all ALWAYS restored in `finally`.
 * Requires the B3 plugin assembly on the org and qdb_fatigue_min_days > 0. Live writes:
 * run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env b3-fatigue-priority-milestone-e2e.mjs
 */
import {
  openSession, pollFor, setDisbursementStep, createDisbursement, moveDisbursement, findDisbursementSource,
  failedPluginJobsSince, runStamp, PAYMENT_PROCESSED, LETTER_OF_CREDIT, REMITTANCE,
} from './e2e-helpers.mjs';
import { ensureSurveyForm, ensureCompletionSetup, ensureMilestoneSetup, COMPLETION_FORM_CODE, MILESTONE_FORM_CODE } from './e2e-fixtures.mjs';

const STATUS = { pending: 100000000, postponed: 100000001 };
const REASON = { fatigue: 100000000, priorityLost: 100000001 };
const INVITATION_COLUMNS = 'qdb_status,qdb_milestone_index,qdb_dedupe_key,qdb_source_record_id,_qdb_survey_setup_id_value';

const invitationsOf = (session, accountId) => session.rows(`qdb_survey_invitations?$select=${INVITATION_COLUMNS}&$filter=_qdb_customer_id_value eq ${accountId}`);
const suppressionsFor = (session, recordId) => session.rows(`qdb_survey_suppression_logs?$select=qdb_reason,qdb_detail,_qdb_survey_trigger_id_value&$filter=qdb_source_record_id eq '${recordId}'`);

async function createCustomer(session, label, stamp) {
  const name = `Survey E2E ${label} ${stamp}`;
  return (await session.write('POST', 'accounts', { name, description: 'Test customer for the Customer Survey Engine B3 end-to-end test. Safe to delete.' })).entityId;
}

async function completeDisbursement(session, { accountId, type, name }) {
  const recordId = await createDisbursement(session, { name, accountId, type });
  await moveDisbursement(session, recordId, PAYMENT_PROCESSED);
  return recordId;
}

async function runFatigueScenario(session, { stamp, completion, milestone }) {
  console.log('Customer B — fatigue');
  const accountId = await createCustomer(session, 'B', stamp);
  await completeDisbursement(session, { accountId, type: LETTER_OF_CREDIT, name: `SURVEY-E2E-B1-${stamp}` });
  const first = await pollFor('the first completion invitation', () => invitationsOf(session, accountId));
  session.check('D1: completion invitation Pending', first.length === 1 && first[0]._qdb_survey_setup_id_value === completion.setupId && first[0].qdb_status === STATUS.pending);
  const secondId = await completeDisbursement(session, { accountId, type: LETTER_OF_CREDIT, name: `SURVEY-E2E-B2-${stamp}` });
  const postponed = await pollFor('the postponed milestone invitation', async () => (await invitationsOf(session, accountId)).filter((i) => i._qdb_survey_setup_id_value === milestone.setupId));
  session.check('D2: milestone M1 Postponed (customer fatigued)', postponed.length === 1 && postponed[0].qdb_status === STATUS.postponed && postponed[0].qdb_milestone_index === 1,
    postponed.map((i) => `status ${i.qdb_status} index ${i.qdb_milestone_index}`).join('; '));
  const logs = await pollFor('the Fatigue suppression row', () => suppressionsFor(session, secondId));
  session.check('D2: completion trigger dropped with reason Fatigue', logs.length === 1 && logs[0].qdb_reason === REASON.fatigue && logs[0]._qdb_survey_trigger_id_value === completion.triggerId,
    logs.map((l) => `${l.qdb_reason}: ${l.qdb_detail}`).join('; '));
  session.check('customer B has exactly two invitations', (await invitationsOf(session, accountId)).length === 2);
}

async function runPriorityScenario(session, { stamp, completion, milestone }) {
  console.log('Customer C — priority');
  const accountId = await createCustomer(session, 'C', stamp);
  await completeDisbursement(session, { accountId, type: REMITTANCE, name: `SURVEY-E2E-C1-${stamp}` });
  const secondId = await completeDisbursement(session, { accountId, type: LETTER_OF_CREDIT, name: `SURVEY-E2E-C2-${stamp}` });
  const winners = await pollFor('the milestone invitation', () => invitationsOf(session, accountId));
  const winner = winners[0];
  session.check('D2: one invitation, the milestone M1, Pending', winners.length === 1 && winner._qdb_survey_setup_id_value === milestone.setupId && winner.qdb_milestone_index === 1 && winner.qdb_status === STATUS.pending,
    winners.map((i) => `setup ${i._qdb_survey_setup_id_value === milestone.setupId ? 'milestone' : 'completion'} status ${i.qdb_status} index ${i.qdb_milestone_index}`).join('; '));
  session.check('milestone fired on the record that reached it', winner?.qdb_source_record_id === secondId);
  const logs = await pollFor('the PriorityLost suppression row', () => suppressionsFor(session, secondId));
  session.check('D2: completion trigger logged PriorityLost', logs.length === 1 && logs[0].qdb_reason === REASON.priorityLost && logs[0]._qdb_survey_trigger_id_value === completion.triggerId,
    logs.map((l) => `${l.qdb_reason}: ${l.qdb_detail}`).join('; '));
}

async function prepare(session) {
  for (const formCode of [COMPLETION_FORM_CODE, MILESTONE_FORM_CODE]) {
    const published = await ensureSurveyForm(session, formCode);
    session.check(`form ${formCode} published`, published.length > 0, published.map((p) => `${p.qdb_language_code} v${p.qdb_published_version}`).join(', '));
  }
  const source = await findDisbursementSource(session);
  return { source, completion: await ensureCompletionSetup(session, source.qdb_survey_sourceid), milestone: await ensureMilestoneSetup(session, source.qdb_survey_sourceid) };
}

async function restore(session, { source, completion, milestone }) {
  await setDisbursementStep(session, false);
  await session.write('PATCH', `qdb_survey_sources(${source.qdb_survey_sourceid})`, { qdb_is_active: source.qdb_is_active });
  for (const setup of [completion, milestone]) await session.write('PATCH', `qdb_survey_setups(${setup.setupId})`, { qdb_is_active: false });
  console.log(`  restored: Update step disabled, source active=${source.qdb_is_active}, both test setups deactivated`);
}

async function run() {
  const startedOn = new Date().toISOString();
  const session = await openSession();
  console.log(`B3 E2E — ${session.client.orgUrl}`);
  const fixtures = await prepare(session);
  const settings = (await session.rows('qdb_survey_settingses?$select=qdb_fatigue_min_days&$top=1'))[0];
  session.check('fatigue limit is on for this org', (settings?.qdb_fatigue_min_days ?? 0) > 0, `${settings?.qdb_fatigue_min_days} days`);
  try {
    await session.write('PATCH', `qdb_survey_sources(${fixtures.source.qdb_survey_sourceid})`, { qdb_is_active: true });
    await setDisbursementStep(session, true);
    console.log('  source activated, Update step enabled');
    const context = { stamp: runStamp(), ...fixtures };
    await runFatigueScenario(session, context);
    await runPriorityScenario(session, context);
  } finally {
    await restore(session, fixtures);
  }
  const failures = await failedPluginJobsSince(session, startedOn);
  session.check('no failed SurveyTriggerPlugin system jobs', failures.length === 0, failures.map((f) => f.friendlymessage ?? f.message).join(' | ').slice(0, 300));
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
