import { describe, expect, it } from 'vitest';
import { RuleEngineError, type ICheckpointStore, type ProcessingCheckpoint } from '@dcp/domain';
import { BackgroundSyncRunner, StubRuleEngine } from '../services/collection/index.js';
import { MockMisDelinquencyService, type MockMisFaults } from '../services/mis/index.js';
import { buildHarness, MemoryLogger } from './helpers/collectionFixtures.js';

/** An in-memory checkpoint store, so restart behaviour is observable. */
class MemoryCheckpoints implements ICheckpointStore {
  readonly written: ProcessingCheckpoint[] = [];
  private store = new Map<string, ProcessingCheckpoint>();
  async read(org: string, runId: string) { return this.store.get(`${org}/${runId}`) ?? null; }
  async write(checkpoint: ProcessingCheckpoint) {
    this.store.set(`${checkpoint.organizationCode}/${checkpoint.runId}`, checkpoint);
    this.written.push(checkpoint);
  }
}

/** Rows in the evidenced shape. `bad` injects the specific defect a test is about. */
function rows(count: number, bad: Record<number, Record<string, unknown>> = {}): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    'Customer Number': 'C-1001',
    'Customer Name': `CUSTOMER ${i}`,
    'Account Number': 900000 + i,
    'Loan Type Code': 1011,
    'Loan Type Description': 'Building Housing',
    'ID Number': '28912345678',
    'QCB Deceased Status': null,
    'Loan Balance': 500000,
    'Account Status': 8,
    'Arrear Buckets': '31-60',
    'First Arrear Date': '30/06/2026',
    'Arrear Days': 45,
    'Total Arrears': 12500,
    'Installment Amount': 6000,
    'Last Arrear Amount': 6000,
    'Arrear %': 1,
    'Exemption Percentage': null,
    'Exemption Amount': null,
    'Mobile Number': 55512345,
    ...(bad[i] ?? {}),
  }));
}

function buildRunner(options: {
  rowCount?: number;
  bad?: Record<number, Record<string, unknown>>;
  faults?: MockMisFaults;
  ruleEngine?: ConstructorParameters<typeof StubRuleEngine>[0] | 'refusing';
} = {}) {
  const harness = buildHarness(
    options.ruleEngine === 'refusing'
      ? { ruleEngine: {
          evaluateEligibility: async () => { throw new RuleEngineError('no ruleset configured', 'X'); },
          selectStrategy: async () => { throw new RuleEngineError('no ruleset configured', 'X'); },
          evaluateContactHold: async () => { throw new RuleEngineError('no ruleset configured', 'X'); },
        } }
      : {});
  const mis = new MockMisDelinquencyService(
    rows(options.rowCount ?? 25, options.bad),
    { sourceSystem: 'HL', misAsOfDate: '2026-06-30', ...(options.faults ? { faults: options.faults } : {}) });
  const checkpoints = new MemoryCheckpoints();
  const logger = new MemoryLogger();
  const runner = new BackgroundSyncRunner(mis, harness.service, checkpoints, logger, () => '2026-09-18T15:00:00.000Z');
  return { runner, checkpoints, harness, logger, mis };
}

const OPTIONS = { organizationCode: 'HL', runId: 'run-1', mode: 'FullScan' as const, pageSize: 10 };

describe('processing a population incrementally', () => {
  it('walks every page and processes every record', async () => {
    const { runner } = buildRunner({ rowCount: 25 });
    const report = await runner.run(OPTIONS);
    expect(report.pagesRead).toBe(3);
    expect(report.recordsProcessed).toBe(25);
  });

  it('checkpoints after each page, not once at the end', async () => {
    const { runner, checkpoints } = buildRunner({ rowCount: 25 });
    await runner.run(OPTIONS);
    expect(checkpoints.written).toHaveLength(3);
    expect(checkpoints.written.map(c => c.pagesCompleted)).toEqual([1, 2, 3]);
  });

  it('finishes with a completed checkpoint carrying no continuation', async () => {
    const { runner } = buildRunner({ rowCount: 25 });
    const report = await runner.run(OPTIONS);
    expect(report.checkpoint.completed).toBe(true);
    expect(report.checkpoint.sourceContinuation).toBeUndefined();
  });

  it('creates one collection case per facility', async () => {
    const { runner, harness } = buildRunner({ rowCount: 12 });
    await runner.run(OPTIONS);
    expect(harness.crm.rows('qdb_collectioncases')).toHaveLength(12);
  });

  it('says plainly that a full scan is not source-level change synchronisation', async () => {
    const { runner } = buildRunner({ rowCount: 5 });
    const report = await runner.run(OPTIONS);
    expect(report.guarantee).toMatch(/NOT.*source-level change synchronisation/);
  });

  it('refuses a delta run against a source with no change feed', async () => {
    const { runner } = buildRunner({ rowCount: 5, faults: { noChangeFeed: true } });
    await expect(runner.run({ ...OPTIONS, mode: 'SourceDelta' })).rejects.toThrow(/reload the whole population/);
  });
});

describe('one bad observation does not destroy the rest', () => {
  it('isolates a row the normalizer refuses and still processes the others', async () => {
    // A bucket outside the taxonomy: the provider drops it, so the page is simply short.
    const { runner } = buildRunner({ rowCount: 10, bad: { 3: { 'Arrear Buckets': 'not-a-bucket' } } });
    const report = await runner.run(OPTIONS);
    expect(report.recordsProcessed).toBe(9);
  });

  it('isolates a row with no customer identity', async () => {
    const { runner } = buildRunner({ rowCount: 10, bad: { 2: { 'ID Number': null, 'Customer Number': null } } });
    const report = await runner.run(OPTIONS);
    expect(report.recordsProcessed).toBe(9);
  });

  it('isolates a malformed facility identity and carries on', async () => {
    const { runner, harness } = buildRunner({ rowCount: 6, bad: { 1: { 'Account Number': 'x'.repeat(80) } } });
    const report = await runner.run(OPTIONS);
    expect(report.counts.FacilityException ?? 0).toBeGreaterThan(0);
    expect(harness.crm.rows('qdb_collectioncases').length).toBe(5);
  });

  it('records an unknown customer as an identity exception rather than failing the run', async () => {
    const { runner } = buildRunner({ rowCount: 5, bad: { 0: { 'ID Number': '99999999999', 'Customer Number': 'C-NOPE' } } });
    const report = await runner.run(OPTIONS);
    expect(report.counts.IdentityException).toBe(1);
    expect(report.recordsProcessed).toBe(5);
  });

  it('enumerates isolated failures so they can be acted on without trawling logs', async () => {
    const { runner } = buildRunner({ rowCount: 5, ruleEngine: 'refusing' });
    const report = await runner.run(OPTIONS);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures[0]).toHaveProperty('facilityNumber');
  });

  it('keeps going when the Rule Engine refuses every record, and reports them all as failed', async () => {
    const { runner } = buildRunner({ rowCount: 7, ruleEngine: 'refusing' });
    const report = await runner.run(OPTIONS);
    expect(report.recordsFailed).toBe(7);
    expect(report.checkpoint.completed).toBe(true);
  });

  it('counts a persistence failure as an isolated record failure', async () => {
    const { runner, harness } = buildRunner({ rowCount: 5 });
    harness.crm.failCreateWhen = (entity) => entity === 'qdb_collectioncases';
    const report = await runner.run(OPTIONS);
    expect(report.recordsFailed).toBeGreaterThan(0);
    expect(report.checkpoint.completed).toBe(true);
  });
});

describe('a page that fails', () => {
  it('stops the run without advancing the checkpoint past unprocessed work', async () => {
    const { runner, checkpoints } = buildRunner({ rowCount: 30, faults: { failOnPageIndex: 1 } });
    const report = await runner.run({ ...OPTIONS, pageRetries: 0 });

    expect(report.stoppedBecause).toBeDefined();
    expect(report.checkpoint.completed).toBe(false);
    // Exactly one page was persisted; the failed page contributed nothing to the tally.
    expect(report.checkpoint.pagesCompleted).toBe(1);
    expect(report.checkpoint.recordsProcessed).toBe(10);
    expect(checkpoints.written).toHaveLength(1);
  });

  it('retries a transient page failure and completes without operator intervention', async () => {
    const { runner } = buildRunner({ rowCount: 30, faults: { failOnPageIndex: 1 } });
    const report = await runner.run({ ...OPTIONS, pageRetries: 1 });
    expect(report.stoppedBecause).toBeUndefined();
    expect(report.recordsProcessed).toBe(30);
  });

  it('resumes from the checkpoint and does not reprocess completed pages', async () => {
    const { runner, checkpoints, harness } = buildRunner({ rowCount: 30, faults: { failOnPageIndex: 1 } });
    const first = await runner.run({ ...OPTIONS, pageRetries: 0 });
    expect(first.checkpoint.recordsProcessed).toBe(10);
    const casesAfterFailure = harness.crm.rows('qdb_collectioncases').length;

    // The same runner, resuming: the stored checkpoint carries the source continuation.
    const second = await runner.run({ ...OPTIONS, pageRetries: 1 });

    expect(second.checkpoint.completed).toBe(true);
    expect(second.checkpoint.recordsProcessed).toBe(30);
    expect(checkpoints.written.at(-1)!.pagesCompleted).toBe(3);
    // The first ten facilities already had cases; resuming added the rest rather than duplicating.
    expect(harness.crm.rows('qdb_collectioncases').length).toBeGreaterThan(casesAfterFailure);
    expect(harness.crm.rows('qdb_collectioncases')).toHaveLength(30);
  });

  it('refuses to resume a run that already completed', async () => {
    const { runner } = buildRunner({ rowCount: 5 });
    await runner.run(OPTIONS);
    await expect(runner.run(OPTIONS)).rejects.toThrow(/already completed/);
  });
});

describe('a source that behaves awkwardly', () => {
  it('handles a short page without treating it as the end', async () => {
    const { runner } = buildRunner({ rowCount: 20, faults: { shortPageSize: 3 } });
    const report = await runner.run(OPTIONS);
    expect(report.recordsProcessed).toBe(20);
    expect(report.pagesRead).toBeGreaterThan(2);
  });

  it('stops at the page safety rail rather than looping forever on a repeated continuation', async () => {
    const { runner } = buildRunner({ rowCount: 100 });
    const report = await runner.run({ ...OPTIONS, pageSize: 5, maxPages: 3 });
    expect(report.stoppedBecause).toMatch(/safety rail/);
    expect(report.pagesRead).toBe(3);
    expect(report.checkpoint.completed).toBe(false);
  });

  it('processes a duplicate facility across pages only once', async () => {
    // Two rows for the same account number, which a repeating source could produce.
    const { runner, harness } = buildRunner({ rowCount: 6, bad: { 4: { 'Account Number': 900000 } } });
    const report = await runner.run({ ...OPTIONS, pageSize: 3 });
    expect(report.recordsProcessed).toBe(6);
    expect(harness.crm.rows('qdb_collectioncases')).toHaveLength(5);
  });
});

describe('the run is visible in the technical log', () => {
  it('logs the run starting and finishing against qdb_crmlogs', async () => {
    const { runner, logger } = buildRunner({ rowCount: 5 });
    await runner.run(OPTIONS);
    const operations = logger.entries.map(e => e.operation);
    expect(operations).toContain('runStarted');
    expect(operations).toContain('runFinished');
  });

  it('logs a page failure with an actionable code', async () => {
    const { runner, logger } = buildRunner({ rowCount: 30, faults: { failOnPageIndex: 0 } });
    await runner.run({ ...OPTIONS, pageRetries: 0 });
    expect(logger.entries.some(e => e.errorCode === 'sync_page_failed')).toBe(true);
  });
});
