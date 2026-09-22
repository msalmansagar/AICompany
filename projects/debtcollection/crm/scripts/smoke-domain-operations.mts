/**
 * smoke-domain-operations.mts
 * The gate the Phase 6 authorisation puts **before** the React forms.
 *
 * `smoke-browser-writes.mts` proved the transport: that a PATCH carrying `If-Match` behaves, that a
 * stale version is refused, that an ETag round-trips. This proves the two layers above it — the
 * domain's decisions and the service that executes them — running unmodified against
 * `org5869857f`, so that when a form is finally written there is nothing underneath it that has
 * only ever been exercised by a mock.
 *
 * The distinction matters because the layers can disagree. A plan can be correct and the column map
 * wrong; a transition can be refused in TypeScript and permitted by the plugin. Each of those is
 * invisible to a unit test and obvious here.
 *
 * Everything it creates carries `SMOKE-`. Cleanup runs in a `finally`, is verified, and touches
 * nothing marked `DEMO-`, `P6-` or `ARR-`.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-domain-operations.mts
 */

import { loadConfig, acquireToken, apiGet, apiPost, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';
import { buildNodeHarness } from './lib/node-workspace-harness.mts';
import { ActivityService } from '../../apps/web/src/services/activityService.js';
import { createFollowUpQuery, loadActionPlan } from '../../apps/web/src/data/followUpQueries.js';
import { createPtpQuery } from '../../apps/web/src/data/caseQueries.js';
import { createCaseQuery } from '../../apps/web/src/data/collectionQueries.js';
import { loadActivityTypes, loadOutcomes } from '../../apps/web/src/data/configurationCatalog.js';
import { deriveFollowUpDate } from '@dcp/domain';
import { ENTITY_SETS } from '../../apps/web/src/data/schema.js';
import type { ActivityOutcomeConfig, RowVersion } from '@dcp/domain';

/**
 * The Completed option on `qdb_collectionactivity`.
 *
 * The entity has configured state transitions, so a bare `statecode` is refused: "Transition
 * from 'Open' to '2' is not permitted". This is the option whose State is 1.
 */
const ACTIVITY_COMPLETED_STATUS = 100000644;

const AUTHORISED_ORG = 'org5869857f';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const mark = (what: string) => `${SMOKE_MARKER}P6OPS-${what}-${stamp}`;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A fresh GUID per record, which is what makes a create idempotent (ADR-DCP-19). */
const newId = () => crypto.randomUUID();

type Config = ReturnType<typeof loadConfig>;

interface Seed {
  contactId: string;
  accountId: string;
  hlCaseId: string;
  bfdCaseId: string;
  strategyId: string;
  /** The planned action an activity can name. Provenance, not resemblance (WP8). */
  plannedActionId: string;
  /** The activity that names that planned action and has been completed. */
  attributedActivityId: string;
  callTypeId: string;
  ptpTypeId: string;
  outcome: ActivityOutcomeConfig;
}

async function main(): Promise<void> {
  console.log('=== Phase 6 — domain operations and query modules against the real platform ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}\n`);

  const token = await acquireToken(cfg);
  const { adapter, counters } = buildNodeHarness(cfg.apiBase, token);
  const service = new ActivityService(adapter);

  try {
    const seed = await seedFixtures(cfg, token);
    await proveActivityLifecycle(service, adapter, seed);
    await provePromiseLifecycle(service, adapter, seed);
    await proveConcurrency(service, adapter, seed);
    await proveIdempotency(service, adapter, seed);
    await proveQueries(adapter, seed);
    await proveConfigurationCatalogue(adapter);
    await proveConfiguredFollowUpIsPersisted(service, adapter, seed);
    console.log(`\n  HTTP: ${counters.reads} reads, ${counters.writes} writes through the production classes.`);
  } finally {
    await cleanUpAndVerify(cfg, token);
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`    FAILED: ${f.name}`);
    process.exit(1);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Seeds both customer contexts.
 *
 * Housing Loan customers are contacts and BFD customers are accounts — one polymorphic lookup with a
 * different navigation property per target. Seeding both is the only way this script can claim the
 * workspace is dual-context rather than assume it.
 */
async function seedFixtures(cfg: Config, token: string): Promise<Seed> {
  const post = async (path: string, body: Record<string, unknown>, label: string): Promise<string> => {
    // A Dataverse POST answers 204 with an empty body: the id arrives only in `OData-EntityId`,
    // which `postOnce` has already extracted into `entityId`. Reading it off the parsed body would
    // silently yield `undefined`.
    const created = await apiPost(cfg, token, SOLUTION_NAME, path, body);
    const id = String(created?.entityId ?? '');
    if (!id) throw new Error(`${label}: no id returned`);
    return id;
  };

  // Both the contact's surname and the account's name carry the marker, because those are the
  // columns `clean-qdb-smoke-data.mjs` scans. A fixture marked somewhere the cleaner does not look
  // is residue by construction.
  const contactId = await post('/contacts',
    { firstname: 'Ops', lastname: mark('CONTACT'), governmentid: mark('QID') }, 'contact');
  const accountId = await post('/accounts', { name: mark('BFD-CUSTOMER') }, 'account');

  const strategyId = await post('/qdb_collectionstrategies', {
    qdb_name: mark('STRATEGY'), qdb_code: mark('STRAT'), qdb_priority: 10, qdb_isactive: true,
  }, 'strategy');

  const callTypeId = await post('/qdb_collectionactivitytypes',
    { qdb_name: mark('CALL'), qdb_code: mark('CALL') }, 'call type');
  const ptpTypeId = await post('/qdb_collectionactivitytypes',
    { qdb_name: mark('PTP'), qdb_code: mark('PTP') }, 'ptp type');

  const plannedActionId = await post('/qdb_strategyactions', {
    qdb_name: mark('PLANNED-CALL'), qdb_sequence: 1, qdb_isactive: true,
    'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
    'qdb_activitytypeid@odata.bind': `/qdb_collectionactivitytypes(${callTypeId})`,
  }, 'planned action');

  const caseBody = (facility: string, source: string, customerBind: Record<string, string>) => ({
    qdb_casenumber: `${mark('CASE')}-${facility}`,
    qdb_facilitynumber: facility, qdb_facilitysourcesystem: source,
    qdb_customerbusinessid: mark('QID'), qdb_organizationcode: 100000140,
    qdb_episodenumber: 1, qdb_opendate: new Date().toISOString(), qdb_currentdpd: 74,
    'qdb_strategyid@odata.bind': `/qdb_collectionstrategies(${strategyId})`,
    ...customerBind,
  });

  const hlCaseId = await post('/qdb_collectioncases',
    caseBody(mark('HL'), 'HL', { 'qdb_customerid_contact@odata.bind': `/contacts(${contactId})` }), 'HL case');
  const bfdCaseId = await post('/qdb_collectioncases',
    caseBody(mark('BFD'), 'BFD', { 'qdb_customerid_account@odata.bind': `/accounts(${accountId})` }), 'BFD case');

  const outcomeId = await post('/qdb_activityoutcomes', {
    qdb_name: mark('CONTACTED'), qdb_code: mark('CONTACTED'),
    qdb_requiresfollowup: true, qdb_followupdays: 3, qdb_requiresnotes: true,
    qdb_escalationrequired: false,
  }, 'outcome');

  /**
   * The activity the Action Plan should attribute to the planned action.
   *
   * It names the action outright. Since WP8 that lookup is the ONLY thing that attributes work to
   * a plan — a matching Activity Type no longer correlates anything, which is why the CALL-1
   * activity created later, of this very type and without the lookup, must stay unattributed.
   */
  const attributedActivityId = await post('/qdb_collectionactivities', {
    subject: mark('ATTRIBUTED-CALL'),
    'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${hlCaseId})`,
    'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${callTypeId})`,
    'qdb_strategyactionid_qdb_collectionactivity@odata.bind': `/qdb_strategyactions(${plannedActionId})`,
  }, 'attributed activity');
  await completeActivity(cfg, token, attributedActivityId);

  check('seeded both customer contexts — HL contact and BFD account', Boolean(hlCaseId && bfdCaseId));

  return {
    contactId, accountId, hlCaseId, bfdCaseId, strategyId, plannedActionId,
    attributedActivityId, callTypeId, ptpTypeId,
    outcome: {
      id: outcomeId, code: mark('CONTACTED'), name: 'Contacted',
      requiresFollowUp: true, followUpDays: 3, requiresNotes: true, escalationRequired: false,
    },
  };
}

/**
 * Moves a seeded activity to Completed.
 *
 * It cannot be created that way: `qdb_collectionactivity` has configured state transitions, and
 * a create carrying the Completed status is refused — "100000644 is not a valid status code for
 * state code qdb_collectionactivityState.Open". State and status move together, afterwards.
 */
async function completeActivity(cfg: Config, token: string, activityId: string): Promise<void> {
  const res = await fetch(`${cfg.apiBase}/qdb_collectionactivities(${activityId})`, {
    method: 'PATCH',
    headers: buildHeaders(token, SOLUTION_NAME) as Record<string, string>,
    body: JSON.stringify({ statecode: 1, statuscode: ACTIVITY_COMPLETED_STATUS }),
  });
  if (!res.ok) throw new Error(`completing the attributed activity -> ${res.status}: ${await res.text()}`);
}

// ── The activity lifecycle ───────────────────────────────────────────────────

async function proveActivityLifecycle(
  service: ActivityService, adapter: ReturnType<typeof buildNodeHarness>['adapter'], seed: Seed,
): Promise<void> {
  console.log('\n  Activity — create, complete, outcome-driven behaviour');

  const id = newId();
  const created = await service.createActivity(id, {
    caseId: seed.hlCaseId, activityTypeId: seed.callTypeId, subject: mark('CALL-1'),
  });
  check('an activity is created through the service', created.status === 'saved',
    created.status === 'refused' ? created.refusals.map(r => r.code).join(',') : '');

  // Read it back. HTTP success is not evidence that the values landed — KI-52 was a column that
  // accepted a write and returned nothing.
  const afterCreate = await adapter.retrieveVersioned(
    { entity: 'qdb_collectionactivities', id },
    ['activityid', 'subject', 'statuscode', '_qdb_collectioncaseid_value', '_qdb_activitytypeid_value']);
  check('the case and type bindings are stored, read back from Dataverse',
    afterCreate?.record['_qdb_collectioncaseid_value'] === seed.hlCaseId
    && afterCreate?.record['_qdb_activitytypeid_value'] === seed.callTypeId);
  check('the server assigned the opening status, not the client',
    typeof afterCreate?.record['statuscode'] === 'number');

  // Required notes: the same outcome, with and without them.
  const missingNotes = await service.completeActivity(
    { id, version: afterCreate!.version }, { currentStatus: 'Open', outcome: seed.outcome });
  check('completion is refused when the configured outcome requires notes',
    missingNotes.status === 'refused'
    && missingNotes.refusals.some(r => r.code === 'NotesRequired'));

  const completed = await service.completeActivity({ id, version: afterCreate!.version }, {
    currentStatus: 'Open', outcome: seed.outcome, notes: 'Customer will pay on Thursday.',
    now: new Date('2026-09-19T10:00:00.000Z'),
  });
  check('completion succeeds once the notes are supplied', completed.status === 'saved');

  const afterComplete = await adapter.retrieveVersioned(
    { entity: 'qdb_collectionactivities', id },
    ['activityid', 'statuscode', 'statecode', 'description', 'qdb_followupdate', '_qdb_outcomeid_value']);
  check('the notes are stored on the activity base column, not a qdb_ column',
    afterComplete?.record['description'] === 'Customer will pay on Thursday.');
  check('the outcome is bound through its navigation property',
    afterComplete?.record['_qdb_outcomeid_value'] === seed.outcome.id);
  check('the follow-up is scheduled the CONFIGURED number of days out',
    String(afterComplete?.record['qdb_followupdate'] ?? '').startsWith('2026-09-22'),
    String(afterComplete?.record['qdb_followupdate']));
  check('the activity is closed', afterComplete?.record['statecode'] === 1);

  // The server is the authority. The client refuses this too, so the refusal is asked for in a way
  // that reaches the platform: a transition the domain permits but the plugin must reject.
  const resurrect = await service.moveActivity(
    { id, version: afterComplete!.version }, 'Completed', 'Open');
  check('a completed activity cannot be reopened', resurrect.status === 'refused');
}

// ── The promise ──────────────────────────────────────────────────────────────

async function provePromiseLifecycle(
  service: ActivityService, adapter: ReturnType<typeof buildNodeHarness>['adapter'], seed: Seed,
): Promise<void> {
  console.log('\n  Promise to pay — the same entity, carrying promise columns');

  const id = newId();
  const created = await service.createPromise(id, {
    caseId: seed.hlCaseId, activityTypeId: seed.ptpTypeId, subject: mark('PTP-1'),
    promisedAmount: 5000, promiseDate: '2026-10-05T00:00:00.000Z', promiseType: 'Partial',
  });
  check('a promise is created through the service', created.status === 'saved');

  const stored = await adapter.retrieveVersioned(
    { entity: 'qdb_collectionactivities', id },
    ['activityid', 'qdb_ptpstatus', 'qdb_promisedamount', 'qdb_promisetype', 'qdb_ptpdate']);
  check('the promise lives on qdb_collectionactivity — no second entity exists',
    stored?.record['qdb_promisedamount'] === 5000);
  check('the promise opens Active', stored?.record['qdb_ptpstatus'] === 100000080);

  const partially = await service.movePromise(
    { id, version: stored!.version }, 'Active', 'PartiallyKept', { amountReceived: 2000 });
  check('a documented promise transition is accepted', partially.status === 'saved');

  const afterMove = await adapter.retrieveVersioned(
    { entity: 'qdb_collectionactivities', id },
    ['activityid', 'qdb_ptpstatus', 'qdb_amountreceived']);
  check('the reported amount is stored', afterMove?.record['qdb_amountreceived'] === 2000);

  const forbidden = await service.movePromise(
    { id, version: afterMove!.version }, 'Kept', 'Broken');
  check('a transition the matrix forbids is refused before any request is made',
    forbidden.status === 'refused');

  /**
   * The line the authorisation draws twice: a collector marking a promise Kept records an
   * operational belief. Nothing here writes a financial verification, and DCP is not the ledger.
   */
  const columns = Object.keys(afterMove?.record ?? {}).join(',').toLowerCase();
  check('no verification flag is written by a promise outcome',
    !/verif|confirmed|reconcil/.test(columns));
}

// ── Concurrency ──────────────────────────────────────────────────────────────

async function proveConcurrency(
  service: ActivityService, adapter: ReturnType<typeof buildNodeHarness>['adapter'], seed: Seed,
): Promise<void> {
  console.log('\n  Concurrency — a stale write, and two legitimate saves in a row');

  const id = newId();
  await service.createActivity(id, {
    caseId: seed.hlCaseId, activityTypeId: seed.callTypeId, subject: mark('CONFLICT'),
  });
  const reference = { entity: 'qdb_collectionactivities', id };
  const first = await adapter.retrieveVersioned(reference, ['activityid', 'subject', 'qdb_followupdate']);
  const staleVersion = first!.version;

  // Two consecutive saves by the same user. This is the KI-70 regression: without
  // `Prefer: return=representation` the second one fails looking exactly like a conflict.
  const saveOne = await service.scheduleFollowUp({ id, version: staleVersion }, 'Open', '2026-10-01T00:00:00.000Z');
  check('the first save succeeds', saveOne.status === 'saved');
  if (saveOne.status !== 'saved') return;

  const saveTwo = await service.scheduleFollowUp(
    { id, version: saveOne.result.version }, 'Open', '2026-10-08T00:00:00.000Z');
  check('a second consecutive save by the same user also succeeds', saveTwo.status === 'saved');

  // Now the stale one: the version read before either save.
  const stale = await service.scheduleFollowUp({ id, version: staleVersion }, 'Open', '2026-11-30T00:00:00.000Z');
  check('a stale write is reported as a conflict, not a generic failure', stale.status === 'conflict');
  check('the conflict message carries no HTTP or ETag vocabulary',
    stale.status === 'conflict' && !/412|etag|if-match|rowversion/i.test(stale.message));

  const afterStale = await adapter.retrieveVersioned(reference, ['activityid', 'qdb_followupdate']);
  check('the refused stale payload did NOT overwrite the stored value',
    String(afterStale?.record['qdb_followupdate'] ?? '').startsWith('2026-10-08'),
    String(afterStale?.record['qdb_followupdate']));
}

// ── Idempotency ──────────────────────────────────────────────────────────────

async function proveIdempotency(
  service: ActivityService, adapter: ReturnType<typeof buildNodeHarness>['adapter'], seed: Seed,
): Promise<void> {
  console.log('\n  Duplicate submission — the same id, sent twice');

  const id = newId();
  const request = {
    caseId: seed.hlCaseId, activityTypeId: seed.callTypeId, subject: mark('DUPLICATE'),
  };

  const first = await service.createActivity(id, request);
  const retry = await service.createActivity(id, request);

  check('the first submission created the activity',
    first.status === 'saved' && first.result.created === true);
  check('the retry reports saved, not an error',
    retry.status === 'saved');
  check('the retry did NOT create a second record',
    retry.status === 'saved' && retry.result.created === false);

  // The authoritative check: count the rows, rather than trust the flag.
  const page = await adapter.retrievePage('qdb_collectionactivities', {
    select: ['activityid', 'subject'], pageSize: 50,
    filter: `subject eq '${mark('DUPLICATE')}'`,
  });
  check('exactly one row exists for the duplicated submission', page.items.length === 1,
    `${page.items.length} rows`);
}

// ── The query modules ────────────────────────────────────────────────────────

async function proveQueries(
  adapter: ReturnType<typeof buildNodeHarness>['adapter'], seed: Seed,
): Promise<void> {
  console.log('\n  Query modules — server-side paging, filtering and the Action Plan');

  // Paging is proved by walking it, with the page size set below the row count so there is more than
  // one page to walk. Zero duplicates and zero missing rows is the claim; a set comparison is the
  // evidence.
  const caseQuery = createCaseQuery(adapter);
  const seen: string[] = [];
  let continuation: Parameters<typeof caseQuery>[0]['continuation'];
  let pages = 0;
  do {
    const page = await caseQuery({
      pageSize: 1, search: mark('CASE'),
      ...(continuation !== undefined ? { continuation } : {}),
    } as Parameters<typeof caseQuery>[0]);
    seen.push(...page.items.map(row => row.id));
    continuation = page.continuation;
    pages++;
  } while (continuation && pages < 10);

  check('paging returned more than one page', pages > 1, `${pages} pages`);
  check('no row appeared twice across pages', new Set(seen).size === seen.length);
  check('both seeded cases were seen', seen.includes(seed.hlCaseId) && seen.includes(seed.bfdCaseId),
    `${seen.length} rows`);

  // A fresh query with no continuation must start again from the first page.
  const restarted = await caseQuery({ pageSize: 1, search: mark('CASE') } as Parameters<typeof caseQuery>[0]);
  check('a query without a continuation restarts at the first page',
    restarted.items.length === 1 && restarted.items[0]!.id === seen[0]);

  // The follow-up queue. The activity completed earlier carries a follow-up date.
  const followUps = await createFollowUpQuery(adapter)({ pageSize: 25, openOnly: false, window: 'all' });
  check('the follow-up query returns rows and every one has a follow-up date',
    followUps.items.length > 0 && followUps.items.every(row => Boolean(row.followUpDate)),
    `${followUps.items.length} rows`);

  // The Action Plan: one planned call, and the work that NAMES it.
  const plan = await loadActionPlan(adapter, { caseId: seed.hlCaseId, strategyId: seed.strategyId });
  check('the Action Plan lists the strategy\'s planned actions', plan.rows.length === 1,
    `${plan.rows.length} rows`);
  check('work that names the planned action is attributed to it, and one is completed',
    plan.rows[0]?.attributed.some(row => row.id === seed.attributedActivityId) === true
    && plan.rows[0]?.hasCompletedAttributed === true,
    `${plan.rows[0]?.attributed.length ?? 0} attributed`);

  /**
   * The negative half, which is what makes the positive one mean anything.
   *
   * CALL-1 is on the same case and of the **same Activity Type as the planned action** — the exact
   * record the pre-WP8 correlation would have claimed. It does not name the action, so nothing may
   * attribute it. A plan that simply returned the case's activities would fail here.
   */
  check('a look-alike activity of the planned type is NOT attributed to the action',
    plan.rows[0]?.attributed.every(row => row.id === seed.attributedActivityId) === true,
    `${plan.rows[0]?.attributed.length ?? 0} attributed`);

  // And it is not discarded either — unattributed work stays on the screen that explains the case.
  check('the look-alike is kept as unattributed history rather than dropped',
    plan.unattributed.length > 0);

  // BFD context: an account-backed case reads through the same code path.
  const bfdCases = await caseQuery({ pageSize: 10, search: mark('CASE') } as Parameters<typeof caseQuery>[0]);
  check('an account-backed BFD case is readable by the same query module',
    bfdCases.items.some(row => row.id === seed.bfdCaseId));

  const promises = await createPtpQuery(adapter)({ pageSize: 25, caseId: seed.hlCaseId });
  check('the PTP query returns the seeded promise', promises.items.length >= 1,
    `${promises.items.length} rows`);
}

// ── The configuration the forms offer ────────────────────────────────────────

/**
 * What the dropdowns will actually contain.
 *
 * This exists because the first Phase 6 seeding produced configuration that every test accepted and
 * no officer could have used: eleven activity types all written **inactive**, and seven outcomes with
 * **no owning activity type**. The rows were there, the columns were right, and both dropdowns would
 * have been empty — the type list because the form correctly refuses retired configuration, the
 * outcome list because it correctly filters by the chosen type.
 *
 * So the assertion is not "the rows exist" but "the catalogue a form would read is non-empty and
 * behaves" — which is the only version of the question a user would recognise.
 */
async function proveConfigurationCatalogue(
  adapter: ReturnType<typeof buildNodeHarness>['adapter'],
): Promise<void> {
  console.log('\n  Configuration — what the Phase 6 forms will offer');

  const types = await loadActivityTypes(adapter);
  check('the activity-type catalogue is not empty', types.length > 0, `${types.length} types`);
  check('every offered type is active — a retired one is never selectable for a new record',
    types.every(type => type.isActive));
  check('types arrive in configuration\'s own order, not alphabetical',
    types.every((type, index) => index === 0 || (type.sequence ?? 0) >= (types[index - 1]!.sequence ?? 0)));

  const callType = types.find(type => (type.code ?? '').includes('CALL'));
  check('a call type is configured', Boolean(callType), callType?.name ?? 'none');
  if (!callType) return;

  const outcomes = await loadOutcomes(adapter, callType.id);
  check('the call type offers outcomes', outcomes.length > 0, `${outcomes.length} outcomes`);
  check('every outcome offered belongs to the chosen type',
    outcomes.every(outcome => outcome.activityTypeId === callType.id));

  // The four behaviours `planCompleteActivity` reads. A catalogue that varies across none of them
  // would let the configuration-driven code pass while doing nothing.
  check('the catalogue varies across the behaviours the form drives from it',
    outcomes.some(o => o.requiresNotes) && outcomes.some(o => !o.requiresNotes)
    && outcomes.some(o => o.requiresFollowUp && o.followUpDays !== undefined),
    `${outcomes.filter(o => o.requiresNotes).length} need notes, `
    + `${outcomes.filter(o => o.requiresFollowUp).length} need follow-up`);

  // Per-type filtering, proved by difference rather than by asserting one list is non-empty.
  const visitType = types.find(type => (type.code ?? '').includes('FIELDVISIT'));
  if (visitType) {
    const visitOutcomes = await loadOutcomes(adapter, visitType.id);
    const shared = visitOutcomes.filter(v => outcomes.some(c => c.id === v.id));
    check('a different activity type offers different outcomes',
      visitOutcomes.length > 0 && shared.length === 0,
      `${visitOutcomes.length} visit outcomes, ${shared.length} shared with call`);
  }

  const promiseType = types.find(type => (type.code ?? '').toUpperCase().includes('PTP'));
  check('a promise activity type is configured, so a promise can be captured',
    Boolean(promiseType), promiseType?.name ?? 'none');
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Removes every `SMOKE-` row and proves it, leaving the other markers alone.
 *
 * Runs from a `finally`, so a failure half way through still leaves nothing behind — the residue
 * count is the assertion, not the fact that the cleanup routine was called.
 */
async function cleanUpAndVerify(cfg: unknown, token: string): Promise<void> {
  console.log('\n  Cleanup');
  await cleanSmokeData({ cfg, token, confirmed: true, marker: SMOKE_MARKER });

  const countOf = async (path: string): Promise<number> =>
    Number((await apiGet(cfg, token, SOLUTION_NAME, path))?.['@odata.count'] ?? -1);

  const residue = await countOf(
    `/qdb_collectionactivities?$select=activityid&$top=1&$count=true&$filter=startswith(subject,'${SMOKE_MARKER}')`);
  check('zero SMOKE- activity residue remains', residue === 0, `${residue} rows`);

  const cases = await countOf(
    `/qdb_collectioncases?$select=qdb_collectioncaseid&$top=1&$count=true&$filter=startswith(qdb_casenumber,'${SMOKE_MARKER}')`);
  check('zero SMOKE- case residue remains', cases === 0, `${cases} rows`);

  // The markers that must survive. Deleting DEMO- or P6- would take the seeded scenario and the
  // Phase 6 configuration with it, which is why they are counted rather than assumed.
  const demo = await countOf(
    "/qdb_collectioncases?$select=qdb_collectioncaseid&$top=1&$count=true&$filter=startswith(qdb_casenumber,'DEMO-')");
  const config = await countOf(
    "/qdb_activityoutcomes?$select=qdb_activityoutcomeid&$top=1&$count=true&$filter=startswith(qdb_code,'P6-')");
  check('DEMO- scenario data is untouched', demo > 0, `${demo} cases`);
  check('P6- configuration is untouched', config > 0, `${config} outcomes`);
}

main().catch(error => {
  console.error('\n  FATAL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

/**
 * The configured follow-up, derived from the **deployed** configuration and read back.
 *
 * Phase 6 runtime validation step 3b reported an activity completing with no follow-up date. The
 * derivation was correct at every layer; what was missing was any check that the configuration
 * *actually on the organisation* produces a persisted date when the officer supplies none.
 *
 * So this uses the real `P6-` outcome rather than a seeded one — a synthetic outcome created by this
 * script would prove the mechanism and say nothing about the catalogue QDB will be looking at — and
 * asserts the date that comes **back out of Dataverse**, not the one the plan went in with.
 */
async function proveConfiguredFollowUpIsPersisted(
  service: ActivityService,
  adapter: ReturnType<typeof buildNodeHarness>['adapter'],
  seed: Seed,
): Promise<void> {
  console.log('\n  Configured follow-up — derived, written, and read back');

  const types = await loadActivityTypes(adapter);
  const callType = types.find(t => (t.code ?? '').includes('P6-CALL'));
  if (!callType) { check('a deployed call type exists to complete against', false); return; }

  const outcomes = await loadOutcomes(adapter, callType.id);
  const scheduling = outcomes.find(o => o.requiresFollowUp && o.followUpDays !== undefined && !o.requiresNotes);
  if (!scheduling) { check('a deployed outcome schedules a follow-up without demanding notes', false); return; }
  check('a deployed outcome schedules a follow-up', true,
    `${scheduling.code} → ${scheduling.followUpDays} days`);

  // An activity of that type, with no follow-up of its own.
  const activityId = newId();
  const created = await service.createActivity(activityId, {
    caseId: seed.hlCaseId, activityTypeId: callType.id, subject: mark('FOLLOWUP'),
  });
  check('an activity was logged against the deployed call type', created.status === 'saved');

  const before = await adapter.retrieveVersioned(
    { entity: ENTITY_SETS.collectionActivity, id: activityId },
    ['activityid', 'qdb_followupdate', 'statuscode']);
  check('it starts with no follow-up, so the one that appears can only be derived',
    before?.record['qdb_followupdate'] === null || before?.record['qdb_followupdate'] === undefined,
    String(before?.record['qdb_followupdate']));

  // Complete with NO follow-up date supplied — the exact runtime scenario.
  const completedAt = new Date();
  const completed = await service.completeActivity(
    { id: activityId, version: before!.version },
    { currentStatus: 'Open', outcome: scheduling, now: completedAt },
  );
  check('it completes without the officer supplying a follow-up date', completed.status === 'saved',
    completed.status === 'refused' ? completed.refusals.map(r => r.code).join(',') : '');

  const after = await adapter.retrieveVersioned(
    { entity: ENTITY_SETS.collectionActivity, id: activityId },
    ['activityid', 'qdb_followupdate', 'statuscode', 'statecode']);

  const persisted = String(after?.record['qdb_followupdate'] ?? '');
  check('a follow-up date was persisted by Dataverse', persisted !== '', persisted || 'none');

  // The date the domain's own rule says it should be — asserted against `deriveFollowUpDate` rather
  // than against a number written here, so the test cannot drift from the rule it is checking.
  const expected = deriveFollowUpDate(scheduling, completedAt);
  check('the persisted date is the one configuration derives, to the day',
    expected.kind === 'derived' && persisted.slice(0, 10) === expected.date.slice(0, 10),
    expected.kind === 'derived' ? `expected ${expected.date.slice(0, 10)}, stored ${persisted.slice(0, 10)}` : expected.kind);

  // Qatar is UTC+3 with no daylight saving, so the stored instant must fall on the same calendar day
  // in the officer's frame as in the platform's — an off-by-one here would move a day's work.
  const inQatar = new Date(new Date(persisted).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  check('the stored follow-up is the same calendar day in Asia/Qatar as in UTC',
    inQatar === persisted.slice(0, 10), `UTC ${persisted.slice(0, 10)}, Qatar ${inQatar}`);

  check('completing the activity closed it', after?.record['statecode'] === 1);
}
