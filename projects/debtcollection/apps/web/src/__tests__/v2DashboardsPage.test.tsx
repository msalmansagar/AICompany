import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { formatMoney } from '../components/primitives.js';
import { DCP_DASHBOARDS } from '../reporting/dcpDashboards.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Dashboards inside Workspace V2, against a stand-in Report Engine.
 *
 * The stand-in answers `qdb_RunReport` by aggregating the same in-memory cases the stand-in client
 * API lists — two independent interpreters over one set of rows, as in the V1 suite — so what is
 * proven is the thing that matters: a row an officer opens leads to V2's Collection Cases holding
 * exactly the population the row counted, with the way back kept. V1 stays the default throughout.
 */

type Row = Record<string, unknown>;
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const BUCKET_LABELS: Record<number, string> = { 100000000: '1-30', 100000002: '61-90', 100000009: '>2000' };
const STATUS_LABELS: Record<number, string> = { 100000600: 'New', 100000604: 'PTP Active' };
const STRATEGY_NAMES: Record<string, string> = { 's-1': 'Soft contact' };
const OWNER_NAMES: Record<string, string> = { 'o-1': 'Officer One', 'o-2': 'Officer Two' };

function caseRow(id: string, org: 'HL' | 'BFD', bucket: number, status: number, strategy: string | null, owner: string, arrears: number, statecode = 0): Row {
  return {
    qdb_collectioncaseid: id, qdb_casenumber: `COL-${org}-${id}`, qdb_customerbusinessid: `CUST-${id}`, qdb_facilitynumber: `${org}-${id}`,
    qdb_facilitysourcesystem: org, qdb_organizationcode: org === 'HL' ? 100000140 : 100000141,
    statuscode: status, [`statuscode${FORMATTED}`]: STATUS_LABELS[status], statecode, qdb_currentarrearbucket: bucket, [`qdb_currentarrearbucket${FORMATTED}`]: BUCKET_LABELS[bucket],
    qdb_currentdpd: 75, qdb_currenttotalarrears: arrears, qdb_currentloanbalance: arrears * 10,
    _qdb_strategyid_value: strategy, _ownerid_value: owner, _qdb_customerid_value: `cust-${id}`, [`_qdb_customerid_value${FORMATTED}`]: `Customer ${id}`,
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

// Interpreter one: the list's OData filter (the subset V2's Collection Cases sends).
function matchesFilter(row: Row, filter: string | null): boolean {
  if (!filter) return true;
  return filter.split(' and ').every(clause => {
    const match = /^\(?(\w+) eq (.+?)\)?$/.exec(clause.trim());
    if (!match) return true;
    const [, field, raw] = match;
    const actual = row[field!];
    if (raw === 'null') return actual === null || actual === undefined;
    return String(actual) === raw!.replace(/^'|'$/g, '');
  });
}

// Interpreter two: the Engine's named parameters.
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

function grouped(rows: Row[], alias: string, key: (row: Row) => [unknown, string | null]) {
  const groups = new Map<string, { head: [unknown, string | null]; rows: Row[] }>();
  for (const row of rows) {
    const head = key(row);
    groups.set(String(head[0]), { head, rows: [...(groups.get(String(head[0]))?.rows ?? []), row] });
  }
  return [...groups.values()].map(group => ({ cells: { [alias]: cell(group.head[0], group.head[1]), cases: cell(group.rows.length, String(group.rows.length)), arrears: cell(sum(group.rows, 'qdb_currenttotalarrears'), null), balance: cell(sum(group.rows, 'qdb_currentloanbalance'), null) } }));
}

function engineAnswer(code: string, parameters: Record<string, string>): unknown {
  const rows = CASES.filter(row => inScope(row, parameters));
  const single = (body: unknown[]) => ({ reportId: `id-${code}`, columns: [], rows: body, rowCount: body.length, truncated: false });
  switch (code) {
    case 'DCP-RPT-015': return single([{ cells: { cases: cell(rows.length, null), customers: cell(new Set(rows.map(r => r['_qdb_customerid_value'])).size, null), arrears: cell(sum(rows, 'qdb_currenttotalarrears'), null), balance: cell(sum(rows, 'qdb_currentloanbalance'), null) } }]);
    case 'DCP-RPT-001': return single(grouped(rows, 'bucket', r => [r['qdb_currentarrearbucket'], BUCKET_LABELS[Number(r['qdb_currentarrearbucket'])] ?? null]));
    case 'DCP-RPT-002': return single(grouped(rows, 'source', r => [r['qdb_facilitysourcesystem'], String(r['qdb_facilitysourcesystem'])]));
    case 'DCP-RPT-003': return single(grouped(rows, 'status', r => [r['statuscode'], STATUS_LABELS[Number(r['statuscode'])] ?? null]));
    case 'DCP-RPT-004': return single(grouped(rows, 'strategy', r => [r['_qdb_strategyid_value'] ?? null, r['_qdb_strategyid_value'] ? STRATEGY_NAMES[String(r['_qdb_strategyid_value'])] ?? null : null]));
    case 'DCP-RPT-005': return single(grouped(rows, 'owner', r => [r['_ownerid_value'], OWNER_NAMES[String(r['_ownerid_value'])] ?? null]));
    case 'DCP-RPT-007': return single([{ cells: { owner: cell('o-1', 'Officer One'), activities: cell(3, '3') } }]);
    case 'DCP-RPT-014': return { reportId: `id-${code}`, datasets: [{ name: 'assignmentConfiguration', role: 'root', columns: [{ alias: 'rows', label: 'Assignment configuration rows' }], rows: [{ cells: { rows: cell(0, '0') } }] }] };
    default: return single([]);
  }
}

interface Fake { xrm: XrmLike; runs: { code: string; parameters: Record<string, string> }[]; listFilters: string[] }

function fakeXrm({ withEngine = true }: { withEngine?: boolean } = {}): Fake {
  const runs: Fake['runs'] = [];
  const listFilters: string[] = [];
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
        const decoded = decodeURIComponent(options.replace(/^\?/, ''));
        if (decoded.startsWith('fetchXml=')) return { entities: [] };
        const filter = new URLSearchParams(options.replace(/^\?/, '')).get('$filter');
        if (logicalName === 'qdb_reportdefinition') return { entities: definitionRows() };
        if (logicalName === 'qdb_collectioncase') { if (filter) listFilters.push(filter); return { entities: CASES.filter(row => matchesFilter(row, filter)) }; }
        return { entities: [] };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
      ...(withEngine ? {
        async execute(request: { reportId: string; parametersJson: string }) {
          const code = request.reportId.replace(/^id-/, '');
          const parameters = JSON.parse(request.parametersJson) as Record<string, string>;
          runs.push({ code, parameters });
          return new Response(JSON.stringify({ resultJson: JSON.stringify(engineAnswer(code, parameters)), executionId: 'x' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        },
      } : {}),
    },
  } as unknown as XrmLike;
  return { xrm, runs, listFilters };
}

function install(xrm: XrmLike) { (window as unknown as { Xrm?: XrmLike }).Xrm = xrm; }

async function openV2Dashboards() {
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.location.hash = '#dashboards';
  render(<App />);
  return screen.findByTestId('v2-dashboards', {}, { timeout: 5000 });
}

const panel = (code: string) => screen.findByTestId(`v2-panel-${code}`);
async function rowWith(container: HTMLElement, text: string) {
  await waitFor(() => expect(container.getAttribute('data-state')).toBe('ok'));
  return within(container).getAllByTestId('v2-report-row').find(row => row.textContent?.includes(text))!;
}

beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 0, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

describe('V1 stays the default', () => {
  it('opens the V1 Dashboards when nothing chose V2', async () => {
    install(fakeXrm().xrm);
    window.location.hash = '#dashboards';
    render(<App />);

    await screen.findByTestId('view-dashboards');
    expect(screen.queryByTestId('workspace-v2')).toBeNull();
  });
});

describe('Dashboards V2 as Report Engine compositions', () => {
  it('draws the four dashboards natively and runs each Portfolio panel once', async () => {
    const { xrm, runs } = fakeXrm();
    install(xrm);
    await openV2Dashboards();

    expect(screen.getAllByRole('tab', { name: /Overview|Delinquency/ }).map(tab => tab.textContent)).toEqual(DCP_DASHBOARDS.map(d => d.title));
    const book = await panel('DCP-RPT-015');
    await waitFor(() => expect(within(book).getByTestId('v2-kpi-cases').textContent).toContain('5'));
    expect(within(book).getByTestId('v2-kpi-arrears').textContent).toContain(formatMoney(1500));
    await waitFor(() => expect(runs.map(run => run.code).sort()).toEqual(['DCP-RPT-001', 'DCP-RPT-002', 'DCP-RPT-003', 'DCP-RPT-004', 'DCP-RPT-015']));
    expect(screen.queryByTestId('v2-bridged')).toBeNull();
  });

  it('opens a bucket row into V2 Collection Cases with the same filters, on the wire, with the way back', async () => {
    const { xrm, listFilters } = fakeXrm();
    install(xrm);
    await openV2Dashboards();

    const row = await rowWith(await panel('DCP-RPT-001'), '61-90');
    expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('3');
    fireEvent.click(row);

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&from=dashboard');
    await screen.findByTestId('v2-cases');
    expect((await screen.findByTestId('v2-filter-chip-bucket')).textContent).toContain('DPD: 61-90');
    await waitFor(() => expect(listFilters.some(filter => filter.includes('qdb_currentarrearbucket eq 100000002') && filter.includes('statecode eq 0'))).toBe(true));
    await userEvent.click(screen.getByTestId('v2-cases-back-dashboard'));
    expect(window.location.hash).toBe('#dashboards');
  });

  it('drills a strategy row with its name, and the null strategy as its own population', async () => {
    install(fakeXrm().xrm);
    await openV2Dashboards();

    const byStrategy = await panel('DCP-RPT-004');
    fireEvent.click(await rowWith(byStrategy, 'Soft contact'));
    expect(window.location.hash).toBe('#cases/filter/strategy=s-1&strategyLabel=Soft+contact&from=dashboard');
    expect((await screen.findByTestId('v2-filter-chip-strategy')).textContent).toContain('Soft contact');

    await userEvent.click(screen.getByTestId('v2-cases-back-dashboard'));
    fireEvent.click(await rowWith(await panel('DCP-RPT-004'), 'Strategy Not Assigned'));
    expect(window.location.hash).toBe('#cases/filter/strategy=none&from=dashboard');
  });

  it('keeps the CRM scope: HL narrows every case-grain report and travels into the list', async () => {
    const { xrm, runs, listFilters } = fakeXrm();
    install(xrm);
    await openV2Dashboards();
    await userEvent.selectOptions(screen.getByTestId('v2-org-scope'), 'HL');

    const byBucket = await panel('DCP-RPT-001');
    await waitFor(() => expect(runs.some(run => run.code === 'DCP-RPT-001' && run.parameters['SourceSystem'] === 'HL')).toBe(true));
    const row = await rowWith(byBucket, '61-90');
    await waitFor(() => expect(within(row).getAllByRole('cell')[1]!.textContent).toBe('2'));
    fireEvent.click(row);

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&scope=HL&from=dashboard');
    await waitFor(() => expect(listFilters.some(filter => filter.includes('qdb_organizationcode eq 100000140') && filter.includes('qdb_currentarrearbucket eq 100000002'))).toBe(true));
  });

  it('honours a V1 dashboard link of the form #cases/scope/… through the same mapping', async () => {
    const { xrm, listFilters } = fakeXrm();
    install(xrm);
    window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
    window.location.hash = '#cases/scope/sourceSystem=BFD&bucket=%3E2000';
    render(<App />);

    await screen.findByTestId('v2-cases');
    expect((await screen.findByTestId('v2-filter-chip-bucket')).textContent).toContain('>2000');
    await waitFor(() => expect(listFilters.some(filter => filter.includes('qdb_organizationcode eq 100000141') && filter.includes('qdb_currentarrearbucket eq 100000009'))).toBe(true));
  });

  it('says plainly which Supervisor reports the CRM scope does not narrow, and never dresses them as scoped', async () => {
    install(fakeXrm().xrm);
    await openV2Dashboards();
    await userEvent.selectOptions(screen.getByTestId('v2-org-scope'), 'BFD');
    await userEvent.click(screen.getByTestId('v2-tab-DCP-DB-002'));

    const activities = await panel('DCP-RPT-007');
    expect((await screen.findByTestId('v2-dropped-DCP-RPT-007')).textContent).toContain('Not narrowed by CRM');
    expect(activities.textContent).toContain('for both CRMs');
    expect(screen.queryByTestId('v2-dropped-DCP-RPT-005')).toBeNull();
  });

  it('shows configuration gaps as one count per dataset', async () => {
    install(fakeXrm().xrm);
    await openV2Dashboards();
    await userEvent.click(screen.getByTestId('v2-tab-DCP-DB-003'));

    const gaps = await panel('DCP-RPT-014');
    await waitFor(() => expect(gaps.textContent).toContain('Assignment configuration rows'));
    expect(gaps.textContent).toContain('0');
  });

  it('names an unreachable Engine on every panel and leaves My Day working', async () => {
    install(fakeXrm({ withEngine: false }).xrm);
    await openV2Dashboards();

    const book = await panel('DCP-RPT-015');
    await waitFor(() => expect(within(book).getByTestId('v2-report-failed').textContent).toContain('Reporting service unavailable'));
    expect(within(book).queryByTestId('v2-kpi-cases')).toBeNull();

    window.location.hash = '#myday';
    expect(await screen.findByTestId('v2-home')).toBeTruthy();
  });
});
