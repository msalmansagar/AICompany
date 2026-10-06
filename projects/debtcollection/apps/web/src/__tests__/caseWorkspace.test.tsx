import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import { rememberCaseListReturn } from '../v2/data/caseListFilterUrl.js';
import type { XrmLike } from '../platform/crmContext.js';
import { LETTER_COLUMN_MAP, communicationMappings, configurationRow } from './messagingFixtures.js';

/**
 * The unified Collection Case Workspace (WP3), through the real App on a fake platform, in both
 * workspaces — V1 draws it directly, V2 inside its frame, and they must behave the same.
 *
 * The fake honours the two filters the case's activity reads depend on (`_qdb_strategyactionid_value
 * ne null` / `eq null`) the way the platform does, so attributed work and history never double up.
 */

const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const CASE_ROW = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140,
  statuscode: 100000604, statecode: 0, qdb_currentarrearbucket: 100000002, qdb_currentdpd: 74,
  qdb_currenttotalarrears: 41250, qdb_currentloanbalance: 860000, qdb_misasofdate: '2026-09-17',
  qdb_correlationid: 'corr-abc-123', _qdb_customerid_value: 'cust-1',
  '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
};
const CONTACT = { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97400000000', statecode: 0 };

const OVERDUE_FOLLOW_UP = { activityid: 'a-over', subject: 'Call back about arrears', statecode: 0, qdb_followupdate: isoDay(-2), createdon: '2026-09-20T09:00:00Z' };
const UPCOMING_FOLLOW_UP = { activityid: 'a-next', subject: 'Check salary credit', statecode: 0, qdb_followupdate: isoDay(5), createdon: '2026-09-21T09:00:00Z' };
const PROMISE = { activityid: 'p-1', subject: 'Promise to pay', statecode: 0, qdb_ptpdate: isoDay(4), qdb_promisedamount: 12000, qdb_ptpstatus: 100000080, createdon: '2026-09-22T09:00:00Z' };

type Rows = Record<string, Record<string, unknown>[]>;
let listCalls: string[] = [];

function matches(row: Record<string, unknown>, options: string): boolean {
  if (options.includes('_qdb_strategyactionid_value ne null')) return row['_qdb_strategyactionid_value'] != null;
  if (options.includes('_qdb_strategyactionid_value eq null')) return row['_qdb_strategyactionid_value'] == null;
  if (options.includes('qdb_ptpdate ne null')) return row['qdb_ptpdate'] != null;
  return true;
}

function install(rows: Rows): void {
  const xrm = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/', getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string) {
        const row = rows[logicalName]?.find(candidate => Object.values(candidate).includes(id)) ?? rows[logicalName]?.[0];
        if (!row) throw { errorCode: 2147746327, message: 'Does Not Exist' };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        const decoded = decodeURIComponent(options);
        listCalls.push(`${logicalName} ${decoded}`);
        return { entities: (rows[logicalName] ?? []).filter(row => matches(row, decoded)) };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 0, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

const BASE: Rows = { qdb_collectioncase: [CASE_ROW], contact: [CONTACT] };

async function openCase(version: 'v1' | 'v2', hash = '#case/c-1', rows: Rows = BASE) {
  listCalls = [];
  window.localStorage.setItem(VERSION_STORAGE_KEY, version);
  install(rows);
  window.location.hash = hash;
  render(<App />);
  return screen.findByTestId('view-case', {}, { timeout: 5000 });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe.each(['v1', 'v2'] as const)('the case header (%s)', version => {
  it('names the customer from the CRM record, as a link to Customer 360', async () => {
    await openCase(version);

    const link = within(screen.getByTestId('cw-customer')).getByTestId('customer-link');
    await userEvent.click(link);

    // The case travels with the link, so Customer 360 opens on it and offers the way back (WP4).
    expect([link.textContent, window.location.hash]).toEqual(['Aisha Al-Mansouri', '#customer/28912345678/c-1']);
  });

  it('falls back to the business id when the customer cannot be read', async () => {
    await openCase(version, '#case/c-1', { qdb_collectioncase: [CASE_ROW] });

    expect(screen.getByTestId('cw-customer').textContent).toBe('28912345678');
  });

  it('names an HL unit a Loan Account and shows the case number as this page', async () => {
    await openCase(version);

    const identity = screen.getByTestId('cw-identity');
    expect([identity.textContent?.includes('Loan Account HL-99001'), within(identity).getByText(/^Case/).getAttribute('aria-current')]).toEqual([true, 'page']);
  });

  it('shows the stored DPD, arrears and balance with the date they are from', async () => {
    await openCase(version);

    const position = screen.getByTestId('cw-position');
    expect([position.textContent?.includes('74'), position.textContent?.includes('41,250'), position.textContent?.includes('860,000'), within(position).getByTestId('balances-as-of').textContent])
      .toEqual([true, true, true, expect.stringMatching(/^Balances as of \d{1,2} \w+ \d{4}$/)]);
  });

  it('shows an integration-owned case as owned by System, never by its technical name', async () => {
    const integrationOwned = { ...CASE_ROW, _ownerid_value: 'app-1', '_ownerid_value@OData.Community.Display.V1.FormattedValue': '# DFE Backend API' };
    await openCase(version, '#case/c-1', { qdb_collectioncase: [integrationOwned], contact: [CONTACT], systemuser: [{ systemuserid: 'app-1' }] });

    await waitFor(() => expect(screen.getByTestId('cw-identity').textContent).toContain('Owner System'));
  });
});

describe.each(['v1', 'v2'] as const)('the action bar (%s)', version => {
  it('offers Contact, Log action, Capture PTP, Complete follow-up and More, in that order', async () => {
    await openCase(version);

    const bar = screen.getByRole('toolbar', { name: 'Case commands' });
    expect(within(bar).getAllByRole('button').map(button => button.textContent?.replace('▾', '').trim())).toEqual(['Contact', 'Log action', 'Capture PTP', 'Complete follow-up', 'More']);
  });

  it('offers a call to the customer\'s own number, and a way to log it', async () => {
    await openCase(version);

    await userEvent.click(screen.getByTestId('cw-contact'));

    expect([screen.getByTestId('cw-contact-call-mobile').getAttribute('href'), Boolean(screen.getByTestId('cw-contact-log-call'))]).toEqual(['tel:+97400000000', true]);
  });

  it('offers only the channels that can be used: no SMS without a message table, no Email without an address, never WhatsApp', async () => {
    await openCase(version);

    await userEvent.click(screen.getByTestId('cw-contact'));

    const entries = within(screen.getByTestId('cw-contact-menu')).getAllByRole('menuitem').map(item => item.textContent ?? '');
    expect([entries.some(text => /SMS|Email|WhatsApp|Letter|Fax/i.test(text))]).toEqual([false]);
  });

  it.each([/legal/i, /reassign/i, /restructur/i, /escalate/i])('exposes no unsupported operation matching %s under More', async pattern => {
    await openCase(version);

    await userEvent.click(screen.getByTestId('cw-more'));

    const entries = within(screen.getByTestId('cw-more-menu')).getAllByRole('menuitem').map(item => item.textContent ?? '');
    expect(entries.filter(text => pattern.test(text) && !text.startsWith('Resolution'))).toEqual([]);
  });

  it('offers Raise complaint on a Housing Loan case only', async () => {
    await openCase(version, '#case/c-1', { qdb_collectioncase: [{ ...CASE_ROW, qdb_organizationcode: 100000141, qdb_facilitysourcesystem: 'BFD' }], contact: [CONTACT] });

    await userEvent.click(screen.getByTestId('cw-more'));

    expect(screen.queryByTestId('cw-more-complaint')).toBeNull();
  });

  it('opens the existing activity pane to log an action, without leaving the case', async () => {
    await openCase(version);

    await userEvent.click(screen.getByTestId('cw-log-action'));

    expect([Boolean(await screen.findByTestId('activity-dialog')), window.location.hash]).toEqual([true, '#case/c-1']);
  });

  it('offers nothing that writes on a closed case, and says why', async () => {
    await openCase(version, '#case/c-1', { qdb_collectioncase: [{ ...CASE_ROW, statecode: 1 }], contact: [CONTACT] });

    const bar = screen.getByRole('toolbar', { name: 'Case commands' });
    expect([within(bar).queryAllByRole('button').length, bar.textContent]).toEqual([0, 'This case is closed; nothing can be recorded on it.']);
  });
});

describe('the Action Plan and Complete follow-up', () => {
  const WITH_WORK: Rows = { ...BASE, qdb_collectionactivity: [OVERDUE_FOLLOW_UP, UPCOMING_FOLLOW_UP, PROMISE] };

  it('groups the case\'s work by when it is due', async () => {
    await openCase('v1', '#case/c-1', WITH_WORK);

    const plan = await screen.findByTestId('cw-plan', {}, { timeout: 5000 });
    expect([within(plan).getByTestId('cw-plan-overdue').textContent?.includes('Call back about arrears'), within(plan).getByTestId('cw-plan-upcoming').textContent?.includes('Check salary credit')]).toEqual([true, true]);
  });

  it('completes the overdue follow-up from the action bar, opening the pane at completion', async () => {
    await openCase('v2', '#case/c-1', WITH_WORK);
    await screen.findByTestId('cw-plan', {}, { timeout: 5000 });

    await userEvent.click(screen.getByTestId('cw-complete-followup'));

    expect(await screen.findByTestId('activity-dialog')).toBeTruthy();
  });

  it('says so when nothing is planned or due', async () => {
    await openCase('v1');

    expect(await screen.findByTestId('cw-plan-empty', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('disables Complete follow-up when no follow-up is due, and says why', async () => {
    await openCase('v1');
    await screen.findByTestId('cw-plan-empty', {}, { timeout: 5000 });

    const complete = screen.getByTestId('cw-complete-followup');
    expect([complete.hasAttribute('disabled'), complete.getAttribute('title')]).toEqual([true, 'No follow-up is due on this case.']);
  });
});

describe('the overview, promise and resolution panels', () => {
  const WITH_WORK: Rows = { ...BASE, qdb_collectionactivity: [OVERDUE_FOLLOW_UP, PROMISE] };

  it('names the next planned action and its due date', async () => {
    await openCase('v1', '#case/c-1', WITH_WORK);

    await waitFor(() => expect(screen.getByTestId('cw-overview-fields').textContent).toContain('Call back about arrears'));
  });

  it('shows the open promise prominently, with its amount and date', async () => {
    await openCase('v2', '#case/c-1', WITH_WORK);

    const current = await screen.findByTestId('cw-ptp-current', {}, { timeout: 5000 });
    expect([current.textContent?.includes('Current promise'), current.textContent?.includes('12,000')]).toEqual([true, true]);
  });

  it('opens the promise in its own pane from View', async () => {
    await openCase('v1', '#case/c-1', WITH_WORK);

    await userEvent.click(await screen.findByTestId('cw-ptp-view', {}, { timeout: 5000 }));

    expect(await screen.findByTestId('promise-dialog')).toBeTruthy();
  });

  it('says each centralised process is not initiated when nothing has been recorded', async () => {
    await openCase('v1');

    const resolution = await screen.findByTestId('cw-resolution', {}, { timeout: 5000 });
    expect(['complaint', 'legal', 'deceased'].map(process => within(resolution).getByTestId(`cw-resolution-${process}`).textContent)).toEqual([
      'Complaint / DisputeNot initiated', 'LegalNot initiated', 'Deceased / InsuranceNot initiated',
    ]);
  });

  it('shows the case timeline, filtered by the platform', async () => {
    await openCase('v2');

    const timeline = await screen.findByTestId('c360-history-card', {}, { timeout: 5000 });
    expect(within(timeline).getByRole('heading').textContent).toBe('Timeline');
  });
});

describe('quick actions keep the case in context (WP4)', () => {
  const CONTEXT = 'Aisha Al-Mansouri · Loan Account HL-99001 · Case COL-HL-000123';

  it.each([['cw-log-action', 'activity-dialog-context'], ['cw-capture-ptp', 'promise-dialog-context']])('says which customer, unit and case %s records against', async (command, note) => {
    await openCase('v1');

    await userEvent.click(screen.getByTestId(command));

    expect((await screen.findByTestId(note)).textContent).toBe(CONTEXT);
  });

  it('captures a promise in a pane: saving closes it, says so and re-reads the case\'s work', async () => {
    await openCase('v2', '#case/c-1', { ...BASE, qdb_collectionactivitytype: [{ qdb_collectionactivitytypeid: 't-ptp', qdb_name: 'Promise to pay', qdb_code: 'P6-PTP', qdb_isactive: true }] });
    await screen.findByTestId('cw-plan-empty', {}, { timeout: 5000 });
    await userEvent.click(screen.getByTestId('cw-capture-ptp'));
    await userEvent.type(await screen.findByTestId('promise-amount'), '12000');
    await userEvent.type(screen.getByTestId('promise-date'), isoDay(7));
    const workReadsBefore = listCalls.filter(call => call.includes('_qdb_strategyactionid_value eq null')).length;

    await userEvent.click(screen.getByTestId('promise-save'));

    await waitFor(() => expect(screen.queryByTestId('promise-dialog')).toBeNull(), { timeout: 5000 });
    const workReadsAfter = listCalls.filter(call => call.includes('_qdb_strategyactionid_value eq null')).length;
    expect([screen.getByTestId('cw-notice').textContent, workReadsAfter > workReadsBefore, window.location.hash]).toEqual(['The promise was saved.', true, '#case/c-1']);
  });
});

describe.each(['v1', 'v2'] as const)('Complete from My Day (%s, WP4)', version => {
  it('opens the follow-up\'s activity pane in place, without opening the case', async () => {
    window.localStorage.setItem(VERSION_STORAGE_KEY, version);
    install({ ...BASE, qdb_collectionactivity: [{ ...OVERDUE_FOLLOW_UP, _qdb_collectioncaseid_value: 'c-1', '_qdb_collectioncaseid_value@OData.Community.Display.V1.FormattedValue': 'COL-HL-000123' }] });
    window.location.hash = '#myday';
    render(<App />);

    await userEvent.click(await screen.findByTestId('followup-complete', {}, { timeout: 5000 }));

    const pane = await screen.findByTestId('activity-dialog');
    expect([window.location.hash, within(pane).getByTestId('activity-dialog-context').textContent]).toEqual(['#myday', 'Case COL-HL-000123 · Call back about arrears']);
  });
});

describe('Customer 360 from the case, and back (WP4)', () => {
  it('opens on the case it came from and offers one click back to it', async () => {
    await openCase('v1');
    await userEvent.click(within(screen.getByTestId('cw-customer')).getByTestId('customer-link'));

    await userEvent.click(await screen.findByTestId('c360-back-to-case', {}, { timeout: 5000 }));

    expect(window.location.hash).toBe('#case/c-1');
  });

  it('offers no way back when Customer 360 was not opened from a case', async () => {
    window.localStorage.setItem(VERSION_STORAGE_KEY, 'v1');
    install(BASE);
    window.location.hash = '#customer/28912345678';
    render(<App />);

    await screen.findByTestId('c360-head', {}, { timeout: 5000 });

    expect(screen.queryByTestId('c360-back-to-case')).toBeNull();
  });
});

describe('the record tabs', () => {
  it('keeps every record a case had: activities, promises, communications, plan, resolution, history, details, audit', async () => {
    await openCase('v1');

    expect(within(screen.getByTestId('cw-records')).getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Activities', 'Promises', 'Communications', 'Action Plan', 'Resolution', 'Delinquency history', 'Case details', 'Audit',
    ]);
  });

  it('opens straight onto a tab named in the URL', async () => {
    await openCase('v2', '#case/c-1/comms');

    expect(await screen.findByTestId('view-comms', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('replaces the URL on a tab change, so Back leaves the case instead of stepping through tabs', async () => {
    await openCase('v1');
    const before = window.history.length;

    await userEvent.click(screen.getByTestId('case-pivot-tab-ptp'));

    expect([window.location.hash, window.history.length]).toEqual(['#case/c-1/ptp', before]);
  });

  const MESSAGING: Rows = {
    ...BASE,
    contact: [{ ...CONTACT, emailaddress1: 'aisha@example.qa' }],
    qdb_platformconfiguration: [configurationRow('cfg-hl', 'letter', 'letter')],
    qdb_platformmapping: communicationMappings('cfg-hl', 'letter', LETTER_COLUMN_MAP),
  };

  it.each([['SMS', 'cw-contact-sms'], ['Email', 'cw-contact-email']])('opens the composer on %s in a pane, without leaving the case', async (channel, item) => {
    await openCase('v2', '#case/c-1', MESSAGING);
    await waitFor(async () => {
      await userEvent.click(screen.getByTestId('cw-contact'));
      expect(screen.getByTestId(item)).toBeTruthy();
    }, { timeout: 5000 });

    await userEvent.click(screen.getByTestId(item));

    const pane = await screen.findByTestId('message-pane');
    const select = await within(pane).findByTestId('composer-channel', {}, { timeout: 5000 }) as HTMLSelectElement;
    expect([window.location.hash, pane.getAttribute('aria-label'), select.value])
      .toEqual(['#case/c-1', channel === 'SMS' ? 'Send an SMS' : 'Send an email', channel]);
  });

  it('treats an old Summary or Documents link as the working surface', async () => {
    await openCase('v1', '#case/c-1/documents');

    expect(screen.getByTestId('case-pivot-tab-actions').getAttribute('aria-selected')).toBe('true');
  });
});

describe('the way back', () => {
  it('returns V2 to the filtered list the case was opened from', async () => {
    rememberCaseListReturn('bucket=61-90&strategy=none&from=portfolio');
    await openCase('v2');

    await userEvent.click(screen.getByTestId('cw-back'));

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&strategy=none&from=portfolio');
  });

  it('returns to the plain list otherwise', async () => {
    rememberCaseListReturn(undefined);
    await openCase('v1');

    await userEvent.click(screen.getByTestId('cw-back'));

    expect(window.location.hash).toBe('#cases');
  });
});

describe('the read model', () => {
  it('reads the case\'s activities twice — attributed and not — and never once per panel or record', async () => {
    await openCase('v1', '#case/c-1', { ...BASE, qdb_collectionactivity: [OVERDUE_FOLLOW_UP, UPCOMING_FOLLOW_UP, PROMISE] });
    await screen.findByTestId('cw-ptp-current', {}, { timeout: 5000 });
    await screen.findByTestId('cw-resolution', {}, { timeout: 5000 });

    const filterOf = (call: string) => call.slice(call.indexOf('$filter='));
    const workReads = listCalls.filter(call => call.startsWith('qdb_collectionactivity ') && /_qdb_strategyactionid_value (ne|eq) null/.test(filterOf(call)));
    expect(workReads).toHaveLength(2);
  });

  it('says a case that cannot be read could not be found', async () => {
    await openCase('v1', '#case/nope', {}).catch(() => undefined);

    expect(await screen.findByText(/No collection case with id nope/, {}, { timeout: 5000 })).toBeTruthy();
  });
});
