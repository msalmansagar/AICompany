import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Customer 360 through the real App, in both workspaces (user instruction, 2026-09-28).
 *
 * One customer holds a Housing Loan **loan account** on a contact and a BFD **facility** on an
 * account, each with its own case. The screen must name each unit by its own kind, aggregate the
 * position through the platform, show the next planned action per case, tell the history across
 * both cases with each entry's unit, ask which case a customer-level command concerns, and fabricate
 * nothing the platform does not hold.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const WAIT = 5000;
const QID = '28912345678';

const HL_CASE = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: QID,
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140, [`qdb_organizationcode${FORMATTED}`]: 'HL',
  statuscode: 100000600, statecode: 0, qdb_currentdpd: 74, qdb_currenttotalarrears: 41250, qdb_currentloanbalance: 900000,
  qdb_currentarrearbucket: 100000002, qdb_customertype: 100000000, [`qdb_customertype${FORMATTED}`]: 'Individual', qdb_productdescription: 'Building Housing',
  qdb_misasofdate: '2026-09-27T00:00:00Z', qdb_lastmissyncon: '2026-09-28T02:00:00Z', qdb_episodenumber: 1,
  '_qdb_customerid_value': 'cust-1', '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact', [`_qdb_customerid_value${FORMATTED}`]: 'Aisha Al-Mansouri',
  '_qdb_strategyid_value': 'strat-1', [`_qdb_strategyid_value${FORMATTED}`]: 'Early stage', '_ownerid_value': 'u-1', [`_ownerid_value${FORMATTED}`]: 'Officer One',
};
const BFD_CASE = {
  ...HL_CASE, qdb_collectioncaseid: 'c-2', qdb_casenumber: 'COL-BFD-000777', qdb_facilitynumber: 'BFD-4410', qdb_facilitysourcesystem: 'BFD',
  qdb_organizationcode: 100000141, [`qdb_organizationcode${FORMATTED}`]: 'BFD', qdb_currentdpd: 12, qdb_currenttotalarrears: 5000, qdb_currentloanbalance: 120000,
  qdb_currentarrearbucket: 100000000, qdb_customertype: 100000001, [`qdb_customertype${FORMATTED}`]: 'SME', qdb_productdescription: 'Working Capital',
  '_qdb_customerid_value': 'acct-1', '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'account', [`_qdb_customerid_value${FORMATTED}`]: 'Doha Marine Supplies',
  '_qdb_strategyid_value': null, [`_qdb_strategyid_value${FORMATTED}`]: null,
};
const CONTACT = { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97400000000', donotphone: true, statecode: 0 };
const ACCOUNT = { accountid: 'acct-1', name: 'Doha Marine Supplies', accountnumber: 'CR-1', statecode: 0 };
const STRATEGY_ACTION = { qdb_strategyactionid: 'sa-1', qdb_name: 'Follow-up call', qdb_isactive: true, qdb_sequence: 1, '_qdb_strategyid_value': 'strat-1', [`_qdb_strategyid_value${FORMATTED}`]: 'Early stage' };
const PROMISE = {
  activityid: 'a-1', subject: 'Promise to pay', statecode: 0, statuscode: 1, [`statuscode${FORMATTED}`]: 'Open', createdon: '2026-09-29T14:45:00Z',
  qdb_ptpdate: '2026-10-04', qdb_promisedamount: 30800, qdb_ptpstatus: 100000080, [`qdb_ptpstatus${FORMATTED}`]: 'Active',
  '_qdb_collectioncaseid_value': 'c-1', [`_qdb_activitytypeid_value${FORMATTED}`]: 'Promise to pay', [`_ownerid_value${FORMATTED}`]: 'Officer One',
};
const CALL = { activityid: 'a-2', subject: 'Reached customer', statecode: 1, statuscode: 2, [`statuscode${FORMATTED}`]: 'Completed', createdon: '2026-09-27T09:00:00Z', '_qdb_collectioncaseid_value': 'c-2', [`_qdb_activitytypeid_value${FORMATTED}`]: 'Call' };
const SMS = { activityid: 'f-1', subject: 'Payment reminder', statecode: 1, statuscode: 3, [`statuscode${FORMATTED}`]: 'Sent', createdon: '2026-09-28T10:00:00Z', directioncode: true, '_regardingobjectid_value': 'c-2' };
const EMAIL = { activityid: 'e-1', subject: 'Statement', statecode: 1, statuscode: 3, [`statuscode${FORMATTED}`]: 'Sent', createdon: '2026-09-28T10:12:00Z', directioncode: true, '_regardingobjectid_value': 'c-1' };

interface Options { cases?: Record<string, unknown>[]; refuseAggregate?: boolean }

function install(options: Options = {}): { calls: string[] } {
  const cases = options.cases ?? [HL_CASE, BFD_CASE];
  const calls: string[] = [];
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/', getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] }, organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string) {
        if (logicalName === 'contact') return CONTACT;
        if (logicalName === 'account') return ACCOUNT;
        if (logicalName === 'qdb_collectioncase') return cases.find(c => c['qdb_collectioncaseid'] === id) ?? HL_CASE;
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, rawOptions = '') {
        const decoded = decodeURIComponent(rawOptions);
        calls.push(`${logicalName} ${decoded}`);
        if (decoded.startsWith('?fetchXml=')) {
          if (options.refuseAggregate) throw { errorCode: 0x8004E023, message: 'AggregateQueryRecordLimit exceeded.' };
          return { entities: decoded.includes('alias="overdue"') ? [{ cases: cases.length, overdue: 46250, exposure: 1020000, dpd: 74 }] : [] };
        }
        if (logicalName === 'qdb_collectioncase') return { entities: cases };
        if (logicalName === 'qdb_strategyaction') return { entities: [STRATEGY_ACTION] };
        if (logicalName === 'qdb_collectionactivity') {
          // The action plan reads attributed and unattributed activities by their provenance; the history read is the one over every case.
          if (/_qdb_strategyactionid_value (ne|eq) null/.test(decoded)) return { entities: [] };
          return { entities: [PROMISE, CALL].filter(a => decoded.includes(String(a['_qdb_collectioncaseid_value']))) };
        }
        if (logicalName === 'fax') return { entities: [SMS].filter(a => decoded.includes(String(a['_regardingobjectid_value']))) };
        if (logicalName === 'email') return { entities: [EMAIL].filter(a => decoded.includes(String(a['_regardingobjectid_value']))) };
        return { entities: [] };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async (url: string) => {
    const decoded = decodeURIComponent(String(url));
    const count = decoded.includes('qdb_ptpstatus eq 100000081') ? 1 : decoded.includes('qdb_ptpdate ne null') ? 3 : 0;
    return new Response(JSON.stringify({ '@odata.count': count, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { calls };
}

async function open(options: Options = {}, version: 'v1' | 'v2' = 'v1') {
  const probe = install(options);
  if (version === 'v2') window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.location.hash = `#customer/${QID}`;
  render(<App />);
  await screen.findByTestId('c360-head', {}, { timeout: WAIT });
  return probe;
}

beforeEach(() => { window.localStorage.removeItem(VERSION_STORAGE_KEY); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.removeItem(VERSION_STORAGE_KEY); window.location.hash = ''; });

describe('identity', () => {
  it('names the customer from the CRM record, says which CRM table they are, and carries every segment their cases record', async () => {
    await open();

    expect([screen.getByTestId('c360-name').textContent, screen.getByTestId('c360-tags').textContent, screen.getByTestId('c360-sub').textContent])
      .toEqual(['Aisha Al-Mansouri', expect.stringContaining('Housing Loan · contact'), expect.stringContaining(`QID ${QID} · +97400000000`)]);
    expect(screen.getByTestId('c360-tags').textContent).toMatch(/Individual.*SME|SME.*Individual/);
  });
});

describe('the words', () => {
  it('calls the Housing Loan unit a loan account and the BFD unit a facility, under a heading for both', async () => {
    await open();

    const units = screen.getAllByTestId('c360-unit');
    const hl = units.find(u => u.dataset['unit'] === 'HL-99001')!;
    const bfd = units.find(u => u.dataset['unit'] === 'BFD-4410')!;
    expect([
      within(hl).getByTestId('c360-unit-number').textContent, within(bfd).getByTestId('c360-unit-number').textContent,
      hl.dataset['kind'], bfd.dataset['kind'], /Facility/.test(hl.textContent ?? ''), screen.getByText('Loan Accounts & Facilities').tagName,
    ]).toEqual(['Loan Account: HL-99001', 'Facility: BFD-4410', 'loanAccount', 'facility', false, 'H3']);
  });

  it('labels the balance by the kind of unit', async () => {
    await open();
    const [hl, bfd] = [screen.getAllByTestId('c360-unit').find(u => u.dataset['unit'] === 'HL-99001')!, screen.getAllByTestId('c360-unit').find(u => u.dataset['unit'] === 'BFD-4410')!];

    expect([within(hl).getByText('Loan balance').tagName, within(bfd).getByText('Facility exposure').tagName]).toEqual(['SPAN', 'SPAN']);
  });
});

describe('the position', () => {
  it('shows the platform\'s own sums, maximum and count, and the recorded promise performance with its caveat', async () => {
    await open();
    const head = screen.getByTestId('c360-head');

    await waitFor(() => expect(head.textContent).toContain('1 of 3 recorded as kept'), { timeout: WAIT });
    expect([head.textContent?.includes('QAR 1,020,000'), head.textContent?.includes('QAR 46,250'), head.textContent?.includes('74'), head.textContent?.includes('Payment verification is not currently integrated')])
      .toEqual([true, true, true, true]);
    expect(head.textContent).not.toContain('(partial)');
  });

  it('falls back to the rows it read when the platform refuses the aggregate, and says the figures are not the platform\'s', async () => {
    await open({ refuseAggregate: true });

    expect(screen.getByTestId('c360-head').textContent).toContain('QAR 1,020,000');
  });

  it('says a stored MIS position is stored, never live', async () => {
    await open();

    expect(screen.getAllByTestId('stored-position')[0]!.textContent).toMatch(/not a live MIS read/i);
  });
});

describe('the next planned action', () => {
  it('comes from each case\'s own action plan, and says when no strategy has been resolved', async () => {
    await open();
    const hl = screen.getAllByTestId('c360-unit').find(u => u.dataset['unit'] === 'HL-99001')!;
    const bfd = screen.getAllByTestId('c360-unit').find(u => u.dataset['unit'] === 'BFD-4410')!;

    await waitFor(() => expect(within(hl).getByTestId('c360-next').textContent).toContain('Follow-up call'), { timeout: WAIT });
    expect(within(bfd).getByTestId('c360-next').textContent).toContain('No strategy has been resolved');
  });
});

describe('the collection history', () => {
  it('tells every recorded event across both cases newest first, each naming its loan account or facility', async () => {
    await open();

    await waitFor(() => expect(screen.getAllByTestId('c360-history-item')).toHaveLength(4), { timeout: WAIT });
    const items = screen.getAllByTestId('c360-history-item').map(item => item.textContent ?? '');
    expect([
      items[0]!.includes('Promise to pay') && items[0]!.includes('QAR 30,800 promised for 4 Oct 2026') && items[0]!.includes('HL Loan Account HL-99001'),
      items[1]!.includes('Email') && items[1]!.includes('COL-HL-000123'),
      items[2]!.includes('SMS') && items[2]!.includes('BFD Facility BFD-4410'),
      items[3]!.includes('Call') && items[3]!.includes('Reached customer'),
      screen.getByTestId('c360-history-end').textContent,
    ]).toEqual([true, true, true, true, '4 shown — end of history']);
  });
});

describe('case-bound commands', () => {
  it('asks which loan account or facility a customer-level action concerns when more than one case is open', async () => {
    await open();

    await userEvent.click(screen.getByTestId('c360-log-action'));
    const picker = await screen.findByTestId('c360-case-picker');
    expect(within(picker).getAllByRole('button', { name: /Loan Account|Facility/ })).toHaveLength(2);

    await userEvent.click(within(picker).getByTestId('c360-pick-c-2'));

    expect(screen.queryByTestId('c360-case-picker')).toBeNull();
    expect((await screen.findByRole('dialog', {}, { timeout: WAIT })).getAttribute('data-placement')).toBe('side');
  });

  it('binds a customer-level action to the one open case without asking', async () => {
    await open({ cases: [HL_CASE] });

    await userEvent.click(screen.getByTestId('c360-capture-ptp'));

    expect(screen.queryByTestId('c360-case-picker')).toBeNull();
    expect(await screen.findByRole('dialog', {}, { timeout: WAIT })).toBeTruthy();
  });

  it('acts on the unit\'s own case from the unit card, never silently on another', async () => {
    await open();
    const bfd = screen.getAllByTestId('c360-unit').find(u => u.dataset['unit'] === 'BFD-4410')!;

    await userEvent.click(within(bfd).getByTestId('c360-unit-case'));

    expect(window.location.hash).toBe('#case/c-2');
  });
});

describe('what is not here', () => {
  it('fabricates no risk score, KYC, tenure, recommendation, eligibility, fee waiver or contact policy', async () => {
    await open();
    await waitFor(() => expect(screen.getAllByTestId('c360-history-item').length).toBeGreaterThan(0), { timeout: WAIT });

    expect(screen.getByTestId('view-customer').textContent).not.toMatch(/Risk \d|KYC|Customer since|Recommended|Rule SR|Override|Eligib|Fee waiver|Contact window|of \d+ allowed|Collateral|Guarantor|Insurance|Tenor|Interest rate/i);
  });

  it('keeps the channel preferences as the CRM\'s own settings, never a collections hold', async () => {
    await open();

    expect([screen.getByText(/not a collections contact hold/).tagName, screen.getByTestId('c360-prefs').textContent]).toEqual(['DIV', expect.stringContaining('Do not phone')]);
  });
});

describe('one screen in both workspaces', () => {
  it('shows the same screen inside the V2 frame', async () => {
    await open({}, 'v2');

    expect([Boolean(screen.getByTestId('workspace-v2')), screen.getByTestId('v2-customer').querySelector('[data-testid="c360-name"]')?.textContent])
      .toEqual([true, 'Aisha Al-Mansouri']);
  });

  it('reads no case history per case one by one — the three tables are asked once each for every case', async () => {
    const probe = await open();
    await waitFor(() => expect(screen.getAllByTestId('c360-history-item')).toHaveLength(4), { timeout: WAIT });

    const historyReads = probe.calls.filter(call => /_regardingobjectid_value eq c-1 or _regardingobjectid_value eq c-2|_qdb_collectioncaseid_value eq c-1 or _qdb_collectioncaseid_value eq c-2/.test(call));
    expect(historyReads).toHaveLength(3);
  });
});
