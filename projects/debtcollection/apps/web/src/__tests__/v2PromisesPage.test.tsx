import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Promise to Pay V2 through the real App: the status chip is a filter the source applies, counts are
 * the platform's own, a row opens its case on the Promises tab, and no rate is ever computed.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const PROMISE = {
  activityid: 'p-1', subject: 'Promise', statecode: 0, qdb_ptpdate: '2026-10-01', qdb_promisedamount: 5000,
  qdb_ptpstatus: 100000080, _qdb_collectioncaseid_value: 'c-1', [`_qdb_collectioncaseid_value${FORMATTED}`]: 'COL-HL-000123',
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
      retrieveRecord: async () => { throw { errorCode: 2147746327 }; },
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

beforeEach(() => {
  activityQueries = [];
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
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

  it('opens the case on its Promises tab', async () => {
    await openPromises();

    await userEvent.click(await screen.findByRole('row', { name: /Open the promise on case COL-HL-000123/ }));

    expect(window.location.hash).toBe('#case/c-1/ptp');
  });

  it('computes no kept rate', async () => {
    const page = await openPromises();

    expect(page.textContent).not.toMatch(/rate|%/i);
  });
});
