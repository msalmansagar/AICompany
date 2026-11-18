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
// "My" views are checked separately (QA-D1): raw they must be refused, pinned to a user they must count that user's.
const VIEWS = ['Active Accounts', 'Accounts Being Followed', 'Inactive Accounts'];

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

// QA-D1: the user owning the most active accounts, so "My Active Accounts" pinned to them has a known answer.
async function busiestOwner(session) {
  const owners = await session.rows('accounts?$select=_ownerid_value&$filter=statecode eq 0&$top=500');
  const counts = owners.reduce((tally, row) => ({ ...tally, [row._ownerid_value]: (tally[row._ownerid_value] || 0) + 1 }), {});
  const [ownerId, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return { ownerId, count };
}

async function checkMyViews(session, setupId) {
  const raw = await viewFetchXml(session, 'My Active Accounts');
  if (!raw) { session.check('"My Active Accounts" exists on this org', false); return; }
  const refused = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: 'QA view audience - My (raw)', 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_trigger_kind: ONE_TIME, qdb_audience: FILTER, qdb_audience_fetchxml: raw, qdb_is_active: false,
  }).then((created) => session.write('DELETE', `qdb_survey_triggers(${created.entityId})`).then(() => 'saved'), (error) => error.message);
  session.check('raw "My Active Accounts" (current user) is refused at save', refused.includes('current user'), refused.slice(0, 140));
  const { ownerId, count } = await busiestOwner(session);
  const core = (await import('../webresources/trigger-audience-core.js')).default;
  const pinned = await previewFetchXml(session, setupId, core.resolveCurrentUser(raw, ownerId));
  session.check(`"My Active Accounts" pinned to the owner of ${count} active account(s) previews exactly them`, pinned.count === count, pinned.outcome);
}

async function previewFetchXml(session, setupId, fetchXml) {
  const created = await session.write('POST', 'qdb_survey_triggers', {
    qdb_name: 'QA view audience - pinned', 'qdb_survey_setup_id@odata.bind': `/qdb_survey_setups(${setupId})`,
    qdb_trigger_kind: ONE_TIME, qdb_audience: FILTER, qdb_audience_fetchxml: fetchXml, qdb_is_active: false,
  });
  try {
    const { json } = await session.client.send('POST', 'qdb_srv_PreviewAudience', { TriggerId: created.entityId });
    return { count: json.Count, outcome: `${json.Count} customer(s)` };
  } catch (error) {
    return { count: null, outcome: `preview failed: ${error.message.slice(0, 140)}` };
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
  await checkMyViews(session, setupId);
  console.log('  temporary triggers deleted; nothing was sent');
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
