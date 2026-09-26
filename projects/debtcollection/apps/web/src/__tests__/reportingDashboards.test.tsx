import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { formatMoney } from '../components/primitives.js';
import { DCP_DASHBOARDS } from '../reporting/dcpDashboards.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * The Dashboards screen against a stand-in Report Engine.
 *
 * The stand-in answers `qdb_RunReport` by aggregating the same in-memory cases the stand-in client
 * API lists — through two independent interpreters: the Engine's named parameters on one side and
 * the Cases list's OData `$filter` on the other. That is what lets these tests prove the one thing
 * the screen exists for: **the row an officer clicks and the list they land on describe the same
 * population.** A figure that could not be walked into would be an invented number with a chart.
 */

type Row = Record<string, unknown>;

const BUCKET_LABELS: Record<number, string> = { 100000000: '1-30', 100000002: '61-90', 100000009: '>2000' };
const STATUS_LABELS: Record<number, string> = { 100000600: 'New', 100000604: 'PTP Active' };
const STRATEGY_NAMES: Record<string, string> = { 's-1': 'Soft contact' };
const OWNER_NAMES: Record<string, string> = { 'o-1': 'Officer One', 'o-2': 'Officer Two' };

function caseRow(id: string, org: 'HL' | 'BFD', bucket: number, status: number, strategy: string | null, owner: string, arrears: number, statecode = 0): Row {
  return {
    qdb_collectioncaseid: id, qdb_casenumber: `COL-${org}-${id}`, qdb_customerbusinessid: `CUST-${id}`, qdb_facilitynumber: `${org}-${id}`,
    qdb_facilitysourcesystem: org, qdb_organizationcode: org === 'HL' ? 100000140 : 100000141,
    statuscode: status, statecode, qdb_currentarrearbucket: bucket, qdb_currentdpd: 75, qdb_currenttotalarrears: arrears, qdb_currentloanbalance: arrears * 10,
    _qdb_strategyid_value: strategy, _ownerid_value: owner, _qdb_customerid_value: `cust-${id}`,
  };
}

const CASES: Row[] = [
  caseRow('c1', 'HL', 100000002, 100000600, null, 'o-1', 100),
  caseRow('c2', 'HL', 100000002, 100000604, 's-1', 'o-1', 200),
  caseRow('c3', 'HL', 100000000, 100000600, null, 'o-1', 300),
  caseRow('c4', 'BFD', 100000002, 100000600, 's-1', 'o-2', 400),
  caseRow('c5', 'BFD', 100000009, 100000600, null, 'o-2', 500),
  caseRow('c6', 'HL', 100000002, 100000600, null, 'o-1', 600, 1),
];

const PROVISIONED = ['DCP-RPT-001', 'DCP-RPT-002', 'DCP-RPT-003', 'DCP-RPT-004', 'DCP-RPT-005', 'DCP-RPT-007', 'DCP-RPT-008', 'DCP-RPT-009', 'DCP-RPT-010', 'DCP-RPT-011', 'DCP-RPT-012', 'DCP-RPT-013', 'DCP-RPT-014', 'DCP-RPT-015'];
const definitionRows = (): Row[] => PROVISIONED.map(code => ({ qdb_reportdefinitionid: `id-${code}`, qdb_reportcode: code, qdb_currentversionnumber: 1, qdb_ispublished: true }));

// ── Interpreter one: the Cases list's OData filter ────────────────────────────

function matchesFilter(row: Row, filter: string | null): boolean {
  if (!filter) return true;
  return filter.split(' and ').every(clause => {
    const match = /^(\w+) eq (.+)$/.exec(clause.trim());
    if (!match) return true;
    const [, field, raw] = match;
    const actual = row[field!];
    if (raw === 'null') return actual === null || actual === undefined;
    return String(actual) === raw!.replace(/^'|'$/g, '');
  });
}

// ── Interpreter two: the Engine's named parameters ───────────────────────────

function inScope(row: Row, parameters: Record<string, string>): boolean {
  if (row['statecode'] !== 0) return false;
  if (parameters['SourceSystem'] && row['qdb_facilitysourcesystem'] !== parameters['SourceSystem']) return false;
  if (parameters['Bucket'] && String(row['qdb_currentarrearbucket']) !== parameters['Bucket']) return false;
  if (parameters['CaseStatus'] && String(row['statuscode']) !== parameters['CaseStatus']) return false;
  if (parameters['Owner'] && row['_ownerid_value'] !== parameters['Owner']) return false;
  if (parameters['Strategy'] && row['_qdb_strategyid_value'] !== parameters['Strategy']) return false;
  return true;
}

const cell = (value: unknown, text: string | null) => ({ value, text });
const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);

function grouped(rows: Row[], alias: string, key: (row: Row) => [unknown, string | null], extra: (group: Row[]) => Record<string, { value: unknown; text: string | null }>) {
  const groups = new Map<string, { head: [unknown, string | null]; rows: Row[] }>();
  for (const row of rows) {
    const head = key(row);
    const id = String(head[0]);
    groups.set(id, { head, rows: [...(groups.get(id)?.rows ?? []), row] });
  }
  return [...groups.values()].map(group => ({ cells: { [alias]: cell(group.head[0], group.head[1]), cases: cell(group.rows.length, String(group.rows.length)), ...extra(group.rows) } }));
}

function engineAnswer(code: string, parameters: Record<string, string>): unknown {
  const rows = CASES.filter(row => inScope(row, parameters));
  const money = (group: Row[]) => ({ arrears: cell(sum(group, 'qdb_currenttotalarrears'), null), balance: cell(sum(group, 'qdb_currentloanbalance'), null) });
  const single = (body: unknown[]) => ({ reportId: `id-${code}`, columns: [], rows: body, rowCount: body.length, truncated: false });
  switch (code) {
    case 'DCP-RPT-015': return single([{ cells: { cases: cell(rows.length, null), customers: cell(new Set(rows.map(r => r['_qdb_customerid_value'])).size, null), ...money(rows) } }]);
    case 'DCP-RPT-001': return single(grouped(rows, 'bucket', r => [r['qdb_currentarrearbucket'], BUCKET_LABELS[Number(r['qdb_currentarrearbucket'])] ?? null], money));
    case 'DCP-RPT-002': return single(grouped(rows, 'source', r => [r['qdb_facilitysourcesystem'], String(r['qdb_facilitysourcesystem'])], money));
    case 'DCP-RPT-003': return single(grouped(rows, 'status', r => [r['statuscode'], STATUS_LABELS[Number(r['statuscode'])] ?? null], money));
    case 'DCP-RPT-004': return single(grouped(rows, 'strategy', r => [r['_qdb_strategyid_value'] ?? null, r['_qdb_strategyid_value'] ? STRATEGY_NAMES[String(r['_qdb_strategyid_value'])] ?? null : null], money));
    case 'DCP-RPT-005': return single(grouped(rows, 'owner', r => [r['_ownerid_value'], OWNER_NAMES[String(r['_ownerid_value'])] ?? null], money));
    case 'DCP-RPT-014': return {
      reportId: `id-${code}`,
      datasets: [
        { name: 'assignmentConfiguration', role: 'root', columns: [{ alias: 'rows', label: 'Assignment configuration rows' }], rows: [{ cells: { rows: cell(0, '0') } }] },
        { name: 'activityTypesWithoutOutcome', role: 'standalone', columns: [{ alias: 'rows', label: 'Active activity types with no outcome' }], rows: [{ cells: { rows: cell(7, '7') } }] },
      ],
    };
    default: return single([]);
  }
}

function fakeXrm({ withEngine = true, refuse }: { withEngine?: boolean; refuse?: { errorCode: string; errorMessage: string } } = {}): { xrm: XrmLike; runs: { code: string; parameters: Record<string, string> }[] } {
  const runs: { code: string; parameters: Record<string, string> }[] = [];
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/', getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{61086FE4-0000-0000-0000-000000000001}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord() { return {}; },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        const filter = new URLSearchParams(options.replace(/^\?/, '')).get('$filter');
        if (logicalName === 'qdb_reportdefinition') return { entities: definitionRows() };
        if (logicalName === 'qdb_collectioncase') return { entities: CASES.filter(row => matchesFilter(row, filter)) };
        return { entities: [] };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
      ...(withEngine ? {
        async execute(request: { reportId: string; parametersJson: string }) {
          const code = request.reportId.replace(/^id-/, '');
          const parameters = JSON.parse(request.parametersJson) as Record<string, string>;
          runs.push({ code, parameters });
          const output = refuse ? { ...refuse, resultJson: '' } : { resultJson: JSON.stringify(engineAnswer(code, parameters)), executionId: 'x' };
          return new Response(JSON.stringify(output), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
      } : {}),
    },
  } as unknown as XrmLike;
  return { xrm, runs };
}

function install(xrm: XrmLike) { (window as unknown as { Xrm?: XrmLike }).Xrm = xrm; }

async function openDashboards() {
  window.location.hash = '#dashboards';
  render(<App />);
  return screen.findByTestId('view-dashboards');
}

const panel = (code: string) => screen.findByTestId(`panel-${code}`);
const kpiValue = (container: HTMLElement, label: string) => within(container).getByText(label).closest('.kpi-tile')!.querySelector('.kpi-value')!.textContent;
async function rowWith(container: HTMLElement, text: string) {
  await waitFor(() => expect(container.getAttribute('data-state')).toBe('ok'));
  return within(container).getAllByTestId('report-row').find(row => row.textContent?.includes(text))!;
}

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 0, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

describe('the Dashboards screen is a set of Report Engine reports', () => {
  it('offers the four DCP dashboards and runs each Portfolio panel as its own report', async () => {
    const { xrm, runs } = fakeXrm();
    install(xrm);
    await openDashboards();

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(DCP_DASHBOARDS.map(d => d.title));
    const book = await panel('DCP-RPT-015');
    await waitFor(() => expect(kpiValue(book, 'Open cases')).toBe('5'));
    expect([kpiValue(book, 'Customers with an open case'), kpiValue(book, 'Current arrears')]).toEqual(['5', formatMoney(1500)]);
    await waitFor(() => expect(new Set(runs.map(run => run.code))).toEqual(new Set(['DCP-RPT-015', 'DCP-RPT-001', 'DCP-RPT-002', 'DCP-RPT-003', 'DCP-RPT-004'])));
  });

  it('opens a bucket row into the Cases list in the scope it was counted in, and the list holds exactly that many cases', async () => {
    install(fakeXrm().xrm);
    await openDashboards();

    const byBucket = await panel('DCP-RPT-001');
    const row = await rowWith(byBucket, '61-90');
    expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('3');
    fireEvent.click(row);

    expect(window.location.hash).toBe('#cases/scope/bucket=61-90');
    expect((await screen.findByTestId('scope-chip-bucket')).textContent).toBe('DPD: 61-90');
    const grid = await screen.findByTestId('cases-grid');
    await waitFor(() => expect(grid.querySelectorAll('tbody tr').length).toBe(3));
  });

  it('narrows every report through one SourceSystem parameter, and the drill-down keeps the CRM', async () => {
    const { xrm, runs } = fakeXrm();
    install(xrm);
    await openDashboards();
    await userEvent.selectOptions(screen.getByTestId('org-scope'), 'HL');

    const byBucket = await panel('DCP-RPT-001');
    await waitFor(() => expect(runs.some(run => run.code === 'DCP-RPT-001' && run.parameters['SourceSystem'] === 'HL')).toBe(true));
    const row = await rowWith(byBucket, '61-90');
    await waitFor(() => expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('2'));
    fireEvent.click(row);

    expect(window.location.hash).toBe('#cases/scope/sourceSystem=HL&bucket=61-90');
    const grid = await screen.findByTestId('cases-grid');
    await waitFor(() => expect(grid.querySelectorAll('tbody tr').length).toBe(2));
    expect(runs.every(run => !('Bucket' in run.parameters) || /^\d+$/.test(run.parameters['Bucket']!))).toBe(true);
  });

  it('drills "Strategy Not Assigned" as the null-strategy population, never as a filter the Engine would ignore', async () => {
    install(fakeXrm().xrm);
    await openDashboards();

    const byStrategy = await panel('DCP-RPT-004');
    const row = await rowWith(byStrategy, 'Strategy Not Assigned');
    expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('3');
    fireEvent.click(row);

    expect(window.location.hash).toBe('#cases/scope/strategy=none');
    const grid = await screen.findByTestId('cases-grid');
    await waitFor(() => expect(grid.querySelectorAll('tbody tr').length).toBe(3));
  });

  it('names a definition this organisation has not been provisioned with, instead of faking it', async () => {
    install(fakeXrm().xrm);
    await openDashboards();

    const concentration = await panel('DCP-RPT-006');
    await waitFor(() => expect(concentration.textContent).toContain('DCP-RPT-006 is not provisioned on this organisation'));
  });

  it('says which reports the CRM scope does not narrow, on the Supervisor dashboard', async () => {
    install(fakeXrm().xrm);
    await openDashboards();
    await userEvent.selectOptions(screen.getByTestId('org-scope'), 'BFD');
    await userEvent.click(screen.getByTestId('dashboards-tab-DCP-DB-002'));

    expect((await screen.findByTestId('dropped-DCP-RPT-007')).textContent).toContain('Not narrowed by CRM');
    expect(screen.queryByTestId('dropped-DCP-RPT-005')).toBeNull();
  });

  it('shows configuration gaps as one labelled count per dataset', async () => {
    install(fakeXrm().xrm);
    await openDashboards();
    await userEvent.click(screen.getByTestId('dashboards-tab-DCP-DB-003'));

    const gaps = await panel('DCP-RPT-014');
    await waitFor(() => expect(kpiValue(gaps, 'Active activity types with no outcome')).toBe('7'));
    expect(kpiValue(gaps, 'Assignment configuration rows')).toBe('0');
  });
});

describe('when the Engine cannot answer, the screen says so and the workspace stands', () => {
  it('names an unavailable reporting service on every panel and leaves My Day working', async () => {
    install(fakeXrm({ withEngine: false }).xrm);
    await openDashboards();

    const book = await panel('DCP-RPT-015');
    await waitFor(() => expect(book.textContent).toContain('Reporting service unavailable'));
    expect(within(book).queryByText('0')).toBeNull();

    window.location.hash = '#myday';
    expect((await screen.findAllByText('Open cases')).length).toBeGreaterThan(0);
  });

  it('tells a permission refusal apart from a failure', async () => {
    install(fakeXrm({ refuse: { errorCode: 'report_failed', errorMessage: 'You do not have permission to run this report.' } }).xrm);
    await openDashboards();

    const book = await panel('DCP-RPT-015');
    await waitFor(() => expect(book.textContent).toContain('You do not have permission to run this report'));
    expect(book.getAttribute('data-state')).toBe('accessDenied');
  });
});
