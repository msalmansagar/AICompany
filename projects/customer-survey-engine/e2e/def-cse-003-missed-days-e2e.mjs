/**
 * DEF-CSE-003 on a live (test) org: missed scheduler days are caught up, and an earlier RunDate re-run does not
 * move the daily gate back.
 *   1. Daily Passes Completed On is set to 3 days ago; Pass = Daily for today must name the two missed days and
 *      record today.
 *   2. Pass = Daily for 10 days ago must leave today recorded.
 * Every date touched is checked NOT to be the 1st of a month: on the 1st an active scheduled trigger would survey
 * the org's real accounts. The gate is restored to its starting value at the end. Live writes: go-ahead needed.
 *
 *   node --env-file=<dfe>/scripts/.env def-cse-003-missed-days-e2e.mjs
 */
import { openSession } from './e2e-helpers.mjs';

const ISO_DAY = 10;
const day = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, ISO_DAY); };

function refuseFirstOfMonth(dates) {
  const firsts = dates.filter((date) => date.endsWith('-01'));
  if (firsts.length > 0) throw new Error(`refusing: ${firsts.join(', ')} is the 1st of a month; an active scheduled trigger would survey real accounts. Run on another day.`);
}

async function settingsRow(session) {
  const [row] = await session.rows('qdb_survey_settingses?$select=qdb_survey_settingsid,qdb_daily_passes_completed_on');
  return row;
}

async function runDaily(session, runDate) {
  const { json } = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: runDate, Pass: 'Daily' });
  console.log(`  Daily for ${runDate}: ${json.Summary}`);
  return json;
}

async function run() {
  refuseFirstOfMonth([day(-2), day(-1), day(0), day(-10)]);
  const session = await openSession();
  console.log(`DEF-CSE-003 E2E — ${session.client.orgUrl}`);
  const settings = await settingsRow(session);
  const original = settings.qdb_daily_passes_completed_on;
  console.log(`  gate at start: ${original}`);
  try {
    await session.write('PATCH', `qdb_survey_settingses(${settings.qdb_survey_settingsid})`, { qdb_daily_passes_completed_on: day(-3) });
    const caughtUp = await runDaily(session, day(0));
    session.check(`names missed day ${day(-2)}`, caughtUp.Summary.includes(`Missed day ${day(-2)}`));
    session.check(`names missed day ${day(-1)}`, caughtUp.Summary.includes(`Missed day ${day(-1)}`));
    session.check('completes', caughtUp.IsComplete === true);
    session.check(`records ${day(0)}`, String((await settingsRow(session)).qdb_daily_passes_completed_on).startsWith(day(0)));
    await runDaily(session, day(-10));
    session.check(`an earlier RunDate (${day(-10)}) leaves ${day(0)} recorded`, String((await settingsRow(session)).qdb_daily_passes_completed_on).startsWith(day(0)));
  } finally {
    await session.write('PATCH', `qdb_survey_settingses(${settings.qdb_survey_settingsid})`, { qdb_daily_passes_completed_on: original ? original.slice(0, ISO_DAY) : null });
    console.log(`  gate restored to ${original}`);
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
