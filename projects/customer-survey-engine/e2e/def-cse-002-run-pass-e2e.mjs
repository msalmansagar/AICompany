/**
 * DEF-CSE-002 on a live (test) org: qdb_srv_RunDueSurveys runs one pass per call when Pass is given, so the
 * scheduler can keep the One-time pass and the daily passes in separate transactions.
 *   Pass = OneTime  → the daily passes are not run, and the summary says so
 *   Pass = Daily    → the One-time pass is not run, the daily passes run (or were already done today)
 *   Pass = Daily    → again: already completed for this date
 *   Pass = Weekly   → refused
 * Live writes: the Daily call may release or discard postponed invitations and records the run date. Go-ahead needed.
 *
 *   node --env-file=<dfe>/scripts/.env def-cse-002-run-pass-e2e.mjs
 */
import { openSession } from './e2e-helpers.mjs';

const today = () => new Date().toISOString().slice(0, 10);

async function runPass(session, pass) {
  const { json } = await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: today(), Pass: pass });
  console.log(`  Pass=${pass}: IsComplete ${json.IsComplete} — ${json.Summary}`);
  return json;
}

async function refusal(session, pass) {
  try {
    await session.client.send('POST', 'qdb_srv_RunDueSurveys', { RunDate: today(), Pass: pass });
    return null;
  } catch (error) {
    return error.message;
  }
}

async function run() {
  const session = await openSession();
  console.log(`DEF-CSE-002 E2E — ${session.client.orgUrl}`);
  const oneTime = await runPass(session, 'OneTime');
  session.check('OneTime: the daily passes are left to their own call', oneTime.Summary.includes('Daily passes: not run in this call'));
  session.check('OneTime: the One-time pass ran', oneTime.Summary.startsWith('One-time:'));
  const daily = await runPass(session, 'Daily');
  session.check('Daily: the One-time pass is left to its own call', daily.Summary.startsWith('One-time pass: not run in this call'));
  session.check('Daily: the daily passes ran or were already done today', /Postponed|already completed/i.test(daily.Summary) && daily.IsComplete === true);
  const [settings] = await session.rows('qdb_survey_settingses?$select=qdb_daily_passes_completed_on');
  session.check('Daily: today is recorded as done', String(settings.qdb_daily_passes_completed_on).startsWith(today()), settings.qdb_daily_passes_completed_on);
  const again = await runPass(session, 'Daily');
  session.check('Daily again: already completed for this date', again.Summary.includes('already completed for this date'));
  const refused = await refusal(session, 'Weekly');
  session.check('Weekly: refused with the allowed values named', Boolean(refused) && refused.includes('OneTime, Daily or empty'), refused);
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
