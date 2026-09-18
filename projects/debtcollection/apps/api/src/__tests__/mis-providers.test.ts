import { describe, expect, it } from 'vitest';
import { MisUnavailableError, isStale, type MisDelinquencyRecord } from '@dcp/domain';
import {
  ApiMisDelinquencyService,
  CachedFallbackMisService,
  MockMisDelinquencyService,
  type MisFallbackCache,
} from '../services/mis/index.js';

/** Rows shaped exactly like the evidenced Housing Loan export, including its awkward values. */
function rawRows(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    'Customer Number': 100000 + i,
    'Customer Name': `CUSTOMER ${i}`,
    'Account Number': 9000000 + i,
    'Loan Type Code': 1011,
    'Loan Type Description': 'Building Housing',
    'ID Number': 28900000000 + i,
    'QCB Deceased Status': i % 10 === 0 ? 'DEAD' : null,
    'Loan Balance': 500000 + i,
    'Account Status': i % 5 === 0 ? 7 : 8,
    // The 1-30 bucket as the export actually delivers it, for a third of the rows.
    'Arrear Buckets': i % 3 === 0 ? new Date(Date.UTC(2026, 0, 30)) : '31-60',
    'First Arrear Date': '30/06/2026',
    'Arrear Days': i % 3 === 0 ? 15 : 45,
    'Total Arrears': 1000 + i,
    'Installment Amount': 6000,
    'Last Arrear Amount': 6000,
    'Arrear %': 0.5,
    'Exemption Percentage': null,
    'Exemption Amount': null,
    'Mobile Number': 55500000 + i,
  }));
}

const OPTIONS = { sourceSystem: 'HL', misAsOfDate: '2026-06-30', now: () => '2026-09-18T12:00:00.000Z' };
const logger = () => {
  const entries: unknown[] = [];
  return { entries, logger: { log: async (e: unknown) => { entries.push(e); } } };
};

describe('the mock provider', () => {
  it('pages through the same opaque-continuation contract as the platform', async () => {
    const mis = new MockMisDelinquencyService(rawRows(25), OPTIONS);

    const first = await mis.getArrearDetails({ pageSize: 10 });
    expect(first.data.items).toHaveLength(10);
    expect(first.data.hasMore).toBe(true);

    const second = await mis.getArrearDetails({ pageSize: 10, continuation: first.data.continuation });
    const firstIds = new Set(first.data.items.map(r => r.facilityNumber));
    expect(second.data.items.some(r => firstIds.has(r.facilityNumber))).toBe(false);
  });

  it('walks to the end and stops, with no continuation on the last page', async () => {
    const mis = new MockMisDelinquencyService(rawRows(25), OPTIONS);
    const seen = new Set<string>();
    let continuation;
    let pages = 0;
    do {
      const page = await mis.getArrearDetails({ pageSize: 10, ...(continuation ? { continuation } : {}) });
      page.data.items.forEach(r => seen.add(r.facilityNumber));
      continuation = page.data.continuation;
      pages++;
    } while (continuation && pages < 10);
    expect(pages).toBe(3);
    expect(seen.size).toBe(25);
  });

  it('runs the real normalizer, so the coerced 1-30 bucket is recovered end to end', async () => {
    const mis = new MockMisDelinquencyService(rawRows(6), OPTIONS);
    const page = await mis.getArrearDetails({ pageSize: 6 });
    expect(page.data.items.filter(r => r.arrearBucket === '1-30')).toHaveLength(2);
    expect(page.data.items.every(r => r.firstArrearDate === '2026-06-30')).toBe(true);
  });

  it('labels every answer as Mock and Live, so nothing passes for real MIS data', async () => {
    const mis = new MockMisDelinquencyService(rawRows(3), OPTIONS);
    const page = await mis.getArrearDetails({ pageSize: 3 });
    expect(page.meta.provider).toBe('Mock');
    expect(page.meta.freshness).toBe('Live');
    expect(isStale(page.meta)).toBe(false);
  });

  it('narrows at the source when asked for one facility', async () => {
    const mis = new MockMisDelinquencyService(rawRows(20), OPTIONS);
    const page = await mis.getArrearDetails({ pageSize: 50, facilityNumber: '9000005' });
    expect(page.data.items).toHaveLength(1);
    expect(page.data.items[0]?.facilityNumber).toBe('9000005');
  });

  it('narrows by DPD range at the source', async () => {
    const mis = new MockMisDelinquencyService(rawRows(30), OPTIONS);
    const page = await mis.getArrearDetails({ pageSize: 100, dpdFrom: 40, dpdTo: 50 });
    expect(page.data.items.every(r => r.dpd === 45)).toBe(true);
    expect(page.data.items.length).toBeGreaterThan(0);
  });

  it('can return a short page without that meaning the end', async () => {
    const mis = new MockMisDelinquencyService(rawRows(20), { ...OPTIONS, faults: { shortPageSize: 3 } });
    const page = await mis.getArrearDetails({ pageSize: 10 });
    expect(page.data.items).toHaveLength(3);
    expect(page.data.hasMore).toBe(true);
  });

  it('fails a page once and succeeds on retry, so restart can be exercised', async () => {
    const mis = new MockMisDelinquencyService(rawRows(20), { ...OPTIONS, faults: { failOnPageIndex: 0 } });
    await expect(mis.getArrearDetails({ pageSize: 10 })).rejects.toThrow(MisUnavailableError);
    const retried = await mis.getArrearDetails({ pageSize: 10 });
    expect(retried.data.items).toHaveLength(10);
  });

  it('refuses a changed-since feed when the source has none, rather than reloading everything', async () => {
    const mis = new MockMisDelinquencyService(rawRows(10), { ...OPTIONS, faults: { noChangeFeed: true } });
    await expect(mis.getArrearChanges(undefined, 10)).rejects.toThrow(/exposes no changed-since feed/);
  });

  it('aggregates a breakdown without the caller pulling every row', async () => {
    const mis = new MockMisDelinquencyService(rawRows(30), OPTIONS);
    const breakdown = await mis.getArrearBreakdown();
    expect(breakdown.data.totals.accountCount).toBe(30);
    expect(breakdown.data.buckets.map(b => b.bucket).sort()).toEqual(['1-30', '31-60']);
  });
});

describe('the API provider refuses rather than inventing a contract', () => {
  const api = new ApiMisDelinquencyService();

  it('refuses arrear details, naming what QDB must supply', async () => {
    await expect(api.getArrearDetails({ pageSize: 10 })).rejects.toThrow(/TBD — Actual MIS Contract Required/);
  });

  it('refuses a facility position', async () => {
    await expect(api.getFacilityArrearPosition({ facilityNumber: '1', sourceSystem: 'HL' }))
      .rejects.toThrow(MisUnavailableError);
  });

  it('refuses a breakdown', async () => {
    await expect(api.getArrearBreakdown()).rejects.toThrow(/NotConfigured|TBD/);
  });

  it('refuses a change feed', async () => {
    await expect(api.getArrearChanges(undefined, 10)).rejects.toThrow(MisUnavailableError);
  });

  it('reports itself unreachable and points at the evidence', async () => {
    const health = await api.health();
    expect(health.reachable).toBe(false);
    expect(health.detail).toMatch(/MISContractEvidence/);
  });

  it('still refuses when endpoints are configured, because the contract is unconfirmed', async () => {
    const configured = new ApiMisDelinquencyService({ baseUrl: 'https://mis.example', arrearDetailsPath: '/arrears' });
    await expect(configured.getArrearDetails({ pageSize: 10 })).rejects.toThrow(/has not been confirmed by QDB/);
  });
});

describe('live where possible, cached where not — and never the two confused', () => {
  const cachedRecord = (): MisDelinquencyRecord => ({
    customer: { customerNumber: '100001' },
    facilityNumber: '9000001',
    sourceSystem: 'HL',
    dpd: 30,
    loanBalance: 500000,
    totalArrears: 1000,
    misAsOfDate: '2026-05-31',
    integrationBatchId: 'earlier-run',
  });

  const cache: MisFallbackCache = {
    readFacilityPosition: async () => ({ record: cachedRecord(), cachedAt: '2026-06-01T09:00:00.000Z' }),
  };
  const emptyCache: MisFallbackCache = { readFacilityPosition: async () => null };

  it('passes a live answer through, marked Live', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), OPTIONS), cache, log);
    const result = await service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' });
    expect(result.meta.freshness).toBe('Live');
  });

  it('serves the cached position when MIS is unreachable, marked Cached', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Unreachable' } }), cache, log);

    const result = await service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' });

    expect(result.meta.freshness).toBe('Cached');
    expect(isStale(result.meta)).toBe(true);
  });

  it('says why the figures are stale, and when they were obtained', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Timeout' } }), cache, log);

    const result = await service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' });

    expect(result.meta.staleReason).toMatch(/Timeout/);
    expect(result.meta.cachedAt).toBe('2026-06-01T09:00:00.000Z');
    expect(result.meta.misAsOfDate).toBe('2026-05-31');
  });

  it('records the fallback in the technical log', async () => {
    const { entries, logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Unreachable' } }), cache, log);

    await service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ errorCode: 'mis_cached_fallback', severity: 'Warn' });
  });

  it('raises the MIS failure when nothing is cached, rather than returning an empty answer', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Unreachable' } }), emptyCache, log);

    await expect(service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' }))
      .rejects.toThrow(MisUnavailableError);
  });

  it('does not fall back on a malformed response — that is a defect, not an outage', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Malformed' } }), cache, log);

    await expect(service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' }))
      .rejects.toThrow(/Malformed/);
  });

  it('does not fall back on an authorisation failure', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Unauthorised' } }), cache, log);

    await expect(service.getFacilityArrearPosition({ facilityNumber: '9000001', sourceSystem: 'HL' }))
      .rejects.toThrow(/Unauthorised/);
  });

  it('refuses to serve a cached portfolio list, which would be a different population', async () => {
    const { entries, logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(30), { ...OPTIONS, faults: { unavailable: 'Unreachable' } }), cache, log);

    await expect(service.getArrearDetails({ pageSize: 10 })).rejects.toThrow(MisUnavailableError);
    expect(entries[0]).toMatchObject({ errorCode: 'mis_unavailable' });
  });

  it('never falls back for synchronisation, which writes to the Collection lifecycle', async () => {
    const { logger: log } = logger();
    const service = new CachedFallbackMisService(
      new MockMisDelinquencyService(rawRows(3), { ...OPTIONS, faults: { unavailable: 'Unreachable' } }), cache, log);

    await expect(service.getArrearChanges(undefined, 10)).rejects.toThrow(MisUnavailableError);
  });
});
