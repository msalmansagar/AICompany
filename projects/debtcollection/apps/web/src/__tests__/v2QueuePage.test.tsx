import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Work Queues V2 through the real App. The queue reads through the same work-queue query V1 uses;
 * what is tested is the V2 behaviour around it — the bucket in the URL, the two layouts, the
 * unavailable buckets explained, and search sent to the source rather than applied in the browser.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LAYOUT_KEY = 'dcp.v2.queueLayout';

const TYPES = [{ qdb_collectionactivitytypeid: 't-legal', qdb_name: 'Legal', qdb_code: 'P6-LEGALREC', qdb_isactive: true }];
const WORK = {
  activityid: 'w-1', subject: 'Recommend litigation', statecode: 0, createdon: '2026-09-23T09:15:00Z',
  _qdb_activitytypeid_value: 't-legal', _qdb_collectioncaseid_value: 'c-1',
  [`_qdb_collectioncaseid_value${FORMATTED}`]: 'COL-HL-000123',
};
const CASE_ROW = {
  qdb_collectioncaseid: 'c-1', qdb_casenumber: 'COL-HL-000123', qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001', qdb_facilitysourcesystem: 'HL', qdb_organizationcode: 100000140,
  statuscode: 100000600, statecode: 0, qdb_currentdpd: 74, qdb_currenttotalarrears: 41250,
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
      async retrieveRecord(logicalName: string) {
        if (logicalName === 'qdb_collectioncase') return CASE_ROW;
        throw { errorCode: 2147746327 };
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        if (logicalName === 'qdb_collectionactivitytype') return { entities: TYPES };
        if (logicalName === 'qdb_collectionactivity') {
          activityQueries.push(decodeURIComponent(options));
          return { entities: [WORK] };
        }
        return { entities: [] };
      },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 1, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

async function openQueue(hash: string) {
  install();
  window.location.hash = hash;
  render(<App />);
  return screen.findByTestId('v2-queue', {}, { timeout: 5000 });
}

beforeEach(() => {
  activityQueries = [];
  window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2');
  window.localStorage.removeItem(LAYOUT_KEY);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.localStorage.removeItem(LAYOUT_KEY);
  window.location.hash = '';
});

describe('the bucket', () => {
  it('comes from the URL', async () => {
    const queue = await openQueue('#queues/Legal');

    expect([queue.dataset['bucket'], screen.getByTestId('v2-chip-Legal').getAttribute('aria-pressed')]).toEqual(['Legal', 'true']);
  });

  it('defaults to my work for an unknown one', async () => {
    const queue = await openQueue('#queues/Nonsense');

    expect(queue.dataset['bucket']).toBe('MyAssigned');
  });

  it('changes through the URL', async () => {
    await openQueue('#queues/MyAssigned');

    await userEvent.click(screen.getByTestId('v2-chip-Legal'));

    expect(window.location.hash).toBe('#queues/Legal');
  });

  it('shows a bucket it cannot serve as disabled, with the reason', async () => {
    await openQueue('#queues/MyAssigned');

    const overdue = screen.getByTestId('v2-chip-Overdue');
    expect([overdue.hasAttribute('disabled'), overdue.getAttribute('title')]).toEqual([true, expect.stringContaining('Due dates are not configured')]);
  });

  it('explains rather than lists when opened on one it cannot serve', async () => {
    await openQueue('#queues/Overdue');

    expect(screen.getByTestId('v2-queue-unavailable').textContent).toContain('Due dates are not configured');
  });
});

describe('the split layout', () => {
  it('previews the chosen row, then opens its case', async () => {
    await openQueue('#queues/Legal');

    await userEvent.click(await screen.findByRole('row', { name: 'Preview Recommend litigation' }));
    const preview = await screen.findByTestId('v2-queue-preview');
    await waitFor(() => expect(preview.textContent).toContain('COL-HL-000123'));
    await userEvent.click(screen.getByTestId('v2-queue-open-case'));

    expect(window.location.hash).toBe('#case/c-1');
  });

  it('asks the officer to choose before anything is selected', async () => {
    await openQueue('#queues/Legal');

    expect(await screen.findByTestId('v2-queue-preview-empty')).toBeTruthy();
  });
});

describe('the grid layout', () => {
  it('opens a case straight from a row, and is remembered', async () => {
    await openQueue('#queues/Legal');
    await userEvent.click(screen.getByTestId('v2-layout-grid'));

    await userEvent.click(await screen.findByRole('row', { name: /Open case COL-HL-000123/ }));

    expect([window.location.hash, window.localStorage.getItem(LAYOUT_KEY)]).toEqual(['#case/c-1', 'grid']);
  });
});

describe('search', () => {
  it('is sent to the source, not applied in the browser', async () => {
    await openQueue('#queues/Legal');
    await screen.findByRole('row', { name: 'Preview Recommend litigation' });

    await userEvent.type(screen.getByTestId('v2-queue-search'), 'litig');

    await waitFor(() => expect(activityQueries.some(q => q.includes('litig'))).toBe(true), { timeout: 3000 });
  });
});

describe('the Legal entry', () => {
  it('opens on the Legal queue, says what is possible, and offers no other queue', async () => {
    const queue = await openQueue('#legal');

    expect([queue.dataset['bucket'], Boolean(screen.queryByTestId('v2-queue-buckets'))]).toEqual(['Legal', false]);
    expect(screen.getByTestId('v2-queue-intro').textContent).toContain('No recommendation is handed to Legal');
  });
});
