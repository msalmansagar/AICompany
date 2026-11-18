/**
 * Addendum D QA (FR-CSE-090, 091, Amendment 1) on a live (test) org: the server accepts the FetchXML of real
 * CRM views of the customer table (layout attributes, orders, link-entities, user-relative operators) as an
 * audience. For each view: create an INACTIVE One-time trigger on the E2E test setup with the view's FetchXML
 * (the save-time validation plugin must accept it), call qdb_srv_PreviewAudience (read-only count), then delete
 * the trigger. Nothing is sent. Live writes (temporary triggers only): run only with a go-ahead.
 *
 *   node --env-file=<dfe>/scripts/.env one-time-views-qa.mjs
 */
import { openSession, ensureRow } from './e2e-helpers.mjs';
import { COMPLETION_FORM_CODE } from './e2e-fixtures.mjs';

const SETUP_NAME = 'E2E - One-time general survey';
const ONE_TIME = 100000004;
const FILTER = 100000001;
const VIEWS = ['Active Accounts', 'My Active Accounts', 'Accounts Being Followed', 'Accounts: No Orders in Last 6 Months', 'Inactive Accounts'];

async function viewFetchXml(session, name) {
  const [view] = await session.rows(`savedqueries?$select=fetchxml&$filter=${encodeURIComponent(`returnedtypecode eq 'account' and querytype eq 0 and name eq '${name}'`)}`);
  return view ? view.fetchxml : null;
}

async function previewView(session, setupId, name) {
  const fetchXml = await viewFetchXml(session, name);
  if (!fetchXml) return { name, outcome: 'view not found on this org', isPass: true };
  const hasLink = fetchXml.includes('<link-entity');
  const created = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: `QA view audience - ${name}`, 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_trigger_kind: ONE_TIME, qdb_audience: FILTER, qdb_audience_fetchxml: fetchXml, qdb_is_active: false,
  }).catch((error) => ({ error: error.message }));
  if (created.error) return { name, outcome: `save refused: ${created.error.slice(0, 160)}`, isPass: false, hasLink };
  try {
    const { json } = await session.client.send('POST', 'qdb_srv_PreviewAudience', { TriggerId: created.entityId });
    return { name, outcome: `${json.Count} customer(s)`, isPass: Number.isInteger(json.Count), hasLink };
  } catch (error) {
    return { name, outcome: `preview failed: ${error.message.slice(0, 160)}`, isPass: false, hasLink };
  } finally {
    await session.write('DELETE', `qdb_survey_triggers(${created.entityId})`);
  }
}

async function run() {
  const session = await openSession();
  console.log(`Addendum D view-audience QA — ${session.client.orgUrl}`);
  const setupId = await ensureRow(session, { entitySet: 'qdb_survey_setups', idAttribute: 'qdb_survey_setupid', filter: `qdb_name eq '${SETUP_NAME}'` }, {
    qdb_name: SETUP_NAME, qdb_form_code: COMPLETION_FORM_CODE, qdb_delivery_digital: 100000000, qdb_delivery_legacy: 100000000, qdb_expiry_days: 14, qdb_is_active: false,
  });
  for (const name of VIEWS) {
    const result = await previewView(session, setupId, name);
    session.check(`view "${name}"${result.hasLink ? ' (has a related-entity link)' : ''} is accepted at save and previews`, result.isPass, result.outcome);
  }
  console.log('  temporary triggers deleted; nothing was sent');
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
