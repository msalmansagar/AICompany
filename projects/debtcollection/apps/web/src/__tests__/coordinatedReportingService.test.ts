import { describe, expect, it } from 'vitest';
import { CoordinatedReportingService } from '../reporting/CoordinatedReportingService.js';
import type { IReportingService, ReportingOutcome, RunReportRequest } from '../reporting/ReportingService.js';
import type { ReportResult } from '../reporting/reportEngineContracts.js';

/**
 * One Engine run per question. A dashboard's panels, a tab remount and React's double-mounted
 * development effects must not each cost the Engine a full read of the book.
 */

function innerService() {
  const calls: RunReportRequest[] = [];
  const pending: ((outcome: ReportingOutcome<ReportResult>) => void)[] = [];
  const service: IReportingService = {
    runReport: request => { calls.push(request); return new Promise(resolve => { pending.push(resolve); }); },
    runDashboard: async id => ({ status: 'ok', result: { dashboardId: id, widgets: [] } }),
  };
  const answer = (index: number, status: 'ok' | 'unavailable' = 'ok') => pending[index]!(status === 'ok'
    ? { status: 'ok', result: { reportId: 'r', columns: [], rows: [], rowCount: 0 } }
    : { status: 'unavailable', message: 'down' });
  return { service, calls, answer };
}

describe('CoordinatedReportingService', () => {
  it('shares one in-flight run between identical requests', async () => {
    const { service, calls, answer } = innerService();
    const coordinated = new CoordinatedReportingService(service);

    const first = coordinated.runReport({ reportId: 'r', scope: { sourceSystem: 'HL' } });
    const second = coordinated.runReport({ reportId: 'r', scope: { sourceSystem: 'HL' } });
    answer(0);

    expect([calls.length, (await first).status, (await second).status, coordinated.runsIssued]).toEqual([1, 'ok', 'ok', 1]);
  });

  it('keeps a successful answer for the retention window and asks again after it', async () => {
    let clock = 1_000;
    const { service, calls, answer } = innerService();
    const coordinated = new CoordinatedReportingService(service, 60_000, () => clock);

    const first = coordinated.runReport({ reportId: 'r' });
    answer(0);
    await first;
    clock += 30_000;
    await coordinated.runReport({ reportId: 'r' });
    clock += 31_000;
    const third = coordinated.runReport({ reportId: 'r' });
    answer(1);
    await third;

    expect(calls.length).toBe(2);
  });

  it('never keeps a failure — the next request asks the Engine again', async () => {
    const { service, calls, answer } = innerService();
    const coordinated = new CoordinatedReportingService(service);

    const first = coordinated.runReport({ reportId: 'r' });
    answer(0, 'unavailable');
    expect((await first).status).toBe('unavailable');
    const second = coordinated.runReport({ reportId: 'r' });
    answer(1);
    await second;

    expect(calls.length).toBe(2);
  });

  it('tells different scopes, parameters and drills apart', async () => {
    const { service, calls, answer } = innerService();
    const coordinated = new CoordinatedReportingService(service);

    const runs = [
      coordinated.runReport({ reportId: 'r', scope: { sourceSystem: 'HL' } }),
      coordinated.runReport({ reportId: 'r', scope: { sourceSystem: 'BFD' } }),
      coordinated.runReport({ reportId: 'r', parameters: { Owner: 'u-1' } }),
      coordinated.runReport({ reportId: 'r', drill: { relationshipId: 'rel', parentKey: 'k' } }),
    ];
    runs.forEach((_, index) => answer(index));
    await Promise.all(runs);

    expect(calls.length).toBe(4);
  });

  it('forgets everything on invalidate', async () => {
    const { service, calls, answer } = innerService();
    const coordinated = new CoordinatedReportingService(service);

    const first = coordinated.runReport({ reportId: 'r' });
    answer(0);
    await first;
    coordinated.invalidate();
    const second = coordinated.runReport({ reportId: 'r' });
    answer(1);
    await second;

    expect(calls.length).toBe(2);
  });
});
