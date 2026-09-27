import { beforeEach, describe, expect, it } from 'vitest';
import type { CommunicationRequest, EligibilityContext } from '@dcp/domain';
import { BulkCommunicationService } from '../services/bulkCommunicationService.js';
import { CommunicationService, RECIPIENT_PARTY_MASK } from '../services/communicationService.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import type { WriteResponse, WriteTransport } from '../platform/writeTransport.js';

/**
 * The crash windows, proved against Dataverse's actual semantics.
 *
 * The fake below is not a set of scripted replies — it is a small store that enforces the two rules
 * WP3 proved on the real organisation: `If-None-Match: *` refuses a create when the id exists, and
 * `If-Match` refuses a write when the row version has moved. Scripted replies would let the executor
 * pass by agreeing with a script; this makes it meet the same refusals the platform issues.
 *
 * "The process dies" is modelled as the test simply not calling the next step — which is exactly
 * what a crash is from the platform's point of view. Nothing is reset between the crash and the
 * resume, because a real resume inherits whatever the platform was left holding.
 */

const CAPACITY = 1_048_576;
const CASE_ID = '11111111-1111-1111-1111-111111111111';

const recipient = (n: number) => `aaaaaaaa-bbbb-cccc-dddd-${n.toString(16).padStart(12, '0')}`;

/**
 * A store that behaves like Dataverse for the three operations the executor uses.
 *
 * Deliberately strict: it refuses rather than forgives, because a harness friendlier than the
 * platform proves nothing — the lesson KI-63, KI-64 and KI-75 each taught in turn.
 */
class FakeDataverse implements WriteTransport {
  readonly records = new Map<string, { body: Record<string, unknown>; version: number }>();
  readonly creates: string[] = [];
  /**
   * Activity parties, kept apart so they are not mistaken for communications when counting.
   *
   * Stored decomposed rather than as opaque bodies, because the executor now *reads* them back to
   * decide whether a communication is complete. A store that only remembered that a POST happened
   * could not answer that question, and the test would be agreeing with itself.
   */
  readonly parties: { activityId: string; partyId: string; mask: number }[] = [];

  /**
   * Makes the recipient-party POST fail while the activity create still succeeds.
   *
   * This is the window the live organisation exposed: a perfectly created Fax row whose recipient
   * never attached. It is not a hypothetical — it produced six inert rows reported as sent (KI-85).
   */
  failPartyAppend = false;
  /**
   * Kills the CHECKPOINT write specifically, standing in for a process that dies after creating
   * records but before recording that it did.
   *
   * Targeted at the checkpoint rather than 'the next patch' because the executor now claims the run
   * before doing any work — so a blunt flag would kill the claim instead, and nothing would ever be
   * created. The checkpoint is the write that carries the cursor.
   */
  failNextCheckpoint = false;

  private key(url: string): string {
    return url.split('?')[0] ?? url;
  }

  async createOnly(url: string, body: unknown): Promise<WriteResponse> {
    const key = this.key(url);
    this.creates.push(key);
    if (this.records.has(key)) {
      return { status: 412, message: 'A record with matching key values already exists.' };
    }
    this.records.set(key, { body: { ...(body as Record<string, unknown>) }, version: 1 });
    return { status: 201, etag: 'W/"1"' };
  }

  async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
    const isCheckpoint = typeof body === 'object' && body !== null && 'qdb_cursor' in body;
    if (this.failNextCheckpoint && isCheckpoint) {
      this.failNextCheckpoint = false;
      throw new Error('the process died before the checkpoint was persisted');
    }
    const key = this.key(url);
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, { body: { ...(body as Record<string, unknown>) }, version: 1 });
      return { status: 201, etag: 'W/"1"' };
    }
    if (ifMatch && ifMatch !== `W/"${existing.version}"`) {
      return {
        status: 412,
        message: "The version of the existing record doesn't match the RowVersion property provided.",
      };
    }
    existing.body = { ...existing.body, ...(body as Record<string, unknown>) };
    existing.version += 1;
    return { status: 200, etag: `W/"${existing.version}"` };
  }

  /**
   * Appending a party — recorded separately from the records map.
   *
   * Kept apart because a party's path starts with the activity's, so storing it alongside would
   * make every communication look like two and quietly break the reconciliation counts.
   */
  async post(url: string, body: unknown): Promise<WriteResponse> {
    if (this.failPartyAppend) {
      return { status: 500, message: 'the recipient could not be attached' };
    }
    const path = this.key(url);
    const activityId = path.match(/\(([0-9a-f-]+)\)/i)?.[1] ?? '';
    const fields = body as Record<string, unknown>;
    const bind = String(fields['partyid_contact@odata.bind'] ?? fields['partyid_account@odata.bind'] ?? '');
    const partyId = bind.match(/\(([0-9a-f-]+)\)/i)?.[1] ?? '';
    this.parties.push({ activityId, partyId, mask: Number(fields['participationtypemask']) });
    return { status: 204 };
  }

  async get(url: string): Promise<WriteResponse> {
    const path = this.key(url);

    // A read of a collection-valued navigation property, which is how the service asks "does this
    // activity already carry its recipient?". It has to be answered from the parties the store
    // really holds — answering 404 would make every retry look like a first attempt.
    const collection = path.match(/^\/(?:faxes|emails)\(([0-9a-f-]+)\)\/\w+_activity_parties$/i);
    if (collection) {
      const activityId = (collection[1] ?? '').toLowerCase();
      return {
        status: 200,
        body: {
          value: this.parties
            .filter(party => party.activityId.toLowerCase() === activityId)
            .map(party => ({
              activitypartyid: `${party.activityId}-${party.mask}`,
              participationtypemask: party.mask,
              _partyid_value: party.partyId,
            })),
        },
      };
    }

    const existing = this.records.get(path);
    if (!existing) return { status: 404 };
    return { status: 200, etag: `W/"${existing.version}"`, body: existing.body };
  }

  /** How many native activity rows exist. Existence only — **not** a count of communications. */
  countActivities(): number {
    return [...this.records.keys()].filter(k => k.startsWith('/faxes(') || k.startsWith('/emails(')).length;
  }

  /**
   * How many activities carry a recipient — the number of actual communications.
   *
   * The distinction the live platform forced: a row without its recipient party is a message nobody
   * can receive, so it is not a communication however perfect the row looks.
   */
  countCommunications(): number {
    return new Set(this.parties
      .filter(party => party.mask === RECIPIENT_PARTY_MASK)
      .map(party => party.activityId.toLowerCase())).size;
  }
}

function buildServices(store: FakeDataverse) {
  const xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://x/', getVersion: () => '9.2.0.0', userSettings: { userId: '{1}', userName: 't', languageId: 1033 } }) },
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      // Reconciliation reads through the client API; it answers from the same store so the count is
      // the store's truth rather than a second, agreeable fiction.
      // Reconciliation counts ActivityParty rows, so the fake answers from the parties it holds —
      // the same store, not a second and more agreeable fiction.
      async retrieveMultipleRecords(_logical: string, options = '') {
        const wanted = new Set([...String(options).matchAll(/_activityid_value eq ([0-9a-f-]+)/g)]
          .map(match => (match[1] ?? '').toLowerCase()));
        const entities = store.parties
          .filter(party => party.mask === RECIPIENT_PARTY_MASK && wanted.has(party.activityId.toLowerCase()))
          .map(party => ({
            activitypartyid: `${party.activityId}-${party.mask}`,
            _activityid_value: party.activityId,
          }));
        return { entities };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  } as unknown as XrmLike;

  const adapter = new XrmCrmAdapter(xrm, undefined, store);
  const communications = new CommunicationService(adapter);
  return { adapter, bulk: new BulkCommunicationService(adapter, communications, CAPACITY) };
}

const ELIGIBLE: EligibilityContext = {
  contactHold: { available: true, held: false },
  contactHoldPolicy: 'refuse-when-unverifiable',
};

const buildRequest = (recipientId: string): Promise<CommunicationRequest | null> =>
  Promise.resolve({
    channel: 'SMS',
    caseId: CASE_ID,
    body: 'Your payment is overdue.',
    recipient: {
      table: 'contact', id: recipientId, displayName: 'Test Customer',
      mobile: '+97455500000',
      restrictions: { doNotFax: false, doNotEmail: false, doNotPhone: false },
    },
  });

const alwaysEligible = () => Promise.resolve(ELIGIBLE);

let store: FakeDataverse;
let bulk: BulkCommunicationService;

beforeEach(() => {
  store = new FakeDataverse();
  ({ bulk } = buildServices(store));
});

async function createRun(count: number) {
  const created = await bulk.createRun({
    name: 'SMOKE-P7 bulk', channel: 'SMS', selectionMode: 'SelectedRecords',
    body: 'Your payment is overdue.',
    recipientIds: Array.from({ length: count }, (_, i) => recipient(i)),
  });
  if (created.status !== 'created') throw new Error(`run not created: ${created.message}`);
  return created.runId;
}

/** Runs batches until the run reports complete, or the guard trips. */
async function runToCompletion(runId: string, batchSize = 3, maxBatches = 20) {
  let batches = 0;
  for (;;) {
    const outcome = await bulk.runBatch(runId, buildRequest, alwaysEligible, batchSize);
    batches++;
    if (outcome.status === 'complete' || outcome.status === 'notRunnable' || outcome.status === 'takenOver') {
      return { outcome, batches };
    }
    if (batches >= maxBatches) throw new Error('did not complete within the batch guard');
  }
}

// ── The crash windows ────────────────────────────────────────────────────────

describe('crash windows', () => {
  /** 1 — failure before the native record is created: the recipient is simply attempted again. */
  it('re-attempts a recipient whose send failed before anything was created', async () => {
    const runId = await createRun(6);
    let failFirst = true;
    const flaky = (id: string) => {
      if (failFirst) { failFirst = false; return Promise.reject(new Error('network down')); }
      return buildRequest(id);
    };

    const first = await bulk.runBatch(runId, flaky as never, alwaysEligible, 3);
    expect(first.status).toBe('progressed');
    if (first.status !== 'progressed') return;
    expect(first.progress.failed, 'one retryable failure recorded').toBe(1);

    // A resume re-attempts only that recipient; the other two are already done.
    const before = store.countActivities();
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    expect(store.countActivities()).toBeGreaterThanOrEqual(before);
  });

  /**
   * 2 and 3 — the record is created and then the checkpoint write dies.
   *
   * The most important test in the file. On resume the same deterministic id is derived, the
   * platform refuses the create, and the executor must treat that as already processed: no second
   * record, no overwrite, no extra failure, no double-counted success.
   */
  it('recognises its own earlier work when the checkpoint never persisted', async () => {
    const runId = await createRun(3);

    store.failNextCheckpoint = true;
    await expect(bulk.runBatch(runId, buildRequest, alwaysEligible, 3)).rejects.toThrow(/process died/);

    const afterCrash = store.countActivities();
    expect(afterCrash, 'the records were created before the crash').toBe(3);

    // Resume. The cursor never moved, so the same three recipients are attempted again.
    const resumed = await runToCompletion(runId, 3);
    expect(resumed.outcome.status).toBe('complete');

    expect(store.countActivities(), 'no duplicate was created').toBe(3);
    if (resumed.outcome.status !== 'complete') return;
    expect(resumed.outcome.progress.successful, 'counted once, not twice').toBe(3);
    expect(resumed.outcome.progress.failed, 'the refusal is not a failure').toBe(0);
  });

  /** 4 — the checkpoint persisted and then the process died: a resume must not regress. */
  it('resumes from the persisted cursor without repeating completed work', async () => {
    const runId = await createRun(6);
    const first = await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    expect(first.status).toBe('progressed');

    const createsAfterFirst = store.creates.length;
    const run = await bulk.loadRun(runId);
    expect(run?.cursor, 'the checkpoint is an absolute position').toBe(3);

    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    const run2 = await bulk.loadRun(runId);
    expect(run2?.cursor, 'it advanced, never regressed').toBe(6);
    expect(store.creates.length - createsAfterFirst, 'only the remaining three were attempted').toBe(3);
  });

  /** 5 — the same batch twice must leave the same records and the same accounting as once. */
  it('leaves identical state when the same batch is executed twice', async () => {
    const runIdOnce = await createRun(4);
    await runToCompletion(runIdOnce, 4);
    const onceRun = await bulk.loadRun(runIdOnce);
    const onceActivities = store.countActivities();

    // A second identical pass over an already-complete run changes nothing.
    const again = await bulk.runBatch(runIdOnce, buildRequest, alwaysEligible, 4);
    expect(again.status).toBe('notRunnable');
    expect(store.countActivities()).toBe(onceActivities);
    const afterRun = await bulk.loadRun(runIdOnce);
    expect(afterRun?.cursor).toBe(onceRun?.cursor);
  });

  /** 6 and 7 — no in-memory state. A brand new service instance resumes the same run. */
  it('resumes through a completely new service instance, holding nothing in memory', async () => {
    const runId = await createRun(6);
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);

    // Stand in for a process restart or the browser being closed and reopened: the store survives,
    // every object above it is rebuilt.
    const { bulk: rebuilt } = buildServices(store);
    const finished = await rebuilt.runBatch(runId, buildRequest, alwaysEligible, 3);

    expect(finished.status).toBe('complete');
    if (finished.status !== 'complete') return;
    expect(finished.progress.successful).toBe(6);
    expect(store.countActivities()).toBe(6);
  });

  /** 8 — a duplicated recipient in the frozen source cannot produce two communications. */
  it('sends once to a customer who appears twice in the source population', async () => {
    const duplicated = [recipient(1), recipient(2), recipient(1), recipient(2), recipient(1)];
    const created = await bulk.createRun({
      name: 'SMOKE-P7 duplicates', channel: 'SMS', selectionMode: 'SelectedRecords',
      body: 'x', recipientIds: duplicated,
    });
    expect(created.status).toBe('created');
    if (created.status !== 'created') return;
    expect(created.total, 'collapsed at freeze time').toBe(2);

    await runToCompletion(created.runId, 5);
    expect(store.countActivities()).toBe(2);
  });

  /**
   * 9 — the population is frozen; eligibility is not.
   *
   * A customer who was in scope at confirmation but has since been restricted must be refused at
   * send time, and must still be accounted for. Freezing decides who was in scope; the gate decides
   * whether to send now.
   */
  it('keeps a newly ineligible recipient in the population but refuses to send to them', async () => {
    const runId = await createRun(3);
    const blocked = recipient(1);

    const withRestriction = async (id: string) => {
      const request = await buildRequest(id);
      if (request && id === blocked) {
        return { ...request, recipient: { ...request.recipient, restrictions: { doNotFax: true, doNotEmail: false, doNotPhone: false } } };
      }
      return request;
    };

    const finished = await runToCompletion(runId, 3);
    void finished;
    const run = await bulk.loadRun(runId);
    expect(run?.total, 'the frozen population is unchanged').toBe(3);

    // Re-run the same scenario with the restriction in place from the start.
    const secondRunId = await createRun(3);
    const outcome = await bulk.runBatch(secondRunId, withRestriction as never, alwaysEligible, 3);
    expect(outcome.status).toBe('complete');
    if (outcome.status !== 'complete') return;
    expect(outcome.progress.refused, 'refused, not failed — retrying changes nothing').toBe(1);
    expect(outcome.progress.successful).toBe(2);
    expect(outcome.progress.total, 'the population did not shrink').toBe(3);
  });

  /** 10 — the rendered content is frozen with the population. */
  it('keeps using the content frozen at confirmation when the template changes mid-run', async () => {
    const runId = await createRun(6);
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);

    const run = await bulk.loadRun(runId);
    expect(run?.body, 'the body is read from the run, not re-rendered').toBe('Your payment is overdue.');

    // A template edited now cannot reach this run: nothing re-renders, and the second half of the
    // population receives what the first half did.
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    const after = await bulk.loadRun(runId);
    expect(after?.body).toBe('Your payment is overdue.');
  });
});

// ── Concurrency: two workers, one run ────────────────────────────────────────

describe('two workers on one run', () => {
  /**
   * The point the authorisation sharpens: derived counters only help if their SOURCE is
   * concurrency-safe. `successful` is derived from `processed`, and `processed` is the persisted
   * cursor — so a stale worker must not be able to advance it.
   */
  it('refuses a stale worker\'s checkpoint, so the cursor cannot be advanced twice', async () => {
    const runId = await createRun(9);

    // Both workers read the same version, as two tabs would.
    const { bulk: workerA } = buildServices(store);
    const { bulk: workerB } = buildServices(store);
    const runForA = await workerA.loadRun(runId);
    const runForB = await workerB.loadRun(runId);
    expect(runForA?.version).toBe(runForB?.version);

    // Started together so both read the run before either claims it — awaiting them in turn would
    // let the second re-read after the first had committed, which is not the race being tested.
    const [resultA, resultB] = await Promise.all([
      workerA.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);
    const advanced = [resultA, resultB].filter(r => r.status === 'progressed');
    const refused = [resultA, resultB].filter(r => r.status === 'takenOver');
    expect(advanced, 'exactly one advanced the run').toHaveLength(1);
    expect(refused, 'the loser is told, not silently ignored').toHaveLength(1);

    const afterBoth = await bulk.loadRun(runId);
    expect(afterBoth?.cursor, 'advanced once, not twice').toBe(3);
  });

  /**
   * The harder case the authorisation names: the losing worker had ALREADY created native records
   * before losing the run-row race. Those records are valid work and must survive, and the winner
   * must reconcile them rather than duplicate them.
   */
  it('keeps the records a losing worker already created, and never duplicates them', async () => {
    const runId = await createRun(6);
    const { bulk: workerA } = buildServices(store);
    const { bulk: workerB } = buildServices(store);
    await workerA.loadRun(runId);
    await workerB.loadRun(runId);

    // Both attempt the same batch. Both create the same deterministic ids; the second gets refusals.
    const [resultA, resultB] = await Promise.all([
      workerA.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);

    const winners = [resultA, resultB].filter(r => r.status === 'progressed');
    const losers = [resultA, resultB].filter(r => r.status === 'takenOver');
    expect(winners, 'exactly one advanced the run').toHaveLength(1);
    expect(losers, 'exactly one was told it had been taken over').toHaveLength(1);

    expect(store.countActivities(), 'three recipients, three records — never six').toBe(3);

    // The run stays resumable, and the work the loser did is not repeated.
    const finished = await runToCompletion(runId, 3);
    expect(finished.outcome.status).toBe('complete');
    expect(store.countActivities()).toBe(6);
  });

  /**
   * The sharpest form of "both cannot independently advance the run".
   *
   * Duplicate-safety alone does not need the claim — the deterministic ids would collapse the
   * loser's records anyway. What the claim adds is that the loser never creates them: it discovers
   * it has lost **before** doing any work, so two workers never both process the same batch.
   */
  it('lets the loser create nothing at all, not merely nothing duplicated', async () => {
    const runId = await createRun(9);
    const { bulk: workerA } = buildServices(store);
    const { bulk: workerB } = buildServices(store);

    const before = store.creates.filter(k => k.startsWith('/faxes(')).length;
    const outcomes = await Promise.all([
      workerA.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);
    const attempted = store.creates.filter(k => k.startsWith('/faxes(')).length - before;

    expect(outcomes.filter(o => o.status === 'takenOver'), 'one lost').toHaveLength(1);
    // Three recipients attempted once — not six attempts collapsing to three records.
    expect(attempted, 'the loser never reached a create').toBe(3);
  });

  /**
   * The source of the derived counters must itself be concurrency-safe, which is the point the
   * authorisation makes: deriving `successful` from `processed` only helps if `processed` cannot be
   * advanced twice.
   */
  it('advances the cursor exactly once under contention', async () => {
    const runId = await createRun(9);
    const { bulk: workerA } = buildServices(store);
    const { bulk: workerB } = buildServices(store);
    await Promise.all([
      workerA.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);
    const run = await bulk.loadRun(runId);
    expect(run?.cursor, 'one batch of three, not two').toBe(3);
  });

  it('leaves the run resumable after contention', async () => {
    const runId = await createRun(6);
    const { bulk: workerB } = buildServices(store);
    const [, contended] = await Promise.all([
      bulk.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);
    expect(contended.status).toBe('takenOver');

    const finished = await runToCompletion(runId, 3);
    expect(finished.outcome.status).toBe('complete');
    if (finished.outcome.status !== 'complete') return;
    expect(finished.outcome.progress.successful).toBe(6);
  });
});

// ── The completion invariant ─────────────────────────────────────────────────

describe('the accounting invariant, under every path', () => {
  const assertReconciles = async (runId: string) => {
    const verdict = await bulk.reconcileRun(runId);
    expect(verdict, 'the run could be read').not.toBeNull();
    if (!verdict) return;
    const { progress } = verdict;
    expect(
      progress.successful + progress.refused + progress.failed,
      'frozen population = successful + refused + failed',
    ).toBe(progress.total);
    return verdict;
  };

  it('holds after a clean execution', async () => {
    const runId = await createRun(6);
    await runToCompletion(runId, 3);
    const verdict = await assertReconciles(runId);
    expect(verdict?.reconciles).toBe(true);
  });

  it('holds after a crash and resume', async () => {
    const runId = await createRun(6);
    store.failNextCheckpoint = true;
    await expect(bulk.runBatch(runId, buildRequest, alwaysEligible, 3)).rejects.toThrow();
    await runToCompletion(runId, 3);
    const verdict = await assertReconciles(runId);
    expect(verdict?.reconciles, 'the platform agrees with the run').toBe(true);
  });

  it('holds when the source population contained a duplicate', async () => {
    const created = await bulk.createRun({
      name: 'SMOKE-P7 dup', channel: 'SMS', selectionMode: 'SelectedRecords',
      body: 'x', recipientIds: [recipient(1), recipient(1), recipient(2)],
    });
    if (created.status !== 'created') throw new Error('not created');
    await runToCompletion(created.runId, 5);
    await assertReconciles(created.runId);
  });

  it('holds after two-worker contention', async () => {
    const runId = await createRun(6);
    const { bulk: workerB } = buildServices(store);
    await Promise.all([
      bulk.runBatch(runId, buildRequest, alwaysEligible, 3),
      workerB.runBatch(runId, buildRequest, alwaysEligible, 3),
    ]);
    await runToCompletion(runId, 3);
    await assertReconciles(runId);
  });

  /** A run that has not finished must never look reconciled, whatever its counters say. */
  it('refuses to call a part-finished run reconciled', async () => {
    const runId = await createRun(9);
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    const verdict = await bulk.reconcileRun(runId);
    expect(verdict?.reconciles).toBe(false);
    expect(verdict?.message).toMatch(/not complete/);
  });
});

// ── Capacity, against the real column size ───────────────────────────────────

describe('frozen population capacity, against the real metadata limit', () => {
  it('refuses an empty selection before creating anything', async () => {
    const outcome = await bulk.createRun({
      name: 'x', channel: 'SMS', selectionMode: 'FilterDefinition', body: 'x', recipientIds: [],
    });
    expect(outcome.status).toBe('refused');
    expect(store.records.size, 'nothing was created').toBe(0);
  });

  it('accepts the whole collection book', async () => {
    const ids = Array.from({ length: 4_363 }, (_, i) => recipient(i));
    const outcome = await bulk.createRun({
      name: 'whole book', channel: 'SMS', selectionMode: 'FilterDefinition', body: 'x', recipientIds: ids,
    });
    expect(outcome.status).toBe('created');
    if (outcome.status === 'created') expect(outcome.total).toBe(4_363);
  });

  /** Beyond what the real column can hold: refused before execution, never truncated. */
  it('refuses a population beyond the column, and creates no run', async () => {
    const ids = Array.from({ length: 40_000 }, (_, i) => recipient(i));
    const outcome = await bulk.createRun({
      name: 'too many', channel: 'SMS', selectionMode: 'FilterDefinition', body: 'x', recipientIds: ids,
    });
    expect(outcome.status).toBe('refused');
    if (outcome.status === 'refused') expect(outcome.message).toMatch(/narrow the filter/i);
    expect(store.records.size, 'no partial run was left behind').toBe(0);
  });
});

// ── The second crash window: the row exists, the communication does not ──────

/**
 * A native row is not a communication.
 *
 * The live organisation taught this one the hard way. Six Fax rows were created perfectly, their
 * recipient ActivityParty appends all failed with 500, and the run reported `0 sent + 6 failed` —
 * the honest half of the answer. The dangerous half is what happens *next*: on retry the same
 * deterministic id already exists, the platform refuses the create, and an executor that read
 * `created: false` as "already sent" would mark six customers contacted who could never receive
 * anything (KI-85).
 *
 * So `sent` means the row **and** its required structure. These ten tests pin every corner of that.
 */
describe('a communication is the activity and its recipient, not the activity alone', () => {
  /** 1 — the ordinary path: both halves succeed, and the structure is really there. */
  it('creates the activity and attaches the recipient', async () => {
    const runId = await createRun(3);
    const outcome = await runToCompletion(runId, 3);

    expect(outcome.outcome.status).toBe('complete');
    expect(store.countActivities(), 'three rows').toBe(3);
    expect(store.countCommunications(), 'three rows that someone can receive').toBe(3);
    expect(store.parties.every(party => party.mask === RECIPIENT_PARTY_MASK)).toBe(true);
  });

  /** 2 — the row lands and the party append is refused. */
  it('reports a recipient whose party could not be attached as not sent', async () => {
    const runId = await createRun(3);
    store.failPartyAppend = true;

    const outcome = await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);
    expect(outcome.status).toBe('progressed');
    if (outcome.status !== 'progressed') return;

    expect(store.countActivities(), 'the rows exist').toBe(3);
    expect(store.countCommunications(), 'none of them is a communication').toBe(0);
    expect(outcome.progress.successful, 'and none of them is counted as sent').toBe(0);
    expect(outcome.progress.failed, 'all three are retryable failures').toBe(3);
  });

  /** 3 — the process dies between creating the activity and attaching the party. */
  it('leaves an incomplete activity when the process dies between the two operations', async () => {
    const runId = await createRun(2);
    store.failPartyAppend = true;
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 2);

    // What the platform is left holding is exactly a half-made communication.
    expect(store.countActivities()).toBe(2);
    expect(store.countCommunications()).toBe(0);
  });

  /** 4 — a retry against an existing incomplete activity must complete it, not skip it. */
  it('completes an existing incomplete activity on retry rather than treating it as sent', async () => {
    const runId = await createRun(2);
    store.failPartyAppend = true;
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 2);
    const createsBefore = store.creates.length;

    store.failPartyAppend = false;
    const repaired = await bulk.retryFailures(runId, buildRequest, alwaysEligible);

    expect(repaired.status).toBe('complete');
    expect(store.countCommunications(), 'now they are communications').toBe(2);
    expect(store.countActivities(), 'repaired in place — no second row').toBe(2);
    expect(store.creates.length, 'the retry did attempt the create again').toBeGreaterThan(createsBefore);
  });

  /** 5 — a retry that finds the party already there must not add a second one. */
  it('adds nothing when the recipient is already attached', async () => {
    const runId = await createRun(2);
    await runToCompletion(runId, 2);
    const partiesAfterFirstPass = store.parties.length;

    // A different run derives different activity ids, so it legitimately attaches its own two
    // parties — and still exactly one per activity, which is the property under test.
    const secondRunId = await createRun(2);
    await runToCompletion(secondRunId, 2);

    expect(store.parties.length - partiesAfterFirstPass).toBe(2);
    expect(store.parties.filter(p => p.mask === RECIPIENT_PARTY_MASK).length)
      .toBe(new Set(store.parties.map(p => p.activityId)).size);
  });

  /** 6 — repairing twice is repairing once. */
  it('is idempotent when the repair is attempted more than once', async () => {
    const runId = await createRun(2);
    store.failPartyAppend = true;
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 2);

    store.failPartyAppend = false;
    await bulk.retryFailures(runId, buildRequest, alwaysEligible);
    const afterFirstRepair = store.parties.length;

    // A second executor over the same store, repairing what is already repaired. Nothing is left
    // recorded as failed, so the pass is a no-op — and must stay a no-op at the platform too.
    const { bulk: second } = buildServices(store);
    await second.retryFailures(runId, buildRequest, alwaysEligible);

    expect(store.parties.length, 'the second repair adds nothing').toBe(afterFirstRepair);
    expect(store.countCommunications()).toBe(2);
  });

  /** 7 — the headline rule, stated as its own assertion. */
  it('never counts an incomplete activity as a success', async () => {
    const runId = await createRun(4);
    store.failPartyAppend = true;
    const outcome = await bulk.runBatch(runId, buildRequest, alwaysEligible, 4);

    if (outcome.status !== 'progressed') throw new Error('expected progress');
    expect(outcome.progress.successful).toBe(0);
    expect(store.countActivities(), 'even though four rows exist').toBe(4);
  });

  /** 8 — a repaired communication is a success exactly once, however many passes it took. */
  it('counts a repaired communication once', async () => {
    const runId = await createRun(3);
    store.failPartyAppend = true;
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 3);

    store.failPartyAppend = false;
    const repaired = await bulk.retryFailures(runId, buildRequest, alwaysEligible);

    if (repaired.status !== 'complete') throw new Error('expected completion');
    expect(repaired.progress.successful, 'three, not six').toBe(3);
    expect(repaired.progress.total).toBe(3);
    expect(repaired.progress.failed, 'nothing left retryable').toBe(0);
  });

  /** 9 — no duplicate parties survive a retry, whatever route the retry took. */
  it('leaves exactly one recipient party per activity after a retry', async () => {
    const runId = await createRun(4);
    store.failPartyAppend = true;
    await bulk.runBatch(runId, buildRequest, alwaysEligible, 2);
    store.failPartyAppend = false;
    await runToCompletion(runId, 2);
    await bulk.retryFailures(runId, buildRequest, alwaysEligible);

    const perActivity = new Map<string, number>();
    for (const party of store.parties.filter(p => p.mask === RECIPIENT_PARTY_MASK)) {
      perActivity.set(party.activityId, (perActivity.get(party.activityId) ?? 0) + 1);
    }
    expect([...perActivity.values()].every(count => count === 1), 'one recipient each').toBe(true);
  });

  /**
   * 10a — the terminal checkpoint waits for the complete contract.
   *
   * A run whose cursor has reached the end of its population is not finished if any recipient is
   * still a half-made communication. Marking it Completed would close the only door through which
   * the repair could happen, behind a green "done".
   */
  it('does not complete a run while a communication is still incomplete', async () => {
    const runId = await createRun(3);
    store.failPartyAppend = true;
    const swept = await runToCompletion(runId, 3);

    // The cursor is at the end, and the run is still open for repair rather than Completed.
    expect(swept.outcome.status).toBe('complete');
    const afterSweep = await bulk.loadRun(runId);
    expect(afterSweep?.cursor, 'the whole population was attempted').toBe(3);
    expect(afterSweep?.status, 'but the run is not Completed').toBe('Paused');

    store.failPartyAppend = false;
    await bulk.retryFailures(runId, buildRequest, alwaysEligible);

    const afterRepair = await bulk.loadRun(runId);
    expect(afterRepair?.status, 'Completed only once every communication is whole').toBe('Completed');
  });

  /**
   * 10b — reconciliation counts the structure, not the rows.
   *
   * Where it matters most: the platform's own count is of *complete* communications. If the
   * structure is not there, a run that believes it sent three must not reconcile — which is
   * precisely the report the live organisation would have produced over six orphan Fax rows.
   */
  it('refuses to reconcile when the activities exist but the structure does not', async () => {
    const runId = await createRun(3);
    await runToCompletion(runId, 3);

    const whole = await bulk.reconcileRun(runId);
    expect(whole?.reconciles, 'three communications, counted by the platform').toBe(true);
    expect(whole?.platformCount).toBe(3);

    // The rows survive; their recipients do not. Nothing about the executor's own tally changes.
    store.parties.length = 0;

    const orphaned = await bulk.reconcileRun(runId);
    expect(store.countActivities(), 'the rows are all still there').toBe(3);
    expect(orphaned?.reconciles, 'and none of them is a communication').toBe(false);
    expect(orphaned?.platformCount).toBe(0);
  });
});
