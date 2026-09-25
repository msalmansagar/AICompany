import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ARREAR_BUCKET_CODES } from '@dcp/domain';
import { App } from '../App.js';
import { buildCaseFilter } from '../data/collectionQueries.js';
import { formatMoney } from '../components/primitives.js';
import { BUCKET_LABELS, CASE_STATUS_LABELS } from '../data/schema.js';
import { recallCaseListReturn, recallSelectedCase } from '../v2/data/caseListFilterUrl.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Collection Cases V2 through the real App, on a fake platform that **filters, sorts, pages and
 * aggregates server-side** — the OData `$filter` and the FetchXML facet are honoured by two separate
 * interpreters, as Dataverse honours them, so the contract proved is the one that matters: a bucket
 * chip's count and the list it opens describe one population, every narrowing is sent to the source,
 * Split and Grid are two renderings of one query, and nothing the reference shows that DCP cannot
 * back appears on the screen.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const SESSION_USER = '1';

interface FakeCase {
  id: string; caseNumber: string; customerBusinessId: string; customerName: string; table: 'contact' | 'account';
  facility: string; source: 'HL' | 'BFD'; status: number; bucket: number | null; dpd: number; arrears: number;
  balance: number; strategy: string | null; owner: string; product: string; customerType: number; opened: string; open: boolean;
}

const bucketValue = (code: string) => Number(Object.entries(BUCKET_LABELS).find(([, label]) => label === code)![0]);
const statusValue = (label: string) => Number(Object.entries(CASE_STATUS_LABELS).find(([, text]) => text === label)![0]);

let counter = 0;
function makeCase(over: Omit<Partial<FakeCase>, 'bucket'> & { bucket?: string | null }): FakeCase {
  counter += 1;
  const n = String(counter).padStart(4, '0');
  const { bucket, ...rest } = over;
  return {
    id: `c-${n}`, caseNumber: `ARR-HL-${n}`, customerBusinessId: `289${n}`, customerName: `Customer ${n}`, table: 'contact',
    facility: `FAC-${n}`, source: 'HL', status: statusValue('New'), bucket: bucket === undefined ? bucketValue('1-30') : bucket === null ? null : bucketValue(bucket),
    dpd: 10, arrears: 1_000, balance: 100_000, strategy: null, owner: 'svc', product: 'LLD-REAL ESTATE LN', customerType: 100000020,
    opened: '2024-01-01T00:00:00Z', open: true, ...rest,
  };
}

function defaultCases(): FakeCase[] {
  counter = 0;
  return [
    ...ARREAR_BUCKET_CODES.map((code, index) => makeCase({ bucket: code, dpd: 10 * (index + 1), arrears: 1_000 * (index + 1) })),
    makeCase({ bucket: '61-90', caseNumber: 'DEMO-HL-1000', customerName: 'Aisha Al-Mansouri', strategy: 's-early', status: statusValue('PTP Active'), dpd: 74, arrears: 41_250, balance: 1_236_462, owner: SESSION_USER, product: 'Building Housing' }),
    makeCase({ bucket: '91-180', caseNumber: 'DEMO-BFD-1002', customerName: 'Doha Trading WLL', table: 'account', source: 'BFD', customerType: 100000021, product: 'Trade Facility', arrears: 188_400 }),
    makeCase({ bucket: null, caseNumber: 'ARR-HL-NOBUCKET' }),
    makeCase({ bucket: '1-30', caseNumber: 'CLOSED-1', open: false }),
  ];
}

const ORG = { HL: 100000140, BFD: 100000141 } as const;
const OWNER_NAMES: Record<string, string> = { svc: '# DFE Backend API', [SESSION_USER]: 'Tester' };
const STRATEGY_NAMES: Record<string, string> = { 's-early': 'DEMO-Early stage — soft contact' };
const ACTION = { qdb_strategyactionid: 'a-1', qdb_name: 'DEMO-Send SMS reminder', qdb_sequence: 1, qdb_isactive: true, _qdb_strategyid_value: 's-early' };

function toEntity(c: FakeCase): Record<string, unknown> {
  return {
    qdb_collectioncaseid: c.id, qdb_casenumber: c.caseNumber, qdb_customerbusinessid: c.customerBusinessId, qdb_facilitynumber: c.facility,
    qdb_facilitysourcesystem: c.source, qdb_organizationcode: ORG[c.source], statuscode: c.status, statecode: c.open ? 0 : 1,
    ...(c.bucket === null ? {} : { qdb_currentarrearbucket: c.bucket }), qdb_currentdpd: c.dpd, qdb_currenttotalarrears: c.arrears, qdb_currentloanbalance: c.balance,
    qdb_misasofdate: '2026-06-30T00:00:00Z', qdb_lastmissyncon: '2026-09-18T22:45:43Z', qdb_episodenumber: 1, qdb_opendate: c.opened,
    _qdb_customerid_value: `cust-${c.id}`, [`_qdb_customerid_value${FORMATTED}`]: c.customerName, [`_qdb_customerid_value${TABLE}`]: c.table,
    qdb_customertype: c.customerType, qdb_productdescription: c.product,
    ...(c.strategy ? { _qdb_strategyid_value: c.strategy, [`_qdb_strategyid_value${FORMATTED}`]: STRATEGY_NAMES[c.strategy] } : {}),
    _ownerid_value: c.owner, [`_ownerid_value${FORMATTED}`]: OWNER_NAMES[c.owner], createdon: c.opened,
  };
}

// ── Two interpreters, as the platform has two ────────────────────────────────

const SEARCHABLE: Record<string, (c: FakeCase) => string> = {
  qdb_casenumber: c => c.caseNumber, qdb_customerbusinessid: c => c.customerBusinessId, qdb_facilitynumber: c => c.facility,
  'qdb_customerid_contact/fullname': c => (c.table === 'contact' ? c.customerName : ''), 'qdb_customerid_account/name': c => (c.table === 'account' ? c.customerName : ''),
};

/** Honours a case-list `$filter` the way Dataverse would. */
function matchesOData(c: FakeCase, filter: string): boolean {
  if (filter.includes('statecode eq 0') && !c.open) return false;
  const org = /qdb_organizationcode eq (\d+)/.exec(filter);
  if (org && ORG[c.source] !== Number(org[1])) return false;
  const bucket = /qdb_currentarrearbucket eq (\d+)/.exec(filter);
  if (bucket && c.bucket !== Number(bucket[1])) return false;
  const status = /statuscode eq (\d+)/.exec(filter);
  if (status && c.status !== Number(status[1])) return false;
  if (filter.includes('_qdb_strategyid_value eq null') && c.strategy !== null) return false;
  const strategy = /_qdb_strategyid_value eq (s-[a-z]+)/.exec(filter);
  if (strategy && c.strategy !== strategy[1]) return false;
  const owner = /_ownerid_value eq ([\w-]+)/.exec(filter);
  if (owner && c.owner !== owner[1]) return false;
  const contains = [...filter.matchAll(/contains\(([\w/]+),'([^']*)'\)/g)];
  if (contains.length > 0 && !contains.some(([, field, term]) => SEARCHABLE[field!]!(c).toLowerCase().includes(term!.toLowerCase()))) return false;
  return true;
}

const FETCH_SEARCHABLE: Record<string, (c: FakeCase) => string> = {
  qdb_casenumber: SEARCHABLE['qdb_casenumber']!, qdb_customerbusinessid: SEARCHABLE['qdb_customerbusinessid']!, qdb_facilitynumber: SEARCHABLE['qdb_facilitynumber']!,
  'customercontact.fullname': SEARCHABLE['qdb_customerid_contact/fullname']!, 'customeraccount.name': SEARCHABLE['qdb_customerid_account/name']!,
};

/** Honours the facet FetchXML the way Dataverse would — written separately from `matchesOData` on purpose. */
function matchesFetch(c: FakeCase, fetchXml: string): boolean {
  const has = (attribute: string, value: string) => fetchXml.includes(`<condition attribute="${attribute}" operator="eq" value="${value}"/>`);
  if (has('statecode', '0') && !c.open) return false;
  const org = /attribute="qdb_organizationcode" operator="eq" value="(\d+)"/.exec(fetchXml);
  if (org && ORG[c.source] !== Number(org[1])) return false;
  const status = /attribute="statuscode" operator="eq" value="(\d+)"/.exec(fetchXml);
  if (status && c.status !== Number(status[1])) return false;
  if (fetchXml.includes('<condition attribute="qdb_strategyid" operator="null"/>') && c.strategy !== null) return false;
  const strategy = /attribute="qdb_strategyid" operator="eq" value="([^"]+)"/.exec(fetchXml);
  if (strategy && c.strategy !== strategy[1]) return false;
  const owner = /attribute="ownerid" operator="eq" value="([^"]+)"/.exec(fetchXml);
  if (owner && c.owner !== owner[1]) return false;
  const orFilter = /<filter type="or">(.*?)<\/filter>/.exec(fetchXml);
  if (orFilter) {
    const likes = [...orFilter[1]!.matchAll(/<condition (?:entityname="(\w+)" )?attribute="(\w+)" operator="like" value="%([^"]*)%"\/>/g)];
    if (!likes.some(([, entity, attribute, term]) => FETCH_SEARCHABLE[entity ? `${entity}.${attribute}` : attribute!]!(c).toLowerCase().includes(term!.toLowerCase()))) return false;
  }
  return true;
}

function facet(cases: FakeCase[], fetchXml: string): Record<string, unknown>[] {
  const groups = new Map<number | null, number>();
  for (const c of cases.filter(x => matchesFetch(x, fetchXml))) groups.set(c.bucket, (groups.get(c.bucket) ?? 0) + 1);
  return [...groups].map(([bucket, cases]) => ({ cases, ...(bucket === null ? {} : { bucket, [`bucket${FORMATTED}`]: BUCKET_LABELS[bucket] }) }));
}

const SORTABLE: Record<string, (c: FakeCase) => string | number> = {
  qdb_currentdpd: c => c.dpd, qdb_currenttotalarrears: c => c.arrears, qdb_currentloanbalance: c => c.balance,
  qdb_casenumber: c => c.caseNumber, qdb_productdescription: c => c.product, createdon: c => c.opened, qdb_collectioncaseid: c => c.id,
};

function sorted(cases: FakeCase[], orderBy: string | undefined): FakeCase[] {
  if (!orderBy) return cases;
  const keys = orderBy.split(',').map(part => { const [field, dir] = part.trim().split(' '); return { read: SORTABLE[field!]!, desc: dir === 'desc' }; });
  return [...cases].sort((a, b) => {
    for (const key of keys) {
      const [x, y] = [key.read(a), key.read(b)];
      if (x === y) continue;
      return (x < y ? -1 : 1) * (key.desc ? -1 : 1);
    }
    return 0;
  });
}

interface Options { cases?: FakeCase[]; refuseAggregate?: boolean; failList?: boolean; holdList?: (options: string) => Promise<void> | void; caseReadFails?: boolean }
let listQueries: string[] = [];
let facetQueries: string[] = [];
let rowsHandedToBrowser = 0;
let activities: Record<string, unknown>[] = [];

function install(options: Options = {}): FakeCase[] {
  const cases = options.cases ?? defaultCases();
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: `{${SESSION_USER}}`, userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string) {
        if (options.caseReadFails) throw { errorCode: 0x80040220, message: 'refused' };
        if (logicalName === 'qdb_collectioncase') { const c = cases.find(x => x.id === id); if (c) return toEntity(c); }
        if (logicalName === 'contact') return { contactid: id, fullname: cases.find(x => `cust-${x.id}` === id)?.customerName, statecode: 0 };
        if (logicalName === 'account') return { accountid: id, name: cases.find(x => `cust-${x.id}` === id)?.customerName, statecode: 0 };
        throw { errorCode: 2147746327, message: 'Does Not Exist' };
      },
      async retrieveMultipleRecords(logicalName: string, optionsString = '', maxPageSize?: number) {
        const decoded = decodeURIComponent(optionsString);
        if (logicalName === 'qdb_strategyaction') return { entities: decoded.includes('s-early') ? [ACTION] : [] };
        if (logicalName === 'qdb_collectionactivity') {
          const caseId = /_qdb_collectioncaseid_value eq ([\w-]+)/.exec(decoded)?.[1];
          const promisesOnly = decoded.includes('qdb_ptpdate ne null');
          const attributed = decoded.includes('_qdb_strategyactionid_value ne null');
          return { entities: activities.filter(a => a['_qdb_collectioncaseid_value'] === caseId && (!promisesOnly || a['qdb_ptpdate']) && (!attributed || a['_qdb_strategyactionid_value'])) };
        }
        if (logicalName !== 'qdb_collectioncase') return { entities: [] };
        if (decoded.startsWith('?fetchXml=')) {
          facetQueries.push(decoded);
          if (options.refuseAggregate) throw { errorCode: 0x8004E023, message: 'AggregateQueryRecordLimit exceeded.' };
          return { entities: facet(cases, decoded.slice('?fetchXml='.length)) };
        }
        listQueries.push(decoded);
        await options.holdList?.(decoded);
        if (options.failList) throw { errorCode: 0x80040220, message: 'refused' };
        const filter = /\$filter=([^&]*)/.exec(decoded)?.[1] ?? '';
        const orderBy = /\$orderby=([^&]*)/.exec(decoded)?.[1];
        const skip = Number(/\$skiptoken=(\d+)/.exec(decoded)?.[1] ?? 0);
        const size = maxPageSize ?? 50;
        const population = sorted(cases.filter(c => matchesOData(c, filter)), orderBy);
        const page = population.slice(skip, skip + size);
        rowsHandedToBrowser += page.length;
        const base = decoded.replace(/&\$skiptoken=\d+/, '');
        return {
          entities: page.map(toEntity),
          ...(skip + size < population.length ? { nextLink: `https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_collectioncases${base}&$skiptoken=${skip + size}` } : {}),
        };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async (url: string) => {
    const filter = decodeURIComponent(/\$filter=([^&]*)/.exec(String(url))?.[1] ?? '');
    const total = cases.filter(c => matchesOData(c, filter)).length;
    return new Response(JSON.stringify({ '@odata.count': total, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return cases;
}

async function openCases(options: Options = {}, hash = '#cases') {
  const cases = install(options);
  window.location.hash = hash;
  render(<App />);
  await screen.findByTestId('v2-cases', {}, { timeout: 5000 });
  return cases;
}

const lastList = () => listQueries[listQueries.length - 1] ?? '';
const lastFacet = () => facetQueries[facetQueries.length - 1] ?? '';
const chip = (id: string) => screen.getByTestId(`v2-chip-${id}`);
const chipCount = (id: string) => chip(id).querySelector('.v2-chip-count')?.textContent;
const listRows = () => within(screen.getByTestId('v2-cases-list')).getAllByRole('row').slice(1);
const useGrid = () => window.localStorage.setItem('dcp.v2.casesLayout', 'grid');

beforeEach(() => {
  listQueries = []; facetQueries = []; rowsHandedToBrowser = 0; activities = [];
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = '';
});

// ── Layouts ──────────────────────────────────────────────────────────────────

describe('Split and Grid', () => {
  it('opens in Split, with the list beside an empty preview', async () => {
    await openCases();

    await screen.findByTestId('v2-cases-list');
    expect([screen.getByTestId('v2-cases').getAttribute('data-layout'), Boolean(screen.getByTestId('v2-case-preview-empty')), screen.getByTestId('v2-cases-list').className]).toEqual(['split', true, 'v2-grid v2-grid-fits']);
  });

  it('switches to Grid and remembers it for this browser', async () => {
    await openCases();

    await userEvent.click(screen.getByTestId('v2-cases-layout-grid'));

    expect([Boolean(await screen.findByTestId('v2-cases-grid')), window.localStorage.getItem('dcp.v2.casesLayout')]).toEqual([true, 'grid']);
  });

  it('comes back in the layout last chosen', async () => {
    useGrid();
    await openCases();

    expect(Boolean(await screen.findByTestId('v2-cases-grid'))).toBe(true);
  });

  it('asks the source the same question in both layouts — filters, search, scope and sort survive the switch', async () => {
    await openCases();
    await userEvent.click(chip('61-90'));
    await userEvent.type(screen.getByTestId('v2-cases-search'), 'DEMO');
    await userEvent.selectOptions(screen.getByTestId('v2-cases-sort'), 'arrears');
    await waitFor(() => expect(lastList()).toContain("contains(qdb_casenumber,'DEMO')"), { timeout: 3000 });
    const splitQuery = lastList();

    await userEvent.click(screen.getByTestId('v2-cases-layout-grid'));
    await screen.findByTestId('v2-cases-grid');

    await waitFor(() => expect(lastList()).toBe(splitQuery));
    expect(splitQuery).toContain('qdb_currentarrearbucket eq 100000002');
    expect(splitQuery).toContain('$orderby=qdb_currenttotalarrears desc,qdb_collectioncaseid asc');
  });

  it('keeps the filters that arrived from Portfolio & Strategy across the switch', async () => {
    await openCases({}, '#cases/filter/bucket=61-90&strategy=none&from=portfolio');
    await screen.findByTestId('v2-cases-filtered-by');

    await userEvent.click(screen.getByTestId('v2-cases-layout-grid'));
    await screen.findByTestId('v2-cases-grid');

    expect([window.location.hash, screen.getByTestId('v2-filter-chip-strategy').textContent]).toEqual(['#cases/filter/bucket=61-90&strategy=none&from=portfolio', 'Strategy: Strategy Not Assigned×']);
    await waitFor(() => expect(lastList()).toContain('_qdb_strategyid_value eq null'));
  });
});

// ── Buckets ──────────────────────────────────────────────────────────────────

describe('the bucket chips', () => {
  it('offers All and the ten MIS buckets in MIS order, each with its dot', async () => {
    await openCases();

    const group = screen.getByTestId('v2-cases-buckets');
    const ids = within(group).getAllByRole('button').map(b => b.getAttribute('data-testid'));
    const dots = within(group).getAllByRole('button').slice(1).map(b => b.querySelector('.v2-bucket-dot')?.getAttribute('data-bucket'));
    expect([ids, dots]).toEqual([['v2-chip-all', ...ARREAR_BUCKET_CODES.map(code => `v2-chip-${code}`)], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']]);
  });

  it('counts each bucket by one aggregate from the same query, and All by the whole population', async () => {
    const cases = await openCases();

    await waitFor(() => expect(chipCount('all')).toBeTruthy());

    const open = cases.filter(c => c.open);
    expect([chipCount('all'), chipCount('1-30'), chipCount('61-90'), chipCount('>2000')])
      .toEqual([String(open.length), String(open.filter(c => c.bucket === bucketValue('1-30')).length), String(open.filter(c => c.bucket === bucketValue('61-90')).length), '1']);
    expect(open.length).toBe(13);
  });

  it('names the matching cases that carry no bucket instead of losing them', async () => {
    await openCases();

    expect((await screen.findByTestId('v2-cases-unbucketed')).textContent).toBe('· 1 unbucketed');
  });

  it('opens exactly the population a chip counted — count reconciliation', async () => {
    const cases = await openCases();
    await waitFor(() => expect(chipCount('61-90')).toBeTruthy());
    const counted = Number(chipCount('61-90'));

    await userEvent.click(chip('61-90'));
    await waitFor(() => expect(lastList()).toContain('qdb_currentarrearbucket eq 100000002'));

    const filter = /\$filter=([^&]*)/.exec(lastList())![1]!;
    expect([counted, cases.filter(c => matchesOData(c, filter)).length]).toEqual([2, 2]);
  });

  it('reconciles the count with the list under every other filter — search, status, scope and owner alike', async () => {
    const cases = await openCases();
    await userEvent.click(chip('owner-mine'));
    await userEvent.type(screen.getByTestId('v2-cases-search'), 'DEMO');
    await waitFor(() => expect(lastFacet()).toContain('%DEMO%'), { timeout: 3000 });
    await waitFor(() => expect(lastList()).toContain("contains(qdb_casenumber,'DEMO')"));

    const fetchXml = lastFacet().slice('?fetchXml='.length);
    const filter = /\$filter=([^&]*)/.exec(lastList())![1]!;
    const byFacet = cases.filter(c => matchesFetch(c, fetchXml)).length;
    const byList = cases.filter(c => matchesOData(c, filter)).length;
    await waitFor(() => expect(chipCount('all')).toBe(String(byFacet)));
    expect([byFacet, byList]).toEqual([1, 1]);
  });

  it('shows every count as unknown, never zero, when the platform refuses the aggregate — and the chips still filter', async () => {
    await openCases({ refuseAggregate: true });

    await screen.findByTestId('v2-cases-counts-unknown');
    await userEvent.click(chip('91-180'));

    expect(chipCount('all')).toBe('—');
    await waitFor(() => expect(lastList()).toContain('qdb_currentarrearbucket eq 100000003'));
  });
});

// ── The question sent to the source ──────────────────────────────────────────

describe('the query sent to the source', () => {
  it('orders worst DPD first, with a unique tie-breaker', async () => {
    await openCases();

    await waitFor(() => expect(lastList()).toContain('$orderby=qdb_currentdpd desc,qdb_collectioncaseid asc'));
  });

  it('searches case number, customer id, facility number and the customer name at the source', async () => {
    await openCases();

    await userEvent.type(screen.getByTestId('v2-cases-search'), 'Aisha');

    await waitFor(() => expect(lastList()).toContain("contains(qdb_casenumber,'Aisha') or contains(qdb_customerbusinessid,'Aisha') or contains(qdb_facilitynumber,'Aisha') or contains(qdb_customerid_contact/fullname,'Aisha') or contains(qdb_customerid_account/name,'Aisha')"), { timeout: 3000 });
    await waitFor(() => expect(listRows().length).toBe(1));
  });

  it('narrows to the officer\'s own cases by ownership, and back', async () => {
    await openCases();

    await userEvent.click(chip('owner-mine'));
    await waitFor(() => expect(lastList()).toContain(`_ownerid_value eq ${SESSION_USER}`));
    await userEvent.click(chip('owner-all'));

    await waitFor(() => expect(/\$filter=([^&]*)/.exec(lastList())?.[1] ?? '').not.toContain('_ownerid_value'));
  });

  it('changes the order at the source from the select', async () => {
    await openCases();

    await userEvent.selectOptions(screen.getByTestId('v2-cases-sort'), 'balance');

    await waitFor(() => expect(lastList()).toContain('$orderby=qdb_currentloanbalance desc,qdb_collectioncaseid asc'));
  });

  it('sorts from a Grid column header at the source, flips on a second click, and says so', async () => {
    useGrid();
    await openCases();
    await screen.findByTestId('v2-cases-grid');

    await userEvent.click(screen.getByTestId('v2-sort-arrears'));
    await waitFor(() => expect(lastList()).toContain('$orderby=qdb_currenttotalarrears desc,qdb_collectioncaseid asc'));
    await userEvent.click(screen.getByTestId('v2-sort-arrears'));

    await waitFor(() => expect(lastList()).toContain('$orderby=qdb_currenttotalarrears asc,qdb_collectioncaseid asc'));
    expect(screen.getByTestId('v2-sort-arrears').closest('th')?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('offers no header sort on a column backed by a lookup', async () => {
    useGrid();
    await openCases();
    await screen.findByTestId('v2-cases-grid');

    expect([screen.queryByTestId('v2-sort-customer'), screen.queryByTestId('v2-sort-strategy'), screen.queryByTestId('v2-sort-owner')]).toEqual([null, null, null]);
  });

  it('pages: the browser receives one page and asks for the next only when needed', async () => {
    counter = 0;
    const many = Array.from({ length: 120 }, () => makeCase({}));
    await openCases({ cases: many });

    await waitFor(() => expect(screen.getByTestId('v2-cases-list-footer').textContent).toContain('50 shown — scroll for more'));
    expect(rowsHandedToBrowser).toBe(50);
  });

  it('never lets a slow answer to an old search replace the current one', async () => {
    let release: () => void = () => {};
    const first = new Promise<void>(resolve => { release = resolve; });
    let held = 0;
    await openCases({ holdList: async options => { if (options.includes("'DEMO-HL'") && held++ === 0) await first; } });
    await userEvent.type(screen.getByTestId('v2-cases-search'), 'DEMO-HL');
    await waitFor(() => expect(lastList()).toContain("'DEMO-HL'"), { timeout: 3000 });
    await userEvent.type(screen.getByTestId('v2-cases-search'), '{Backspace}{Backspace}{Backspace}');
    await waitFor(() => expect(lastList()).toContain("'DEMO'"), { timeout: 3000 });
    await waitFor(() => expect(listRows().length).toBe(2));

    release();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(listRows().length).toBe(2);
  });
});

// ── Selection and preview ─────────────────────────────────────────────────────

describe('choosing a case in Split', () => {
  it('carries the bucket bar at each row\'s edge, ranked by the same contract as the chip dot', async () => {
    await openCases();
    const row = await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' });

    const bar = row.querySelector('.v2-bucket-bar')?.getAttribute('data-bucket');
    const dot = chip('61-90').querySelector('.v2-bucket-dot')?.getAttribute('data-bucket');
    expect([bar, dot, row.querySelector('.v2-bucket-dot')]).toEqual(['3', '3', null]);
  });

  it('marks the row, previews the case and does not navigate', async () => {
    await openCases();
    const row = await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' });

    await userEvent.click(row);

    const preview = await screen.findByTestId('v2-case-preview');
    expect([row.getAttribute('aria-selected'), window.location.hash, within(preview).getByTestId('v2-preview-customer').textContent]).toEqual(['true', '#cases', 'Aisha Al-Mansouri 61-90 PTP Active HL']);
  });

  it('shows the four facts, the details and the freshness of the stored position', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    const preview = await screen.findByTestId('v2-case-preview');

    const stats = within(preview).getByTestId('v2-preview-stats').textContent;
    const details = within(preview).getByTestId('v2-preview-details').textContent;
    expect(stats).toContain(`Current arrears${formatMoney(41_250)}`);
    expect(stats).toContain('DPD74');
    expect(stats).toContain(`Loan balance${formatMoney(1_236_462)}`);
    expect(stats).toContain('StrategyDEMO-Early stage — soft contact');
    expect(details).toContain('Customer typeIndividual');
    expect(details).toContain('OwnerTester');
    expect(within(preview).getByTestId('v2-preview-sub').textContent).toBe('DEMO-HL-1000 · facility FAC-0011 · Building Housing');
    expect(within(preview).getByTestId('stored-position').textContent).toContain('not a live MIS read');
  });

  it('says Strategy Not Assigned and No next action determined when that is the truth', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case ARR-HL-0001' }));
    const preview = await screen.findByTestId('v2-case-preview');

    await waitFor(() => expect(within(preview).getByTestId('v2-preview-next').textContent).toContain('No next action determined'));
    expect(within(preview).getByTestId('v2-preview-stats').textContent).toContain('StrategyStrategy Not Assigned');
  });

  it('names the next planned action from the case\'s own action plan when the platform holds one', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    const preview = await screen.findByTestId('v2-case-preview');

    await waitFor(() => expect(within(preview).getByTestId('v2-preview-next').textContent).toContain('DEMO-Send SMS reminder'));
  });

  it('shows the last activity and the latest promise as recorded, or says none', async () => {
    activities = [
      { activityid: 'act-1', subject: 'Call attempted', createdon: '2026-09-20T08:30:00Z', statecode: 0, _qdb_collectioncaseid_value: 'c-0011' },
      { activityid: 'ptp-1', subject: 'Promise to pay', createdon: '2026-09-19T08:00:00Z', statecode: 0, _qdb_collectioncaseid_value: 'c-0011', qdb_ptpdate: '2026-10-08T00:00:00Z', qdb_promisedamount: 5000, qdb_ptpstatus: 100000080 },
    ];
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    const preview = await screen.findByTestId('v2-case-preview');

    await waitFor(() => expect(within(preview).getByTestId('v2-preview-recent').textContent).toContain('Call attempted'));
    expect(within(preview).getByTestId('v2-preview-recent').textContent).toContain(`${formatMoney(5_000)} promised for 2026-10-08 · Active`);
  });

  it('opens the full record from the preview and remembers the way back', async () => {
    await openCases({}, '#cases/filter/bucket=61-90&from=portfolio');
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    await userEvent.click(screen.getByTestId('v2-preview-open'));

    expect([window.location.hash, recallCaseListReturn()]).toEqual(['#case/c-0011', 'bucket=61-90&from=portfolio']);
  });

  it('remembers the chosen case for this tab and lands on it again', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');
    expect(recallSelectedCase()).toBe('c-0011');
    cleanup();

    install();
    window.location.hash = '#cases';
    render(<App />);

    expect((await screen.findByTestId('v2-case-preview', {}, { timeout: 5000 })).getAttribute('data-case-id')).toBe('c-0011');
  });

  it('works from the keyboard: arrows move between rows, Enter chooses', async () => {
    await openCases();
    const first = (await screen.findAllByRole('row', { name: /Preview case/ }))[0]!;
    first.focus();

    await userEvent.keyboard('{ArrowDown}');
    const second = document.activeElement as HTMLElement;
    await userEvent.keyboard('{Enter}');

    expect([second !== first, second.getAttribute('aria-selected')]).toEqual([true, 'true']);
  });

  it('says so when the chosen case cannot be read, rather than showing stale figures', async () => {
    await openCases({ caseReadFails: true });
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));

    expect(Boolean(await screen.findByTestId('v2-case-preview-error'))).toBe(true);
  });
});

describe('opening a case in Grid', () => {
  it('says in the footer how many cases there are and how they are ordered, from the source', async () => {
    useGrid();
    await openCases();
    await screen.findByTestId('v2-cases-grid');

    await waitFor(() => expect(screen.getByTestId('v2-cases-grid-summary').textContent).toBe('13 cases · sorted by DPD, highest first'));
    await userEvent.click(screen.getByTestId('v2-sort-arrears'));
    await userEvent.click(screen.getByTestId('v2-sort-arrears'));

    await waitFor(() => expect(screen.getByTestId('v2-cases-grid-summary').textContent).toBe('13 cases · sorted by arrears, lowest first'));
  });

  it('opens it from its row', async () => {
    useGrid();
    await openCases();

    await userEvent.click(await screen.findByRole('row', { name: 'Open case DEMO-HL-1000' }));

    expect(window.location.hash).toBe('#case/c-0011');
  });

  it('lays out every approved data point and nothing the reference shows that DCP cannot back', async () => {
    useGrid();
    await openCases();
    const grid = await screen.findByTestId('v2-cases-grid');

    const headers = within(grid).getAllByRole('columnheader').map(h => h.textContent?.replace(/[▲▼]/g, '').trim());
    expect(headers).toEqual(['Case', 'Customer', 'Arrears', 'Bucket', 'DPD', 'Status', 'Strategy', 'Owner']);
    const row = within(grid).getByRole('row', { name: 'Open case DEMO-HL-1000' });
    expect([row.textContent?.includes('Aisha Al-Mansouri'), row.textContent?.includes('HL CRM · Individual'), row.textContent?.includes('Building Housing'), row.querySelector('.v2-bucket-bar')?.getAttribute('data-bucket')]).toEqual([true, true, true, '3']);
    expect(screen.queryByTestId('v2-cases-sort')).toBeNull();
  });
});

// ── Commands ─────────────────────────────────────────────────────────────────

describe('commands on the chosen case', () => {
  it('opens the existing activity dialog to log an action', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    await userEvent.click(screen.getByTestId('v2-preview-log-action'));

    expect(Boolean(await screen.findByTestId('activity-dialog'))).toBe(true);
  });

  it('opens the existing promise dialog to capture a PTP', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    await userEvent.click(screen.getByTestId('v2-preview-capture-ptp'));

    expect(Boolean(await screen.findByTestId('promise-save'))).toBe(true);
  });

  it('sends a message through the case\'s own Communications tab', async () => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    await userEvent.click(screen.getByTestId('v2-preview-message'));

    expect(window.location.hash).toBe('#case/c-0011/comms');
  });

  it.each(['reassign', 'export', 'new action', 'log call', 'send reminder'])('offers no "%s" — not a delivered capability', async (label) => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    expect(screen.queryAllByRole('button', { name: new RegExp(label, 'i') })).toEqual([]);
  });
});

// ── Honesty ──────────────────────────────────────────────────────────────────

describe('what is not on the screen', () => {
  it.each(['Risk', 'Priority', 'Segment', 'SLA', 'Next review', 'Exposure', 'Contact rate', 'breaching', 'High risk'])('never says "%s"', async (word) => {
    await openCases();
    await userEvent.click(await screen.findByRole('row', { name: 'Preview case DEMO-HL-1000' }));
    await screen.findByTestId('v2-case-preview');

    expect(screen.getByTestId('v2-cases').textContent).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
  });

  it('carries no KPI cards', async () => {
    await openCases();

    expect(screen.queryAllByTestId(/v2-metric/)).toEqual([]);
  });

  it('distinguishes no cases at all from no matching cases', async () => {
    await openCases({ cases: [] });
    const unfiltered = await screen.findByTestId('v2-cases-list-empty');

    await userEvent.click(chip('61-90'));

    expect([Boolean(unfiltered), Boolean(await screen.findByTestId('v2-cases-list-empty-filtered'))]).toEqual([true, true]);
  });

  it('shows the list failure with a retry, not an empty list', async () => {
    await openCases({ failList: true });

    expect(Boolean(await screen.findByTestId('v2-cases-list-error'))).toBe(true);
  });

  it('takes a search typed in the header', async () => {
    install();
    window.location.hash = '#myday';
    render(<App />);
    await screen.findByTestId('v2-content', {}, { timeout: 5000 });

    await userEvent.type(screen.getByTestId('v2-search'), '28912345678{Enter}');

    expect((await screen.findByTestId('v2-cases-search') as HTMLInputElement).value).toBe('28912345678');
  });
});

describe('V1 is unchanged', () => {
  it('still searches only the identifiers unless a caller asks for more', () => {
    expect(buildCaseFilter({ search: 'x' })).toBe("(contains(qdb_casenumber,'x') or contains(qdb_customerbusinessid,'x'))");
  });
});
