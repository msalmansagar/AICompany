import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { NAV_COLLAPSED_KEY } from '../shell/AppShell.js';
import { findView } from '../shell/routes.js';
import { navigationSectionOf } from '../shell/navigation.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Workspace V1 with the layouts Workspace V2 has — Split and Grid on every list, a customers list
 * behind Customer 360, a clickable Action Plan, a header hamburger, and Dashboards beside the
 * officer's work (user instruction, 2026-09-27: both workspaces the same).
 *
 * Everything renders through the real App against a stand-in client API that answers with a few
 * real-shaped rows, so the route, the list, the preview and the way into the record all have to agree.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const WAIT = 5000;

const CASE_ROW = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140,
  statuscode: 100000600, statecode: 0, qdb_currentdpd: 74, qdb_currenttotalarrears: 41250, qdb_currentloanbalance: 900000,
  '_qdb_customerid_value': 'cust-1', '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
  [`_qdb_customerid_value${FORMATTED}`]: 'Aisha Al-Mansouri',
};
const CONTACT = { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97400000000', statecode: 0 };
const PROMISE_ROW = {
  activityid: 'ptp-1', subject: 'Promise to pay', statecode: 0, createdon: '2026-09-20T08:46:00Z',
  qdb_ptpdate: '2026-10-01', qdb_promisedamount: 1200, qdb_ptpstatus: 100000080,
  '_qdb_collectioncaseid_value': 'c-1', [`_qdb_collectioncaseid_value${FORMATTED}`]: 'COL-HL-000123',
  '_ownerid_value': 'u-1', [`_ownerid_value${FORMATTED}`]: 'Officer One',
};
const LOG_ROW = {
  activityid: 'log-1', qdb_source: 'DelinquencySync', createdon: '2026-09-21T06:00:00Z', subject: 'Sync completed',
  qdb_isexception: false, description: '{"correlationId":"corr-77","read":12}',
};
const ACTION_ROW = {
  qdb_strategyactionid: 'sa-1', qdb_name: 'Reminder SMS', qdb_isactive: true, qdb_sequence: 1, qdb_ismandatory: true,
  '_qdb_strategyid_value': 'strat-1', [`_qdb_strategyid_value${FORMATTED}`]: 'Early Stage',
};
const CUSTOMER_GROUP = {
  cases: 1, arrears: 41250, exposure: 900000, dpd: 74, customer: '28912345678', customerref: 'cust-1',
  [`customerref${FORMATTED}`]: 'Aisha Al-Mansouri', org: 100000140,
};

function install(): void {
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
      async retrieveRecord(logicalName: string) {
        if (logicalName === 'qdb_collectioncase') return CASE_ROW;
        if (logicalName === 'contact') return CONTACT;
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        if (decodeURIComponent(options).startsWith('?fetchXml=')) {
          return { entities: logicalName === 'qdb_collectioncase' && decodeURIComponent(options).includes('alias="customer"') ? [CUSTOMER_GROUP] : [] };
        }
        if (logicalName === 'qdb_collectioncase') return { entities: [CASE_ROW] };
        if (logicalName === 'qdb_collectionactivity') return { entities: [PROMISE_ROW] };
        if (logicalName === 'qdb_crmlogs') return { entities: [LOG_ROW] };
        if (logicalName === 'qdb_strategyaction') return { entities: [ACTION_ROW] };
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 1, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

const LAYOUT_KEYS = ['dcp.v1.casesLayout', 'dcp.v1.promisesLayout', 'dcp.v1.auditLayout', 'dcp.v1.customersLayout', 'dcp.v1.queueLayout'];

async function open(hash: string) {
  install();
  window.location.hash = hash;
  render(<App />);
  await screen.findByTestId('content');
}

beforeEach(() => { for (const key of [...LAYOUT_KEYS, NAV_COLLAPSED_KEY]) window.localStorage.removeItem(key); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const key of [...LAYOUT_KEYS, NAV_COLLAPSED_KEY]) window.localStorage.removeItem(key);
  window.location.hash = '';
});

describe('Collection Cases', () => {
  it('opens in Split with the first case already previewed, and opens it from the preview', async () => {
    await open('#cases');

    const preview = await screen.findByTestId('case-preview', {}, { timeout: WAIT });
    const layout = screen.getByTestId('cases-split').className;
    expect(screen.getAllByRole('row', { selected: true })).toHaveLength(1);
    await userEvent.click(within(preview).getByTestId('case-preview-open'));

    expect([layout, window.location.hash]).toEqual(['split-layout', '#case/c-1']);
  });

  it('draws only the Case column as a link in Grid, and opens the case from that column alone', async () => {
    window.localStorage.setItem('dcp.v1.casesLayout', 'grid');
    await open('#cases');
    const row = (await within(await screen.findByTestId('cases-grid', {}, { timeout: WAIT })).findByText('COL-HL-000123')).closest('tr')!;
    const cells = [...row.querySelectorAll('td')];

    await userEvent.click(within(row).getByText('New'));
    const afterStatusClick = window.location.hash;
    await userEvent.click(cells[0]!);

    expect([cells.filter(cell => cell.classList.contains('link-cell')).length, cells[0]!.classList.contains('link-cell'), row.classList.contains('link-cell'), afterStatusClick, window.location.hash])
      .toEqual([1, true, false, '#cases', '#case/c-1']);
  });

  it('opens the case straight from a Grid row, and remembers the layout', async () => {
    await open('#cases');
    await userEvent.click(screen.getByTestId('case-filters-layout-grid'));

    await userEvent.click(await within(await screen.findByTestId('cases-grid', {}, { timeout: WAIT })).findByText('COL-HL-000123'));

    expect([window.location.hash, window.localStorage.getItem('dcp.v1.casesLayout')]).toEqual(['#case/c-1', 'grid']);
  });
});

describe('Promise to Pay', () => {
  it('previews the promise and its case in Split, then opens the case', async () => {
    await open('#ptp');

    const list = await screen.findByTestId('ptp-list', {}, { timeout: WAIT });
    await userEvent.click(within(list).getByText(/promised for 1 Oct 2026/));
    const preview = await screen.findByTestId('ptp-preview', {}, { timeout: WAIT });
    await userEvent.click(await within(preview).findByTestId('ptp-case-preview-open', {}, { timeout: WAIT }));

    expect([preview.textContent?.includes('recorded by Officer One'), window.location.hash]).toEqual([true, '#case/c-1']);
  });
});

describe('Audit Trail', () => {
  it('reads the first entry in full beside the list in Split, without a click', async () => {
    await open('#audit');

    await screen.findByTestId('audit-list', {}, { timeout: WAIT });

    expect((await screen.findByTestId('audit-preview-diagnostics')).textContent).toContain('corr-77');
  });

  it('opens the entry in a side pane from a Grid row, since an entry has no record of its own', async () => {
    window.localStorage.setItem('dcp.v1.auditLayout', 'grid');
    await open('#audit');

    await userEvent.click(await screen.findByText('Sync completed', {}, { timeout: WAIT }));

    expect((await screen.findByTestId('audit-entry')).getAttribute('data-placement')).toBe('side');
  });
});

describe('Customer & Loan 360', () => {
  it('lists every customer with an open case instead of asking for one', async () => {
    await open('#customer');

    const list = await screen.findByTestId('customers-list', {}, { timeout: WAIT });
    const row = within(list).getByText('Aisha Al-Mansouri');

    expect([Boolean(screen.getByTestId('view-customers')), row.closest('tr')?.textContent?.includes('28912345678')]).toEqual([true, true]);
  });

  it('previews the first customer in Split and opens their Customer 360 from the preview', async () => {
    await open('#customer');

    const preview = await screen.findByTestId('customer-preview', {}, { timeout: WAIT });
    await userEvent.click(within(preview).getByTestId('customer-preview-open'));

    expect(window.location.hash).toBe('#customer/28912345678');
  });

  it('opens the Customer 360 straight from a Grid row', async () => {
    window.localStorage.setItem('dcp.v1.customersLayout', 'grid');
    await open('#customer');

    await userEvent.click(await within(await screen.findByTestId('customers-grid', {}, { timeout: WAIT })).findByText('Aisha Al-Mansouri'));

    expect(window.location.hash).toBe('#customer/28912345678');
  });
});

describe('Action Plan', () => {
  it('opens a planned action in a side pane and drills into the cases on its strategy', async () => {
    await open('#actionplan');

    await userEvent.click(await screen.findByText('Reminder SMS', {}, { timeout: WAIT }));
    const pane = await screen.findByTestId('actionplan-action');
    const mandatory = within(pane).getByText('Mandatory').nextElementSibling?.textContent;
    await userEvent.click(within(pane).getByTestId('actionplan-action-cases'));

    expect([pane.getAttribute('data-placement'), mandatory, window.location.hash]).toEqual(['side', 'Yes', '#cases/scope/strategy=strat-1']);
  });
});

describe('the header navigation toggle', () => {
  it('collapses the sitemap to icons from the header, keeps every entry named, and remembers it', async () => {
    await open('#myday');

    await userEvent.click(screen.getByTestId('nav-toggle'));

    const rail = screen.getByTestId('nav-rail');
    const unnamed = within(rail).getAllByRole('button').filter(button => !button.getAttribute('title'));
    expect([rail.dataset['collapsed'], window.localStorage.getItem(NAV_COLLAPSED_KEY), unnamed]).toEqual(['true', 'true', []]);
  });

  it('reopens the sitemap from the same control', async () => {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, 'true');
    await open('#myday');

    await userEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));

    expect(screen.getByTestId('nav-rail').dataset['collapsed']).toBe('false');
  });
});

describe('Dashboards', () => {
  it('sits under Insights in both workspaces, and is offered to an officer (WP2)', async () => {
    const view = findView('dashboards')!;
    await open('#myday');

    const rail = screen.getByTestId('nav-rail');

    expect([view.group, navigationSectionOf(view), within(rail).queryByTestId('nav-dashboards') !== null]).toEqual(['Insights', 'Insights', true]);
  });
});

/** The Work Queues Split list previews the case behind the chosen work; its own test file covers opening it. */
describe('Work Queues', () => {
  it('opens Promise to Pay, now that it is not a navigation entry for an officer (WP2)', async () => {
    await open('#queues');

    await userEvent.click(await screen.findByTestId('queue-open-ptp'));

    expect(window.location.hash).toBe('#ptp');
  });

  it('offers the layout control beside the queue search', async () => {
    await open('#queues');

    await waitFor(() => expect(screen.getByTestId('mywork-toolbar-layout-split').getAttribute('aria-pressed')).toBe('true'));
  });
});
