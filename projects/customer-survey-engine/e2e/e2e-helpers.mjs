/**
 * Shared helpers for the survey end-to-end tests against a live (test) org.
 *
 * @module survey-e2e/helpers
 */
import { createDataverseClient } from '../provisioning/lib/dataverse-client.mjs';
import { stepName } from '../provisioning/lib/plugin-payloads.mjs';

export const DISBURSEMENT_TABLE = 'qdb_payment_authorization_ticket';
export const PAYMENT_PROCESSED = Object.freeze({ statecode: 1, statuscode: 751090050 });
export const SAVED = Object.freeze({ statecode: 0, statuscode: 1 });
export const LETTER_OF_CREDIT = 751090000;
export const REMITTANCE = 751090001;
export const QDB_DIGITAL = 751090002;
const POLL_MS = 10000;
const POLL_ATTEMPTS = 30;

/** A connected test session: client, row reads, data writes and a PASS/FAIL tally. */
export async function openSession() {
  const client = await createDataverseClient({ solutionUniqueName: 'SurveyEngine' });
  const results = [];
  return {
    client,
    write: (method, path, body) => client.sendOutsideSolution(method, path, body),
    rows: async (path) => (await client.send('GET', path)).json.value,
    check: (label, passed, detail = '') => { results.push(passed); console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); },
    allPassed: () => results.every(Boolean),
  };
}

/** Polls until the query returns rows, up to five minutes; answers [] on timeout. */
export async function pollFor(describe, query) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const found = await query();
    if (found.length > 0) { if (attempt > 1) console.log(''); return found; }
    process.stdout.write(attempt === 1 ? `  waiting for ${describe}` : '.');
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.log('');
  return [];
}

/** Returns the id of the first row matching the filter, creating it from `body` when none does. */
export async function ensureRow(session, { entitySet, idAttribute, filter }, body) {
  const found = await session.rows(`${entitySet}?$select=${idAttribute}&$filter=${encodeURIComponent(filter)}&$top=1`);
  if (found.length > 0) return found[0][idAttribute];
  return (await session.write('POST', entitySet, body)).entityId;
}

/** Enables or disables the disbursement Update step of SurveyTriggerPlugin. */
export async function setDisbursementStep(session, isEnabled) {
  const [step] = await session.rows(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '${stepName('Update', DISBURSEMENT_TABLE)}'`);
  await session.write('PATCH', `sdkmessageprocessingsteps(${step.sdkmessageprocessingstepid})`, isEnabled ? { statecode: 0, statuscode: 1 } : { statecode: 1, statuscode: 2 });
}

/** Creates a Digital-origin test disbursement for the customer and answers its id. */
export async function createDisbursement(session, { name, accountId, type }) {
  const { entityId } = await session.write('POST', 'qdb_payment_authorization_tickets', {
    // The Web API binds by navigation property, which keeps this lookup's schema-name casing.
    qdb_name: name, 'qdb_Customer_Name@odata.bind': `/accounts(${accountId})`, qdb_disbursement_type_1: type, qdb_source_location: QDB_DIGITAL,
  });
  return entityId;
}

/** Moves a disbursement to a status (statecode + statuscode). */
export async function moveDisbursement(session, recordId, status) {
  await session.write('PATCH', `qdb_payment_authorization_tickets(${recordId})`, status);
}

/** The Disbursements source row (id and current active flag). */
export async function findDisbursementSource(session) {
  const [source] = await session.rows(`qdb_survey_sources?$select=qdb_survey_sourceid,qdb_is_active&$filter=qdb_table_logical_name eq '${DISBURSEMENT_TABLE}'`);
  return source;
}

/**
 * Waits until the async jobs about a record have run. Two completions seconds apart can otherwise
 * both be evaluated after both are complete, and a live milestone count then fires on the first
 * record instead of the one that reached it. A job is first awaited for up to a minute (it may not
 * be queued yet); successful jobs delete themselves, so "none left unfinished" means done.
 */
export async function waitForJobsOn(session, recordId) {
  const unfinished = () => session.rows(`asyncoperations?$select=asyncoperationid,statecode&$filter=_regardingobjectid_value eq ${recordId} and statecode ne 3`);
  for (let attempt = 0; attempt < 6 && (await unfinished()).length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  for (let attempt = 0; attempt < POLL_ATTEMPTS && (await unfinished()).length > 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

/** Failed SurveyTriggerPlugin system jobs created since the given ISO time. */
export async function failedPluginJobsSince(session, startedOn) {
  return session.rows(`asyncoperations?$select=name,message,friendlymessage&$filter=createdon ge ${startedOn} and statuscode eq 31 and contains(name,'SurveyTriggerPlugin')`);
}

const SYSTEM_ADMINISTRATOR_TEMPLATE = '627090ff-40a3-4053-8790-584edc5be201';

/** Mirrors AdministratorCheck: the System Administrator role directly or through a team. */
export async function isAdministrator(session, userId) {
  const direct = `_roletemplateid_value eq ${SYSTEM_ADMINISTRATOR_TEMPLATE} and systemuserroles_association/any(u:u/systemuserid eq ${userId})`;
  if ((await session.rows(`roles?$select=roleid&$filter=${encodeURIComponent(direct)}`)).length > 0) return true;
  const viaTeam = `_roletemplateid_value eq ${SYSTEM_ADMINISTRATOR_TEMPLATE} and teamroles_association/any(t:t/teammembership_association/any(u:u/systemuserid eq ${userId}))`;
  return (await session.rows(`roles?$select=roleid&$filter=${encodeURIComponent(viaTeam)}`)).length > 0;
}

/** The first enabled interactive user without System Administrator, or null when none of the first 25 qualifies. */
export async function findNonAdministrator(session) {
  const users = await session.rows(`systemusers?$select=systemuserid,fullname&$filter=isdisabled eq false and accessmode eq 0 and applicationid eq null&$top=25`);
  for (const user of users) if (!(await isAdministrator(session, user.systemuserid))) return user;
  return null;
}

/** A run-unique suffix, so each run uses fresh records. */
export function runStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An encoded OData filter matching any of the values: `column eq v1 or column eq v2 …`. */
export const anyOf = (column, values) => encodeURIComponent(values.map((value) => `${column} eq ${value}`).join(' or '));
