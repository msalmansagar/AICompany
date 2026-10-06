import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import { isPending, VIEWS, type ViewDefinition } from '../shell/routes.js';
import type { XrmLike } from '../platform/crmContext.js';
import { formatMoney } from '../components/primitives.js';

/**
 * The views, rendered through the real application bootstrap.
 *
 * These tests mount `App` itself rather than a component in isolation, so the route table, the
 * router, the CRM session and the view all have to agree for one to pass. A view that exists in the
 * route table but is not wired to an implementation renders the router's own defect panel, and the
 * completeness test below fails on it — which is the only way to be sure the navigation and the
 * application have not drifted apart.
 *
 * The client API is a stand-in, and it answers with **no rows**. That is deliberate: what is under
 * test here is the screen, its states and its honesty, not data shaping — the shaping has its own
 * tests against real row forms in `viewQueries.test.ts`, and the platform's own behaviour is proven
 * by the live spike. An empty grid must render its empty state, not a spinner that never resolves.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

function fakeXrm(rows: Record<string, Record<string, unknown>[]> = {}): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: {
          userId: '{61086FE4-0000-0000-0000-000000000001}',
          userName: 'Tester',
          languageId: 1033,
          securityRoles: ['{AAAA0000-0000-0000-0000-000000000001}'],
        },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string) {
        const row = rows[logicalName]?.[0];
        if (!row) throw { status: 404 };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        // A FetchXML aggregate is answered as the platform answers it: one grouped row, no records.
        if (decodeURIComponent(options).startsWith('?fetchXml=')) {
          const arrears = (rows[logicalName] ?? []).reduce((sum, row) => sum + (typeof row['qdb_currenttotalarrears'] === 'number' ? row['qdb_currenttotalarrears'] : 0), 0);
          return { entities: [{ arrears }] };
        }
        // No `@odata.count`: the real client API never returns one, whatever is asked for (KI-96).
        // A count therefore has to come from the transport, and the stub below answers it.
        return { entities: rows[logicalName] ?? [] };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  };
}

function install(xrm: XrmLike) {
  (window as unknown as { Xrm?: XrmLike }).Xrm = xrm;
}

/**
 * Answers `$count=true` over the same-origin transport, as the platform does.
 *
 * Counting cannot go through `Xrm.WebApi`, so a view under test needs this stub to produce a KPI
 * figure at all — which is the point: before it existed, every tile in this suite was green while
 * the deployed workspace showed an em dash.
 */
function installCounts(rows: Record<string, Record<string, unknown>[]> = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    const set = /\/([a-z_]+)\?/.exec(String(url))?.[1] ?? '';
    // Named rather than de-pluralised. `qdb_collectioncases` loses one `s`, not `es`, and a
    // near-miss here would silently count zero — which is the shape of the defect being fixed.
    const logicalName = set === 'qdb_collectioncases' ? 'qdb_collectioncase' : set;
    const total = (rows[logicalName] ?? []).length;
    return new Response(JSON.stringify({ '@odata.count': total, value: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
}

async function openView(viewId: string, recordId?: string) {
  window.location.hash = recordId ? `#${viewId}/${recordId}` : `#${viewId}`;
  render(<App />);
  await screen.findByTestId('content');
}

beforeEach(() => {
  install(fakeXrm());
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

// ── Router completeness ──────────────────────────────────────────────────────

const PHASE_5_VIEWS: readonly ViewDefinition[] = VIEWS.filter(view => view.phase === 5);

describe('every Phase 5 view in the route table has an implementation', () => {
  it('has thirteen of them to check, as the matrix states', () => {
    expect(PHASE_5_VIEWS).toHaveLength(13);
  });

  for (const view of PHASE_5_VIEWS) {
    it(`routes ${view.id} to a real screen`, async () => {
      await openView(view.id);
      const content = screen.getByTestId('content');
      // The route must have been taken at all — otherwise "no defect panel" would be trivially true
      // of a blank page, which is exactly the vacuous assertion this suite exists to avoid.
      expect(content.getAttribute('data-view')).toBe(view.id);
      expect(content.textContent!.trim().length, `${view.id} rendered nothing`).toBeGreaterThan(0);
      expect(
        screen.queryByTestId('unrouted-view'),
        `${view.id} is declared Phase 5 but the router has nothing bound to it`,
      ).toBeNull();
    });
  }

  // The two loops below generate one test per view. If either list were empty they would generate
  // nothing and the suite would still be green, so both counts are asserted first.
  // Pending now means "not built", not "owned by a later phase". Phase 7 delivered the
  // Communication Centre, so it is routed and no longer shows a notice — while still being a
  // Phase 7 view, which is what the route table records.
  it('has four views still to build, as the matrix states', () => {
    expect(VIEWS.filter(isPending)).toHaveLength(4);
  });

  /**
   * Phase 9 delivers the Workout entries as the operational queue opened on their own process, and
   * each says what is possible there — including what is not. Legal must never read as a hand-off.
   */
  it.each([
    ['disputes', /changes nothing about collection/],
    ['legal', /No recommendation is handed to Legal/],
    ['claims', /Insurance claims are not offered/],
  ])('opens %s as a working queue that says what it cannot do', async (id, limitation) => {
    await openView(id);

    const view = await screen.findByTestId(`workout-queue-${id}`);

    expect(view.textContent).toMatch(limitation);
  });

  /** Controls for functionality that does not exist are not offered, even disabled. */
  it('offers no Refer to legal or Propose restructure command', async () => {
    await openView('restructure');
    await screen.findByTestId('cmd-refresh');

    expect([screen.queryByTestId('cmd-refer-to-legal'), screen.queryByTestId('cmd-propose-restructure')])
      .toEqual([null, null]);
  });

  it('keeps case commands off the global command bar — the case action bar does them in place (WP6)', async () => {
    await openView('restructure');
    await screen.findByTestId('cmd-refresh');

    expect(['cmd-log-action', 'cmd-capture-ptp', 'cmd-send-message'].map(id => screen.queryByTestId(id))).toEqual([null, null, null]);
  });

  it('says restructuring is parked by QDB, not waiting on a phase', async () => {
    await openView('restructure');

    const notice = await screen.findByTestId('pending-restructure');

    expect(notice.textContent).toContain('Parked by QDB');
    expect(notice.textContent).not.toMatch(/Phase 9 owns/);
  });

  for (const view of VIEWS.filter(isPending)) {
    it(`keeps ${view.id} present and names Phase ${view.phase}`, async () => {
      await openView(view.id);
      const notice = await screen.findByTestId(`pending-${view.id}`);
      expect(notice.getAttribute('data-owning-phase')).toBe(String(view.phase));
    });
  }
});

// ── Case Workspace ───────────────────────────────────────────────────────────

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
  '_qdb_strategyid_value': 'strat-1',
  [`_qdb_strategyid_value${FORMATTED}`]: 'Early stage',
};

describe('the Case Workspace keeps every record a case had (WP3)', () => {
  // Summary became the working surface above the tabs; Documents was a placeholder with nothing in it.
  const TABS = ['actions', 'ptp', 'comms', 'plan', 'workout', 'history', 'details', 'audit'];

  beforeEach(() => install(fakeXrm({ qdb_collectioncase: [CASE_ROW] })));

  it('renders every record tab, and no others', async () => {
    await openView('case', 'c-1');
    const pivot = await screen.findByTestId('case-pivot');
    for (const tab of TABS) expect(screen.getByTestId(`case-pivot-tab-${tab}`)).toBeTruthy();
    // And no others: a tab added without going through the matrix would slip past the loop above.
    expect(pivot.querySelectorAll('[role="tab"]')).toHaveLength(TABS.length);
  });

  it('shows the case it was asked for, with its stored details one tab away', async () => {
    await openView('case', 'c-1');
    const view = await screen.findByTestId('view-case');
    await userEvent.click(screen.getByTestId('case-pivot-tab-details'));
    expect([view.getAttribute('data-case-id'), screen.getByTestId('case-summary-fields').textContent?.includes('COL-HL-000123')]).toEqual(['c-1', true]);
  });

  it('says which date the balances are from, with no MIS position bar', async () => {
    await openView('case', 'c-1');
    const line = await screen.findByTestId('balances-as-of');
    expect([line.textContent, screen.queryByTestId('stored-position')]).toEqual(['Balances as of 17 Sep 2026', null]);
  });

  it('messages the customer from the case: Communications embeds the case\'s own composer (WP2)', async () => {
    await openView('case', 'c-1');
    await screen.findByTestId('view-case');
    await userEvent.click(screen.getByTestId('case-pivot-tab-comms'));
    expect(await screen.findByTestId('view-comms')).toBeTruthy();
    expect(screen.queryByTestId('pending-panel-7')).toBeNull();
  });

  it('names no internal delivery phase anywhere on the case', async () => {
    await openView('case', 'c-1');
    const view = await screen.findByTestId('view-case');
    expect(view.textContent).not.toMatch(/Phase \d|\bP\d\b/);
  });

  /**
   * The workout tab once told an officer that no entity existed for legal, disputes or claims, on
   * the very case where all three were already being recorded. Phase 9 delivers the tab: it states
   * what each process supports, and a delivered capability must read as available there.
   */
  it('does not deny capability the case already has', async () => {
    await openView('case', 'c-1');
    await screen.findByTestId('view-case');
    await userEvent.click(screen.getByTestId('case-pivot-tab-workout'));

    const matrix = await screen.findByTestId('advanced-processes');
    expect(matrix.textContent).not.toMatch(/no entity exists/i);
    expect(within(matrix).getByTestId('process-aspect-legal-record').dataset['capability']).toBe('Actionable');
  });

  it('no longer marks Workout & Legal as a later phase', async () => {
    await openView('case', 'c-1');
    await screen.findByTestId('view-case');

    expect(screen.getByTestId('case-pivot-tab-workout').getAttribute('data-pending-phase')).toBeNull();
  });

  it('refuses to invent a case that does not resolve', async () => {
    install(fakeXrm({}));
    await openView('case', 'missing-id');
    await waitFor(() => expect(screen.getByText(/No collection case with id missing-id/)).toBeTruthy());
  });

  it('asks for a case rather than showing an empty screen when none is selected', async () => {
    await openView('case');
    await waitFor(() => expect(screen.getByText(/Open a case from Collection Cases/)).toBeTruthy());
  });
});

// ── Customer 360 ─────────────────────────────────────────────────────────────

describe('Customer 360 aggregates and admits what it cannot source', () => {
  beforeEach(() => install(fakeXrm({
    qdb_collectioncase: [CASE_ROW],
    contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0, telephone1: '+974 5555 0000' }],
  })));

  it('shows the customer gathered from their cases, named from the CRM contact', async () => {
    await openView('customer', '28912345678');
    const view = await screen.findByTestId('view-customer');
    expect(view.getAttribute('data-customer-id')).toBe('28912345678');
    expect(screen.getByTestId('c360-tags').textContent).toContain('Housing Loan · Contact');
  });

  it('lists one card per loan account, named as a loan account and not a facility', async () => {
    await openView('customer', '28912345678');
    const units = await screen.findAllByTestId('c360-unit');
    expect(units).toHaveLength(1);
    expect([units[0]!.getAttribute('data-unit'), units[0]!.getAttribute('data-kind'), /Facility/.test(units[0]!.textContent ?? '')]).toEqual(['HL-99001', 'loanAccount', false]);
  });

  it('omits collateral, guarantor and insurance rather than showing placeholders for what has no source', async () => {
    await openView('customer', '28912345678');
    await screen.findByTestId('view-customer');
    expect(screen.getByTestId('view-customer').textContent).not.toMatch(/Collateral|Guarantor|Insurance|not yet sourced/);
  });

  it('lists the customers with arrears rather than a customer master when no customer is named', async () => {
    await openView('customer');
    await waitFor(() => expect(screen.getByTestId('view-customers')).toBeTruthy());
    expect(screen.getByText(/no customer master of its own/i)).toBeTruthy();
  });
});

// ── Configuration and strategy ───────────────────────────────────────────────

describe('configuration screens read and never author', () => {
  it('preserves the rule builder and disables it', async () => {
    await openView('rules');
    const builder = await screen.findByTestId('rule-builder');
    expect((builder as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('preserves the configuration commands as disabled, each naming its phase', async () => {
    install(fakeXrm({ qdb_platformconfiguration: [] }));
    await openView('admin');
    const commands = await screen.findByTestId('config-commands');
    const buttons = [...commands.querySelectorAll('button')];
    expect(buttons.length).toBe(4);
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('data-pending-phase')).toBeTruthy();
    }
  });

  it('says plainly when no platform configuration row exists, rather than showing nothing', async () => {
    install(fakeXrm({ qdb_platformconfiguration: [] }));
    await openView('admin');
    await waitFor(() => expect(screen.getByText(/No platform configuration row exists/)).toBeTruthy());
  });

  it('reports the CRM session it actually resolved', async () => {
    await openView('admin');
    const fields = await screen.findByTestId('session-fields');
    expect(fields.textContent).toContain('9.2');
    expect(fields.textContent).toContain('org5869857f');
  });
});

// ── KPI honesty ──────────────────────────────────────────────────────────────

describe('a KPI is a platform count or an em dash, never an invention', () => {
  it('sums current arrears through the platform, as one aggregate over open cases', async () => {
    install(fakeXrm({ qdb_collectioncase: [CASE_ROW, { ...CASE_ROW, qdb_collectioncaseid: 'c-2', qdb_currenttotalarrears: 1_000 }] }));
    installCounts({ qdb_collectioncase: [CASE_ROW] });
    await openView('myday');
    const tiles = await screen.findAllByText('Current arrears');
    const tile = tiles[0]!.closest('.kpi-tile')!;
    await waitFor(() => expect(tile.querySelector('.kpi-value')!.textContent).toBe(formatMoney(CASE_ROW.qdb_currenttotalarrears + 1_000)));
    expect(tile.textContent).toContain('Latest MIS balances, open cases');
  });

  it('shows an em dash, never zero, when the platform refuses the sum', async () => {
    const xrm = fakeXrm({ qdb_collectioncase: [CASE_ROW] });
    xrm.WebApi.retrieveMultipleRecords = async (_name: string, options = '') => {
      if (decodeURIComponent(options).startsWith('?fetchXml=')) throw { errorCode: 0x8004E023 };
      return { entities: [CASE_ROW] };
    };
    install(xrm);
    installCounts({ qdb_collectioncase: [CASE_ROW] });
    await openView('myday');
    const tile = (await screen.findAllByText('Current arrears'))[0]!.closest('.kpi-tile')!;
    await waitFor(() => expect(tile.textContent).toContain('could not sum'));
    expect(tile.querySelector('.kpi-value')!.textContent).toBe('—');
  });

  it('states what each My Day tile counts, and claims no SLA', async () => {
    await openView('myday');
    const labels = (await screen.findAllByText(/./, { selector: '.kpi-label' })).map(el => el.textContent);
    // The default role is officer: their own cases, and no identity exceptions (a manager's concern).
    expect(labels).toEqual(['My open cases', 'Current arrears', 'My open work', 'Follow-ups overdue', 'Follow-ups upcoming', 'Promises due, 7 days', 'Broken promises', 'Awaiting assignment']);
    expect(document.body.textContent).not.toMatch(/SLA breached|Overdue balance/);
  });

  /**
   * Phase 10 made the Dashboards a set of Report Engine reports. A session with no Engine — this
   * stand-in has no `execute` — must say so on every panel and count nothing itself: a bounded
   * `$count` shown where an Engine figure belongs would be a second, unreconciled answer.
   */
  it('shows no figure on a dashboard whose definitions this organisation does not carry', async () => {
    install(fakeXrm({ qdb_collectioncase: [CASE_ROW] }));
    installCounts({ qdb_collectioncase: [CASE_ROW] });
    await openView('dashboards');
    const book = await screen.findByTestId('panel-DCP-RPT-015');
    await waitFor(() => expect(book.textContent).toContain('DCP-RPT-015 is not provisioned on this organisation'));
    expect(book.querySelector('.kpi-value')).toBeNull();
  });
});

describe('a working screen does not announce itself unimplemented', () => {
  /**
   * The Action Plan printed "Not yet implemented — Phase 5 owns this" and "No data is shown here,
   * because none would be real" directly above four rows of real strategy actions. One component
   * was carrying two meanings: *this screen does not work* and *this screen is not finished*. Only
   * the first may claim there is no data.
   */
  const WORKING_WITH_MORE_TO_COME = ['actionplan', 'buckets'];

  for (const id of WORKING_WITH_MORE_TO_COME) {
    it(`${id} says what is still coming without denying what it shows`, async () => {
      await openView(id);
      await screen.findByTestId(`view-${id}`);

      expect(screen.queryByTestId(`pending-${id}`), 'must not use the not-implemented notice')
        .toBeNull();
      expect(screen.queryByText(/No data is shown here/i)).toBeNull();
      expect(screen.queryByText(/Not yet implemented/i)).toBeNull();
    });
  }

  it('still says plainly that a genuinely pending screen does not work', async () => {
    await openView('restructure');

    expect(await screen.findByTestId('pending-restructure')).toBeTruthy();
    expect(screen.getByText(/No data is shown here/i)).toBeTruthy();
  });
});

describe('a reporting scope carried into Collection Cases', () => {
  it('narrows the list to the population a card counted, and says so', async () => {
    const xrm = fakeXrm({ qdb_collectioncase: [CASE_ROW] });
    const queries: string[] = [];
    const inner = xrm.WebApi.retrieveMultipleRecords.bind(xrm.WebApi);
    xrm.WebApi.retrieveMultipleRecords = async (name: string, options = '', size?: number) => {
      if (name === 'qdb_collectioncase' && !decodeURIComponent(options).startsWith('?fetchXml=')) queries.push(decodeURIComponent(options));
      return inner(name, options, size);
    };
    install(xrm);
    installCounts({ qdb_collectioncase: [CASE_ROW] });
    window.location.hash = '#cases/scope/sourceSystem=HL&bucket=61-90&strategy=none&owner=u-1';
    render(<App />);
    await screen.findByTestId('cases-scope');

    await waitFor(() => expect(queries.at(-1)).toContain('qdb_organizationcode eq 100000140 and statecode eq 0 and _qdb_strategyid_value eq null and _ownerid_value eq u-1 and qdb_currentarrearbucket eq 100000002'));
    expect([
      screen.getByTestId('scope-chip-bucket').textContent, screen.getByTestId('scope-chip-strategy').textContent,
      (screen.getByTestId('filter-bucket') as HTMLSelectElement).value,
    ]).toEqual(['DPD: 61-90', 'Strategy: Strategy Not Assigned', '61-90']);
  });

  it('shows no scope strip on the plain list', async () => {
    await openView('cases');
    expect(screen.queryByTestId('cases-scope')).toBeNull();
  });
});
