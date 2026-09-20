/**
 * smoke-bulk-concurrency.mts
 * Two workers, one real communication run, against `org5869857f`.
 *
 * The fake store in `bulkExecutor.test.ts` proves the executor's logic. It cannot prove that
 * Dataverse refuses a stale `If-Match` on `qdb_communicationrun` the way the fake does, and the
 * whole worker-coordination model rests on that. So the same production classes run here against
 * the real platform, with only the credential different (KI-67).
 *
 * The two safety layers are deliberately separate and both are exercised:
 *   • the **run row-version claim** stops two workers independently processing one run;
 *   • the **deterministic activity id** stops duplicates across crash and retry.
 * A worker that loses the claim must reach **zero** create attempts — which is why creates are
 * counted per worker rather than inferred from the records that end up existing.
 *
 * Nothing can be sent: QDB's dispatcher is not installed here (KI-83), so every Fax row is inert.
 * Everything is `SMOKE-` marked and removed by id, with residue verified independently.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-bulk-concurrency.mts
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { buildNodeHarness } from './lib/node-workspace-harness.mts';
import { cleanSmokeData } from './clean-qdb-smoke-data.mjs';
import { BulkCommunicationService } from '../../apps/web/src/services/bulkCommunicationService.js';
import { CommunicationService } from '../../apps/web/src/services/communicationService.js';
import { ENTITY_SETS } from '../../apps/web/src/data/schema.js';
import type { CommunicationRequest, EligibilityContext } from '@dcp/domain';
import type { WriteResponse, WriteTransport } from '../../apps/web/src/platform/writeTransport.js';

const AUTHORISED_ORG = 'org5869857f';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const mark = (what: string) => `SMOKE-P7RACE-${what}-${stamp}`;
const POPULATION = 6;
const BATCH = 3;

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Records every create this worker attempts, so "zero attempts" is measured, not inferred. */
class CountingTransport implements WriteTransport {
  createAttempts: string[] = [];
  constructor(private readonly inner: WriteTransport) {}
  async createOnly(url: string, body: unknown): Promise<WriteResponse> {
    if (url.startsWith('/faxes(') || url.startsWith('/emails(')) this.createAttempts.push(url);
    return this.inner.createOnly(url, body);
  }
  async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
    return this.inner.patch(url, body, ifMatch);
  }
  async post(url: string, body: unknown): Promise<WriteResponse> {
    return this.inner.post(url, body);
  }
  async get(url: string): Promise<WriteResponse> { return this.inner.get(url); }
}

interface Seed { caseId: string; contactIds: string[] }

const created: { set: string; id: string }[] = [];

async function main(): Promise<void> {
  console.log('=== Phase 7 — two workers, one run, real Dataverse ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`  Organisation: ${host}`);
  console.log('  NOTE: the QDB dispatcher is absent here, so no Fax row can send (KI-83).\n');

  const token = await acquireToken(cfg);
  const capacity = await readFrozenPopulationCapacity(cfg, token);
  check('the frozen-population capacity was read from live metadata', capacity > 0, String(capacity));

  const seed = await seedFixtures(cfg, token);

  // Two independent workers, exactly as two browser tabs or two machines would be.
  const workerA = buildWorker(cfg.apiBase, token, capacity);
  const workerB = buildWorker(cfg.apiBase, token, capacity);

  const runId = await createRun(workerA.bulk, seed);
  created.push({ set: ENTITY_SETS.communicationRun, id: runId });
  check('a real communication run was created', Boolean(runId), runId);

  try {
    await proveTheRace(workerA, workerB, runId, seed);
    await proveResumable(workerA, runId, seed);
  } finally {
    await cleanUp(cfg, token, seed);
  }

  const failed = results.filter(r => !r.passed);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`    FAILED: ${f.name}`);
    process.exit(1);
  }
}

interface Worker {
  bulk: BulkCommunicationService;
  counter: CountingTransport;
}

function buildWorker(apiBase: string, token: string, capacity: number): Worker {
  // The counter is injected INTO the harness, so the adapter is built around it and the count is of
  // what the production path attempted.
  let counter!: CountingTransport;
  const harness = buildNodeHarness(apiBase, token, inner => (counter = new CountingTransport(inner)));
  const communications = new CommunicationService(harness.adapter);
  return { bulk: new BulkCommunicationService(harness.adapter, communications, capacity), counter };
}

async function proveTheRace(a: Worker, b: Worker, runId: string, seed: Seed): Promise<void> {
  console.log('\n  ── The race ──');

  const before = await a.bulk.loadRun(runId);
  const beforeB = await b.bulk.loadRun(runId);
  check('both workers begin from the same version', before?.version === beforeB?.version,
    String(before?.version));
  check('the run starts at cursor 0', before?.cursor === 0);

  const attemptsBefore = { a: a.counter.createAttempts.length, b: b.counter.createAttempts.length };

  // Started together so both read before either claims — awaiting in turn would not be a race.
  const [resultA, resultB] = await Promise.all([
    a.bulk.runBatch(runId, buildRequest(seed), eligible, BATCH),
    b.bulk.runBatch(runId, buildRequest(seed), eligible, BATCH),
  ]);

  const outcomes = [resultA.status, resultB.status];
  const advanced = outcomes.filter(s => s === 'progressed' || s === 'complete');
  const refused = outcomes.filter(s => s === 'takenOver');

  check('exactly one worker claimed the run', advanced.length === 1, outcomes.join(' / '));
  check('the other received the platform\'s concurrency refusal', refused.length === 1);

  const attemptsA = a.counter.createAttempts.length - attemptsBefore.a;
  const attemptsB = b.counter.createAttempts.length - attemptsBefore.b;
  const loserAttempts = resultA.status === 'takenOver' ? attemptsA : attemptsB;
  const winnerAttempts = resultA.status === 'takenOver' ? attemptsB : attemptsA;

  check('the losing worker attempted ZERO native creates', loserAttempts === 0, `${loserAttempts} attempts`);
  check('the winning worker processed the bounded batch', winnerAttempts === BATCH, `${winnerAttempts} attempts`);

  const winner = resultA.status === 'progressed' ? resultA : resultB;
  if (winner.status === 'progressed') {
    for (const r of winner.results.filter(x => x.outcome !== 'sent')) {
      console.log('    recipient outcome:', r.outcome, '—', (r.detail ?? '').slice(0, 220));
    }
  }

  const after = await a.bulk.loadRun(runId);
  check('the cursor advanced exactly once', after?.cursor === BATCH, `cursor = ${after?.cursor}`);
  check('the run is still runnable', after?.status === 'Running', String(after?.status));
}

async function proveResumable(worker: Worker, runId: string, seed: Seed): Promise<void> {
  console.log('\n  ── Resume after contention ──');

  // A legitimate later worker claims the NEW row version and continues.
  const cfg = loadConfig();
  const resumed = buildWorker(cfg.apiBase, await acquireToken(cfg), 1_048_576);
  const outcome = await resumed.bulk.runBatch(runId, buildRequest(seed), eligible, BATCH);
  check('a later worker claimed the new version and continued', outcome.status === 'complete', outcome.status);

  const run = await worker.bulk.loadRun(runId);
  check('every recipient was processed', run?.cursor === POPULATION, `cursor = ${run?.cursor}`);
  check('the run is Completed', run?.status === 'Completed', String(run?.status));

  const verdict = await worker.bulk.reconcileRun(runId);
  check('the run reconciles against the platform\'s own record count',
    verdict?.reconciles === true,
    verdict ? `${verdict.progress.successful} sent + ${verdict.progress.refused} refused + `
      + `${verdict.progress.failed} failed = ${verdict.progress.total}; platform holds ${verdict.platformCount}`
      : 'no verdict');

  // Record the created faxes for cleanup, by reading what the run actually produced.
  const faxes = await findRunFaxes(cfg, await acquireToken(cfg));
  for (const id of faxes) created.push({ set: ENTITY_SETS.fax, id });
  check('exactly one native record exists per recipient', faxes.length === POPULATION, `${faxes.length} faxes`);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────



async function seedFixtures(cfg: unknown, token: string): Promise<Seed> {
  const post = async (path: string, body: Record<string, unknown>): Promise<string> => {
    const r = await apiPost(cfg, token, SOLUTION_NAME, path, body);
    const id = String(r?.entityId ?? '');
    if (!id) throw new Error(`no id from ${path}`);
    return id;
  };

  const contactIds: string[] = [];
  for (let i = 0; i < POPULATION; i++) {
    const id = await post('/contacts', {
      firstname: 'Race', lastname: mark(`C${i}`), mobilephone: '+9745550000' + i,
    });
    contactIds.push(id);
    created.push({ set: ENTITY_SETS.contact, id });
  }

  const caseId = await post('/qdb_collectioncases', {
    qdb_casenumber: mark('CASE'), qdb_facilitynumber: mark('F'), qdb_facilitysourcesystem: 'HL',
    qdb_customerbusinessid: mark('Q'), qdb_organizationcode: 100000140, qdb_episodenumber: 1,
    qdb_opendate: new Date().toISOString(), qdb_currentdpd: 30,
    'qdb_customerid_contact@odata.bind': `/contacts(${contactIds[0]})`,
  });
  created.push({ set: ENTITY_SETS.collectionCase, id: caseId });

  console.log(`  Seeded ${POPULATION} contacts and one case.\n`);
  return { caseId, contactIds };
}

async function createRun(bulk: BulkCommunicationService, seed: Seed): Promise<string> {
  const outcome = await bulk.createRun({
    name: mark('RUN'), channel: 'SMS', selectionMode: 'SelectedRecords',
    body: 'This is a Phase 7 test message. No customer receives it.',
    recipientIds: seed.contactIds,
  });
  if (outcome.status !== 'created') throw new Error(`run refused: ${outcome.message}`);
  return outcome.runId;
}

const eligible = (): Promise<EligibilityContext> => Promise.resolve({
  contactHold: { available: true, held: false },
  contactHoldPolicy: 'refuse-when-unverifiable',
});

const buildRequest = (seed: Seed) => (recipientId: string): Promise<CommunicationRequest | null> =>
  Promise.resolve({
    channel: 'SMS',
    caseId: seed.caseId,
    body: 'This is a Phase 7 test message. No customer receives it.',
    recipient: {
      table: 'contact', id: recipientId, displayName: mark('RACE'),
      mobile: '+97455500000',
      restrictions: { doNotFax: false, doNotEmail: false, doNotPhone: false },
    },
  });

// ── Helpers and cleanup ──────────────────────────────────────────────────────

async function readFrozenPopulationCapacity(cfg: unknown, token: string): Promise<number> {
  const meta = await apiGet(cfg, token, SOLUTION_NAME,
    "/EntityDefinitions(LogicalName='qdb_communicationrun')/Attributes(LogicalName='qdb_frozenpopulation')"
    + '/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=MaxLength');
  return Number(meta?.MaxLength ?? 0);
}

async function findRunFaxes(cfg: unknown, token: string): Promise<string[]> {
  const r = await apiGet(cfg, token, SOLUTION_NAME,
    `/faxes?$select=activityid&$filter=contains(subject,'SMOKE-P7RACE-')&$top=50`);
  return (r?.value ?? []).map((f: { activityid: string }) => f.activityid);
}

/**
 * Removes everything by id.
 *
 * By id rather than by marker: the `SMOKE-` cleaner covers neither `fax` nor `qdb_communicationrun`,
 * and leaving inert Fax rows behind would be residue even though none of them can send.
 */
async function cleanUp(cfg: { apiBase: string }, token: string, seed: Seed): Promise<void> {
  console.log('\n  ── Cleanup ──');
  void seed;
  let removed = 0;
  let refused = 0;

  // Faxes first: they reference the case, which cannot be deleted while they exist.
  // Faxes and the run first, by id: the SMOKE- cleaner covers neither. The case and contacts are
  // left to that cleaner, because ImmutabilityGuard blocks Delete on a collection case and only it
  // knows how to disable and restore the guards.
  const byId = created.filter(r => r.set === ENTITY_SETS.fax || r.set === ENTITY_SETS.communicationRun);
  for (const row of byId) {
    const res = await fetch(`${cfg.apiBase}/${row.set}(${row.id})`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    });
    res.ok ? removed++ : refused++;
  }
  check('every fax and run this test created was removed by id', refused === 0, `${removed} removed, ${refused} refused`);

  await cleanSmokeData({ cfg, token, confirmed: true, marker: 'SMOKE-' });

  for (const [set, field] of [
    [ENTITY_SETS.fax, 'subject'], [ENTITY_SETS.communicationRun, 'qdb_name'],
    [ENTITY_SETS.collectionCase, 'qdb_casenumber'], [ENTITY_SETS.contact, 'lastname'],
  ] as const) {
    const left = await apiGet(cfg, token, SOLUTION_NAME,
      `/${set}?$top=1&$count=true&$filter=startswith(${field},'SMOKE-P7RACE-')`);
    check(`zero SMOKE-P7RACE residue in ${set}`, left?.['@odata.count'] === 0, `${left?.['@odata.count']} rows`);
  }
}

main().catch(error => {
  console.error('\n  FATAL:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
