/**
 * Test data for the A3 performance test (a3-performance.mjs): PERF-TEST-A3 accounts and disbursements,
 * the daily-run setup, and their complete removal. Every record carries the PERF-TEST-A3 prefix so a
 * clean-up can find leftovers of an interrupted run.
 *
 * @module survey-e2e/a3-perf-data
 */
import { LETTER_OF_CREDIT, QDB_DIGITAL } from './e2e-helpers.mjs';

export const PREFIX = 'PERF-TEST-A3';
export const DAILY_SETUP_NAME = `${PREFIX} daily run`;
const DESCRIPTION = 'Customer Survey Engine A3 performance test record. Safe to delete.';
const POOL_SIZE = 6;
const ID_CHUNK = 25;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries a request the service throttled (429), backing off; any other error is thrown. */
async function withRetry(call) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (error.status !== 429 || attempt >= 4) throw error;
      await sleep(5000 * attempt);
    }
  }
}

/** Runs `task` over `items` with POOL_SIZE requests in flight; answers the results in item order. */
export async function inPool(items, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await withRetry(() => task(items[index], index));
    }
  };
  await Promise.all(Array.from({ length: POOL_SIZE }, worker));
  return results;
}

/** Creates `count` accounts, each with one Letter of Credit disbursement; answers their ids. */
export async function createCustomers(session, { label, count, createdOn }) {
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1).padStart(3, '0'));
  return inPool(numbers, async (number) => {
    const name = `${PREFIX}-${label}-${number}`;
    const { entityId: accountId } = await session.write('POST', 'accounts', { name, description: DESCRIPTION });
    const { entityId: recordId } = await session.write('POST', 'qdb_payment_authorization_tickets', {
      qdb_name: name, 'qdb_Customer_Name@odata.bind': `/accounts(${accountId})`, qdb_disbursement_type_1: LETTER_OF_CREDIT,
      qdb_source_location: QDB_DIGITAL, ...(createdOn ? { overriddencreatedon: createdOn } : {}),
    });
    return { accountId, recordId };
  });
}

/** The daily-run setup: a quarterly "active in period" trigger over the Disbursements source. */
export async function createDailySetup(session, { sourceId, formCode }) {
  const { entityId: setupId } = await session.write('POST', 'qdb_survey_setups', {
    qdb_name: DAILY_SETUP_NAME, qdb_form_code: formCode, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000002, qdb_expiry_days: 14, qdb_is_active: true,
  });
  await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `${DAILY_SETUP_NAME} - trigger`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    'qdb_schedule_population_source_id@odata.bind': `/qdb_survey_sources(${sourceId})`,
    qdb_trigger_kind: 100000002, qdb_schedule_period: 100000001, qdb_schedule_population: 100000001, qdb_is_active: true,
  });
  return setupId;
}

const chunksOf = (values) => Array.from({ length: Math.ceil(values.length / ID_CHUNK) }, (_, index) => values.slice(index * ID_CHUNK, (index + 1) * ID_CHUNK));
const anyOf = (column, ids) => encodeURIComponent(ids.map((id) => `${column} eq ${id}`).join(' or '));

/** Rows of `entitySet` whose customer is one of the accounts, read in chunks to keep URLs short. */
async function rowsForCustomers(session, { entitySet, idAttribute, accountIds }) {
  const pages = await inPool(chunksOf(accountIds), (ids) => session.rows(`${entitySet}?$select=${idAttribute}&$filter=${anyOf('_qdb_customer_id_value', ids)}`));
  return pages.flat().map((row) => row[idAttribute]);
}

/** Everything a run created, found by prefix: answers the ids by table. */
export async function findTestData(session) {
  const accounts = await session.rows(`accounts?$select=accountid&$filter=startswith(name,'${PREFIX}-')`);
  const accountIds = accounts.map((row) => row.accountid);
  const records = await session.rows(`qdb_payment_authorization_tickets?$select=qdb_payment_authorization_ticketid&$filter=startswith(qdb_name,'${PREFIX}-')`);
  const setups = await session.rows(`qdb_survey_setups?$select=qdb_survey_setupid&$filter=qdb_name eq '${DAILY_SETUP_NAME}'`);
  const setupIds = setups.map((row) => row.qdb_survey_setupid);
  const triggers = setupIds.length ? await session.rows(`qdb_survey_triggers?$select=qdb_survey_triggerid&$filter=${anyOf('_qdb_survey_setup_id_value', setupIds)}`) : [];
  return {
    invitations: await rowsForCustomers(session, { entitySet: 'qdb_survey_invitations', idAttribute: 'qdb_survey_invitationid', accountIds }),
    suppressionLogs: await rowsForCustomers(session, { entitySet: 'qdb_survey_suppression_logs', idAttribute: 'qdb_survey_suppression_logid', accountIds }),
    records: records.map((row) => row.qdb_payment_authorization_ticketid), accountIds, triggers: triggers.map((row) => row.qdb_survey_triggerid), setupIds,
  };
}

const DELETE_ORDER = [
  ['invitations', 'qdb_survey_invitations'], ['suppressionLogs', 'qdb_survey_suppression_logs'], ['records', 'qdb_payment_authorization_tickets'],
  ['accountIds', 'accounts'], ['triggers', 'qdb_survey_triggers'], ['setupIds', 'qdb_survey_setups'],
];

/** Deletes everything the run created, children first; answers how many rows of each table went. */
export async function deleteTestData(session) {
  const found = await findTestData(session);
  const deleted = {};
  for (const [key, entitySet] of DELETE_ORDER) {
    await inPool(found[key], (id) => session.write('DELETE', `${entitySet}(${id})`));
    deleted[key] = found[key].length;
  }
  return deleted;
}

/** Total rows still present after a clean-up: zero means nothing was left behind. */
export async function countLeftovers(session) {
  const found = await findTestData(session);
  return Object.values(found).reduce((total, ids) => total + ids.length, 0);
}
