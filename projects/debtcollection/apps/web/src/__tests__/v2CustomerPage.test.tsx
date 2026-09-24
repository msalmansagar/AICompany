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
      async retrieveMultipleRecords(logicalName: string) {
        if (logicalName !== 'qdb_collectioncase') return { entities: [] };
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

describe('one customer across both CRMs', () => {
  it('names the customer from the CRM record', async () => {
    await openCustomer();

    expect((await screen.findByTestId('v2-customer-name', {}, { timeout: 5000 })).textContent).toBe('Aisha Al-Mansouri');
  });

  it('counts the CRMs the cases come from', async () => {
    await openCustomer();

    expect((await screen.findByTestId('v2-customer-stats', {}, { timeout: 5000 })).textContent).toContain('2 across 2 CRMs');
  });

  it('lists each facility with its own case', async () => {
    await openCustomer();

    const facilities = await screen.findByTestId('v2-customer-facilities', {}, { timeout: 5000 });
    expect([facilities.textContent?.includes('HL-99001'), facilities.textContent?.includes('BFD-4410')]).toEqual([true, true]);
  });

  it('opens a case', async () => {
    await openCustomer();
    const cases = await screen.findByTestId('v2-customer-cases', {}, { timeout: 5000 });

    await userEvent.click(within(cases).getByRole('button', { name: 'Open case COL-BFD-000777' }));

    expect(window.location.hash).toBe('#case/c-2');
  });
});

describe('honesty', () => {
  it('marks totals partial when the read did not see every case', async () => {
    await openCustomer('#customer/28912345678', { hasMore: true });

    expect(await screen.findByTestId('v2-customer-partial', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('v2-customer-stats').textContent).toContain('Total overdue (partial)');
  });

  it('does not mark complete totals as partial', async () => {
    await openCustomer();
    await screen.findByTestId('v2-customer-stats', {}, { timeout: 5000 });

    expect(screen.queryByTestId('v2-customer-partial')).toBeNull();
  });

  it('calls the do-not-contact settings preferences, not a collections hold', async () => {
    await openCustomer();

    const prefs = await screen.findByTestId('v2-customer-prefs', {}, { timeout: 5000 });
    expect(prefs.textContent).toContain('not a collections contact hold');
  });
});

describe('without a customer', () => {
  it('asks for one', async () => {
    await openCustomer('#customer');

    expect(await screen.findByTestId('v2-customer-id', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('says so when the customer has no case', async () => {
    await openCustomer('#customer/000', { cases: [] });

    expect(await screen.findByTestId('v2-customer-none', {}, { timeout: 5000 })).toBeTruthy();
  });
});
