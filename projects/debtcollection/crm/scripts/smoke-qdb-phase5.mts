/**
 * smoke-qdb-phase5.mts
 * Runtime proof that the workspace's **own reads** return what the screens show.
 *
 * The Phase 5 spike proved the browser adapter against the platform. This proves the layer above it:
 * the query modules the twenty-one views actually call — `createCaseQuery`, `createPtpQuery`,
 * `createSnapshotQuery`, `createStrategyQuery`, `createStrategyActionQuery`,
 * `createIdentityExceptionQuery`, `retrievePlatformConfigurations`, `loadCustomerAggregate` and
 * `countMatching` — running unmodified against `org5869857f`.
 *
 * It matters because a column can exist and still return nothing when selected by the wrong name.
 * `verify-view-columns.mts` proves existence; this proves the values arrive, in the shape the screens
 * render. That is the KI-52 lesson applied to the frontend: **an in-memory adapter can validate the
 * same incorrect assumption as the production code.**
 *
 * Every assertion runs against rows this script seeded and can therefore name. It asserts the
 * population before the behaviour — "every row matches" is trivially true of no rows, and the QDB
 * sandbox is empty between smoke runs, so a query spike written without seeding would have been
 * almost entirely vacuous.
 *
 * It seeds fourteen rows, all carrying the `SMOKE-` marker, and removes them at the end. Nothing is
 * created at volume: what needs proving here is correctness, and the bounded-paging behaviour already
 * has its own measured evidence.
 *
 * Usage:
 *   npm --workspace @dcp/web run build   (not required; this runs the sources directly)
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-qdb-phase5.mts [--keep]
 */

import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { XrmCrmAdapter } from '../../apps/web/src/platform/XrmCrmAdapter.js';
import type { XrmLike } from '../../apps/web/src/platform/crmContext.js';
import type { WriteTransport } from '../../apps/web/src/platform/writeTransport.js';
import { createCaseQuery } from '../../apps/web/src/data/collectionQueries.js';
import {
  createPtpQuery, createSnapshotQuery, retrieveCase, retrieveCustomer,
} from '../../apps/web/src/data/caseQueries.js';
import {
  createIdentityExceptionQuery, createPlatformMappingQuery, createStrategyActionQuery,
  createStrategyQuery, retrievePlatformConfigurations,
} from '../../apps/web/src/data/configurationQueries.js';
import { loadCustomerAggregate } from '../../apps/web/src/data/customerAggregate.js';
import { countMatching } from '../../apps/web/src/data/counts.js';
import { ENTITY_SETS } from '../../apps/web/src/data/schema.js';

const AUTHORISED_ORG = 'org5869857f';

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now().toString(36).toUpperCase();
const mark = (suffix: string) => `${SMOKE_MARKER}${stamp}-${suffix}`;

type Config = ReturnType<typeof loadConfig>;

async function send(cfg: Config, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME) as Record<string, string>,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) {
    return { ok: true as const, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  }
  const text = await res.text();
  let message = text;
  try { message = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false as const, message, id: null };
}

/**
 * An `Xrm.WebApi` shim over real HTTP, matching the client API's contract.
 *
 * A logical entity name, `maxPageSize` rather than a caller-set header, and a returned `nextLink` —
 * with every request genuinely reaching the organisation. The `Prefer` preferences are comma-joined
 * rather than replaced, which is how the client API behaves and is the defect this spike's
 * predecessor found in the Phase 4 service client.
 */
function realHttpXrm(
  apiBase: string, token: string,
): { xrm: XrmLike; transport: WriteTransport; requestCount: () => number } {
  const state = { requests: 0 };

  const get = async (url: string, pageSize?: number) => {
    state.requests++;
    const headers = buildHeaders(token, SOLUTION_NAME) as Record<string, string>;
    const prefer = ['odata.include-annotations="*"'];
    if (pageSize !== undefined) prefer.push(`odata.maxpagesize=${pageSize}`);
    headers['Prefer'] = prefer.join(',');
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      const error = new Error(`${res.status}: ${body.slice(0, 300)}`) as Error & { status: number };
      error.status = res.status;
      throw error;
    }
    return res.json() as Promise<Record<string, unknown>>;
  };

  const xrm = {
    Utility: { getGlobalContext: () => { throw new Error('not available outside a CRM session'); } },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string, options = '') {
        return get(`${apiBase}/${setNameFor(logicalName)}(${id})${options}`);
      },
      async retrieveMultipleRecords(logicalName: string, options = '', maxPageSize?: number) {
        // The real client API composes the URL itself and refuses anything that is not an options
        // string: "UciError: Option Parameter should begin with \"?\"". The shim enforces the same
        // rule, because a stand-in more permissive than the thing it stands for proves nothing — an
        // earlier version accepted an absolute nextLink and hid a defect that only Dynamics found.
        if (!options.startsWith('?')) {
          throw new Error('UciError: Option Parameter should begin with "?" — received: ' + options.slice(0, 80));
        }
        const url = `${apiBase}/${setNameFor(logicalName)}${options}`;
        const body = await get(url, maxPageSize);
        return {
          entities: (body['value'] ?? []) as Record<string, unknown>[],
          ...(body['@odata.nextLink'] ? { nextLink: String(body['@odata.nextLink']) } : {}),
          ...(body['@odata.count'] !== undefined ? { '@odata.count': body['@odata.count'] } : {}),
        };
      },
      async createRecord() { throw new Error('the query smoke reads only; seeding uses plain HTTP'); },
      async updateRecord() { throw new Error('the query smoke reads only; seeding uses plain HTTP'); },
    },
  };
  // A function rather than a property: `Object.assign` would copy the counter's value at assignment
  // time, and the run would report zero requests however many it made.
  /**
   * A transport that can only read.
   *
   * A count cannot go through `Xrm.WebApi` at all — the client API drops `@odata.count` (KI-96),
   * so the adapter asks the transport instead. This smoke still writes nothing: every verb that
   * would change a record refuses, exactly as the shim's `createRecord` does.
   */
  const transport: WriteTransport = {
    async get(url: string) {
      state.requests++;
      const res = await fetch(url.startsWith('http') ? url : `${apiBase}${url}`, {
        headers: buildHeaders(token, SOLUTION_NAME) as Record<string, string>,
      });
      const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
      return { status: res.status, ...(body !== undefined ? { body } : {}) };
    },
    patch: refuseWrite,
    createOnly: refuseWrite,
    post: refuseWrite,
  };

  return { xrm: xrm as XrmLike, transport, requestCount: () => state.requests };
}

/** The query smoke reads only; seeding uses plain HTTP. */
function refuseWrite(): never {
  throw new Error('the query smoke reads only; seeding uses plain HTTP');
}

/** The shim needs the reverse of the adapter's translation to build a URL. */
const SET_FOR_LOGICAL: Record<string, string> = {
  qdb_crmlogs: 'qdb_crmlogses',
  qdb_collectioncase: 'qdb_collectioncases',
  qdb_collectionactivity: 'qdb_collectionactivities',
  qdb_collectionactivitytype: 'qdb_collectionactivitytypes',
  qdb_collectionstrategy: 'qdb_collectionstrategies',
  qdb_delinquencysnapshot: 'qdb_delinquencysnapshots',
  qdb_identityexception: 'qdb_identityexceptions',
  qdb_strategyaction: 'qdb_strategyactions',
  qdb_platformconfiguration: 'qdb_platformconfigurations',
  qdb_platformmapping: 'qdb_platformmappings',
  contact: 'contacts',
  account: 'accounts',
};
const setNameFor = (logicalName: string) => SET_FOR_LOGICAL[logicalName] ?? `${logicalName}s`;

// ── The seed ─────────────────────────────────────────────────────────────────

const QID = mark('QID');
const FACILITY_A = mark('FACA');
const FACILITY_B = mark('FACB');

interface Seed {
  contactId: string;
  strategyId: string;
  actionIds: string[];
  caseIds: string[];
  snapshotIds: string[];
  activityTypeId: string;
  ptpId: string;
  exceptionId: string;
  configurationId: string;
  mappingId: string;
}

async function seed(cfg: Config, token: string): Promise<Seed> {
  const post = async (path: string, body: Record<string, unknown>, label: string) => {
    const result = await send(cfg, token, 'POST', path, body);
    if (!result.ok || !result.id) throw new Error(`${label}: ${result.ok ? 'no id returned' : result.message}`);
    return result.id;
  };

  const contactId = await post('/contacts',
    { firstname: 'SMOKE', lastname: `P5 ${stamp}`, governmentid: QID, telephone1: '+974 5555 0000' }, 'contact');

  const strategyId = await post('/qdb_collectionstrategies', {
    qdb_name: mark('STRATEGY'), qdb_code: mark('EARLY'), qdb_priority: 10, qdb_isactive: true,
    qdb_dpdfrom: 61, qdb_dpdto: 90, qdb_arrearsfrom: 1000, qdb_arrearsto: 100000,
    qdb_customertype: 100000020, qdb_noautomatedcontact: false,
    qdb_description: 'Phase 5 query smoke strategy', qdb_rulecode: mark('RULE'),
  }, 'strategy');

  const actionIds = [
    await post('/qdb_strategyactions', {
      qdb_name: mark('ACTION-1'), qdb_sequence: 1, qdb_dayoffset: 0, qdb_isactive: true,
      qdb_triggerevent: 100000240, qdb_communicationchannel: 100000100, qdb_queuename: mark('QUEUE'),
      qdb_requiresapproval: false, qdb_ismandatory: true, qdb_escalationhours: 48,
      'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
    }, 'action 1'),
    await post('/qdb_strategyactions', {
      qdb_name: mark('ACTION-2'), qdb_sequence: 2, qdb_dayoffset: 3, qdb_isactive: true,
      qdb_triggerevent: 100000241, qdb_communicationchannel: 100000103,
      'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
    }, 'action 2'),
  ];

  const caseBody = (facility: string, dpd: number, arrears: number, balance: number) => ({
    qdb_casenumber: `${mark('CASE')}-${facility.slice(-4)}`,
    qdb_facilitynumber: facility, qdb_facilitysourcesystem: 'HL', qdb_customerbusinessid: QID,
    qdb_organizationcode: 100000140, qdb_episodenumber: 1, qdb_opendate: new Date().toISOString(),
    qdb_currentdpd: dpd, qdb_currentarrearbucket: 100000002,
    qdb_currenttotalarrears: arrears, qdb_currentloanbalance: balance,
    qdb_misasofdate: '2026-09-17', qdb_correlationid: mark('CORR'),
    qdb_customertype: 100000020,
    'qdb_customerid_contact@odata.bind': `/contacts(${contactId})`,
    'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
  });

  const caseIds = [
    await post('/qdb_collectioncases', caseBody(FACILITY_A, 74, 41250, 860000), 'case A'),
    await post('/qdb_collectioncases', caseBody(FACILITY_B, 88, 12000, 240000), 'case B'),
  ];

  const snapshotIds = [
    await post('/qdb_delinquencysnapshots', {
      qdb_name: mark('SNAP-1'), qdb_snapshotkey: mark('KEY-1'), qdb_customerbusinessid: QID,
      qdb_facilitynumber: FACILITY_A, qdb_facilitysourcesystem: 'HL',
      qdb_snapshotdate: '2026-09-17T00:00:00Z', qdb_receivedon: '2026-09-18T03:00:00Z',
      qdb_dpd: 74, qdb_arrearbucket: 100000002, qdb_totalarrears: 41250, qdb_loanbalance: 860000,
      qdb_eligibilityoutcome: 100000261, qdb_eligibilityreason: 'existing episode',
      qdb_integrationbatchid: mark('BATCH'),
      'qdb_collectioncaseid@odata.bind': `/qdb_collectioncases(${caseIds[0]})`,
    }, 'snapshot 1'),
    await post('/qdb_delinquencysnapshots', {
      qdb_name: mark('SNAP-2'), qdb_snapshotkey: mark('KEY-2'), qdb_customerbusinessid: QID,
      qdb_facilitynumber: FACILITY_A, qdb_facilitysourcesystem: 'HL',
      qdb_snapshotdate: '2026-09-10T00:00:00Z', qdb_receivedon: '2026-09-11T03:00:00Z',
      qdb_dpd: 67, qdb_arrearbucket: 100000002, qdb_totalarrears: 39000, qdb_loanbalance: 862000,
      qdb_eligibilityoutcome: 100000260, qdb_integrationbatchid: mark('BATCH'),
      'qdb_collectioncaseid@odata.bind': `/qdb_collectioncases(${caseIds[0]})`,
    }, 'snapshot 2'),
  ];

  const activityTypeId = await post('/qdb_collectionactivitytypes',
    { qdb_name: mark('TYPE'), qdb_code: mark('PTP') }, 'activity type');

  const ptpId = await post('/qdb_collectionactivities', {
    subject: mark('PROMISE'), qdb_activitynumber: mark('ACT-1'),
    qdb_activitydate: new Date().toISOString(),
    qdb_ptpdate: '2026-10-05', qdb_promisedamount: 5000, qdb_promisetype: 100000581,
    qdb_ptpstatus: 100000080,
    // An activity's lookups to the case and to the activity type carry a relationship suffix,
    // because `regardingobjectid` also targets the case. The bare attribute name is rejected — the
    // navigation property is not the column, and this is the shape `qdbBindings.NAVIGATION` records.
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseIds[0]})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${activityTypeId})`,
  }, 'promise');

  const exceptionId = await post('/qdb_identityexceptions', {
    qdb_name: mark('EXCEPTION'), qdb_customerbusinessid: QID, qdb_facilitynumber: mark('FACX'),
    qdb_source: 'HL', qdb_exceptionreason: 100000300, qdb_exceptionstatus: 100000320,
    qdb_receiveddate: new Date().toISOString(), qdb_integrationbatchid: mark('BATCH'),
  }, 'identity exception');

  const configurationId = await post('/qdb_platformconfigurations', {
    qdb_name: mark('CONFIG'), qdb_environmentcode: mark('ENV'), qdb_platformtype: 100000121,
    qdb_organizationcode: 100000140, qdb_customerentity: 'contact',
    qdb_customerbusinessidfield: 'governmentid', qdb_isactive: true,
    qdb_eligibilityrulesetcode: mark('ELIG'), qdb_snapshotpolicy: 100000280,
  }, 'platform configuration');

  const mappingId = await post('/qdb_platformmappings', {
    qdb_name: mark('MAPPING'), qdb_canonicalfield: 'customerBusinessId',
    qdb_crmentitylogicalname: 'contact', qdb_crmfieldlogicalname: 'governmentid',
    qdb_isrequired: true, qdb_isactive: true,
    'qdb_platformconfigurationid@odata.bind': `/qdb_platformconfigurations(${configurationId})`,
  }, 'platform mapping');

  return {
    contactId, strategyId, actionIds, caseIds, snapshotIds, activityTypeId, ptpId,
    exceptionId, configurationId, mappingId,
  };
}

// ── The run ──────────────────────────────────────────────────────────────────

async function main() {
  const keep = process.argv.includes('--keep');
  console.log('=== Phase 5 live smoke — the workspace\'s own reads against the organisation ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log(`  Marker: ${SMOKE_MARKER}${stamp}`);

  const token = await acquireToken(cfg);
  const { xrm, transport, requestCount } = realHttpXrm(cfg.apiBase, token);
  const adapter = new XrmCrmAdapter(xrm, undefined, transport);

  // Seeding is inside the try so that a failure part-way through still cleans up what it created.
  // A half-seeded run that left residue behind would poison the next one.
  try {
    console.log('\n─── Seeding ───');
    const seeded = await seed(cfg, token);
    console.log('  Seeded 14 rows: 2 cases, 2 snapshots, 1 promise, 1 strategy + 2 actions, ' +
      '1 exception, 1 configuration + 1 mapping, 1 contact, 1 activity type');
    await runChecks(adapter, seeded);
  } finally {
    console.log(`\n  HTTP requests issued by the workspace's query modules: ${requestCount()}`);
    if (keep) {
      console.log('\n  --keep: the seeded rows were left in place.');
    } else {
      console.log('\n─── Cleanup ───');
      await cleanSmokeData({ cfg, token, confirmed: true });
    }
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  console.log('\nProven here: the query modules the React views call return, from the real');
  console.log('organisation, the values those views render — lookups by their _value form,');
  console.log('choices as labels, and every narrowing applied by the source.');
  console.log('\nNOT proven here: that the workspace loads inside Dynamics, that getGlobalContext');
  console.log('answers, or that these reads succeed as a signed-in user rather than as the');
  console.log('service principal. Those need a browser with a CRM session.');
  if (passed !== results.length) process.exitCode = 1;
}

async function runChecks(adapter: XrmCrmAdapter, seeded: Seed) {
  // ── The case list ──────────────────────────────────────────────────────────
  console.log('\n─── The case list, as Collection Cases reads it ───');
  const cases = await createCaseQuery(adapter)({
    pageSize: 25, customerBusinessId: QID, openOnly: true,
    sort: [{ field: 'qdb_currentdpd', descending: true }],
  });
  check('The seeded cases come back through the view\'s own query',
    cases.items.length === 2, `${cases.items.length} of ${cases.totalCount} rows`);

  const worst = cases.items[0];
  check('The page is bounded and the source applied the sort',
    cases.items.length === 2 && worst?.dpd === 88, `first row dpd=${worst?.dpd}`);
  check('A choice arrives as its label, not as an option number',
    worst?.status === 'New' || worst?.status === 'Assigned', `status=${worst?.status}`);
  check('The bucket is the one MIS reported', worst?.bucket === '61-90', `bucket=${worst?.bucket}`);
  check('The organisation badge resolves from the choice', worst?.organization === 'HL', `org=${worst?.organization}`);
  check('The polymorphic customer lookup names its table',
    worst?.customerTable === 'contact', `table=${worst?.customerTable}`);
  check('The customer lookup returns an id, which the storage column would not',
    typeof worst?.customerId === 'string' && worst.customerId.length > 0, worst?.customerId ?? 'MISSING');

  const narrowed = await createCaseQuery(adapter)({ pageSize: 25, customerBusinessId: QID, bucket: '61-90' });
  check('A bucket filter is applied by the source and still matches both rows',
    narrowed.items.length === 2, `${narrowed.items.length} rows`);
  const wrongBucket = await createCaseQuery(adapter)({ pageSize: 25, customerBusinessId: QID, bucket: '1-30' });
  check('A bucket the rows do not have returns an empty page, not an error',
    wrongBucket.items.length === 0, `${wrongBucket.items.length} rows`);

  // ── One case, in full ──────────────────────────────────────────────────────
  console.log('\n─── The Case Workspace summary ───');
  const detail = await retrieveCase(adapter, seeded.caseIds[0]!);
  check('The case reads back by id', detail !== null, detail?.caseNumber ?? 'null');
  check('The strategy lookup resolves to a name, by its _value form',
    typeof detail?.strategyName === 'string' && detail.strategyName.includes(stamp),
    detail?.strategyName ?? 'MISSING');
  check('The owner lookup resolves to a name',
    typeof detail?.ownerName === 'string' && detail.ownerName.length > 0, detail?.ownerName ?? 'MISSING');
  check('The stored MIS as-of date is present, and is what was recorded',
    detail?.misAsOfDate?.startsWith('2026-09-17') === true, detail?.misAsOfDate ?? 'MISSING');
  check('The case is open', detail?.isOpen === true, `isOpen=${detail?.isOpen}`);

  const customer = detail?.customerTable && detail.customerId
    ? await retrieveCustomer(adapter, detail.customerTable, detail.customerId)
    : null;
  check('The CRM customer is read from the table the annotation named',
    customer?.table === 'contact' && customer.displayName.includes(stamp),
    `${customer?.table}: ${customer?.displayName}`);

  // ── Snapshots ──────────────────────────────────────────────────────────────
  console.log('\n─── MIS history ───');
  const snapshots = await createSnapshotQuery(adapter)({ pageSize: 25, caseId: seeded.caseIds[0]! });
  check('Both snapshots for the case come back', snapshots.items.length === 2, `${snapshots.items.length} rows`);
  check('The source sorted them newest first',
    snapshots.items.length === 2 && snapshots.items[0]!.dpd === 74 && snapshots.items[1]!.dpd === 67,
    snapshots.items.map(s => s.dpd).join(' then '));
  check('The eligibility outcome arrives as its label',
    snapshots.items[0]?.eligibilityOutcome === 'Existing episode — update',
    snapshots.items[0]?.eligibilityOutcome ?? 'MISSING');

  const byCustomer = await createSnapshotQuery(adapter)({ pageSize: 25, customerBusinessId: QID });
  check('Snapshots are also reachable by customer, as Customer 360 reads them',
    byCustomer.items.length === 2, `${byCustomer.items.length} rows`);

  // ── Promises ───────────────────────────────────────────────────────────────
  console.log('\n─── Promises to pay ───');
  const promises = await createPtpQuery(adapter)({ pageSize: 25, caseId: seeded.caseIds[0]! });
  check('The promise comes back through the PTP query', promises.items.length === 1, `${promises.items.length} rows`);
  const promise = promises.items[0];
  check('Its status is a label from the proven option table', promise?.ptpStatus === 'Active', promise?.ptpStatus ?? 'MISSING');
  check('Its type is a label', promise?.promiseType === 'Partial', promise?.promiseType ?? 'MISSING');
  check('The promised amount is the amount seeded', promise?.promisedAmount === 5000, String(promise?.promisedAmount));
  check('Its case lookup resolves back to the case number',
    typeof promise?.caseNumber === 'string' && promise.caseNumber.includes(stamp), promise?.caseNumber ?? 'MISSING');

  // ── Configuration ──────────────────────────────────────────────────────────
  console.log('\n─── Configuration, as the Strategy and Admin screens read it ───');
  const strategies = await createStrategyQuery(adapter)({ pageSize: 25, activeOnly: true });
  const seededStrategy = strategies.items.find(s => s.id === seeded.strategyId);
  check('The seeded strategy is among the active ones',
    seededStrategy !== undefined, `${strategies.items.length} active strategies`);
  check('Its DPD band is read as configuration, not derived',
    seededStrategy?.dpdFrom === 61 && seededStrategy.dpdTo === 90,
    `${seededStrategy?.dpdFrom}–${seededStrategy?.dpdTo}`);
  check('Its money bands come back as numbers',
    seededStrategy?.arrearsFrom === 1000 && seededStrategy.arrearsTo === 100000,
    `${seededStrategy?.arrearsFrom}–${seededStrategy?.arrearsTo}`);

  const actions = await createStrategyActionQuery(adapter)({ pageSize: 25, strategyId: seeded.strategyId });
  check('Both actions for the strategy come back, by the lookup _value form',
    actions.items.length === 2, `${actions.items.length} rows`);
  check('The source ordered them by sequence',
    actions.items.length === 2 && actions.items[0]!.sequence === 1 && actions.items[1]!.sequence === 2,
    actions.items.map(a => a.sequence).join(' then '));
  check('The trigger and channel arrive as labels',
    actions.items[0]?.triggerEvent === 'Day offset' && actions.items[0].channel === 'SMS',
    `${actions.items[0]?.triggerEvent} / ${actions.items[0]?.channel}`);
  check('Each action names the strategy that owns it',
    actions.items.every(a => a.strategyId === seeded.strategyId) && actions.items.length === 2,
    actions.items[0]?.strategyName ?? 'MISSING');

  const exceptions = await createIdentityExceptionQuery(adapter)({ pageSize: 25, openOnly: true });
  const seededException = exceptions.items.find(e => e.id === seeded.exceptionId);
  check('The identity exception is readable by Delinquency Intake',
    seededException !== undefined, `${exceptions.items.length} open exceptions`);
  check('Its reason and status arrive as labels',
    seededException?.reason === 'Customer not found' && seededException.status === 'Open',
    `${seededException?.reason} / ${seededException?.status}`);

  const configurations = await retrievePlatformConfigurations(adapter);
  const seededConfiguration = configurations.find(c => c.id === seeded.configurationId);
  check('The platform configuration row is readable by the Configuration screen',
    seededConfiguration !== undefined, `${configurations.length} configuration rows`);
  check('It states the platform and the customer table the deployment uses',
    seededConfiguration?.platformType === 'Cloud' && seededConfiguration.customerEntity === 'contact',
    `${seededConfiguration?.platformType} / ${seededConfiguration?.customerEntity}`);

  const mappings = await createPlatformMappingQuery(adapter)({ pageSize: 25, configurationId: seeded.configurationId });
  check('Its field mappings are reachable from it by the lookup _value form',
    mappings.items.length === 1 && mappings.items[0]!.crmField === 'governmentid',
    `${mappings.items.length} mapping(s), crmField=${mappings.items[0]?.crmField}`);

  // ── Counts ─────────────────────────────────────────────────────────────────
  console.log('\n─── Bounded counts, as the KPI tiles read them ───');
  const openCases = await countMatching(adapter, ENTITY_SETS.collectionCase, `qdb_customerbusinessid eq '${QID}'`);
  check('A KPI count is answered by the platform without reading the rows',
    openCases.value === 2, `count=${openCases.value}`);
  check('The count is reported as exact, not as a floor', openCases.atLeast === false, `atLeast=${openCases.atLeast}`);

  // ── Customer 360 ───────────────────────────────────────────────────────────
  console.log('\n─── Customer & Loan 360 ───');
  const aggregate = await loadCustomerAggregate(adapter, QID);
  check('It gathers both of the customer\'s cases', aggregate.cases.length === 2, `${aggregate.cases.length} cases`);
  check('It lists one row per facility', aggregate.facilities.length === 2,
    aggregate.facilities.map(f => f.facilityNumber.slice(-4)).join(', '));
  check('It totals the exposure of the cases it read',
    aggregate.totalExposure === 1_100_000, `exposure=${aggregate.totalExposure}`);
  check('It totals the overdue amount', aggregate.totalOverdue === 53_250, `overdue=${aggregate.totalOverdue}`);
  check('It reports the worst DPD across the facilities', aggregate.worstDpd === 88, `worstDpd=${aggregate.worstDpd}`);
  check('It resolves the CRM customer from the case lookup',
    aggregate.profile?.table === 'contact' && aggregate.profile.displayName.includes(stamp),
    aggregate.profile?.displayName ?? 'MISSING');
  check('It states that the totals are complete rather than partial',
    aggregate.isComplete === true, `isComplete=${aggregate.isComplete}`);
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
