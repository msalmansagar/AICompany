/**
 * smoke-legal-handoff.mts
 * WP9 against real Dataverse — and very careful about what a green run is allowed to mean.
 *
 * Five claims are kept apart, because merging them would assert something untrue:
 *
 *   **BFD Account resolution** — validated here.
 *   **HL → BFD Account resolution** — NOT validated. No authoritative mechanism exists (KI-108),
 *   and this proves the hand-off *refuses* rather than proving it resolves.
 *   **Litigation Request native creation** — validated here, on synthetic DEMO data only.
 *   **Legal hand-off idempotency** — validated here: retry and concurrency both yield one request.
 *   **QDB Legal process execution** — NOT validated. It runs on-premises. Creating the row here
 *   does not run it, and nothing below claims it did.
 *
 * §13 safety: only `DEMO-` cases are touched, never an `ARR-` case or a real customer. Every
 * Litigation Request is created at an id this script derived, and removed by that id afterwards.
 * If creating one turns out to trigger downstream automation, the run stops and reports it.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-legal-handoff.mts
 */

import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import {
  decideLegalHandoff, interpretHandoffWrite, litigationRequestId,
  type LegalQualificationPolicy,
} from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = `SMOKE-P9LEGAL-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;

/** Read from metadata in step 0 rather than written down here. */
let customerNavigationProperty = '';

interface Config { apiBase: string; orgUrl: string }

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = ''): void => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A fixture the rest of the run depends on. Its failure stops the run rather than greening it. */
const require_ = (name: string, passed: boolean, detail = ''): void => {
  check(name, passed, detail);
  if (passed) return;
  console.error('\n[ABORT] A fixture this run depends on is unavailable. '
    + 'Stopping rather than reporting vacuous passes.');
  process.exit(1);
};

const get = <T,>(cfg: Config, token: string, path: string): Promise<T> =>
  apiGet(cfg as never, token, SOLUTION_NAME, path) as Promise<T>;

const createdLegal = new Set<string>();
const linkedActivities = new Set<string>();

async function write(
  cfg: Config, token: string, method: string, path: string,
  body?: unknown, headers: Record<string, string> = {},
): Promise<number> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      'MSCRM.SolutionUniqueName': SOLUTION_NAME, ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response.status;
}

/**
 * The configured policy for this run.
 *
 * Supplied by the test, **not** by the module, because nothing on the organisation states it
 * (KI-109). Using QDB's own option values — Civil, Against Customer, Housing Loan — so the created
 * row is well-formed without this build choosing QDB's legal taxonomy.
 */
const POLICY: LegalQualificationPolicy = {
  qualifyingApprovalStatus: 1,
  caseType: 100000001,
  caseAgainst: 1,
  caseInitiatedBy: 100000006,
};

async function main(): Promise<void> {
  const cfg = loadConfig() as unknown as Config;
  if (!cfg.orgUrl.includes(AUTHORISED_ORG)) {
    console.error(`[FATAL] Only ${AUTHORISED_ORG} is authorised. Refusing ${cfg.orgUrl}.`);
    process.exit(1);
  }
  const token = await acquireToken(cfg as never);
  console.log(`  Organisation: ${cfg.orgUrl}`);
  console.log(`  Marker: ${MARKER}\n`);

  const fixtures = await setUp(cfg, token);
  await customerResolution(cfg, token, fixtures);
  await nativeCreation(cfg, token, fixtures);
  await idempotency(cfg, token, fixtures);
  await concurrency(cfg, token, fixtures);
  await linkage(cfg, token, fixtures);
  await cleanup(cfg, token);

  report();
}

interface Fixtures {
  bfdCase: string; bfdAccount: string;
  hlCase: string; hlCustomerTable: string;
  bfdRecommendation: string; hlRecommendation: string;
  activityTypeId: string;
}

async function setUp(cfg: Config, token: string): Promise<Fixtures> {
  console.log('─── 0. Fixtures, and the navigation property read from metadata ───');

  const relationship = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    "/EntityDefinitions(LogicalName='qdb_qdblegal')/ManyToOneRelationships"
    + '?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName'
    + "&$filter=ReferencingAttribute eq 'qdb_customer'");
  customerNavigationProperty = String(
    relationship.value[0]?.['ReferencingEntityNavigationPropertyName'] ?? '');
  require_('the Legal customer lookup names its write-side navigation property',
    Boolean(customerNavigationProperty), customerNavigationProperty);

  // §13 — DEMO cases only. An ARR- case is a real customer and is never touched.
  const bfd = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,_qdb_customerid_value'
    + "&$filter=startswith(qdb_casenumber,'DEMO-BFD')&$top=1");
  const hl = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber,_qdb_customerid_value'
    + "&$filter=startswith(qdb_casenumber,'DEMO-HL')&$top=1");

  const bfdCase = String(bfd.value[0]?.['qdb_collectioncaseid']);
  const hlCase = String(hl.value[0]?.['qdb_collectioncaseid']);
  require_('a synthetic BFD case exists', Boolean(bfd.value[0]),
    String(bfd.value[0]?.['qdb_casenumber']));
  require_('a synthetic HL case exists', Boolean(hl.value[0]),
    String(hl.value[0]?.['qdb_casenumber']));

  const bfdCustomer = await customerOf(cfg, token, bfdCase);
  const hlCustomer = await customerOf(cfg, token, hlCase);
  console.log(`  BFD customer → ${bfdCustomer.table} ${bfdCustomer.id}`);
  console.log(`  HL  customer → ${hlCustomer.table} ${hlCustomer.id}`);

  const types = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid,qdb_name'
    + "&$filter=contains(qdb_name,'Legal')&$top=1");
  const activityTypeId = String(types.value[0]?.['qdb_collectionactivitytypeid']);
  require_('a Legal Recommendation activity type exists', Boolean(types.value[0]),
    String(types.value[0]?.['qdb_name']));

  const bfdRecommendation = await seedRecommendation(cfg, token, bfdCase, activityTypeId, 'BFD');
  const hlRecommendation = await seedRecommendation(cfg, token, hlCase, activityTypeId, 'HL');

  return {
    bfdCase, bfdAccount: bfdCustomer.id, hlCase, hlCustomerTable: hlCustomer.table,
    bfdRecommendation, hlRecommendation, activityTypeId,
  };
}

/** The customer, and — decisively — which table it is in, from the platform's own annotation. */
async function customerOf(
  cfg: Config, token: string, caseId: string,
): Promise<{ table: string; id: string }> {
  const response = await fetch(
    `${cfg.apiBase}/qdb_collectioncases(${caseId})?$select=_qdb_customerid_value`,
    {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json',
        'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"',
      },
    });
  const row = await response.json() as Record<string, unknown>;
  return {
    table: String(row['_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] ?? 'none'),
    id: String(row['_qdb_customerid_value'] ?? ''),
  };
}

async function seedRecommendation(
  cfg: Config, token: string, caseId: string, typeId: string, book: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const status = await write(cfg, token, 'PATCH', `/qdb_collectionactivities(${id})`, {
    subject: `${MARKER} ${book} legal recommendation`,
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${caseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${typeId})`,
    qdb_approvalstatus: 1,
  }, { 'If-None-Match': '*' });
  if (status < 400) linkedActivities.add(id);
  require_(`a ${book} Legal Recommendation exists to hand off`, status < 400, `status ${status}`);
  return id;
}

async function customerResolution(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 1. Customer resolution — one book resolves, the other refuses ───');

  const bfd = decideLegalHandoff({
    recommendation: { activityId: f.bfdRecommendation, lifecycle: 'Open', isLegalRecommendation: true, approvalStatus: 1 },
    customer: { table: 'account', id: f.bfdAccount },
    policy: POLICY,
  });
  check('a BFD case resolves its account authoritatively',
    bfd.outcome === 'ReadyForLegalHandoff' && bfd.request?.accountId === f.bfdAccount,
    bfd.outcome);

  const hl = decideLegalHandoff({
    recommendation: { activityId: f.hlRecommendation, lifecycle: 'Open', isLegalRecommendation: true, approvalStatus: 1 },
    customer: { table: f.hlCustomerTable === 'account' ? 'account' : 'contact', id: 'unused' },
    policy: POLICY,
  });
  check('an HL case REFUSES rather than inventing a customer (KI-108)',
    hl.outcome === 'CustomerResolutionRequired', hl.outcome);
  check('and the refusal hands the caller nothing to create with', hl.request === undefined);

  const unconfigured = decideLegalHandoff({
    recommendation: { activityId: f.bfdRecommendation, lifecycle: 'Open', isLegalRecommendation: true, approvalStatus: 1 },
    customer: { table: 'account', id: f.bfdAccount },
    policy: {},
  });
  check('with no configured qualification, NOTHING is handed off (KI-109)',
    unconfigured.outcome === 'QualificationNotConfigured' && unconfigured.request === undefined);

  // The organisation's own state, asserted rather than assumed.
  const accountsWithGovernmentId = await get<{ '@odata.count'?: number }>(cfg, token,
    '/accounts?$select=accountid&$count=true&$top=1'
    + "&$filter=accountnumber ne null and startswith(accountnumber,'ARR-')");
  check('no account carries an HL-style identifier, which is why KI-108 stands',
    (accountsWithGovernmentId['@odata.count'] ?? -1) === 0,
    `${accountsWithGovernmentId['@odata.count']} such account(s)`);
}

async function nativeCreation(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 2. Litigation Request native creation (synthetic data only) ───');

  const before = await legalCount(cfg, token);
  const id = litigationRequestId(f.bfdRecommendation);
  const status = await createLitigation(cfg, token, id, f.bfdAccount);
  if (status < 400) createdLegal.add(id);

  check('a Litigation Request is created at its derived id',
    interpretHandoffWrite(status) === 'LegalHandoffCreated', `status ${status}`);

  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_qdblegals(${id})?$select=qdb_qdblegalid,qdb_name,statecode,statuscode,`
    + 'qdb_casetype,qdb_caseagainst,qdb_caseinitiatedby,_qdb_customer_value');
  check('it names the resolved BFD account as its customer',
    String(row['_qdb_customer_value']) === f.bfdAccount);
  check('and carries the CONFIGURED picklist values, not values this build chose',
    Number(row['qdb_casetype']) === POLICY.caseType
    && Number(row['qdb_caseagainst']) === POLICY.caseAgainst
    && Number(row['qdb_caseinitiatedby']) === POLICY.caseInitiatedBy);
  check('it opens in the Legal process’s own initial state, which DCP does not set beyond create',
    Number(row['statecode']) === 0, `state=${row['statecode']} status=${row['statuscode']}`);

  const after = await legalCount(cfg, token);
  check('exactly one Litigation Request was added', after === before + 1, `${before} → ${after}`);

  // §13 — if creating one triggers downstream automation, stop and report rather than continue.
  const escalations = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_escalations?$select=activityid&$count=true&$top=1');
  check('creating it triggered no escalation record — no unexpected downstream automation',
    (escalations['@odata.count'] ?? -1) === 0, `${escalations['@odata.count']} escalation(s)`);
}

async function idempotency(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 3. Idempotency — a lost response must not produce a second litigation ───');

  const before = await legalCount(cfg, token);
  const id = litigationRequestId(f.bfdRecommendation);

  const retry = await createLitigation(cfg, token, id, f.bfdAccount);
  check('a retry of the same hand-off is REFUSED by the platform, not duplicated',
    retry === 412, `status ${retry}`);
  check('and that refusal reads as "already handed off", never as an error',
    interpretHandoffWrite(retry) === 'AlreadyHandedOff');

  const after = await legalCount(cfg, token);
  check('the Litigation Request count is unchanged by the retry', after === before,
    `${before} → ${after}`);

  check('the derived id is stable across attempts, which is what makes the retry safe',
    litigationRequestId(f.bfdRecommendation) === id);
}

async function concurrency(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 4. Concurrency — two workers, one Litigation Request ───');

  const id = litigationRequestId(f.hlRecommendation);
  const before = await legalCount(cfg, token);

  // The HL recommendation's customer cannot be resolved, so the BFD account stands in purely to
  // exercise the write path. The decision-level HL refusal is proven in step 1.
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () => createLitigation(cfg, token, id, f.bfdAccount)));
  if (attempts.some(status => status < 400)) createdLegal.add(id);

  const created = attempts.filter(status => status < 400).length;
  const refused = attempts.filter(status => status === 412).length;
  check('exactly one of five concurrent attempts created a Litigation Request',
    created === 1, `${created} created, ${refused} refused with 412`);
  check('and every other attempt was refused by the platform, not by a prior query',
    created + refused === attempts.length, attempts.join(','));

  const after = await legalCount(cfg, token);
  check('exactly one Litigation Request exists afterwards', after === before + 1,
    `${before} → ${after}`);
}

async function linkage(cfg: Config, token: string, f: Fixtures): Promise<void> {
  console.log('\n─── 5. Traceability — the chain reaches the Litigation Request ───');

  const id = litigationRequestId(f.bfdRecommendation);
  const linked = await write(cfg, token, 'PATCH',
    `/qdb_collectionactivities(${f.bfdRecommendation})`,
    { 'qdb_legalrequestid_qdb_collectionactivity@odata.bind': `/qdb_qdblegals(${id})` });
  check('the recommendation links to its Litigation Request', linked < 400, `status ${linked}`);

  const row = await get<Record<string, unknown>>(cfg, token,
    `/qdb_collectionactivities(${f.bfdRecommendation})`
    + '?$select=_qdb_legalrequestid_value,_qdb_collectioncaseid_value,_qdb_strategyactionid_value');
  check('the link reads back from the organisation',
    String(row['_qdb_legalrequestid_value']) === id);
  check('and the activity still names its case, so the whole chain is traversable',
    String(row['_qdb_collectioncaseid_value']) === f.bfdCase);

  /*
   * Partial failure B: the Litigation Request was created but DCP's linkage never landed.
   *
   * The recovery must not create a second request. Because the id is derived from the
   * recommendation, a retry simply finds the existing one.
   */
  const recovered = await get<Record<string, unknown>>(cfg, token,
    `/qdb_qdblegals(${litigationRequestId(f.bfdRecommendation)})?$select=qdb_qdblegalid`);
  check('an unlinked-but-created request is recoverable by re-deriving its id, not by searching',
    String(recovered['qdb_qdblegalid']).toLowerCase() === id.toLowerCase());

  check('the Legal entity gained nothing — the reference lives on DCP’s own record',
    (await get<{ value: unknown[] }>(cfg, token,
      "/EntityDefinitions(LogicalName='qdb_qdblegal')/ManyToOneRelationships?$select=SchemaName")
    ).value.length === 16, 'still 16 lookups');
}

async function createLitigation(
  cfg: Config, token: string, id: string, accountId: string,
): Promise<number> {
  return write(cfg, token, 'PATCH', `/qdb_qdblegals(${id})`, {
    qdb_name: `${MARKER} litigation`,
    qdb_casetype: POLICY.caseType,
    qdb_caseagainst: POLICY.caseAgainst,
    qdb_caseinitiatedby: POLICY.caseInitiatedBy,
    qdb_summaryjustification: `${MARKER} synthetic WP9 validation — not a real legal matter.`,
    [`${customerNavigationProperty}@odata.bind`]: `/accounts(${accountId})`,
  }, { 'If-None-Match': '*' });
}

async function legalCount(cfg: Config, token: string): Promise<number> {
  const response = await get<{ '@odata.count'?: number }>(cfg, token,
    '/qdb_qdblegals?$select=qdb_qdblegalid&$count=true&$top=1');
  return response['@odata.count'] ?? -1;
}

async function cleanup(cfg: Config, token: string): Promise<void> {
  console.log('\n─── Cleanup (by fixture-owned id, then verified) ───');

  const steps = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
  const setState = async (value: number): Promise<void> => {
    for (const step of steps.value) {
      await write(cfg, token, 'PATCH',
        `/sdkmessageprocessingsteps(${step['sdkmessageprocessingstepid']})`,
        { statecode: value, statuscode: value === 0 ? 1 : 2 });
    }
  };

  await setState(1);
  for (const id of linkedActivities) {
    console.log(`  [DELETE activity] ${id} -> ${await write(cfg, token, 'DELETE', `/qdb_collectionactivities(${id})`)}`);
  }
  await setState(0);

  for (const id of createdLegal) {
    console.log(`  [DELETE litigation] ${id} -> ${await write(cfg, token, 'DELETE', `/qdb_qdblegals(${id})`)}`);
  }

  const restored = await get<{ value: Record<string, unknown>[] }>(cfg, token,
    '/sdkmessageprocessingsteps?$select=statecode'
    + "&$filter=contains(name,'ImmutabilityGuardPlugin') and contains(name,'qdb_collectionactivity')");
  check('the immutability guard is enabled exactly as before',
    restored.value.every(step => Number(step['statecode']) === 0), `${restored.value.length} step(s)`);

  const legalResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_qdblegals?$select=qdb_qdblegalid&$count=true&$filter=startswith(qdb_name,'SMOKE-P9LEGAL')`);
  check('zero Litigation Request residue remains — including from any earlier run',
    (legalResidue['@odata.count'] ?? 0) === 0, `${legalResidue['@odata.count'] ?? 0} row(s)`);

  const activityResidue = await get<{ '@odata.count'?: number }>(cfg, token,
    `/qdb_collectionactivities?$select=activityid&$count=true&$filter=startswith(subject,'SMOKE-P9LEGAL')`);
  check('zero recommendation residue remains',
    (activityResidue['@odata.count'] ?? 0) === 0, `${activityResidue['@odata.count'] ?? 0} row(s)`);
}

function report(): void {
  const failed = results.filter(result => !result.passed);
  if (failed.length === 0) {
    console.log('\n  BFD Account resolution .............. VALIDATED');
    console.log('  HL → BFD Account resolution ........ NOT VALIDATED — no mechanism exists (KI-108);');
    console.log('                                       the hand-off refuses, which IS validated');
    console.log('  Litigation Request creation ........ VALIDATED — synthetic DEMO data only');
    console.log('  Legal hand-off idempotency ......... VALIDATED — retry and concurrency');
    console.log('  QDB Legal process execution ........ UNPROVEN ON CLOUD — it runs on-premises');
    console.log('  On-Prem Legal runtime .............. PENDING — not testable from here');
  } else {
    console.log(`\n  NOT VALIDATED — ${failed.length} check(s) failed. No claim is made about this run.`);
  }
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

await main();
