import { describe, expect, it } from 'vitest';
import type { XrmLike } from '../platform/crmContext.js';
import { datasetsOf } from '../reporting/reportEngineContracts.js';
import { scopeToParameters } from '../reporting/ReportingService.js';
import { XrmReportingService, interpretResponse } from '../reporting/XrmReportingService.js';
import { ReportResultSchema } from '../reporting/reportEngineContracts.js';

/**
 * The Report Engine adapter, against the shapes proven on org5869857f: one answer, two refusal
 * shapes, and the ways a result can be missing or wrong. Every non-answer is named, never thrown
 * into a screen.
 */

const REPORT = { reportId: 'r-1', reportName: 'Open cases by bucket', columns: [{ alias: 'bucket', label: 'Bucket', attribute: 'qdb_currentarrearbucket', isVisible: true }, { alias: 'cases', label: 'Cases', attribute: 'qdb_collectioncaseid', isVisible: true }], rows: [{ cells: { bucket: { value: 100000002, text: '61-90' }, cases: { value: 227, text: '227' } } }], rowCount: 1, truncated: false };
const DASHBOARD = { dashboardId: 'd-1', widgets: [{ widgetId: 'w-1', accessDenied: false, data: [{ label: 'Open cases', value: 4363 }] }] };

function xrmAnswering(output: unknown, ok = true, delayMs = 0): { xrm: XrmLike; requests: unknown[] } {
  const requests: unknown[] = [];
  const xrm = {
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://org/', getVersion: () => '9.2', userSettings: { userId: '{1}', userName: 'T', languageId: 1033 } }) },
    WebApi: {
      retrieveRecord: async () => ({}), retrieveMultipleRecords: async () => ({ entities: [] }), createRecord: async () => ({ id: '' }), updateRecord: async () => ({ id: '' }),
      execute: async (request: unknown) => {
        requests.push(request);
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        return new Response(output === undefined ? '' : JSON.stringify(output), { status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
      },
    },
  } as unknown as XrmLike;
  return { xrm, requests };
}

describe('running a report', () => {
  it('sends the Engine its own request shape, with the scope as named parameters', async () => {
    const { xrm, requests } = xrmAnswering({ resultJson: JSON.stringify(REPORT), executionId: 'x-1' });

    const outcome = await new XrmReportingService(xrm).runReport({ reportId: 'r-1', scope: { sourceSystem: 'HL', bucket: '61-90' } });

    const sent = requests[0] as Record<string, unknown> & { getMetadata: () => { operationName: string; parameterTypes: Record<string, unknown> } };
    expect([sent['reportId'], sent['format'], sent['async'], sent['parametersJson'], sent.getMetadata().operationName, Object.keys(sent.getMetadata().parameterTypes)])
      .toEqual(['r-1', 'RUN', false, '{"SourceSystem":"HL","Bucket":"100000002"}', 'qdb_RunReport', ['reportId', 'parametersJson', 'format', 'async', 'relationshipId', 'parentKey']]);
    expect(outcome).toEqual({ status: 'ok', result: REPORT, executionId: 'x-1' });
  });

  it('names a refusal — HTTP 200 with errorCode — instead of pretending an empty report', async () => {
    const { xrm } = xrmAnswering({ errorCode: 'report_failed', errorMessage: 'Report r-9 was not found.', resultJson: '', executionId: 'x-2' });

    expect(await new XrmReportingService(xrm).runReport({ reportId: 'r-9' })).toEqual({ status: 'refused', message: 'Report r-9 was not found.', code: 'report_failed', executionId: 'x-2' });
  });

  it('tells a permission refusal apart from any other', async () => {
    const { xrm } = xrmAnswering({ errorCode: 'access_denied', errorMessage: 'You do not have canexecute on this report.', resultJson: '' });

    expect((await new XrmReportingService(xrm).runReport({ reportId: 'r-1' })).status).toBe('accessDenied');
  });

  it('reads a plugin fault in OData\'s error shape', async () => {
    const { xrm } = xrmAnswering({ error: { code: '0x80040265', message: 'Invalid column qdb_nothing' } });

    expect(await new XrmReportingService(xrm).runReport({ reportId: 'r-1' })).toEqual({ status: 'refused', message: 'Invalid column qdb_nothing', code: '0x80040265' });
  });

  it('calls a result it cannot recognise malformed, never an answer', async () => {
    const { xrm } = xrmAnswering({ resultJson: JSON.stringify({ something: 'else' }) });

    expect((await new XrmReportingService(xrm).runReport({ reportId: 'r-1' })).status).toBe('malformed');
    expect((await new XrmReportingService(xrmAnswering({ resultJson: 'not json' }).xrm).runReport({ reportId: 'r-1' })).status).toBe('malformed');
    expect((await new XrmReportingService(xrmAnswering({ executionId: 'x' }).xrm).runReport({ reportId: 'r-1' })).status).toBe('malformed');
  });

  it('says the service is unavailable when the call itself fails or the client API cannot execute', async () => {
    const throwing = { ...xrmAnswering({}).xrm, WebApi: { execute: async () => { throw new Error('Failed to fetch'); } } } as unknown as XrmLike;
    const noExecute = { ...xrmAnswering({}).xrm, WebApi: {} } as unknown as XrmLike;

    expect((await new XrmReportingService(throwing).runReport({ reportId: 'r-1' })).status).toBe('unavailable');
    expect((await new XrmReportingService(noExecute).runReport({ reportId: 'r-1' })).status).toBe('unavailable');
  });

  it('gives up after the timeout and says so', async () => {
    const { xrm } = xrmAnswering({ resultJson: JSON.stringify(REPORT) }, true, 80);

    expect((await new XrmReportingService(xrm, undefined, 20).runReport({ reportId: 'r-1' })).status).toBe('timeout');
  });

  it('runs a related-record drill through the Engine, never composing the child query itself', async () => {
    const { xrm, requests } = xrmAnswering({ resultJson: JSON.stringify(REPORT) });

    await new XrmReportingService(xrm).runReport({ reportId: 'r-1', drill: { relationshipId: 'rel-1', parentKey: 'k-1' } });

    expect(requests[0]).toMatchObject({ relationshipId: 'rel-1', parentKey: 'k-1' });
  });
});

describe('running a dashboard', () => {
  it('returns one series per widget, keeping the Engine\'s own access-denied flag', async () => {
    const { xrm, requests } = xrmAnswering({ resultJson: JSON.stringify(DASHBOARD) });

    const outcome = await new XrmReportingService(xrm).runDashboard('d-1');

    expect([(requests[0] as { getMetadata: () => { operationName: string } }).getMetadata().operationName, outcome]).toEqual(['qdb_RunDashboard', { status: 'ok', result: DASHBOARD }]);
  });
});

describe('contracts', () => {
  it('maps scope dimensions to the one set of Engine parameter names, dropping absent ones', () => {
    expect(scopeToParameters({ sourceSystem: 'BFD', dateFrom: '2026-09-01' })).toEqual({ SourceSystem: 'BFD', DateFrom: '2026-09-01' });
    expect(scopeToParameters({})).toEqual({});
  });

  it('treats a single-dataset answer and a multi-dataset answer as one list of datasets', () => {
    expect(datasetsOf(REPORT).map(d => [d.role, d.rows.length])).toEqual([['root', 1]]);
    expect(datasetsOf({ reportId: 'r', datasets: [{ role: 'root', columns: [], rows: [] }, { role: 'child', columns: [], rows: [] }] }).length).toBe(2);
  });

  it('never treats an HTTP failure with no output as an answer', () => {
    expect(interpretResponse(undefined, false, ReportResultSchema).status).toBe('unavailable');
  });
});

describe('scope encoding — codes and ids, never labels', () => {
  /**
   * Proven live (2026-09-26): `{"Bucket":"61-90"}` fails the run with `unexpected_error`, while
   * `{"Bucket":"100000002"}` narrows to 228 cases. The scope carries labels because the lists and
   * the URL do; what leaves for the Engine must be the code.
   */
  it('sends the option value for a bucket and a case status, and the state code for an activity state', () => {
    expect(scopeToParameters({ bucket: '61-90', caseStatus: 'PTP Active', activityState: 'open' }))
      .toEqual({ Bucket: '100000002', CaseStatus: '100000604', ActivityState: '0' });
  });

  it('refuses a label it cannot encode instead of dropping the filter and answering for everyone', async () => {
    const { xrm, requests } = xrmAnswering({ resultJson: JSON.stringify(REPORT) });

    const outcome = await new XrmReportingService(xrm).runReport({ reportId: 'r-1', scope: { caseStatus: 'Not a status' } });

    expect([outcome.status, (outcome as { code?: string }).code, requests.length]).toEqual(['refused', 'scope_encoding', 0]);
  });

  it('passes ids and the source system text through unchanged', () => {
    expect(scopeToParameters({ sourceSystem: 'HL', strategy: 'none', owner: 'u-1' })).toEqual({ SourceSystem: 'HL', Strategy: 'none', Owner: 'u-1' });
  });
});
