import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ARREAR_BUCKET_CODES } from '@dcp/domain';
import { App } from '../App.js';
import { buildCaseFilter } from '../data/collectionQueries.js';
import { BUCKET_LABELS } from '../data/schema.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Portfolio & Strategy through the real App, on a fake platform that **aggregates server-side**.
 *
 * The fake holds a table of cases and answers a FetchXML aggregate by grouping that table itself,
 * exactly as Dataverse does; a plain list read pages the same table through the same `$filter`. So
 * what is proved is the contract that matters: the count a cell shows and the list it opens describe
 * one population, the browser never receives the portfolio to group it, and a refused aggregate is
 * unknown rather than zero.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const EARLY = { qdb_collectionstrategyid: 's-early', qdb_code: 'DEMO-EARLY', qdb_name: 'DEMO-Early stage', qdb_priority: 10, qdb_isactive: true, qdb_dpdfrom: 1, qdb_dpdto: 30, qdb_arrearsfrom: 500, qdb_arrearsto: 50000, qdb_rulecode: 'DEMO-RULE-STRATEGY' };
const LATE = { qdb_collectionstrategyid: 's-late', qdb_code: 'DEMO-PRELEGAL', qdb_name: 'DEMO-Late stage', qdb_priority: 30, qdb_isactive: true, qdb_dpdfrom: 91, qdb_dpdto: 180 };
const ACTION = { qdb_strategyactionid: 'a-1', qdb_name: 'DEMO-Send SMS reminder', qdb_sequence: 1, qdb_isactive: true, _qdb_strategyid_value: 's-early' };

interface FakeCase { id: string; bucket: number; strategy: string | null; org: number; arrears: number; open: boolean }

const bucketValue = (code: string) => Number(Object.entries(BUCKET_LABELS).find(([, label]) => label === code)![0]);

function makeCases(spec: { bucket: string; strategy: string | null; org?: 'HL' | 'BFD'; arrears: number; n: number }[]): FakeCase[] {
  const cases: FakeCase[] = [];
  for (const s of spec) {
    for (let i = 0; i < s.n; i++) {
      cases.push({ id: `${s.bucket}-${s.strategy ?? 'none'}-${s.org ?? 'HL'}-${i}`, bucket: bucketValue(s.bucket), strategy: s.strategy, org: s.org === 'BFD' ? 100000141 : 100000140, arrears: s.arrears, open: true });
    }
  }
  return cases;
}

const DEFAULT_CASES = makeCases([
  { bucket: '1-30', strategy: null, arrears: 1_000, n: 4 },
  { bucket: '61-90', strategy: 's-early', arrears: 100_000, n: 61 },
  { bucket: '61-90', strategy: null, arrears: 5_000, n: 20 },
  { bucket: '61-90', strategy: null, org: 'BFD', arrears: 7_000, n: 3 },
  { bucket: '>2000', strategy: null, arrears: 250_000, n: 5 },
]);

/** Applies a case-list `$filter` the way the platform would, for the fields this page uses. */
function matches(c: FakeCase, filter: string): boolean {
  if (filter.includes('statecode eq 0') && !c.open) return false;
  const bucket = /qdb_currentarrearbucket eq (\d+)/.exec(filter);
  if (bucket && c.bucket !== Number(bucket[1])) return false;
  const org = /qdb_organizationcode eq (\d+)/.exec(filter);
  if (org && c.org !== Number(org[1])) return false;
  if (filter.includes('_qdb_strategyid_value eq null') && c.strategy !== null) return false;
  const strategy = /_qdb_strategyid_value eq (s-[a-z]+)/.exec(filter);
  if (strategy && c.strategy !== strategy[1]) return false;
  return true;
}

/** Groups the table as Dataverse would for the matrix FetchXML. */
function aggregate(cases: FakeCase[], fetchXml: string): Record<string, unknown>[] {
  const org = /qdb_organizationcode" operator="eq" value="(\d+)"/.exec(fetchXml);
  const rows = cases.filter(c => c.open && (!org || c.org === Number(org[1])));
  if (fetchXml.includes('alias="asof"')) return [{ asof: '2026-09-17T22:04:56Z', syncedfrom: '2026-09-17T22:04:40Z', syncedto: '2026-09-18T22:45:43Z' }];
  const groups = new Map<string, { cases: number; arrears: number; bucket: number; strategy: string | null }>();
  for (const c of rows) {
    const key = `${c.bucket}|${c.strategy}`;
    const g = groups.get(key) ?? { cases: 0, arrears: 0, bucket: c.bucket, strategy: c.strategy };
    g.cases += 1; g.arrears += c.arrears; groups.set(key, g);
  }
  return [...groups.values()].map(g => ({
    cases: g.cases, arrears: g.arrears, bucket: g.bucket, [`bucket${FORMATTED}`]: BUCKET_LABELS[g.bucket],
    ...(g.strategy ? { strategy: g.strategy, [`strategy${FORMATTED}`]: g.strategy === 's-early' ? EARLY.qdb_name : LATE.qdb_name } : {}),
  }));
}

interface Options { cases?: FakeCase[]; refuseAggregate?: boolean; holdAggregate?: (fetchXml: string) => Promise<void> | void }
let listQueries: string[] = [];
let rowsHandedToBrowser = 0;

function install(options: Options = {}): void {
  const cases = options.cases ?? DEFAULT_CASES;
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      retrieveRecord: async () => { throw { errorCode: 2147746327 }; },
      async retrieveMultipleRecords(logicalName: string, optionsString = '', maxPageSize?: number) {
        const decoded = decodeURIComponent(optionsString);
        if (logicalName === 'qdb_collectionstrategy') return { entities: [LATE, EARLY] };
        if (logicalName === 'qdb_strategyaction') return { entities: decoded.includes('s-early') ? [ACTION] : [] };
        if (logicalName !== 'qdb_collectioncase') return { entities: [] };
        if (decoded.startsWith('?fetchXml=')) {
          const fetchXml = decoded.slice('?fetchXml='.length);
          await options.holdAggregate?.(fetchXml);
          if (options.refuseAggregate) throw { errorCode: 0x8004E023, message: 'AggregateQueryRecordLimit exceeded.' };
          return { entities: aggregate(cases, fetchXml) };
        }
        listQueries.push(decoded);
        const filter = /\$filter=([^&]*)/.exec(decoded)?.[1] ?? '';
        const page = cases.filter(c => matches(c, filter)).slice(0, maxPageSize ?? 50);
        rowsHandedToBrowser += page.length;
        return { entities: page.map(c => ({ qdb_collectioncaseid: c.id, qdb_casenumber: c.id, qdb_customerbusinessid: 'x', qdb_facilitynumber: c.id, qdb_facilitysourcesystem: 'HL', qdb_organizationcode: c.org, statuscode: 100000600, statecode: 0, qdb_currentarrearbucket: c.bucket, qdb_currenttotalarrears: c.arrears })) };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async (url: string) => {
    // The transport's `$count`, used to reconcile a cell against its own filter.
    const filter = decodeURIComponent(/\$filter=([^&]*)/.exec(String(url))?.[1] ?? '');
    const total = cases.filter(c => matches(c, filter)).length;
    return new Response(JSON.stringify({ '@odata.count': total, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

async function openPortfolio(options: Options = {}) {
  install(options);
  window.location.hash = '#buckets';
  render(<App />);
  return screen.findByTestId('v2-portfolio', {}, { timeout: 5000 });
}

const cell = (bucket: string, strategy: string) => screen.getByTestId(`v2-cell-${bucket}-${strategy}`);

beforeEach(() => {
  listQueries = [];
  rowsHandedToBrowser = 0;
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('the matrix', () => {
  it('has the ten MIS buckets as rows, in MIS order, and a total row', async () => {
    await openPortfolio();
    const table = await screen.findByTestId('v2-portfolio-matrix');

    const rows = within(table).getAllByRole('rowheader').map(h => h.textContent);
    expect(rows).toEqual([...ARREAR_BUCKET_CODES.map(code => `${code} DPD`), 'Total']);
  });

  it('has the configured strategies in priority order, Strategy Not Assigned, then Total as columns', async () => {
    await openPortfolio();
    const table = await screen.findByTestId('v2-portfolio-matrix');

    const heads = within(table).getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['DPD bucket', 'DEMO-Early stage', 'DEMO-Late stage', 'Strategy Not Assigned', 'Total']);
  });

  it('never offers a risk column or exposure wording', async () => {
    const page = await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    expect(page.textContent).not.toMatch(/risk 1|risk [0-9]|exposure/i);
  });

  it('shows the platform\'s count and current arrears in a populated cell', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    expect(cell('61-90', 's-early').textContent).toBe('61QAR 6.1Marrears');
  });

  it('describes a populated cell for a screen reader, in cases', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    expect(cell('61-90', 's-early').getAttribute('aria-label')).toBe('61 to 90 DPD, DEMO-Early stage, 61 cases, QAR 6,100,000 current arrears. Open cases.');
  });

  it('renders a zero cell inert', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    const zero = cell('1-30', 's-early');
    expect([zero.tagName, zero.dataset['state'], zero.textContent]).toEqual(['SPAN', 'zero', '0']);
  });

  it('totals the row from the same rows the cells came from', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    const row = screen.getByTestId('v2-matrix-row-61-90');
    expect(within(row).getAllByRole('cell').at(-1)?.textContent).toBe('84QAR 6.2M');
  });

  it('shades by arrears and says so in a legend, while the cell still shows its figures', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    expect([cell('61-90', 's-early').dataset['shade'], cell('>2000', 'none').dataset['shade'], screen.getByLabelText(/Shade shows current arrears/) !== null])
      .toEqual(['5', '2', true]);
  });

  it('says the position is stored MIS data, with its as-of date', async () => {
    await openPortfolio();

    expect((await screen.findByTestId('v2-portfolio-freshness')).textContent).toMatch(/Stored MIS position as of 2026-09-17.*not a live MIS read/);
  });
});

describe('opening a cell', () => {
  it('goes to Collection Cases with the cell\'s filters and where it came from in the URL', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    await userEvent.click(cell('61-90', 'none'));

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&strategy=none&scope=all&from=portfolio');
  });

  it('works from the keyboard', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    cell('61-90', 's-early').focus();
    await userEvent.keyboard('{Enter}');

    expect(window.location.hash).toContain('#cases/filter/bucket=61-90&strategy=s-early');
  });

  it('lists exactly the population the cell counted — count reconciliation', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');
    const shown = Number(cell('61-90', 'none').querySelector('.v2-cell-count')?.textContent);

    await userEvent.click(cell('61-90', 'none'));
    await screen.findByTestId('v2-cases-filtered-by');
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(0));

    const filter = decodeURIComponent(/\$filter=([^&]*)/.exec(listQueries.at(-1)!)?.[1] ?? '');
    const population = DEFAULT_CASES.filter(c => matches(c, filter));
    expect([shown, population.length]).toEqual([23, 23]);
  });

  it('shows arrears that sum over exactly that population — arrears reconciliation', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');
    const shownArrears = cell('61-90', 'none').querySelector('.v2-cell-sub')?.textContent;

    const filter = buildCaseFilter({ openOnly: true, bucket: '61-90', strategy: 'none' })!;
    const sum = DEFAULT_CASES.filter(c => matches(c, filter)).reduce((a, c) => a + c.arrears, 0);
    expect([shownArrears, sum]).toEqual(['QAR 121K', 121_000]);
  });

  it('scopes the cell to the CRM in view, in the aggregate and the list alike', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    await userEvent.selectOptions(screen.getByTestId('v2-org-scope'), 'BFD');
    await waitFor(() => expect(cell('61-90', 'none').textContent).toContain('3'));
    await userEvent.click(cell('61-90', 'none'));

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&strategy=none&scope=BFD&from=portfolio');
  });

  it('remembers the cell it opened when the officer comes back', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');
    await userEvent.click(cell('61-90', 's-early'));
    await screen.findByTestId('v2-cases-filtered-by');

    await userEvent.click(screen.getByTestId('v2-cases-back-portfolio'));

    await screen.findByTestId('v2-portfolio-matrix');
    expect(cell('61-90', 's-early').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Collection Cases, arrived at from a cell', () => {
  const arrive = async (encoded: string) => {
    install();
    window.location.hash = `#cases/filter/${encoded}`;
    render(<App />);
    return screen.findByTestId('v2-cases-filtered-by', {}, { timeout: 5000 });
  };

  it('shows the filters as chips, with the strategy\'s name', async () => {
    const strip = await arrive('bucket=61-90&strategy=s-early&strategyLabel=DEMO-Early+stage&scope=all&from=portfolio');

    expect([within(strip).getByTestId('v2-filter-chip-bucket').textContent, within(strip).getByTestId('v2-filter-chip-strategy').textContent])
      .toEqual(['DPD: 61-90×', 'Strategy: DEMO-Early stage×']);
  });

  it('names Strategy Not Assigned rather than showing "none"', async () => {
    const strip = await arrive('bucket=61-90&strategy=none&from=portfolio');

    expect(within(strip).getByTestId('v2-filter-chip-strategy').textContent).toBe('Strategy: Strategy Not Assigned×');
  });

  it('sends the strategy filter to the source', async () => {
    await arrive('bucket=61-90&strategy=none&from=portfolio');

    await waitFor(() => expect(listQueries.at(-1)).toContain('_qdb_strategyid_value eq null'));
  });

  it('removes one filter by editing the URL', async () => {
    const strip = await arrive('bucket=61-90&strategy=none&from=portfolio');

    await userEvent.click(within(strip).getByRole('button', { name: 'Remove the DPD 61-90 filter' }));

    expect(window.location.hash).toBe('#cases/filter/strategy=none&from=portfolio');
  });

  it('clears every filter', async () => {
    const strip = await arrive('bucket=61-90&strategy=none&from=portfolio');

    await userEvent.click(within(strip).getByTestId('v2-cases-clear-url'));

    expect(window.location.hash).toBe('#cases');
  });

  it('applies the CRM scope the cell named, and shows it', async () => {
    const strip = await arrive('bucket=61-90&strategy=none&scope=BFD&from=portfolio');

    expect([within(strip).getByTestId('v2-filter-chip-scope').textContent, (screen.getByTestId('v2-org-scope') as HTMLSelectElement).value])
      .toEqual(['CRM: BFD×', 'BFD']);
  });

  it('offers the way back only when the officer came from the portfolio', async () => {
    install();
    window.location.hash = '#cases/filter/bucket=61-90';
    render(<App />);
    await screen.findByTestId('v2-cases-filtered-by', {}, { timeout: 5000 });

    expect(screen.queryByTestId('v2-cases-back-portfolio')).toBeNull();
  });
});

describe('honesty', () => {
  it('shows unknown, never zero, when the platform refuses the aggregate — and cells still open', async () => {
    await openPortfolio({ refuseAggregate: true });

    await screen.findByTestId('v2-portfolio-unavailable');
    const unknown = cell('61-90', 'none');
    expect([unknown.dataset['state'], unknown.textContent?.includes('0'), unknown.tagName]).toEqual(['unknown', false, 'BUTTON']);
    await userEvent.click(unknown);
    expect(window.location.hash).toContain('#cases/filter/bucket=61-90&strategy=none');
  });

  it('says so when no open case is readable in this session', async () => {
    await openPortfolio({ cases: [] });

    expect(await screen.findByTestId('v2-portfolio-empty')).toBeTruthy();
  });

  it('never lets a slow answer to the old scope repaint the new one', async () => {
    let releaseAll: () => void = () => {};
    const held = new Promise<void>(resolve => { releaseAll = resolve; });
    await openPortfolio({ holdAggregate: fetchXml => (fetchXml.includes('organizationcode') ? undefined : held) });
    // The first (all-scope) aggregate is held; switching to BFD answers immediately.
    await userEvent.selectOptions(screen.getByTestId('v2-org-scope'), 'BFD');
    const count = () => cell('61-90', 'none').querySelector('.v2-cell-count')?.textContent;
    await waitFor(() => expect(count()).toBe('3'));

    releaseAll();
    await new Promise(resolve => setTimeout(resolve, 50));

    // The all-scope answer (23) arrived late and must not have replaced BFD's 3.
    expect(count()).toBe('3');
  });
});

describe('large data', () => {
  it('asks the platform to aggregate 100,000 cases and receives only grouped rows, not the portfolio', async () => {
    const big = makeCases(ARREAR_BUCKET_CODES.map(bucket => ({ bucket, strategy: null, arrears: 1_000, n: 10_000 })));
    await openPortfolio({ cases: big });
    await screen.findByTestId('v2-portfolio-matrix');

    expect([screen.getByTestId('v2-matrix-grand-total').textContent, rowsHandedToBrowser, listQueries.length]).toEqual(['100,000QAR 100.0M', 0, 0]);
  });

  it('keeps the DOM bounded to the grid, whatever the portfolio holds', async () => {
    const big = makeCases(ARREAR_BUCKET_CODES.map(bucket => ({ bucket, strategy: null, arrears: 1_000, n: 5_000 })));
    await openPortfolio({ cases: big });
    const table = await screen.findByTestId('v2-portfolio-matrix');

    // 10 buckets + total row, × (2 strategies + not assigned + total)
    expect(within(table).getAllByRole('cell')).toHaveLength(11 * 4);
  });
});

describe('the strategies section', () => {
  it('lists the configured strategies with their conditions and the cases each governs', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    const early = screen.getByTestId('v2-strategy-DEMO-EARLY');
    expect([early.textContent?.includes('DPD 1 – 30'), screen.getByTestId('v2-strategy-governed-DEMO-EARLY').textContent]).toEqual([true, '61']);
  });

  it('shows an action\'s missing activity type as not configured, never inferred', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-portfolio-matrix');

    await userEvent.click(screen.getByTestId('v2-strategy-toggle-DEMO-EARLY'));

    const actions = await screen.findByTestId('v2-strategy-actions-DEMO-EARLY');
    expect(actions.textContent).toContain('Not configured');
  });

  it('carries no invented narrative', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-strategy-table');

    expect(screen.getByTestId('v2-strategies').textContent).not.toMatch(/day 3|day 10|PTP mandatory|high-risk queue|field visit|restructur/i);
  });

  it('offers no control that runs, applies or evaluates a strategy', async () => {
    await openPortfolio();
    await screen.findByTestId('v2-strategy-table');

    expect(screen.queryAllByRole('button').filter(b => /run|apply|execute|evaluate/i.test(b.textContent ?? ''))).toEqual([]);
  });
});
