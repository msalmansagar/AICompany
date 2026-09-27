import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { VERSION_STORAGE_KEY } from '../v2/version/workspaceVersion.js';
import { rememberCaseListReturn } from '../v2/data/caseListFilterUrl.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Case Workspace V2, through the real App on a fake platform.
 *
 * It must answer who, which facility and how late from real records; offer only commands for real
 * capabilities; keep the tab in the shared URL; open V1's own dialogs for every write; and say
 * plainly when there is nothing to show.
 */

const CASE_ROW = {
  qdb_collectioncaseid: 'c-1',
  qdb_casenumber: 'COL-HL-000123',
  qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001',
  qdb_facilitysourcesystem: 'HL',
  qdb_organizationcode: 100000140,
  statuscode: 100000604,
  statecode: 0,
  qdb_currentarrearbucket: 100000002,
  qdb_currentdpd: 74,
  qdb_currenttotalarrears: 41250,
  qdb_misasofdate: '2026-09-17',
  qdb_lastmissyncon: '2026-09-18T03:10:00Z',
  qdb_correlationid: 'corr-abc-123',
  '_qdb_customerid_value': 'cust-1',
  '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
};

const CONTACT = { contactid: 'cust-1', fullname: 'Aisha Al-Mansouri', mobilephone: '+97400000000', statecode: 0 };

function install(rows: Record<string, Record<string, unknown>[]>): void {
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
        const row = rows[logicalName]?.[0];
        if (!row) throw { errorCode: 2147746327, message: 'Does Not Exist' };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string) { return { entities: rows[logicalName] ?? [] }; },
    },
  } as unknown as XrmLike;
  (window as unknown as { Xrm: XrmLike }).Xrm = xrm;
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ '@odata.count': 0, value: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

async function openCase(hash = '#case/c-1', rows: Record<string, Record<string, unknown>[]> = { qdb_collectioncase: [CASE_ROW], contact: [CONTACT] }) {
  install(rows);
  window.location.hash = hash;
  render(<App />);
  return screen.findByTestId('v2-case', {}, { timeout: 5000 });
}

beforeEach(() => { window.localStorage.setItem(VERSION_STORAGE_KEY, 'v2'); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(VERSION_STORAGE_KEY);
  window.location.hash = '';
});

describe('the case header', () => {
  it('names the customer from the CRM record', async () => {
    await openCase();

    expect(screen.getByTestId('v2-case-customer').textContent).toBe('Aisha Al-Mansouri');
  });

  it('falls back to the business id when the customer cannot be read', async () => {
    await openCase('#case/c-1', { qdb_collectioncase: [CASE_ROW] });

    expect(screen.getByTestId('v2-case-customer').textContent).toBe('28912345678');
  });

  it('shows the stored position and says it is not a live read', async () => {
    await openCase();

    expect(screen.getByTestId('v2-case-header').textContent).toContain('not a live MIS read');
  });

  it('shows the arrears from the case', async () => {
    await openCase();

    expect(screen.getByTestId('v2-case-stats').textContent).toMatch(/41,250/);
  });
});

describe('the way back', () => {
  it('returns to the filtered list the case was opened from', async () => {
    rememberCaseListReturn('bucket=61-90&strategy=none&from=portfolio');
    await openCase();

    await userEvent.click(screen.getByTestId('v2-case-back'));

    expect(window.location.hash).toBe('#cases/filter/bucket=61-90&strategy=none&from=portfolio');
  });

  it('returns to the plain list when the case was not opened from a filtered one', async () => {
    rememberCaseListReturn(undefined);
    await openCase();

    await userEvent.click(screen.getByTestId('v2-case-back'));

    expect(window.location.hash).toBe('#cases');
  });
});

describe('case commands', () => {
  it('offers the real ones', async () => {
    await openCase();

    const bar = screen.getByRole('toolbar', { name: 'Case commands' });
    expect(within(bar).getAllByRole('button').map(b => b.textContent)).toEqual(['Log action', 'Capture PTP', 'Send message', 'Customer 360']);
  });

  it.each([/refer to legal/i, /restructur/i, /reassign/i, /deceased/i, /dispute/i, /escalate/i])(
    'offers nothing matching %s', async pattern => {
      await openCase();

      const bar = screen.getByRole('toolbar', { name: 'Case commands' });
      expect(within(bar).queryAllByRole('button').filter(b => pattern.test(b.textContent ?? ''))).toEqual([]);
    });

  it('opens the existing activity dialog to log an action', async () => {
    await openCase();

    await userEvent.click(screen.getByTestId('v2-cmd-log-action'));

    expect(await screen.findByTestId('activity-dialog')).toBeTruthy();
  });

  it('does not offer writes on a closed case, and says why', async () => {
    await openCase('#case/c-1', { qdb_collectioncase: [{ ...CASE_ROW, statecode: 1 }], contact: [CONTACT] });

    const log = screen.getByTestId('v2-cmd-log-action');
    expect([log.hasAttribute('disabled'), log.getAttribute('title')]).toEqual([true, 'This case is closed.']);
  });
});

describe('case tabs', () => {
  it('offers the case sections', async () => {
    await openCase();

    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Overview', 'Action Plan', 'Activities', 'Promises', 'Communications', 'Delinquency history', 'Workout & Legal', 'Audit',
    ]);
  });

  it('keeps the tab in the shared URL', async () => {
    await openCase();

    await userEvent.click(screen.getByTestId('v2-tab-actions'));

    expect(window.location.hash).toBe('#case/c-1/actions');
  });

  it('opens straight onto a tab named in the URL', async () => {
    await openCase('#case/c-1/history');

    expect(await screen.findByTestId('v2-case-panel-history')).toBeTruthy();
  });

  it('falls back to the overview for a tab it does not have', async () => {
    await openCase('#case/c-1/documents');

    expect(screen.getByTestId('v2-case-panel-summary')).toBeTruthy();
  });
});

describe('the overview', () => {
  it('says so when no strategy has been resolved, rather than inventing a next step', async () => {
    await openCase();

    const next = await screen.findByTestId('v2-next-action');
    expect(next.textContent).toContain('No strategy has been resolved for this case.');
  });

  it('says so when nothing has been recorded', async () => {
    await openCase();

    expect(await screen.findByText('No action has been recorded on this case yet.')).toBeTruthy();
  });
});

describe('the recent-activity timeline', () => {
  it('shows when each action was recorded, which is the order it is listed in', async () => {
    await openCase('#case/c-1', {
      qdb_collectioncase: [CASE_ROW], contact: [CONTACT],
      qdb_collectionactivity: [{ activityid: 'a-1', subject: 'Called', statecode: 0, qdb_activitydate: '2026-09-25T09:00:00Z', createdon: '2026-09-19T09:00:00Z' }],
    });

    const timeline = await screen.findByTestId('v2-case-timeline', {}, { timeout: 5000 });
    expect(timeline.textContent).toContain('Recorded 2026-09-19');
  });
});

describe('a case that cannot be read', () => {
  it('says it could not be found', async () => {
    install({});
    window.location.hash = '#case/nope';
    render(<App />);

    expect(await screen.findByTestId('v2-case-missing', {}, { timeout: 5000 })).toBeTruthy();
  });
});
