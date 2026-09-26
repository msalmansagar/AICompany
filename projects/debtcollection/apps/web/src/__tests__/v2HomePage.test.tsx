import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * My Day V2 on a fake platform that answers counts the way Dataverse does — over the transport,
 * per filter. What is tested is honesty: real figures shown, an unanswered count shown as unknown
 * (never 0), no SLA or rate figure anywhere, and only queues that hold work listed as needing you.
 */

const TYPES = [
  { qdb_collectionactivitytypeid: 't-legal', qdb_name: 'Legal', qdb_code: 'P6-LEGALREC', qdb_isactive: true },
  { qdb_collectionactivitytypeid: 't-dispute', qdb_name: 'Complaint / Dispute', qdb_code: 'P6-DISPUTE', qdb_isactive: true },
  { qdb_collectionactivitytypeid: 't-deceased', qdb_name: 'Deceased', qdb_code: 'P6-DECEASED', qdb_isactive: true },
];

/** Count answers keyed by a fragment of the filter the workspace sends. */
function countFor(url: string, failing: boolean): Response {
  if (failing) return new Response('down', { status: 503 });
  const decoded = decodeURIComponent(url);
  const count = decoded.includes('t-legal') && !decoded.includes('t-dispute') ? 2
    : decoded.includes('qdb_collectioncases') && decoded.includes('statecode eq 0') ? 12
      : 0;
  return new Response(JSON.stringify({ '@odata.count': count, value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function install(options: { failingCounts?: boolean } = {}): void {
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
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string) => ({ entities: logicalName === 'qdb_collectionactivitytype' ? TYPES : [] }),
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  countUrls = [];
  vi.stubGlobal('fetch', async (url: string) => { countUrls.push(decodeURIComponent(String(url))); return countFor(String(url), options.failingCounts === true); });
}

/** Every count the home page asked the transport for, decoded, so a test can read the filter it sent. */
let countUrls: string[] = [];

async function openHome(options: { failingCounts?: boolean } = {}) {
  install(options);
  window.location.hash = '#myday';
  render(<App />);
  return screen.findByTestId('v2-home', {}, { timeout: 5000 });
}

beforeEach(() => { window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2'); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('the figures', () => {
  it('shows the count the platform answered', async () => {
    await openHome();

    await waitFor(() => expect(screen.getByTestId('v2-metric-open').textContent).toContain('12'));
  });

  it('shows an unanswered count as unknown, never as zero', async () => {
    await openHome({ failingCounts: true });

    await waitFor(() => expect(screen.getByTestId('v2-metric-open').textContent).toContain('—'));
    expect(screen.getByTestId('v2-metric-open').textContent).not.toMatch(/\b0\b/);
  });

  it('carries no SLA, rate or management figure', async () => {
    const home = await openHome();

    expect(home.textContent).not.toMatch(/SLA|rate|recovery|cure|roll|productivity|portfolio at risk/i);
  });

  /**
   * Phase 10 made the promise tile a fact about PTP activities — recorded status Active, promised
   * for a stated window — rather than a case status standing in for a promise. The words on the tile
   * keep the distinction: a recorded status is not a verified payment.
   */
  it('counts promises due as PTP activities in a stated window, and says a recorded status is not a payment', async () => {
    const home = await openHome();

    const tile = screen.getByTestId('v2-metric-ptp-due');
    expect(tile.textContent).toContain('Promises due, 7 days');
    expect(tile.textContent).toMatch(/not a verified payment/);
    expect(home.textContent).not.toMatch(/Active promises|Broken promises/);
    await waitFor(() => expect(countUrls.some(url => url.includes('qdb_collectionactivities') && url.includes('qdb_ptpdate ne null') && url.includes('qdb_ptpstatus eq') && url.includes('qdb_ptpdate ge') && url.includes('qdb_ptpdate lt'))).toBe(true));
  });

  /** KI-147: an activity count under a single-CRM scope reaches the organisation through the case. */
  it('scopes every activity count through the case when one CRM is chosen', async () => {
    await openHome();
    await userEvent.selectOptions(screen.getByTestId('v2-org-scope'), 'HL');

    await waitFor(() => expect(countUrls.some(url => url.includes('qdb_collectionactivities') && url.includes('qdb_collectioncaseid_qdb_collectionactivity/qdb_organizationcode eq 100000140'))).toBe(true));
    expect(countUrls.filter(url => url.includes('qdb_collectionactivities') && /[^/]qdb_organizationcode eq/.test(url) && !url.includes('qdb_collectioncaseid_qdb_collectionactivity/qdb_organizationcode'))).toEqual([]);
  });
});

describe('what needs you', () => {
  it('lists a queue that holds work', async () => {
    await openHome();

    expect(await screen.findByTestId('v2-needs-Legal')).toBeTruthy();
  });

  it('leaves out a queue known to be empty', async () => {
    await openHome();
    await screen.findByTestId('v2-needs-Legal');

    expect(screen.queryByTestId('v2-needs-Disputes')).toBeNull();
  });

  it('opens the queue that holds the work', async () => {
    await openHome();

    await userEvent.click(await screen.findByTestId('v2-needs-Legal'));

    expect(window.location.hash).toBe('#queues/Legal');
  });

  it('never offers queues that cannot be answered without due dates', async () => {
    await openHome();
    await screen.findByTestId('v2-queue-load');

    expect([screen.queryByTestId('v2-load-Overdue'), screen.queryByTestId('v2-load-DueSoon')]).toEqual([null, null]);
  });
});

describe('follow-ups', () => {
  it('says so when nothing is overdue', async () => {
    await openHome();

    expect(await screen.findByText('Nothing is overdue.')).toBeTruthy();
  });

  it('switches window as a new question', async () => {
    await openHome();
    await screen.findByText('Nothing is overdue.');

    await userEvent.click(screen.getByTestId('v2-chip-upcoming'));

    expect(await screen.findByText('No follow-up in this window.')).toBeTruthy();
  });
});
