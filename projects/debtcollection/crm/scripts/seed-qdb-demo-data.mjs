/**
 * seed-qdb-demo-data.mjs
 * A small, coherent demonstration dataset, so the workspace can actually be exercised.
 *
 * Every grid in the workspace correctly shows an empty state against an empty organisation, which
 * proves the empty state and nothing else. This seeds enough for a person to click through all
 * thirteen Phase 5 views and see real behaviour: the dual-CRM badge, server-side filtering, the
 * polymorphic customer lookup, the Case Workspace tabs, Customer 360's aggregation, and bounded
 * counts that add up.
 *
 * What it deliberately is **not**: bulk. Roughly sixty rows, not tens of thousands. Infinite scroll
 * and virtualization already have their demonstration in the Audit Trail, which reads the 1,295 rows
 * `qdb_crmlogs` holds for real.
 *
 * Safety:
 *   • refuses to run against any organisation but the authorised sandbox;
 *   • every row carries the `DEMO-` marker, which is **not** the smoke marker — a smoke run's
 *     cleanup removes everything matching its own marker, so sharing one would mean the next test
 *     silently deleted this data;
 *   • `--remove` takes it all out again, through the same guard-disable/restore/verify path the
 *     smoke cleanup uses;
 *   • platform configuration rows are seeded **inactive**, so the service layer cannot mistake a
 *     demonstration row for the deployment's real configuration;
 *   • no schema change of any kind. Data only.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/seed-qdb-demo-data.mjs [--remove]
 */

import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { cleanSmokeData, DEMO_MARKER } from './clean-qdb-smoke-data.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Option values, all proven by the Phase 2–5 live smokes. Nothing here is guessed. */
const ORG = { HL: 100000140, BFD: 100000141 };
const BUCKET = { '1-30': 100000000, '31-60': 100000001, '61-90': 100000002, '91-180': 100000003, '181-270': 100000004 };
const STATUS = {
  New: 100000600, Assigned: 100000601, InProgress: 100000602, PendingCustomer: 100000603,
  PtpActive: 100000604, PtpBroken: 100000605, LegalReferred: 100000609, Settled: 100000613,
};
const CUSTOMER_TYPE = { Individual: 100000020, SME: 100000021, Corporate: 100000022 };
const PTP_STATUS = { Active: 100000080, Kept: 100000081, PartiallyKept: 100000082, Broken: 100000083 };
const PROMISE_TYPE = { Full: 100000580, Partial: 100000581 };
const ELIGIBILITY = { Create: 100000260, Existing: 100000261, Grace: 100000262 };
const EXCEPTION_REASON = { CustomerNotFound: 100000300, FacilityNotFound: 100000301, OneOrgOnly: 100000305 };
const EXCEPTION_STATUS = { Open: 100000320, UnderReview: 100000321 };
const TRIGGER = { DayOffset: 100000240, BucketChange: 100000241, BrokenPTP: 100000242 };
const CHANNEL = { SMS: 100000100, WhatsApp: 100000101, Email: 100000102, Call: 100000103, Letter: 100000104 };
const PLATFORM_TYPE = { OnPrem: 100000120, Cloud: 100000121 };
const SNAPSHOT_POLICY = { AllReceived: 100000280 };

const mark = suffix => `${DEMO_MARKER}${suffix}`;

async function send(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) {
    return { ok: true, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  }
  const text = await res.text();
  let message = text;
  try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false, message };
}

const created = { contacts: 0, accounts: 0, strategies: 0, actions: 0, cases: 0, snapshots: 0, activities: 0, exceptions: 0, configurations: 0, mappings: 0 };

async function post(cfg, token, set, body, label, counter) {
  const result = await send(cfg, token, 'POST', `/${set}`, body);
  if (!result.ok || !result.id) throw new Error(`${label}: ${result.ok ? 'no id returned' : result.message}`);
  if (counter) created[counter]++;
  return result.id;
}

/** Dates relative to today, so the demonstration does not look stale next week. */
const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = n => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ── The scenario ─────────────────────────────────────────────────────────────

/**
 * Two customers, deliberately one per CRM.
 *
 * Housing Loan keeps customers as contacts and BFD as accounts. Seeding one of each is what makes
 * the polymorphic customer lookup visible in Customer 360 and the org badge meaningful in every list.
 */
const CUSTOMERS = [
  {
    key: 'hl', table: 'contacts', org: 'HL', type: CUSTOMER_TYPE.Individual,
    qid: mark('28755001234'),
    body: { firstname: 'Aisha', lastname: 'Al-Mansouri (DEMO)', telephone1: '+974 5512 3344', emailaddress1: 'demo.aisha@example.qa' },
    facilities: [
      { number: mark('HL-4401'), product: 'Home Finance — Villa', dpd: 74, bucket: '61-90', arrears: 41250, balance: 860000, instalment: 6800, status: 'PtpActive' },
      { number: mark('HL-4402'), product: 'Home Finance — Extension', dpd: 22, bucket: '1-30', arrears: 7400, balance: 210000, instalment: 2450, status: 'Assigned' },
    ],
  },
  {
    key: 'bfd', table: 'accounts', org: 'BFD', type: CUSTOMER_TYPE.SME,
    qid: mark('70011002233'),
    body: { name: 'Doha Marine Supplies WLL (DEMO)', telephone1: '+974 4455 6677', emailaddress1: 'demo.finance@example.qa' },
    facilities: [
      { number: mark('BFD-8801'), product: 'SME Working Capital', dpd: 132, bucket: '91-180', arrears: 188400, balance: 1450000, instalment: 31500, status: 'LegalReferred' },
      { number: mark('BFD-8802'), product: 'Equipment Finance', dpd: 48, bucket: '31-60', arrears: 22600, balance: 395000, instalment: 9200, status: 'InProgress' },
      { number: mark('BFD-8803'), product: 'Trade Facility', dpd: 9, bucket: '1-30', arrears: 3100, balance: 120000, instalment: 1900, status: 'New' },
    ],
  },
];

/** Two strategies with their actions, so Segmentation, Strategy Rules and Action Plan all have rows. */
const STRATEGIES = [
  {
    name: mark('Early stage — soft contact'), code: mark('EARLY'), priority: 10,
    dpdFrom: 1, dpdTo: 30, arrearsFrom: 500, arrearsTo: 50000, customerType: CUSTOMER_TYPE.Individual,
    description: 'First touch while the arrear is small. Reminder, then a call if unanswered.',
    actions: [
      { name: mark('Send SMS reminder'), sequence: 1, dayOffset: 0, trigger: TRIGGER.DayOffset, channel: CHANNEL.SMS, mandatory: true, escalationHours: 48 },
      { name: mark('Follow-up call'), sequence: 2, dayOffset: 3, trigger: TRIGGER.DayOffset, channel: CHANNEL.Call, mandatory: false, escalationHours: 72 },
    ],
  },
  {
    name: mark('Late stage — pre-legal'), code: mark('PRELEGAL'), priority: 30,
    dpdFrom: 91, dpdTo: 180, arrearsFrom: 50000, arrearsTo: 5000000, customerType: CUSTOMER_TYPE.SME,
    description: 'Formal notice and escalation before a legal referral is considered.',
    actions: [
      { name: mark('Issue formal notice'), sequence: 1, dayOffset: 0, trigger: TRIGGER.BucketChange, channel: CHANNEL.Letter, mandatory: true, approval: true, escalationHours: 24 },
      { name: mark('Escalate to supervisor'), sequence: 2, dayOffset: 5, trigger: TRIGGER.BrokenPTP, channel: CHANNEL.Email, mandatory: true, escalationHours: 12 },
    ],
  },
];

async function seed(cfg, token) {
  console.log('\n─── Configuration ───');
  for (const [code, org] of [['HL', ORG.HL], ['BFD', ORG.BFD]]) {
    const configurationId = await post(cfg, token, 'qdb_platformconfigurations', {
      qdb_name: mark(`${code} Cloud configuration`),
      // Inactive on purpose: the service layer resolves the ACTIVE row for an organisation, and a
      // demonstration row masquerading as the deployment's real configuration would be a trap.
      qdb_isactive: false,
      qdb_environmentcode: mark(`${code}-CLOUD`),
      qdb_platformtype: PLATFORM_TYPE.Cloud,
      qdb_organizationcode: org,
      qdb_customerentity: code === 'HL' ? 'contact' : 'account',
      qdb_customerbusinessidfield: code === 'HL' ? 'governmentid' : 'accountnumber',
      qdb_eligibilityrulesetcode: mark('ELIGIBILITY-V1'),
      qdb_strategyrulesetcode: mark('STRATEGY-V1'),
      qdb_snapshotpolicy: SNAPSHOT_POLICY.AllReceived,
      qdb_customertype: code === 'HL' ? CUSTOMER_TYPE.Individual : CUSTOMER_TYPE.SME,
      qdb_misintegrationenabled: false,
    }, `${code} configuration`, 'configurations');

    for (const mapping of [
      { field: 'customerBusinessId', entity: code === 'HL' ? 'contact' : 'account', column: code === 'HL' ? 'governmentid' : 'accountnumber', required: true },
      { field: 'customerDisplayName', entity: code === 'HL' ? 'contact' : 'account', column: code === 'HL' ? 'fullname' : 'name', required: true },
      { field: 'primaryPhone', entity: code === 'HL' ? 'contact' : 'account', column: 'telephone1', required: false },
    ]) {
      await post(cfg, token, 'qdb_platformmappings', {
        qdb_name: mark(`${code} ${mapping.field}`),
        qdb_canonicalfield: mapping.field,
        qdb_crmentitylogicalname: mapping.entity,
        qdb_crmfieldlogicalname: mapping.column,
        qdb_datatype: 'String',
        qdb_isrequired: mapping.required,
        qdb_isactive: true,
        'qdb_platformconfigurationid@odata.bind': `/qdb_platformconfigurations(${configurationId})`,
      }, `${code} mapping ${mapping.field}`, 'mappings');
    }
    console.log(`  ${code}: configuration (inactive) + 3 field mappings`);
  }

  console.log('\n─── Strategy ───');
  for (const strategy of STRATEGIES) {
    const strategyId = await post(cfg, token, 'qdb_collectionstrategies', {
      qdb_name: strategy.name, qdb_code: strategy.code, qdb_priority: strategy.priority,
      qdb_isactive: true, qdb_noautomatedcontact: false, qdb_description: strategy.description,
      qdb_dpdfrom: strategy.dpdFrom, qdb_dpdto: strategy.dpdTo,
      qdb_arrearsfrom: strategy.arrearsFrom, qdb_arrearsto: strategy.arrearsTo,
      qdb_customertype: strategy.customerType, qdb_rulecode: mark('RULE-STRATEGY'),
      qdb_effectivefrom: daysAgo(90),
    }, strategy.code, 'strategies');
    strategy.id = strategyId;

    for (const action of strategy.actions) {
      await post(cfg, token, 'qdb_strategyactions', {
        qdb_name: action.name, qdb_sequence: action.sequence, qdb_dayoffset: action.dayOffset,
        qdb_triggerevent: action.trigger, qdb_communicationchannel: action.channel,
        qdb_queuename: mark('Collections queue'), qdb_ismandatory: action.mandatory,
        qdb_requiresapproval: action.approval ?? false, qdb_escalateifnotcompleted: true,
        qdb_escalationhours: action.escalationHours, qdb_isactive: true,
        qdb_rulecode: mark('RULE-ACTION'),
        'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
      }, action.name, 'actions');
    }
    console.log(`  ${strategy.code}: strategy + ${strategy.actions.length} actions`);
  }

  console.log('\n─── Customers, facilities and cases ───');
  const activityTypeId = await post(cfg, token, 'qdb_collectionactivitytypes',
    { qdb_name: mark('Promise to pay'), qdb_code: mark('PTP') }, 'activity type');

  const cases = [];
  for (const customer of CUSTOMERS) {
    const isContact = customer.table === 'contacts';
    const customerId = await post(cfg, token, customer.table, {
      ...customer.body,
      ...(isContact ? { governmentid: customer.qid } : { accountnumber: customer.qid }),
    }, `${customer.key} customer`, isContact ? 'contacts' : 'accounts');

    for (const [index, facility] of customer.facilities.entries()) {
      const strategy = STRATEGIES[facility.dpd >= 91 ? 1 : 0];
      const caseId = await post(cfg, token, 'qdb_collectioncases', {
        qdb_casenumber: `${DEMO_MARKER}${customer.org}-${1000 + index}`,
        qdb_facilitynumber: facility.number,
        qdb_facilitysourcesystem: customer.org,
        qdb_customerbusinessid: customer.qid,
        qdb_organizationcode: ORG[customer.org],
        qdb_customertype: customer.type,
        qdb_producttypecode: customer.org === 'HL' ? 'HOME' : 'SME',
        qdb_productdescription: facility.product,
        qdb_episodenumber: 1,
        qdb_opendate: daysAgo(facility.dpd),
        qdb_currentdpd: facility.dpd,
        qdb_currentarrearbucket: BUCKET[facility.bucket],
        qdb_currenttotalarrears: facility.arrears,
        qdb_currentloanbalance: facility.balance,
        qdb_installmentamount: facility.instalment,
        qdb_misasofdate: daysAgo(1),
        qdb_lastmissyncon: daysAgo(1),
        qdb_correlationid: mark(`CORR-${customer.org}-${1000 + index}`),
        statuscode: STATUS[facility.status],
        [`qdb_customerid_${isContact ? 'contact' : 'account'}@odata.bind`]: `/${customer.table}(${customerId})`,
        'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategy.id})`,
      }, facility.number, 'cases');
      cases.push({ caseId, customer, facility, activityTypeId });

      // Three snapshots per facility, so the MIS history on a case actually shows a trend.
      for (const [age, offset] of [[1, 0], [8, -7], [15, -14]]) {
        await post(cfg, token, 'qdb_delinquencysnapshots', {
          qdb_name: mark(`SNAP-${facility.number}-${age}`),
          qdb_snapshotkey: mark(`${facility.number}-${age}`),
          qdb_customerbusinessid: customer.qid,
          qdb_facilitynumber: facility.number,
          qdb_facilitysourcesystem: customer.org,
          qdb_snapshotdate: daysAgo(age),
          qdb_receivedon: daysAgo(age),
          qdb_missourcetimestamp: daysAgo(age),
          qdb_dpd: Math.max(0, facility.dpd + offset),
          qdb_arrearbucket: BUCKET[facility.bucket],
          qdb_totalarrears: Math.round(facility.arrears * (1 + offset / 100)),
          qdb_loanbalance: facility.balance,
          qdb_installmentamount: facility.instalment,
          qdb_producttypecode: customer.org === 'HL' ? 'HOME' : 'SME',
          qdb_eligibilityoutcome: age === 15 ? ELIGIBILITY.Create : ELIGIBILITY.Existing,
          qdb_eligibilityreason: age === 15 ? 'first delinquency observation' : 'existing open episode',
          qdb_integrationbatchid: mark(`BATCH-${age}`),
          'qdb_collectioncaseid@odata.bind': `/qdb_collectioncases(${caseId})`,
        }, `snapshot ${facility.number}`, 'snapshots');
      }
    }
    console.log(`  ${customer.org}: 1 ${isContact ? 'contact' : 'account'} + ${customer.facilities.length} cases + ${customer.facilities.length * 3} snapshots`);
  }

  console.log('\n─── Activity and promises ───');
  // Promises in four states, so the PTP screen shows every tone its status pill can take.
  const PROMISES = [
    { status: PTP_STATUS.Active, type: PROMISE_TYPE.Full, amount: 41250, due: daysAhead(6) },
    { status: PTP_STATUS.Kept, type: PROMISE_TYPE.Full, amount: 7400, due: daysAhead(-12), received: 7400, paid: daysAgo(12) },
    { status: PTP_STATUS.Broken, type: PROMISE_TYPE.Partial, amount: 60000, due: daysAhead(-5), broken: daysAgo(5), reason: 'No payment received by the promised date' },
    { status: PTP_STATUS.PartiallyKept, type: PROMISE_TYPE.Partial, amount: 22600, due: daysAhead(-3), received: 10000, paid: daysAgo(3) },
  ];

  for (const [index, entry] of cases.entries()) {
    const promise = PROMISES[index % PROMISES.length];
    await post(cfg, token, 'qdb_collectionactivities', {
      subject: mark(`Promise to pay — ${entry.facility.number}`),
      qdb_activitynumber: mark(`ACT-${2000 + index}`),
      qdb_activitydate: daysAgo(index + 1),
      qdb_followupdate: daysAhead(7),
      qdb_ptpdate: promise.due,
      qdb_promisedamount: promise.amount,
      qdb_promisetype: promise.type,
      qdb_ptpstatus: promise.status,
      ...(promise.received !== undefined ? { qdb_amountreceived: promise.received } : {}),
      ...(promise.paid !== undefined ? { qdb_paymentreceiveddate: promise.paid } : {}),
      ...(promise.broken !== undefined ? { qdb_brokendate: promise.broken, qdb_brokenreason: promise.reason } : {}),
      // An activity's lookups carry a relationship suffix, because regardingobjectid also targets
      // the case. The bare attribute name is rejected outright (KI-57).
      'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${entry.caseId})`,
      'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${entry.activityTypeId})`,
    }, `promise ${index}`, 'activities');
  }
  console.log(`  ${cases.length} promises across Active, Kept, Broken and Partially Kept`);

  console.log('\n─── Identity exceptions ───');
  const EXCEPTIONS = [
    { facility: mark('HL-9101'), qid: mark('28900009999'), source: 'HL', reason: EXCEPTION_REASON.CustomerNotFound, status: EXCEPTION_STATUS.Open, note: 'No contact carries this QID in the Housing Loan organisation.' },
    { facility: mark('BFD-9102'), qid: mark('70099008888'), source: 'BFD', reason: EXCEPTION_REASON.FacilityNotFound, status: EXCEPTION_STATUS.UnderReview, note: 'Facility reported by MIS is not present in BFD.' },
    { facility: mark('HL-9103'), qid: mark('28900007777'), source: 'HL', reason: EXCEPTION_REASON.OneOrgOnly, status: EXCEPTION_STATUS.Open, note: 'Customer exists in Housing Loan only; BFD has no matching record.' },
  ];
  for (const exception of EXCEPTIONS) {
    await post(cfg, token, 'qdb_identityexceptions', {
      qdb_name: mark(`EXC-${exception.facility}`),
      qdb_customerbusinessid: exception.qid,
      qdb_facilitynumber: exception.facility,
      qdb_source: exception.source,
      qdb_exceptionreason: exception.reason,
      qdb_exceptionstatus: exception.status,
      qdb_receiveddate: daysAgo(2),
      qdb_integrationbatchid: mark('BATCH-1'),
      qdb_resolution: exception.note,
    }, exception.facility, 'exceptions');
  }
  console.log(`  ${EXCEPTIONS.length} identity exceptions`);
}

async function main() {
  const remove = process.argv.includes('--remove');
  console.log(`=== Demonstration dataset — ${remove ? 'REMOVE' : 'SEED'} ===\n`);

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log(`  Marker: ${DEMO_MARKER} (deliberately not the smoke marker)`);

  const token = await acquireToken(cfg);

  if (remove) {
    await cleanSmokeData({ cfg, token, confirmed: true, marker: DEMO_MARKER });
    console.log('\nThe demonstration data is gone. No schema was touched at any point.');
    return;
  }

  await seed(cfg, token);

  const total = Object.values(created).reduce((sum, n) => sum + n, 0);
  console.log('\n─── Seeded ───');
  for (const [what, count] of Object.entries(created)) {
    if (count > 0) console.log(`  ${String(count).padStart(3)}  ${what}`);
  }
  console.log(`  ${String(total).padStart(3)}  rows in total, every one marked ${DEMO_MARKER}`);
  console.log('\n  Remove it all again with:  node ... seed-qdb-demo-data.mjs --remove');
  console.log('\n  Note: the two platform configuration rows are seeded INACTIVE, so the service');
  console.log('  layer cannot mistake a demonstration row for the deployment\'s real configuration.');
  console.log('  They are still listed by the Configuration screen, which reads every row.');
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
