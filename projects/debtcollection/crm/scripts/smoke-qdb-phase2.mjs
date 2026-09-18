/**
 * smoke-qdb-phase2.mjs
 * Runtime proof of the Phase 2 Core Collection model against the live sandbox, using the REAL
 * synchronisation service and repositories from `apps/api/dist` over the real Dataverse adapter —
 * the same code the Integration Service runs, not a re-implementation for the test.
 *
 * What it proves, on the organisation:
 *   • a MIS observation becomes a Collection Case with the customer bound through the Customer
 *     lookup and the facility identified by MIS identity alone — no facility record is consulted;
 *   • the plugins do their part: DefaultStatusAssigner opens the case at New, ActiveCaseGuard refuses
 *     a second active case, StatusTransitionValidator permits the cure path, ImmutabilityGuard
 *     freezes a completed promise;
 *   • replay is idempotent on the snapshot's alternate key;
 *   • an unknown customer and a malformed facility identity become exception rows, not cases;
 *   • a GraceMonitor observation is kept without a case.
 *
 * Every row it creates carries the `SMOKE-` marker and is removed at the end by the same cleaner the
 * Phase 1 close-out used, so the organisation is left as it was found.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/smoke-qdb-phase2.mjs [--keep]
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/** Loads the built Integration Service modules — the real code, not a copy. */
async function loadBuiltServices() {
  const importBuilt = async (rel) => import(pathToFileURL(resolve(root, rel)).href);
  const collection = await importBuilt('apps/api/dist/services/collection/index.js');
  const { PlatformConfigurationService } = await importBuilt('apps/api/dist/services/PlatformConfigurationService.js');
  const { DataverseClient, DataverseCrmAdapter } = await importBuilt('packages/dataverse-client/dist/index.js');
  return { ...collection, PlatformConfigurationService, DataverseClient, DataverseCrmAdapter };
}

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assertAuthorisedOrg(cfg) {
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  console.log(`  Organisation: ${host}`);
}

/** Direct write for the few things the smoke does outside the services (seeding, a deliberate refusal). */
async function write(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, { method, headers: buildHeaders(token, SOLUTION_NAME), ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.ok) return { ok: true, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  const text = await res.text();
  let message = text; try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false, message };
}

const stamp = Date.now().toString(36).toUpperCase();
const facilityA = `${SMOKE_MARKER}${stamp}-A`;
const facilityB = `${SMOKE_MARKER}${stamp}-B`;
const qid = `${SMOKE_MARKER}QID-${stamp}`;

const observation = (facilityNumber, overrides = {}) => ({
  customer: { nationalId: qid },
  facilityNumber, sourceSystem: 'HL',
  dpd: 45, arrearBucket: '31-60', loanBalance: 800000, totalArrears: 12500, installmentAmount: 6250,
  misAsOfDate: '2026-06-30', integrationBatchId: `SMOKE-BATCH-${stamp}`,
  ...overrides,
});

async function seedReferenceData(cfg, token) {
  const contact = await write(cfg, token, 'POST', '/contacts', { firstname: 'SMOKE', lastname: `Customer ${stamp}`, governmentid: qid });
  if (!contact.ok) throw new Error(`could not seed the smoke contact: ${contact.message}`);
  const activityType = await write(cfg, token, 'POST', '/qdb_collectionactivitytypes', {
    qdb_name: 'SMOKE Promise to Pay', qdb_code: `${SMOKE_MARKER}PTP-${stamp}`, qdb_category: 100000462,
    qdb_requiresapproval: false, qdb_requiresfollowup: false, qdb_amountrequired: true, qdb_notesrequired: false,
    qdb_attachmentallowed: false, qdb_requiresmisrevalidation: false, qdb_isactive: true,
  });
  if (!activityType.ok) throw new Error(`could not seed the smoke activity type: ${activityType.message}`);

  const existing = await apiGet(cfg, token, SOLUTION_NAME, '/qdb_platformconfigurations?$select=qdb_platformconfigurationid&$filter=qdb_organizationcode eq 100000140 and qdb_isactive eq true');
  let configurationSeeded = false;
  if ((existing?.value ?? []).length === 0) {
    const configuration = await write(cfg, token, 'POST', '/qdb_platformconfigurations', {
      qdb_name: `SMOKE Sandbox HL ${stamp}`, qdb_environmentcode: `${SMOKE_MARKER}${stamp}`,
      qdb_platformtype: 100000121, qdb_organizationcode: 100000140, qdb_customertype: 100000020,
      qdb_customerentity: 'contacts', qdb_customerbusinessidfield: 'governmentid',
      qdb_eligibilityrulesetcode: 'SMOKE-STATIC-EVALUATOR', qdb_snapshotpolicy: 100000280,
      qdb_featureflags: JSON.stringify({ snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'] }),
      qdb_isactive: true,
    });
    if (!configuration.ok) throw new Error(`could not seed the platform configuration: ${configuration.message}`);
    configurationSeeded = true;
  }
  return { contactId: contact.id, activityTypeCode: `${SMOKE_MARKER}PTP-${stamp}`, configurationSeeded };
}

async function main() {
  const keep = process.argv.includes('--keep');
  console.log('=== qdb_ Phase 2 smoke — Core Collection model on the live organisation ===\n');
  const cfg = loadConfig();
  assertAuthorisedOrg(cfg);
  const token = await acquireToken(cfg);
  const services = await loadBuiltServices();

  const client = new services.DataverseClient({ org: { orgKey: 'HL', baseUrl: cfg.orgUrl, apiVersion: cfg.apiVersion }, getAccessToken: async () => token });
  const crm = new services.DataverseCrmAdapter(client);

  console.log('\n─── Reference data ───');
  const seeded = await seedReferenceData(cfg, token);
  console.log(`  contact ${seeded.contactId}, activity type ${seeded.activityTypeCode}, configuration ${seeded.configurationSeeded ? 'seeded' : 'already present (using in-memory copy)'}`);

  try {
    console.log('\n─── Platform configuration ───');
    let configuration;
    if (seeded.configurationSeeded) {
      configuration = await new services.PlatformConfigurationService(crm, { apiVersion: cfg.apiVersion, cacheTtlMs: 60000 }).getConfiguration('HL');
      check('Platform configuration read from qdb_platformconfiguration', configuration.customerEntity === 'contacts' && configuration.snapshotPolicy === 'AllReceived', `customerEntity=${configuration.customerEntity} policy=${configuration.snapshotPolicy}`);
      check('Feature flags parsed from qdb_featureflags', Array.isArray(configuration.featureFlags?.snapshotKeyComposition), JSON.stringify(configuration.featureFlags));
    } else {
      configuration = {
        organizationCode: 'HL', platformType: 'Cloud', apiVersion: cfg.apiVersion, customerEntity: 'contacts', customerBusinessIdField: 'governmentid',
        eligibilityRulesetCode: 'SMOKE-STATIC-EVALUATOR', snapshotPolicy: 'AllReceived', defaultCustomerType: 'Individual', mappings: [],
        featureFlags: { snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'] },
      };
    }

    const cases = new services.CollectionCaseRepository(crm, { defaultCustomerType: configuration.defaultCustomerType });
    const snapshots = new services.DelinquencySnapshotRepository(crm, configuration.featureFlags.snapshotKeyComposition);
    const activities = new services.CollectionActivityRepository(crm);
    let decideOutcome = 'EligibleCreateCase';
    const logEntries = [];
    const sync = new services.DelinquencySyncService({
      configuration,
      customers: new services.CustomerResolutionService(crm, configuration),
      eligibility: new services.StaticEligibilityEvaluator(() => decideOutcome, 'smoke-static-evaluator'),
      cases, snapshots, exceptions: new services.IdentityExceptionRepository(crm),
      logger: { log: async (e) => { logEntries.push(e); } },
      episodePolicy: {},
      now: () => new Date().toISOString(),
    });

    console.log('\n─── New delinquency → Collection Case ───');
    const created = await sync.processRecord(observation(facilityA));
    check('Case created for the MIS facility identity', created.action === 'CaseCreated' && created.episodeNumber === 1, `${created.action} ${created.detail ?? ''}`);
    const caseRow = created.caseId ? await crm.retrieve({ entity: 'qdb_collectioncases', id: created.caseId }, ['statuscode', 'qdb_facilitynumber', 'qdb_facilitysourcesystem', 'qdb_episodenumber', 'qdb_casenumber', 'qdb_currentdpd', '_qdb_customerid_value']) : null;
    check('Customer bound through the Customer lookup to the contact', caseRow?._qdb_customerid_value === seeded.contactId, `_qdb_customerid_value=${caseRow?._qdb_customerid_value}`);
    check('Facility identity carried on the case, no facility record involved', caseRow?.qdb_facilitynumber === facilityA && caseRow?.qdb_facilitysourcesystem === 'HL', `${caseRow?.qdb_facilitysourcesystem}/${caseRow?.qdb_facilitynumber}`);
    check('Case opened at New by DefaultStatusAssigner', caseRow?.statuscode === 100000600, `statuscode=${caseRow?.statuscode}`);
    check('Cached MIS position written', caseRow?.qdb_currentdpd === 45, `qdb_currentdpd=${caseRow?.qdb_currentdpd}`);
    check('Snapshot written and linked to the case', created.snapshot?.written === true, JSON.stringify(created.snapshot));

    console.log('\n─── Replay and movement ───');
    const replay = await sync.processRecord(observation(facilityA, { integrationBatchId: `SMOKE-BATCH-${stamp}-RERUN` }));
    check('Same observation replayed: case updated, no second snapshot (alternate key)', replay.action === 'CaseUpdated' && replay.snapshot?.written === false, `${replay.action} ${JSON.stringify(replay.snapshot)}`);
    const moved = await sync.processRecord(observation(facilityA, { dpd: 75, arrearBucket: '61-90', misAsOfDate: '2026-07-31' }));
    check('Bucket movement: case updated, new snapshot', moved.action === 'CaseUpdated' && moved.snapshot?.written === true, `${moved.action} ${JSON.stringify(moved.snapshot)}`);

    console.log('\n─── One active case per facility (ActiveCaseGuard) ───');
    const duplicate = await write(cfg, token, 'POST', '/qdb_collectioncases', {
      qdb_casenumber: `${SMOKE_MARKER}${stamp}-DUP`, qdb_facilitynumber: facilityA, qdb_facilitysourcesystem: 'HL',
      qdb_customerbusinessid: qid, qdb_organizationcode: 100000140, qdb_episodenumber: 9, qdb_opendate: new Date().toISOString(),
      'qdb_customerid_contact@odata.bind': `/contacts(${seeded.contactId})`,
    });
    check('A second active case for the facility is refused by the plugin', !duplicate.ok && /already has an active Collection Case/.test(duplicate.message), duplicate.ok ? 'CREATED — guard did not fire' : duplicate.message.split('\n')[0].slice(0, 110));
    const secondFacility = await sync.processRecord(observation(facilityB));
    check('A different facility for the same customer gets its own case', secondFacility.action === 'CaseCreated', secondFacility.action);

    console.log('\n─── Promise to pay as a Collection Activity ───');
    const typeId = await activities.findActivityTypeId(seeded.activityTypeCode);
    check('Activity type resolved by code', typeId !== null, String(typeId));
    const ptpId = await activities.create({
      caseId: created.caseId, activityTypeCode: seeded.activityTypeCode, activityDate: new Date().toISOString(), status: 'Open',
      promise: { ptpDate: '2026-08-15', promisedAmount: 5000, promiseType: 'Full', status: 'Active' },
    }, typeId, `${SMOKE_MARKER}${stamp}-A1`);
    const ptpRow = await crm.retrieve({ entity: 'qdb_collectionactivities', id: ptpId }, ['statuscode', 'qdb_ptpstatus', 'subject']);
    check('Promise opened: activity Open, promise Active, subject composed', ptpRow?.statuscode === 100000640 && ptpRow?.qdb_ptpstatus === 100000080 && /SMOKE Promise to Pay/.test(ptpRow?.subject ?? ''), `statuscode=${ptpRow?.statuscode} ptp=${ptpRow?.qdb_ptpstatus} subject="${ptpRow?.subject}"`);
    await activities.updatePromiseStatus(ptpId, 'Kept');
    await activities.complete(ptpId);
    const frozen = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${ptpId})`, { qdb_brokenreason: 'after completion' });
    check('Promise kept and completed; completed activity is immutable', !frozen.ok && /immutable|cannot be modified/i.test(frozen.message), frozen.ok ? 'update was accepted' : frozen.message.split('\n')[0].slice(0, 90));

    console.log('\n─── Cure → Settled (the Phase 2 matrix amendment) ───');
    const cured = await sync.processRecord(observation(facilityA, { dpd: 0, totalArrears: 0, arrearBucket: undefined, misAsOfDate: '2026-08-31' }));
    const curedRow = await crm.retrieve({ entity: 'qdb_collectioncases', id: created.caseId }, ['statuscode', 'qdb_curedate', 'qdb_resolutiontype']);
    check('Cure recorded from a working state: Settled, cure date, resolution Cured', cured.action === 'CureRecorded' && curedRow?.statuscode === 100000613 && curedRow?.qdb_resolutiontype === 100000340, `${cured.action} statuscode=${curedRow?.statuscode} resolution=${curedRow?.qdb_resolutiontype} ${cured.detail ?? ''}`);

    console.log('\n─── Closure and re-delinquency → new episode ───');
    await cases.transition(created.caseId, 'Closed');
    await cases.markClosed(created.caseId, new Date().toISOString());
    const again = await sync.processRecord(observation(facilityA, { dpd: 12, arrearBucket: '1-30', misAsOfDate: '2026-09-30' }));
    check('Re-delinquency after closure opens episode 2', again.action === 'CaseCreated' && again.episodeNumber === 2, `${again.action} episode=${again.episodeNumber} ${again.detail ?? ''}`);

    console.log('\n─── Exceptions ───');
    const unknown = await sync.processRecord(observation(`${SMOKE_MARKER}${stamp}-X`, { customer: { nationalId: `${SMOKE_MARKER}NOBODY-${stamp}` } }));
    check('Unknown customer → identity exception row, no case', unknown.action === 'IdentityException', `${unknown.action} ${unknown.detail ?? ''}`);
    const malformed = await sync.processRecord(observation(`${SMOKE_MARKER}${stamp} BAD`));
    check('Malformed MIS facility identity → facility exception, no case', malformed.action === 'FacilityException', `${malformed.action} ${malformed.detail ?? ''}`);

    console.log('\n─── GraceMonitor: observation kept without a case ───');
    decideOutcome = 'GraceMonitor';
    const grace = await sync.processRecord(observation(`${SMOKE_MARKER}${stamp}-G`));
    check('GraceMonitor produces a snapshot and no case', grace.action === 'GraceMonitored' && grace.snapshot?.written === true && !grace.caseId, `${grace.action} ${JSON.stringify(grace.snapshot)}`);
  } finally {
    if (keep) {
      console.log('\n--keep given: smoke rows left in place. Remove them with clean-qdb-smoke-data.mjs --confirm.');
    } else {
      console.log('\n─── Cleanup ───');
      await cleanSmokeData({ cfg, token, confirmed: true });
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
