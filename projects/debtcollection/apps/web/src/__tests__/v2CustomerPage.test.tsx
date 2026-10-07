import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Customer 360 V2 through the real App: one customer across both CRMs, read as an aggregation of
 * their cases. Totals must say *partial* when the read did not see every case, and the CRM's
 * do-not-contact settings must never be presented as a collections hold.
 */

const HL_CASE = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140,
  statuscode: 100000600, statecode: 0, qdb_currentdpd: 74, qdb_currenttotalarrears: 41250, qdb_loanbalance: 900000,
  '_qdb_customerid_value': 'cust-1', '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
};
const BFD_CASE = {
  ...HL_CASE, qdb_collectioncaseid: 'c-2', qdb_casenumber: 'COL-BFD-000777', qdb_facilitynumber: 'BFD-4410',
  qdb_facilitysourcesystem: 'BFD', qdb_organizationcode: 100000141, qdb_currentdpd: 12, qdb_currenttotalarrears: 5000,
};
const CONTACT = { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97400000000', donotphone: true, statecode: 0 };

/** Grouped rows, as the aggregate returns them: one per customer and organisation. */
function customerGroups(cases: Record<string, unknown>[]): Record<string, unknown>[] {
  return cases.map(c => ({
    cases: 1, arrears: c['qdb_currenttotalarrears'], exposure: c['qdb_loanbalance'], dpd: c['qdb_currentdpd'],
    customer: c['qdb_customerbusinessid'], customerref: c['_qdb_customerid_value'], 'customerref@OData.Community.Display.V1.FormattedValue': CONTACT.fullname,
    org: c['qdb_organizationcode'],
  }));
}

function install(options: { cases?: Record<string, unknown>[]; hasMore?: boolean } = {}): void {
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
        if (logicalName === 'contact') return CONTACT;
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, query = '') {
        if (logicalName !== 'qdb_collectioncase') return { entities: [] };
        // The customer list is one aggregate over the cases, answered as the platform answers it.
        if (decodeURIComponent(query).startsWith('?fetchXml=')) return { entities: customerGroups(options.cases ?? [HL_CASE, BFD_CASE]) };
        return {
          entities: options.cases ?? [HL_CASE, BFD_CASE],
          ...(options.hasMore ? { nextLink: 'https://org5869857f.crm4.dynamics.com/api/data/v9.2/qdb_collectioncases?$skiptoken=x' } : {}),
        };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 2, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

async function openCustomer(hash = '#customer/28912345678', options: Parameters<typeof install>[0] = {}) {
  install(options);
  window.location.hash = hash;
  render(<App />);
}

beforeEach(() => { window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2'); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('one customer across both CRMs — the shared screen inside the V2 frame', () => {
  it('names the customer from the CRM record', async () => {
    await openCustomer();

    expect((await screen.findByTestId('c360-name', {}, { timeout: 5000 })).textContent).toBe('Aisha Al-Mansouri');
    expect(screen.getByTestId('v2-customer').className).toBe('v2-bridged');
  });

  it('lists each unit with its own case, named by its kind', async () => {
    await openCustomer();

    const units = await screen.findAllByTestId('c360-unit', {}, { timeout: 5000 });
    expect(units.map(u => u.getAttribute('data-unit') + ':' + u.getAttribute('data-kind'))).toEqual(['HL-99001:loanAccount', 'BFD-4410:facility']);
  });

  it('opens a case from its unit', async () => {
    await openCustomer();
    const units = await screen.findAllByTestId('c360-unit', {}, { timeout: 5000 });

    await userEvent.click(within(units[1]!).getByTestId('c360-unit-open'));

    expect(window.location.hash).toBe('#case/c-2');
  });
});

describe('honesty', () => {
  it('says when more cases exist than were read', async () => {
    await openCustomer('#customer/28912345678', { hasMore: true });

    await screen.findByTestId('c360-units', {}, { timeout: 5000 });
    expect(screen.getByText(/more cases than one read returns/)).toBeTruthy();
  });

  it('does not say so when every case was read', async () => {
    await openCustomer();
    await screen.findByTestId('c360-units', {}, { timeout: 5000 });

    expect(screen.queryByText(/more cases than one read returns/)).toBeNull();
  });

  it('calls the do-not-contact settings preferences, not a collections hold', async () => {
    await openCustomer();

    await screen.findByTestId('c360-prefs', {}, { timeout: 5000 });
    expect(screen.getByText(/Not a Collection Contact Hold decision/)).toBeTruthy();
  });
});

describe('without a customer', () => {
  it('lists every customer with an open case, once, across both CRMs', async () => {
    await openCustomer('#customer');

    const list = await screen.findByTestId('v2-customers', {}, { timeout: 5000 });
    const row = await screen.findByRole('row', { name: 'Preview customer Aisha Al-Mansouri' }, { timeout: 5000 });
    expect([list.dataset['layout'], row.textContent?.includes('2 cases')]).toEqual(['split', true]);
  });

  it('previews the chosen customer and opens their Customer 360', async () => {
    await openCustomer('#customer');

    await userEvent.click(await screen.findByRole('row', { name: 'Preview customer Aisha Al-Mansouri' }, { timeout: 5000 }));
    await userEvent.click(await screen.findByTestId('v2-customer-preview-open', {}, { timeout: 5000 }));

    expect(window.location.hash).toBe('#customer/28912345678');
  });

  it('opens the Customer 360 straight from a Grid row', async () => {
    window.localStorage.setItem('dcp.v2.customersLayout', 'grid');
    await openCustomer('#customer');

    await userEvent.click(await screen.findByRole('row', { name: 'Open customer Aisha Al-Mansouri' }, { timeout: 5000 }));

    window.localStorage.removeItem('dcp.v2.customersLayout');
    expect(window.location.hash).toBe('#customer/28912345678');
  });

  it('says so when the customer has no case', async () => {
    await openCustomer('#customer/000', { cases: [] });

    expect(await screen.findByText(/No Collection Case names customer 000/, {}, { timeout: 5000 })).toBeTruthy();
  });
});
