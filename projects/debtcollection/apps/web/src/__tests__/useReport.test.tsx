import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReportingScope } from '@dcp/domain';
import type { IReportingService, ReportingOutcome, RunReportRequest } from '../reporting/ReportingService.js';
import type { ReportResult } from '../reporting/reportEngineContracts.js';
import { useReport } from '../reporting/useReport.js';

/**
 * The hook that keeps a panel's answer belonging to its question. The defect it guards against is
 * a slow run for the previous CRM landing under the new CRM's heading.
 */

function resultFor(name: string): ReportResult {
  return { reportId: 'r', reportName: name, columns: [], rows: [], rowCount: 0 };
}

function controllableService() {
  const pending: { request: RunReportRequest; resolve: (outcome: ReportingOutcome<ReportResult>) => void }[] = [];
  const service: IReportingService = {
    runReport: request => new Promise(resolve => { pending.push({ request, resolve }); }),
    runDashboard: async () => ({ status: 'unavailable', message: 'not used' }),
  };
  return { service, pending };
}

describe('useReport', () => {
  it('drops an answer that arrives after the question changed', async () => {
    const { service, pending } = controllableService();
    const { result, rerender } = renderHook(({ scope }: { scope: ReportingScope }) => useReport(service, { reportId: 'r', scope, isResolved: true }), { initialProps: { scope: { sourceSystem: 'HL' } } });

    rerender({ scope: { sourceSystem: 'BFD' } });
    await waitFor(() => expect(pending.length).toBe(2));
    act(() => pending[1]!.resolve({ status: 'ok', result: resultFor('BFD answer') }));
    act(() => pending[0]!.resolve({ status: 'ok', result: resultFor('HL answer — late') }));

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.status === 'ok' && result.current.result.reportName).toBe('BFD answer');
  });

  it('runs nothing until the definition index has been read, and names a definition the organisation lacks', async () => {
    const { service, pending } = controllableService();
    const { result, rerender } = renderHook(({ resolved, id }: { resolved: boolean; id: string | undefined }) => useReport(service, { reportId: id, scope: {}, isResolved: resolved }), { initialProps: { resolved: false, id: undefined as string | undefined } });

    expect([result.current.status, pending.length]).toEqual(['loading', 0]);
    rerender({ resolved: true, id: undefined });
    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect(pending.length).toBe(0);
  });

  it('carries every named failure through as the panel state', async () => {
    const { service, pending } = controllableService();
    const { result } = renderHook(() => useReport(service, { reportId: 'r', scope: {}, isResolved: true }));

    await waitFor(() => expect(pending.length).toBe(1));
    act(() => pending[0]!.resolve({ status: 'accessDenied', message: 'You do not have permission.' }));

    await waitFor(() => expect(result.current).toEqual({ status: 'accessDenied', message: 'You do not have permission.' }));
  });
});
