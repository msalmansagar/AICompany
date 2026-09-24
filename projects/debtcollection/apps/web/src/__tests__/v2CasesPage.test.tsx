import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Collection Cases V2 through the real App. The fake records every case query the workspace sends,
 * because what matters is that filters, search and sort are sent to the source — and that the sort
 * carries a unique tie-breaker so paging is stable.
 */

const CASE_ROW = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140,
  statuscode: 100000600, statecode: 0, qdb_currentarrearbucket: 100000002, qdb_currentdpd: 74, qdb_currenttotalarrears: 41250,
};

let caseQueries: string[] = [];
let rows: Record<string, unknown>[] = [CASE_ROW];

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
        if (logicalName !== 'qdb_collectioncase') return { entities: [] };
        caseQueries.push(decodeURIComponent(options));
        return { entities: rows };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 1, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

async function openCases() {
  install();
  window.location.hash = '#cases';
  render(<App />);
  await screen.findByTestId('v2-cases', {}, { timeout: 5000 });
}

const lastQuery = () => caseQueries[caseQueries.length - 1] ?? '';

beforeEach(() => {
  caseQueries = [];
  rows = [CASE_ROW];
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('the query sent to the source', () => {
  it('orders worst DPD first, with a unique tie-breaker', async () => {
    await openCases();

    await waitFor(() => expect(lastQuery()).toContain('$orderby=qdb_currentdpd desc,qdb_collectioncaseid asc'));
  });

  it('filters by bucket at the source', async () => {
    await openCases();

    await userEvent.click(screen.getByTestId('v2-chip-61-90'));

    await waitFor(() => expect(lastQuery()).toContain('qdb_currentarrearbucket eq 100000002'));
  });

  it('sends the search to the source', async () => {
    await openCases();

    await userEvent.type(screen.getByTestId('v2-cases-search'), 'COL-HL');

    await waitFor(() => expect(lastQuery()).toContain("contains(qdb_casenumber,'COL-HL')"), { timeout: 3000 });
  });

  it('changes the order at the source', async () => {
    await openCases();

    await userEvent.selectOptions(screen.getByTestId('v2-cases-sort'), 'arrears');

    await waitFor(() => expect(lastQuery()).toContain('$orderby=qdb_currenttotalarrears desc,qdb_collectioncaseid asc'));
  });
});

describe('filters', () => {
  it('counts what is active and clears it all', async () => {
    await openCases();
    await userEvent.click(screen.getByTestId('v2-chip-61-90'));
    await userEvent.selectOptions(screen.getByTestId('v2-cases-status'), 'New');

    const summary = await screen.findByTestId('v2-cases-active-filters');
    const before = summary.textContent;
    await userEvent.click(screen.getByTestId('v2-cases-clear'));

    expect([before?.startsWith('2 filters active'), screen.queryByTestId('v2-cases-active-filters')]).toEqual([true, null]);
  });

  it('distinguishes no cases at all from no matching cases', async () => {
    rows = [];
    await openCases();
    const unfiltered = await screen.findByTestId('v2-cases-grid-empty');

    await userEvent.click(screen.getByTestId('v2-chip-61-90'));

    expect([Boolean(unfiltered), Boolean(await screen.findByTestId('v2-cases-grid-empty-filtered'))]).toEqual([true, true]);
  });
});

describe('opening a case', () => {
  it('opens it from its row', async () => {
    await openCases();

    await userEvent.click(await screen.findByRole('row', { name: 'Open case COL-HL-000123' }));

    expect(window.location.hash).toBe('#case/c-1');
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
