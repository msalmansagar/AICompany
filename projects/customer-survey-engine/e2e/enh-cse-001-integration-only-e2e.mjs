/**
 * ENH-CSE-001 on a live (test) org: an account holding ONLY Survey Integration (no other survey role) can call the
 * integration APIs, and the role still gives it no read on survey tables. A non-administrator user without any
 * survey role is given Survey Integration for the test and ALWAYS has it removed in `finally`.
 *   before: GetSurvey refused; survey tables unreadable
 *   with the role: GetSurvey succeeds; survey tables still unreadable
 * Account and contact reads are reported, not judged: the user may hold other (non-survey) CRM roles.
 * Uses an existing open invitation (read-only GetSurvey). Live writes: the role assignment only. Go-ahead needed.
 *
 *   node --env-file=<dfe>/scripts/.env enh-cse-001-integration-only-e2e.mjs
 */
import { openSession, findUserWithoutRoles } from './e2e-helpers.mjs';

const SURVEY_ROLES = ['Survey Admin', 'Survey Analyst', 'Survey Integration', 'Survey Scheduler', 'Survey Data Officer'];
const SURVEY_TABLES = ['qdb_survey_responses', 'qdb_survey_invitations', 'qdb_survey_answers'];
const PENDING = 100000000;

const outcome = (promise) => promise.then(() => 'allowed', (error) => error.message);

async function integrationRoleFor(session, user) {
  const [row] = await session.rows(`systemusers?$select=_businessunitid_value&$filter=systemuserid eq ${user.systemuserid}`);
  const [role] = await session.rows(`roles?$select=roleid&$filter=name eq 'Survey Integration' and _businessunitid_value eq ${row._businessunitid_value}`);
  if (!role) throw new Error(`no Survey Integration role in ${user.fullname}'s business unit`);
  return role.roleid;
}

async function openInvitation(session) {
  const [invitation] = await session.rows(`qdb_survey_invitations?$select=qdb_survey_invitationid,_qdb_customer_id_value&$filter=qdb_status eq ${PENDING} and qdb_expires_on gt ${new Date().toISOString()} and _qdb_customer_id_value ne null&$top=1&$orderby=createdon desc`);
  if (!invitation) throw new Error('no open, unexpired invitation to read; run b6-integration-api-e2e.mjs first');
  return { InvitationId: invitation.qdb_survey_invitationid, CallerCustomerId: invitation._qdb_customer_id_value };
}

async function probe(session, user, invitation) {
  const getSurvey = await outcome(session.client.sendAsUser('POST', 'qdb_srv_GetSurvey', invitation, user.systemuserid));
  const tables = {};
  for (const table of [...SURVEY_TABLES, 'accounts', 'contacts']) tables[table] = await outcome(session.client.sendAsUser('GET', `${table}?$top=1`, undefined, user.systemuserid));
  return { getSurvey, tables };
}

function report(session, label, result, isRoleHeld) {
  console.log(`  ${label}: GetSurvey ${result.getSurvey === 'allowed' ? 'allowed' : 'refused'}`);
  session.check(`${label}: GetSurvey ${isRoleHeld ? 'succeeds' : 'is refused'}`, (result.getSurvey === 'allowed') === isRoleHeld, result.getSurvey.slice(0, 140));
  for (const table of SURVEY_TABLES) session.check(`${label}: ${table} cannot be read directly`, result.tables[table] !== 'allowed', result.tables[table].slice(0, 100));
  for (const table of ['accounts', 'contacts']) console.log(`    (info) ${table}: ${result.tables[table] === 'allowed' ? 'readable through the user\'s other roles' : 'not readable'}`);
}

async function run() {
  const session = await openSession();
  console.log(`ENH-CSE-001 Integration-only E2E — ${session.client.orgUrl}`);
  const user = await findUserWithoutRoles(session, SURVEY_ROLES);
  if (!user) throw new Error('no non-administrator user without survey roles among the first 25');
  const roleId = await integrationRoleFor(session, user);
  const invitation = await openInvitation(session);
  console.log(`  test user: ${user.fullname}; invitation ${invitation.InvitationId}`);
  report(session, 'without the role', await probe(session, user, invitation), false);
  try {
    await session.client.send('POST', `systemusers(${user.systemuserid})/systemuserroles_association/$ref`, { '@odata.id': `${session.client.orgUrl}/api/data/v9.2/roles(${roleId})` });
    console.log('  Survey Integration given to the test user');
    report(session, 'with only Survey Integration', await probe(session, user, invitation), true);
  } finally {
    await session.client.send('DELETE', `systemusers(${user.systemuserid})/systemuserroles_association(${roleId})/$ref`);
    const left = await session.rows(`roles?$select=roleid&$filter=roleid eq ${roleId} and systemuserroles_association/any(u:u/systemuserid eq ${user.systemuserid})`);
    session.check('role removed again', left.length === 0);
  }
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
