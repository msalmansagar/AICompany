import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';
import { describeBalancesDate } from '../views/customer360/BalancesAsOf.js';
import { communicationMappings, configurationRow, FAX_COLUMN_MAP, LETTER_COLUMN_MAP } from './messagingFixtures.js';

/**
 * Customer 360 through the real App (V1 and V2 share one implementation), against a fake
 * organisation that records every read and every write. HL customers are contacts with Loan
 * Accounts; BFD customers are accounts with Facilities. Viewing the screen must write nothing.
 */

const F = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const WAIT = 5000;
const QID = '28912345678';
const APP_USER = 'app-user-1';
const TYPES = { call: 't-call', dispute: 't-dispute', legal: 't-legal', deceased: 't-deceased' };
const HL_MESSAGING_ROW = { ...configurationRow('cfg-hl', 'letter', 'letter'), qdb_organizationcode: 100000140 };
const BFD_MESSAGING_ROW = { ...configurationRow('cfg-bfd', 'fax', 'fax'), qdb_organizationcode: 100000141 };
const HL_MAPPINGS = communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP);
const BFD_MAPPINGS = communicationMappings('cfg-bfd', 'fax', FAX_COLUMN_MAP);

type Row = Record<string, unknown>;

function unitCase(index: number, overrides: Row = {}): Row {
  return {
    qdb_collectioncaseid: `c-${index}`, qdb_casenumber: `COL-${String(index).padStart(4, '0')}`, qdb_customerbusinessid: QID,
    qdb_facilitynumber: `HL-${String(index).padStart(5, '0')}`, qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140, [`qdb_organizationcode${F}`]: 'HL',
    statuscode: 100000600, [`statuscode${F}`]: 'In Progress', statecode: 0, qdb_currentdpd: 30, qdb_currenttotalarrears: 1000, qdb_currentloanbalance: 100000,
    qdb_currentarrearbucket: 100000000, qdb_customertype: 100000000, [`qdb_customertype${F}`]: 'Individual', qdb_productdescription: 'Building Housing',
    qdb_misasofdate: '2026-09-27T00:00:00Z', qdb_lastmissyncon: '2026-09-28T02:00:00Z', qdb_episodenumber: 1,
    _qdb_customerid_value: 'cust-1', [`_qdb_customerid_value${LOOKUP}`]: 'contact', [`_qdb_customerid_value${F}`]: 'Aisha Al-Mansouri',
    _qdb_strategyid_value: null, _ownerid_value: 'u-1', [`_ownerid_value${F}`]: 'Officer One',
    ...overrides,
  };
}

const BFD_CASE = unitCase(90, {
  qdb_facilitynumber: 'FAC-44100', qdb_facilitysourcesystem: 'BFD', qdb_organizationcode: 100000141, [`qdb_organizationcode${F}`]: 'BFD',
  qdb_productdescription: 'Working Capital', _qdb_customerid_value: 'acct-1', [`_qdb_customerid_value${LOOKUP}`]: 'account',
  qdb_customertype: 100000001, [`qdb_customertype${F}`]: 'SME',
});

interface Fake {
  cases?: Row[];
  contact?: Row | null;
  partialRead?: boolean;
  snapshots?: Row[];
  failSnapshots?: boolean;
  failHistory?: boolean;
  activities?: Row[];
  strategyActions?: Row[];
  holdFirstActivityRead?: boolean;
}

interface Probe { reads: string[]; writes: string[]; releaseHeld: () => void }

function snapshot(date: string, dpd: number, bucket = 100000000): Row {
  return { qdb_delinquencysnapshotid: `s-${date}`, qdb_snapshotdate: date, qdb_dpd: dpd, qdb_arrearbucket: bucket, qdb_facilitynumber: 'HL-00001', qdb_facilitysourcesystem: 'HL' };
}

function install(fake: Fake = {}): Probe {
  const cases = fake.cases ?? [unitCase(1, { qdb_currentdpd: 92 }), unitCase(2, { qdb_currentdpd: 30 })];
  const reads: string[] = [];
  const writes: string[] = [];
  let release: () => void = () => undefined;
  let held = fake.holdFirstActivityRead === true;
  const types = [
    { qdb_collectionactivitytypeid: TYPES.call, qdb_name: 'Call', qdb_code: 'P6-CALL', qdb_isactive: true },
    { qdb_collectionactivitytypeid: TYPES.dispute, qdb_name: 'Complaint / Dispute', qdb_code: 'P6-DISPUTE', qdb_isactive: true },
    { qdb_collectionactivitytypeid: TYPES.legal, qdb_name: 'Legal Recommendation', qdb_code: 'P6-LEGALREC', qdb_isactive: true },
    { qdb_collectionactivitytypeid: TYPES.deceased, qdb_name: 'Deceased / Insurance', qdb_code: 'P6-DECEASED', qdb_isactive: true },
  ];
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/', getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] }, organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string) {
        reads.push(`GET ${logicalName}(${id})`);
        if (logicalName === 'contact') {
          if (fake.contact === null) throw { errorCode: 2147746327 };
          return fake.contact ?? { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97455501234', donotphone: true, donotemail: false, donotfax: false, statecode: 0 };
        }
        if (logicalName === 'account') return { accountid: 'acct-1', name: 'Doha Marine Supplies', accountnumber: 'CR-1', telephone1: '+974444', donotphone: false, donotemail: false, donotfax: false, statecode: 0 };
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, raw = '') {
        const query = decodeURIComponent(raw);
        reads.push(`${logicalName} ${query}`);
        if (query.startsWith('?fetchXml=')) return { entities: query.includes('alias="overdue"') ? [{ cases: cases.filter(c => c['statecode'] === 0).length, overdue: 2000, exposure: 200000, dpd: 92 }] : [] };
        if (logicalName === 'qdb_collectioncase') return { entities: cases, ...(fake.partialRead ? { nextLink: 'https://org/next' } : {}) };
        if (logicalName === 'systemuser') return { entities: [{ systemuserid: APP_USER }] };
        if (logicalName === 'qdb_collectionactivitytype') return { entities: types };
        // Each organisation's messaging configuration, chosen by its code — HL records SMS as Letter, BFD as Fax.
        if (logicalName === 'qdb_platformconfiguration') return { entities: query.includes('100000141') ? [BFD_MESSAGING_ROW] : [HL_MESSAGING_ROW] };
        if (logicalName === 'qdb_platformmapping') return { entities: query.includes('cfg-bfd') ? BFD_MAPPINGS : HL_MAPPINGS };
        if (logicalName === 'qdb_strategyaction') return { entities: fake.strategyActions ?? [] };
        if (logicalName === 'qdb_delinquencysnapshot') {
          if (fake.failSnapshots) throw { errorCode: 0x80040216, message: 'Snapshots unavailable.' };
          return { entities: [...(fake.snapshots ?? [])].reverse() };
        }
        if (logicalName === 'qdb_collectionactivity') {
          if (/_qdb_strategyactionid_value ne null/.test(query) || /statecode eq 0 and \(/.test(query)) return { entities: [] };
          if (fake.failHistory) throw { errorCode: 0x80040216, message: 'History unavailable.' };
          if (held) {
            held = false;
            return new Promise(resolve => { release = () => resolve({ entities: [{ activityid: 'stale', subject: 'Stale entry', createdon: '2026-09-20T00:00:00Z', _qdb_collectioncaseid_value: 'c-1' }] }); });
          }
          const rows = fake.activities ?? [];
          return { entities: query.includes("qdb_relatedrecordtype eq 'qdb_qdblegal'") && !query.includes('not (') ? rows.filter(r => r['qdb_relatedrecordtype'] === 'qdb_qdblegal') : rows };
        }
        return { entities: [] };
      },
      async createRecord(entity: string) { writes.push(`create ${entity}`); return { id: '{1}' }; },
      async updateRecord(entity: string) { writes.push(`update ${entity}`); return { id: '1' }; },
      async deleteRecord(entity: string) { writes.push(`delete ${entity}`); return { id: '1' }; },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') writes.push(`${method} ${url}`);
    const decoded = decodeURIComponent(String(url));
    const count = decoded.includes('qdb_ptpstatus eq 100000081') ? 2 : decoded.includes('qdb_ptpdate ne null') && !decoded.includes('not ') ? 4 : decoded.includes('/letters') ? 3 : decoded.includes('/email') ? 1 : 0;
    return new Response(JSON.stringify({ '@odata.count': count, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { reads, writes, releaseHeld: () => release() };
}

async function open(fake: Fake = {}, version: 'v1' | 'v2' = 'v1'): Promise<Probe> {
  const probe = install(fake);
  if (version === 'v2') window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.location.hash = `#customer/${QID}`;
  render(<App />);
  await screen.findByTestId('c360-head', {}, { timeout: WAIT });
  return probe;
}

const units = () => screen.getAllByTestId('c360-unit');

beforeEach(() => { window.localStorage.removeItem(VERSION_STORAGE_KEY); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.removeItem(VERSION_STORAGE_KEY); window.location.hash = ''; });

describe('customers and terminology', () => {
  it('shows an HL customer as a Contact with Loan Accounts, never Facilities', async () => {
    await open();

    expect(screen.getByTestId('c360-tags').textContent).toContain('Housing Loan · Contact');
    expect(screen.getByRole('heading', { name: 'Loan Accounts' })).toBeTruthy();
    expect(units()[0]!.textContent).toContain('Loan Account HL-00001');
    expect(screen.getByTestId('c360-units-card').textContent).not.toMatch(/Facilit/);
  });

  it('shows a BFD customer as an Account with Facilities', async () => {
    await open({ cases: [BFD_CASE] });

    expect(screen.getByTestId('c360-tags').textContent).toContain('BFD · Account');
    expect(screen.getByRole('heading', { name: 'Facilities' })).toBeTruthy();
    expect(units()[0]!.textContent).toContain('Facility FAC-44100');
  });

  it('lists a cross-source customer once, tagging each row with its own source and terms', async () => {
    await open({ cases: [unitCase(1), BFD_CASE] });

    expect(screen.getByRole('heading', { name: 'Loan Accounts & Facilities' })).toBeTruthy();
    expect(screen.getByTestId('c360-portfolio').textContent).toContain('2 units');
    expect(units().map(row => row.textContent)).toEqual([expect.stringContaining('Facility FAC-44100'), expect.stringContaining('Loan Account HL-00001')]);
    expect(units().every(row => row.querySelector('.org-badge'))).toBe(true);
  });

  it('says the mobile is not available rather than leaving it blank', async () => {
    await open({ contact: { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', statecode: 0 } });

    expect(screen.getByTestId('c360-mobile').textContent).toBe('Mobile Not available');
  });
});

describe('financial units', () => {
  it('orders units by DPD descending, then unit number', async () => {
    await open({ cases: [unitCase(3, { qdb_currentdpd: 30 }), unitCase(1, { qdb_currentdpd: 92 }), unitCase(2, { qdb_currentdpd: 30 })] });

    expect(units().map(row => row.getAttribute('data-unit'))).toEqual(['HL-00001', 'HL-00002', 'HL-00003']);
  });

  it('renders ten units at a time and adds more on request', async () => {
    await open({ cases: Array.from({ length: 12 }, (_, i) => unitCase(i + 1, { qdb_currentdpd: 100 - i })) });

    expect(units()).toHaveLength(10);
    fireEvent.click(screen.getByTestId('c360-units-more'));
    expect(units()).toHaveLength(12);
  });

  it('counts the whole portfolio, not the rows on screen', async () => {
    const cases = Array.from({ length: 12 }, (_, i) => unitCase(i + 1, { qdb_currentdpd: i < 7 ? 30 : 0, statecode: i < 3 ? 0 : 1, statuscode: i < 3 ? 100000602 : 100000614 }));
    await open({ cases });

    expect(screen.getByTestId('c360-portfolio').textContent).toBe('12 Loan Accounts · 3 open cases · 7 delinquent · 5 current');
  });

  it('offers no unit counts when the read did not cover the whole portfolio', async () => {
    await open({ partialRead: true });

    expect(screen.getByTestId('c360-portfolio').textContent).toContain('counts not available');
  });

  it('shows a unit with no open case without case actions', async () => {
    await open({ cases: [unitCase(1), unitCase(2, { statecode: 1, statuscode: 100000614, [`statuscode${F}`]: 'Closed' })] });

    const closed = units()[1]!;
    expect(within(closed).getByTestId('c360-unit-no-case').textContent).toBe('No open Collection Case');
    expect(within(closed).queryByTestId('c360-unit-log-action')).toBeNull();
  });

  it('names the unit and case in every unit action', async () => {
    await open();

    expect(within(units()[0]!).getByTestId('c360-unit-log-action').getAttribute('aria-label')).toBe('Log action on Loan Account HL-00001, case COL-0001');
  });
});

describe('selection', () => {
  it('selects by mouse and by keyboard, marked without relying on colour', async () => {
    await open();

    fireEvent.click(units()[1]!);
    expect(units()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(within(units()[1]!).getByTestId('c360-unit-selected').textContent).toBe('Selected');
    fireEvent.keyDown(units()[0]!, { key: 'Enter' });
    expect(units()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('c360-summary-selected').textContent).toContain('HL-00001');
  });

  it('selects a unit with no case, keeps the panel, and shows only DPD and bucket', async () => {
    await open({ cases: [unitCase(1), unitCase(2, { statecode: 1, statuscode: 100000614, [`statuscode${F}`]: 'Closed', qdb_currentdpd: 12 })] });

    fireEvent.keyDown(units()[1]!, { key: ' ' });
    expect(screen.getByTestId('c360-summary-no-case').textContent).toBe('No open Collection Case');
    expect(screen.getByTestId('c360-summary-facts').textContent).toMatch(/^Bucket.*DPD12$/);
  });

  it('re-reads neither the customer nor the history when the selection changes', async () => {
    const probe = await open();
    await waitFor(() => expect(screen.queryByTestId('c360-history-loading')).toBeNull());
    const before = probe.reads.filter(read => /^qdb_collectioncase |^fax |^email /.test(read)).length;

    fireEvent.click(units()[1]!);
    await screen.findByTestId('c360-delinquency', {}, { timeout: WAIT });

    expect(probe.reads.filter(read => /^qdb_collectioncase |^fax |^email /.test(read)).length).toBe(before);
    expect(probe.reads.some(read => read.startsWith('qdb_delinquencysnapshot') && read.includes("qdb_facilitynumber eq 'HL-00002'"))).toBe(true);
  });
});

describe('customer-level Log action', () => {
  it('is disabled with its reason when no case is open', async () => {
    await open({ cases: [unitCase(1, { statecode: 1, statuscode: 100000614, [`statuscode${F}`]: 'Closed' })] });

    expect((screen.getByTestId('c360-log-action') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('c360-log-action-reason').textContent).toBe('No open Collection Case');
  });

  it('uses the only open case and says so', async () => {
    await open({ cases: [unitCase(1)] });

    fireEvent.click(screen.getByTestId('c360-log-action'));
    expect((await screen.findByTestId('activity-dialog-context', {}, { timeout: WAIT })).textContent).toContain('Loan Account HL-00001, case COL-0001');
  });

  it('with several open cases, blocks Continue until a case is chosen and never picks one', async () => {
    await open();

    fireEvent.click(screen.getByTestId('c360-log-action'));
    const continueButton = screen.getByTestId('c360-picker-continue') as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    expect(screen.queryByTestId('activity-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('c360-pick-c-2'));
    fireEvent.click(continueButton);
    expect((await screen.findByTestId('activity-dialog-context', {}, { timeout: WAIT })).textContent).toContain('HL-00002');
  });

  it('offers no customer-level Capture PTP', async () => {
    await open();

    expect(within(screen.getByTestId('c360-head')).queryByText(/Capture PTP/)).toBeNull();
  });
});

describe('Collection Summary', () => {
  it('says "No Action Plan" when the case has no strategy, and disables Open Action Plan with the reason', async () => {
    await open({ cases: [unitCase(1)] });

    await waitFor(() => expect(screen.getByTestId('c360-summary-next').textContent).toBe('Next Planned ActionNo Action Plan'));
    expect((screen.getByTestId('c360-open-plan') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('c360-no-plan-reason').textContent).toContain('No Action Plan');
    expect(screen.getByTestId('c360-summary-strategy').textContent).toBe('StrategyNot resolved');
  });

  it('says "Not configured" when a plan has no next step, apart from having no plan', async () => {
    await open({ cases: [unitCase(1, { _qdb_strategyid_value: 'strat-1', [`_qdb_strategyid_value${F}`]: 'Early stage' })], strategyActions: [] });

    await waitFor(() => expect(screen.getByTestId('c360-summary-next').textContent).toBe('Next Planned ActionNot configured'));
    expect(screen.getByTestId('c360-summary-strategy').textContent).toBe('StrategyEarly stage');
  });

  it('shows a system-owned case as System, and an officer by name', async () => {
    await open({ cases: [unitCase(1, { _ownerid_value: APP_USER, [`_ownerid_value${F}`]: '# DFE Backend API' }), unitCase(2)] });

    expect((await screen.findAllByTestId('c360-owner-system', {}, { timeout: WAIT }))[0]!.getAttribute('title')).toContain('audit and administration');
    expect(screen.queryByText('# DFE Backend API')).toBeNull();
    expect(screen.getAllByTestId('c360-owner').some(owner => owner.textContent === 'Officer One')).toBe(true);
  });
});

describe('Delinquency History', () => {
  it('shows an empty state with no snapshots', async () => {
    await open({ snapshots: [] });

    expect((await screen.findByTestId('c360-snapshots-empty', {}, { timeout: WAIT })).textContent).toContain('No MIS snapshot');
  });

  it('shows one observation with no line and no movement', async () => {
    await open({ snapshots: [snapshot('2026-09-30', 30)] });

    await screen.findByTestId('c360-snapshot-single', {}, { timeout: WAIT });
    expect(screen.queryByTestId('c360-dpd-chart')).toBeNull();
    expect(screen.queryByTestId('c360-movement')).toBeNull();
  });

  it('with two observations, draws only the real points and states the change', async () => {
    await open({ snapshots: [snapshot('2026-08-31', 62), snapshot('2026-09-30', 92)] });

    const change = await screen.findByTestId('c360-dpd-change', {}, { timeout: WAIT });
    expect(change.textContent).toBe('↑ 30');
    expect(change.getAttribute('aria-label')).toBe('Days past due up by 30');
    expect(screen.getByTestId('c360-dpd-chart').querySelectorAll('circle')).toHaveLength(2);
    expect(screen.queryByTestId('c360-dpd-since')).toBeNull();
  });

  it('with three or more, also states the change since the first observation shown', async () => {
    await open({ snapshots: [snapshot('2026-06-30', 0), snapshot('2026-08-31', 62), snapshot('2026-09-30', 92)] });

    expect((await screen.findByTestId('c360-dpd-since', {}, { timeout: WAIT })).textContent).toBe('↑ 92 DPD since 30-Jun-2026');
    expect(screen.getByTestId('c360-dpd-chart').getAttribute('aria-label')).toContain('30-Jun-2026 0');
  });

  it('keeps a snapshot failure inside its section, with Retry, and the summary working', async () => {
    await open({ failSnapshots: true });

    expect(await screen.findByTestId('c360-delinquency-section-retry', {}, { timeout: WAIT })).toBeTruthy();
    expect(screen.getByTestId('c360-summary-selected')).toBeTruthy();
  });
});

describe('Collection History', () => {
  it('offers only supported categories, with the platform\'s own counts', async () => {
    await open();

    const filters = await screen.findByTestId('c360-history-filters', {}, { timeout: WAIT });
    expect(within(filters).getAllByRole('tab').map(tab => tab.textContent?.split(' · ')[0])).toEqual(['All', 'Actions', 'PTP', 'Communications', 'Complaint / Dispute', 'Legal', 'Deceased / Insurance']);
    await waitFor(() => expect(screen.getByTestId('c360-filter-communications').textContent).toBe('Communications · 4'));
  });

  it('filters on the server and resets the list when the filter changes', async () => {
    const probe = await open({ activities: [{ activityid: 'l-1', subject: 'Legal hand-off', createdon: '2026-09-29T10:00:00Z', _qdb_collectioncaseid_value: 'c-1', qdb_relatedrecordtype: 'qdb_qdblegal', qdb_relatedrecordnumber: 'LGL-0042' }] });

    fireEvent.click(await screen.findByTestId('c360-filter-legal', {}, { timeout: WAIT }));
    const entry = await screen.findByTestId('c360-history-item', {}, { timeout: WAIT });
    expect(entry.textContent).toContain('Referred to BFD Legal');
    expect(entry.textContent).toContain('External reference LGL-0042 · Lifecycle owned by BFD Legal');
    expect(screen.getByTestId('c360-filter-legal').getAttribute('aria-selected')).toBe('true');
    expect(probe.reads.some(read => read.startsWith('qdb_collectionactivity') && read.includes("qdb_relatedrecordtype eq 'qdb_qdblegal'"))).toBe(true);
  });

  it('drops a slow answer to a filter that was left', async () => {
    const probe = await open({ holdFirstActivityRead: true });

    fireEvent.click(await screen.findByTestId('c360-filter-communications', {}, { timeout: WAIT }));
    probe.releaseHeld();
    await screen.findByTestId('c360-history-empty', {}, { timeout: WAIT });
    expect(screen.queryByText('Stale entry')).toBeNull();
  });

  it('offers every configured activity type as a filter, by name', async () => {
    await open();

    const select = await screen.findByTestId('c360-history-type', {}, { timeout: WAIT });
    await waitFor(() => expect(within(select).getAllByRole('option').map(option => option.textContent))
      .toEqual(['All types', 'Call', 'Complaint / Dispute', 'Deceased / Insurance', 'Legal Recommendation']));
  });

  it('narrows the history to the chosen activity type, on the server', async () => {
    const probe = await open();

    const select = await screen.findByTestId('c360-history-type', {}, { timeout: WAIT });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(5));
    fireEvent.change(select, { target: { value: TYPES.call } });

    await waitFor(() => expect(probe.reads.some(read => read.startsWith('qdb_collectionactivity') && read.includes(`_qdb_activitytypeid_value eq ${TYPES.call}`))).toBe(true));
  });

  it('disables the type filter under Communications, because messages have no activity type', async () => {
    await open();

    fireEvent.click(await screen.findByTestId('c360-filter-communications', {}, { timeout: WAIT }));

    expect((screen.getByTestId('c360-history-type') as HTMLSelectElement).disabled).toBe(true);
  });

  it('keeps a history failure inside its section while units stay usable', async () => {
    await open({ failHistory: true });

    expect(await screen.findByTestId('c360-history-retry', {}, { timeout: WAIT })).toBeTruthy();
    fireEvent.click(units()[1]!);
    expect(units()[1]!.getAttribute('aria-selected')).toBe('true');
  });
});

describe('position and balances', () => {
  it('shows promises kept as "N of M", as recorded by officers', async () => {
    await open();

    const tile = screen.getByTestId('c360-kpi-ptp');
    await waitFor(() => expect(tile.textContent).toContain('2 of 4'));
    expect([tile.textContent, tile.getAttribute('title')]).toEqual([
      expect.stringContaining('As recorded by officers'), 'As recorded by officers. Payments are not verified against MIS.',
    ]);
    expect(document.body.textContent).not.toMatch(/Payment Performance|Verified/);
  });

  it('says which date the balances are from, with no MIS position bar', async () => {
    await open();

    expect([screen.getByTestId('c360-balances-as-of').textContent, screen.queryByTestId('c360-mis')])
      .toEqual(['Balances as of 27 Sept 2026', null]);
  });

  it('describeBalancesDate_noDate_saysTheDateIsNotAvailable', () => {
    expect(describeBalancesDate(undefined)).toBe('Balance date not available');
  });

  it('describeBalancesDate_unreadableDate_saysTheDateIsNotAvailable', () => {
    expect(describeBalancesDate('not a date')).toBe('Balance date not available');
  });
});

describe('Open Action Plan', () => {
  const PLANNED = unitCase(1, { _qdb_strategyid_value: 'strat-1', [`_qdb_strategyid_value${F}`]: 'Early stage' });

  it('opens the case on its Action Plan tab in V1', async () => {
    await open({ cases: [PLANNED] });

    fireEvent.click(screen.getByTestId('c360-open-plan'));

    expect(window.location.hash).toBe('#case/c-1/actions');
  });

  it('opens the case on its Action Plan tab in V2', async () => {
    await open({ cases: [PLANNED] }, 'v2');

    fireEvent.click(screen.getByTestId('c360-open-plan'));

    expect(window.location.hash).toBe('#case/c-1/plan');
  });
});

describe('viewing changes nothing', () => {
  it('performs zero CRM writes while loading, selecting, filtering and paging', async () => {
    const probe = await open({ cases: Array.from({ length: 12 }, (_, i) => unitCase(i + 1)), snapshots: [snapshot('2026-08-31', 62), snapshot('2026-09-30', 92)] });

    fireEvent.click(units()[3]!);
    fireEvent.click(screen.getByTestId('c360-units-more'));
    fireEvent.click(await screen.findByTestId('c360-filter-ptp', {}, { timeout: WAIT }));
    await screen.findByTestId('c360-delinquency', {}, { timeout: WAIT });

    expect(probe.writes).toEqual([]);
  });
});

describe('shared V1 / V2', () => {
  it('serves the same content in V2', async () => {
    await open({}, 'v2');

    expect(screen.getByTestId('v2-customer')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Loan Accounts' })).toBeTruthy();
  });
});

describe('excluded data', () => {
  it('shows no unsourced field', async () => {
    await open();

    expect(document.body.textContent).not.toMatch(/Risk (Level|Score)|KYC|Customer Since|Eligib|Recommended|Next Best Action|AI Recommendation|Compliance Window|Interest Rate|Tenor|Collateral|Guarantor|Probability of Payment/i);
  });
});

describe('layout and accessibility', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/customer360.css'), 'utf8');

  it('uses two columns of minmax(0,1fr) and 360px, stacking below 1081px in the specified order', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 360px');
    const narrow = css.slice(css.indexOf('@media (max-width: 1080px)'));
    const order = ['units', 'summary', 'history', 'prefs', 'delinquency'].map(slot => Number(new RegExp(`c360-slot-${slot} \\{ order: (\\d);`).exec(narrow)?.[1]));
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('makes only the Summary + Delinquency group sticky, and only when it fits', () => {
    expect(css).toMatch(/@media \(min-width: 1081px\) and \(min-height: 860px\) \{\s*\.c360-sticky-group \{ position: sticky/);
    expect((css.match(/position: sticky/g) ?? [])).toHaveLength(1);
  });

  it('names its landmarks and roles', async () => {
    await open({ snapshots: [snapshot('2026-08-31', 62), snapshot('2026-09-30', 92)] });

    expect(screen.getByRole('listbox', { name: 'Loan Accounts' })).toBeTruthy();
    expect((await screen.findByRole('tablist', { name: 'History filters' }, { timeout: WAIT }))).toBeTruthy();
    expect((await screen.findByRole('img', {}, { timeout: WAIT })).getAttribute('aria-label')).toMatch(/^Days past due by stored date/);
  });
});
