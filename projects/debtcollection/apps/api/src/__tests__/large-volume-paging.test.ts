import { describe, expect, it } from 'vitest';
import type { ICheckpointStore, ProcessingCheckpoint } from '@dcp/domain';
import { BackgroundSyncRunner, StubRuleEngine } from '../services/collection/index.js';
import { MockMisDelinquencyService } from '../services/mis/index.js';
import { buildHarness, MemoryLogger } from './helpers/collectionFixtures.js';

/**
 * Large-volume behaviour, exercised against synthetic in-memory populations.
 *
 * Volumes here are **logical**: 10K, 50K and 100K records are generated in memory and paged through
 * the real contract. Nothing is written to the QDB Cloud sandbox — creating a hundred thousand rows
 * in a shared organisation to satisfy a test would be vandalism, and the sandbox is shared with EDP,
 * CWFD and DFE. Real Dataverse paging keeps its own targeted live coverage in `smoke-qdb-phase4.mjs`.
 *
 * What these tests are for is the property that cannot be seen at small scale: that **memory does not
 * grow with the size of the dataset**, because only one page exists at a time.
 *
 * Final production-scale stress, load and soak certification remains Phase 11.
 */

class MemoryCheckpoints implements ICheckpointStore {
  private store = new Map<string, ProcessingCheckpoint>();
  async read(org: string, runId: string) { return this.store.get(`${org}/${runId}`) ?? null; }
  async write(c: ProcessingCheckpoint) { this.store.set(`${c.organizationCode}/${c.runId}`, c); }
}

/** A synthetic population in the evidenced shape. Cheap to build; never persisted anywhere. */
function population(count: number): Record<string, unknown>[] {
  const buckets = ['31-60', '61-90', '91-180', '181-270', '>2000'];
  return Array.from({ length: count }, (_, i) => ({
    'Customer Number': 'C-1001',
    'Customer Name': `CUSTOMER ${i}`,
    'Account Number': 9_000_000 + i,
    'Loan Type Code': 1011,
    'Loan Type Description': 'Building Housing',
    // The resolvable customer the harness seeds: one customer with many facilities, which is both
    // realistic and what makes the end-to-end volume test exercise case creation rather than
    // ten thousand identity exceptions.
    'ID Number': '28912345678',
    'QCB Deceased Status': i % 97 === 0 ? 'DEAD' : null,
    'Loan Balance': 400_000 + (i % 5_000),
    'Account Status': i % 7 === 0 ? 7 : 8,
    // A third arrive as the coerced date, exactly as the real export delivers the 1-30 bucket.
    'Arrear Buckets': i % 3 === 0 ? new Date(Date.UTC(2026, 0, 30)) : buckets[i % buckets.length],
    'First Arrear Date': '30/06/2026',
    'Arrear Days': i % 3 === 0 ? 15 : 30 + (i % 900),
    'Total Arrears': 1_000 + (i % 40_000),
    'Installment Amount': i % 500 === 0 ? 0 : 6_000,
    'Last Arrear Amount': 6_000,
    'Arrear %': i % 500 === 0 ? null : 0.8,
    'Exemption Percentage': null,
    'Exemption Amount': null,
    'Mobile Number': 55_500_000 + (i % 100_000),
  }));
}

function misFor(count: number) {
  return new MockMisDelinquencyService(population(count), { sourceSystem: 'HL', misAsOfDate: '2026-06-30' });
}

/** Walks a whole population, reporting what it observed without ever holding it all. */
async function walk(count: number, pageSize: number) {
  const mis = misFor(count);
  const seen = new Set<string>();
  let duplicates = 0;
  let pages = 0;
  let continuation;
  let peakPageSize = 0;

  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = Date.now();

  do {
    const page = await mis.getArrearDetails({ pageSize, ...(continuation ? { continuation } : {}) });
    peakPageSize = Math.max(peakPageSize, page.data.items.length);
    for (const record of page.data.items) {
      if (seen.has(record.facilityNumber)) duplicates++;
      seen.add(record.facilityNumber);
    }
    continuation = page.data.continuation;
    pages++;
  } while (continuation);

  const elapsedMs = Date.now() - started;
  const heapGrowthMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  return { pages, distinct: seen.size, duplicates, elapsedMs, peakPageSize, heapGrowthMb, terminated: continuation === undefined };
}

describe('paging a large population', () => {
  it('walks 10,000 records with no duplicate and a clean termination', async () => {
    const result = await walk(10_000, 500);
    expect(result.distinct).toBe(10_000);
    expect(result.duplicates).toBe(0);
    expect(result.terminated).toBe(true);
    expect(result.pages).toBe(20);
  }, 60_000);

  it('walks 50,000 records with no duplicate', async () => {
    const result = await walk(50_000, 1_000);
    expect(result.distinct).toBe(50_000);
    expect(result.duplicates).toBe(0);
    expect(result.pages).toBe(50);
  }, 120_000);

  it('walks 100,000 records with no duplicate and never exceeds the page size', async () => {
    const result = await walk(100_000, 2_000);
    expect(result.distinct).toBe(100_000);
    expect(result.duplicates).toBe(0);
    expect(result.peakPageSize).toBeLessThanOrEqual(2_000);
    expect(result.pages).toBe(50);
  }, 180_000);

  it('page count scales with the page size, not with a hidden internal limit', async () => {
    const small = await walk(10_000, 100);
    const large = await walk(10_000, 1_000);
    expect(small.pages).toBe(100);
    expect(large.pages).toBe(10);
    expect(small.distinct).toBe(large.distinct);
  }, 120_000);
});

describe('memory does not grow with the size of the dataset', () => {
  it('a 100,000-record walk holds no more than a 10,000-record walk', async () => {
    // The point of paging. If memory tracked the population, this ratio would be about ten.
    const small = await walk(10_000, 1_000);
    const large = await walk(100_000, 1_000);

    // Generous headroom: this asserts the absence of accumulation, not an exact figure.
    expect(large.heapGrowthMb).toBeLessThan(small.heapGrowthMb + 120);
    expect(large.peakPageSize).toBe(small.peakPageSize);
  }, 240_000);
});

describe('filter, sort and search at volume, applied by the source', () => {
  it('narrows 100,000 records to one facility without walking the rest', async () => {
    const mis = misFor(100_000);
    const started = Date.now();
    const page = await mis.getArrearDetails({ pageSize: 10, facilityNumber: '9050000' });
    expect(page.data.items).toHaveLength(1);
    // A source-side narrow, not a client-side scan of a returned population.
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it('applies a DPD range at the source and pages the result', async () => {
    const mis = misFor(10_000);
    const page = await mis.getArrearDetails({ pageSize: 100, dpdFrom: 500, dpdTo: 600 });
    // The population is asserted first: "every row matches" is trivially true of no rows.
    expect(page.data.items.length).toBeGreaterThan(0);
    expect(page.data.items.every(r => r.dpd >= 500 && r.dpd <= 600)).toBe(true);
    expect(page.data.totalCount).toBeGreaterThan(0);
    expect(page.data.totalCount).toBeLessThan(10_000);
  }, 60_000);

  it('a search narrows the population and still pages correctly', async () => {
    const mis = misFor(10_000);
    const page = await mis.getArrearDetails({ pageSize: 25, search: 'CUSTOMER 999' });
    expect(page.data.items.length).toBeGreaterThan(0);
    expect(page.data.items.length).toBeLessThanOrEqual(25);
  }, 60_000);

  it('combines a filter with paging and returns no duplicate across the walk', async () => {
    const mis = misFor(20_000);
    const seen = new Set<string>();
    let duplicates = 0;
    let continuation;
    do {
      const page = await mis.getArrearDetails({ pageSize: 250, dpdFrom: 100, ...(continuation ? { continuation } : {}) });
      for (const r of page.data.items) { if (seen.has(r.facilityNumber)) duplicates++; seen.add(r.facilityNumber); }
      continuation = page.data.continuation;
    } while (continuation);
    // Zero duplicates across zero rows would prove nothing, so the population comes first.
    expect(seen.size).toBeGreaterThan(0);
    expect(duplicates).toBe(0);
  }, 120_000);

  it('refuses a continuation carried across a changed filter, even at volume', async () => {
    const mis = misFor(10_000);
    const first = await mis.getArrearDetails({ pageSize: 100, dpdFrom: 100 });
    const continuation = first.data.continuation!;
    await expect(mis.getArrearDetails({ pageSize: 100, dpdFrom: 200, continuation }))
      .rejects.toThrow(/different query/);
  }, 60_000);
});

describe('concurrent page requests', () => {
  it('serves twenty concurrent first pages consistently', async () => {
    const mis = misFor(50_000);
    const pages = await Promise.all(
      Array.from({ length: 20 }, () => mis.getArrearDetails({ pageSize: 100 })));
    const firstIds = pages.map(p => p.data.items[0]?.facilityNumber);
    expect(new Set(firstIds).size).toBe(1);
    expect(pages.every(p => p.data.items.length === 100)).toBe(true);
  }, 120_000);

  it('serves concurrent continuations of different queries without crossing them', async () => {
    const mis = misFor(20_000);
    const [a, b] = await Promise.all([
      mis.getArrearDetails({ pageSize: 50, dpdFrom: 100 }),
      mis.getArrearDetails({ pageSize: 50, dpdFrom: 800 }),
    ]);
    const [aNext, bNext] = await Promise.all([
      mis.getArrearDetails({ pageSize: 50, dpdFrom: 100, continuation: a.data.continuation! }),
      mis.getArrearDetails({ pageSize: 50, dpdFrom: 800, continuation: b.data.continuation! }),
    ]);
    expect(aNext.data.items.every(r => r.dpd >= 100)).toBe(true);
    expect(bNext.data.items.every(r => r.dpd >= 800)).toBe(true);
  }, 120_000);
});

describe('synchronising a large population end to end', () => {
  it('processes 10,000 records page by page, checkpointing throughout', async () => {
    const harness = buildHarness({ ruleEngine: new StubRuleEngine({ eligibility: () => 'EligibleCreateCase' }) });
    const checkpoints = new MemoryCheckpoints();
    const runner = new BackgroundSyncRunner(
      misFor(10_000), harness.service, checkpoints, new MemoryLogger(), () => '2026-09-18T15:00:00.000Z');

    const started = Date.now();
    const report = await runner.run({ organizationCode: 'HL', runId: 'volume-1', mode: 'FullScan', pageSize: 1_000 });
    const elapsedMs = Date.now() - started;

    expect(report.recordsProcessed).toBe(10_000);
    expect(report.checkpoint.pagesCompleted).toBe(10);
    expect(report.checkpoint.completed).toBe(true);
    expect(report.recordsFailed).toBe(0);
    // Not a performance gate — a guard against an accidental O(n²) in the loop.
    expect(elapsedMs).toBeLessThan(180_000);
  }, 300_000);

  it('resumes a 10,000-record run from its checkpoint without reprocessing', async () => {
    const harness = buildHarness();
    const checkpoints = new MemoryCheckpoints();
    const logger = new MemoryLogger();
    const make = (faults?: { failOnPageIndex: number }) => new BackgroundSyncRunner(
      new MockMisDelinquencyService(population(10_000), {
        sourceSystem: 'HL', misAsOfDate: '2026-06-30', ...(faults ? { faults } : {}),
      }),
      harness.service, checkpoints, logger, () => '2026-09-18T15:00:00.000Z');

    const first = await make({ failOnPageIndex: 3 })
      .run({ organizationCode: 'HL', runId: 'volume-2', mode: 'FullScan', pageSize: 1_000, pageRetries: 0 });
    expect(first.checkpoint.completed).toBe(false);
    expect(first.checkpoint.recordsProcessed).toBe(3_000);

    const second = await make()
      .run({ organizationCode: 'HL', runId: 'volume-2', mode: 'FullScan', pageSize: 1_000 });

    expect(second.checkpoint.completed).toBe(true);
    expect(second.checkpoint.recordsProcessed).toBe(10_000);
    expect(harness.crm.rows('qdb_collectioncases')).toHaveLength(10_000);
  }, 300_000);
});
