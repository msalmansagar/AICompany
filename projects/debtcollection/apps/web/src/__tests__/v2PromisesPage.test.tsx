import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Promise to Pay V2 through the real App: the status chip is a filter the source applies, counts are
 * the platform's own, each row carries its case from the same read, Split previews the case and Grid
 * opens it on its Promises tab, and no rate is ever computed.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const CASE_NAV = 'qdb_collectioncaseid_qdb_collectionactivity';
const PROMISE = {
  activityid: 'p-1', subject: 'Promise', statecode: 0, qdb_ptpdate: '2026-10-01', qdb_promisedamount: 5000,
  qdb_ptpstatus: 100000080, _qdb_collectioncaseid_value: 'c-1', [`_qdb_collectioncaseid_value${FORMATTED}`]: 'COL-HL-000123',
  [CASE_NAV]: {
    qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_currentarrearbucket: 100000002, qdb_currentdpd: 74,
    qdb_currenttotalarrears: 41250, qdb_organizationcode: 100000140, qdb_customertype: 100000020,
    _qdb_customerid_value: 'cust-1', [`_qdb_customerid_value${FORMATTED}`]: 'Aisha Al-Mansouri', [`_qdb_customerid_value${TABLE}`]: 'contact',
  },
};
const CASE_ROW = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678', qdb_facilitynumber: 'HL-99001',
  qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140, statuscode: 100000604, statecode: 0, qdb_currentarrearbucket: 100000002,
  qdb_currentdpd: 74, qdb_currenttotalarrears: 41250, qdb_currentloanbalance: 1236462, qdb_customertype: 100000020,
  _qdb_customerid_value: 'cust-1', [`_qdb_customerid_value${FORMATTED}`]: 'Aisha Al-Mansouri', [`_qdb_customerid_value${TABLE}`]: 'contact',
};

let activityQueries: string[] = [];

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
      async retrieveRecord(logicalName: string, id: string) {
        if (logicalName === 'qdb_collectioncase' && id === 'c-1') return CASE_ROW;
        if (logicalName === 'contact' && id === 'cust-1') return { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', statecode: 0 };
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        if (logicalName !== 'qdb_collectionactivity') return { entities: [] };
        activityQueries.push(decodeURIComponent(options));
        return { entities: [PROMISE] };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async (url: string) => {
    const broken = decodeURIComponent(String(url)).includes('qdb_ptpstatus eq 100000083');
    return new Response(JSON.stringify({ '@odata.count': broken ? 3 : 7, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

async function openPromises() {
  install();
  window.location.hash = '#ptp';
  render(<App />);
  return screen.findByTestId('v2-promises', {}, { timeout: 5000 });
}

const useGrid = () => window.localStorage.setItem('dcp.v2.promisesLayout', 'grid');

beforeEach(() => {
  activityQueries = [];
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = '';
});

describe('Promise to Pay', () => {
  it('shows the platform\'s count on each status', async () => {
    await openPromises();

    await waitFor(() => expect(screen.getByTestId('v2-chip-Broken').textContent).toContain('3'));
  });

  it('filters by status at the source', async () => {
    await openPromises();

    await userEvent.click(screen.getByTestId('v2-chip-Broken'));

    await waitFor(() => expect(activityQueries.some(q => q.includes('qdb_ptpstatus eq 100000083'))).toBe(true));
  });

  it('brings each promise\'s case back in the same read, never one read per row', async () => {
    await openPromises();

    await waitFor(() => expect(activityQueries.length).toBeGreaterThan(0));
    expect(activityQueries[0]).toContain(`$expand=${CASE_NAV}($select=qdb_casenumber,qdb_currentarrearbucket`);
  });

  it('computes no kept rate', async () => {
    const page = await openPromises();

    expect(page.textContent).not.toMatch(/rate|%/i);
  });
});

describe('Split', () => {
  it('opens in Split with the bucket bar on each row and an empty preview', async () => {
    await openPromises();
    const row = await screen.findByRole('row', { name: /Preview the promise on case COL-HL-000123/ });

    expect([row.querySelector('.v2-bucket-bar')?.getAttribute('data-bucket'), Boolean(screen.getByTestId('v2-case-preview-empty')), screen.getByTestId('v2-promises-list').className]).toEqual(['3', true, 'v2-grid v2-grid-fits']);
  });

  it('previews the promise\'s case when a row is chosen, without navigating', async () => {
    await openPromises();

    await userEvent.click(await screen.findByRole('row', { name: /Preview the promise on case COL-HL-000123/ }));

    const preview = await screen.findByTestId('v2-case-preview');
    expect([window.location.hash, within(preview).getByTestId('v2-preview-customer').textContent]).toEqual(['#ptp', 'Aisha Al-Mansouri 61-90 PTP Active HL']);
  });

  it('opens the full record on its Promises tab', async () => {
    await openPromises();
    await userEvent.click(await screen.findByRole('row', { name: /Preview the promise on case COL-HL-000123/ }));
    await screen.findByTestId('v2-case-preview');

    await userEvent.click(screen.getByTestId('v2-preview-open'));

    expect(window.location.hash).toBe('#case/c-1/ptp');
  });
});

describe('Grid', () => {
  it('switches to Grid and remembers it for this browser', async () => {
    await openPromises();

    await userEvent.click(screen.getByTestId('v2-promises-layout-grid'));

    expect([Boolean(await screen.findByTestId('v2-promises-grid')), window.localStorage.getItem('dcp.v2.promisesLayout')]).toEqual([true, 'grid']);
  });

  it('lays the case out as Collection Cases does, with the bar, and opens it on its Promises tab', async () => {
    useGrid();
    await openPromises();
    const row = await screen.findByRole('row', { name: /Open the promise on case COL-HL-000123/ });

    const headers = within(screen.getByTestId('v2-promises-grid')).getAllByRole('columnheader').map(h => h.textContent?.trim());
    await userEvent.click(row);

    expect([headers, row.querySelector('.v2-bucket-bar')?.getAttribute('data-bucket'), row.textContent?.includes('HL CRM · Individual'), window.location.hash])
      .toEqual([['Case', 'Customer', 'Promised for', 'Amount', 'Type', 'Status', 'Recorded by'], '3', true, '#case/c-1/ptp']);
  });
});
