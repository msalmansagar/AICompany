import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavRail } from '../shell/AppShell.js';
import {
  CONTEXTUAL_ROUTES, NAVIGATION, NAVIGATION_SECTIONS, activeNavigationId, navigationFor, navigationLabelOf, pageTitleOf,
} from '../shell/navigation.js';
import { VIEWS, findView, isPending, viewsForRole, type RoleKey } from '../shell/routes.js';
import { QUEUE_BUCKETS } from '../v2/pages/queue/V2QueuePage.js';
import { parseHash } from '../shell/useHashRoute.js';
import { resolveWorkspaceVersion } from '../v2/version/workspaceVersion.js';
import { V2Workspace } from '../v2/V2Workspace.js';
import { WorkspaceVersionRoot } from '../v2/version/WorkspaceVersionRoot.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';

/**
 * One business navigation, two renderers (user instruction, 2026-09-28).
 *
 * V1 and V2 must offer the same sections, the same words, in the same order, to the same roles —
 * and offer only business work areas: no contextual screen, no phase, no parked capability, no
 * engineering name. Offering is not authorising: every route still resolves by URL for every role,
 * and CRM's own security decides what is read there.
 */

const ROLES: readonly RoleKey[] = ['officer', 'manager', 'rm', 'legal'];

function renderV2(role: RoleKey) {
  window.location.hash = '#cases';
  return render(
    <CrmSessionProvider value={{ adapter: {} as never, context: { userId: '1', userName: 'Salman Sagar' } as never }}>
      <RoleProvider initial={role}>
        <OrgProvider>
          <WorkspaceVersionRoot
            search="?ui=v2" storage={undefined as never}
            renderV1={() => <div data-testid="v1" />}
            renderV2={() => <V2Workspace renderView={request => <div data-view={request.view.id} />} />}
          />
        </OrgProvider>
      </RoleProvider>
    </CrmSessionProvider>,
  );
}

/** What a rendered rail offers, section by section: the thing the two renderers must agree on. */
function offered(nav: HTMLElement): { section: string; items: string[] }[] {
  return within(nav).getAllByRole('group').map(group => ({
    section: group.getAttribute('aria-label')!,
    items: within(group).getAllByRole('button').map(button => button.textContent!.trim()),
  }));
}

afterEach(() => { cleanup(); window.location.hash = ''; });

describe('one definition, two renderers', () => {
  it.each(ROLES)('V1 and V2 offer the %s the same sections, words and order', role => {
    render(<NavRail role={role} activeId="myday" onNavigate={() => {}} />);
    const v1 = offered(screen.getByTestId('nav-rail'));
    cleanup();
    renderV2(role);
    const v2 = offered(screen.getByRole('navigation', { name: 'Workspace' }));

    const model = navigationFor(role).map(group => ({ section: group.section, items: group.items.map(item => item.label) }));
    expect([v1, v2]).toEqual([model, model]);
  });
});

describe('the canonical model', () => {
  it('gives an officer My Work and Insights, and nothing else (WP2)', () => {
    expect(navigationFor('officer').map(group => [group.section, group.items.map(item => item.label)])).toEqual([
      ['My Work', ['My Day', 'Work Queues', 'Collection Cases', 'Customers']],
      ['Insights', ['Dashboards']],
    ]);
  });

  it('gives a legal officer the officer\'s navigation', () => {
    expect(navigationFor('legal')).toEqual(navigationFor('officer'));
  });

  it('adds the Manager section and the administration tools for a manager', () => {
    expect(navigationFor('manager').map(group => [group.section, group.items.map(item => item.label)])).toEqual([
      ['My Work', ['My Day', 'Work Queues', 'Collection Cases', 'Customers']],
      ['Insights', ['Dashboards']],
      ['Manager', ['Approvals', 'Portfolio & Strategy', 'Action Plan', 'Communications', 'Audit Trail']],
      ['Administration', ['Delinquency Intake', 'Strategy Rules', 'Configuration']],
    ]);
  });

  it('gives a relationship manager the Manager section without audit, bulk messaging or administration', () => {
    expect(navigationFor('rm').map(group => [group.section, group.items.map(item => item.label)])).toEqual([
      ['My Work', ['My Day', 'Work Queues', 'Collection Cases', 'Customers']],
      ['Insights', ['Dashboards']],
      ['Manager', ['Approvals', 'Portfolio & Strategy', 'Action Plan']],
    ]);
  });

  it.each(['actionplan', 'ptp', 'comms', 'disputes', 'legal', 'claims'])('moves %s out of the officer\'s primary navigation', id => {
    expect(navigationFor('officer').flatMap(group => group.items.map(item => item.id))).not.toContain(id);
  });

  it('never offers administration to an officer merely because the route exists', () => {
    const officerIds = navigationFor('officer').flatMap(group => group.items.map(item => item.id));
    for (const id of ['intake', 'rules', 'admin', 'audit', 'buckets', 'approvals']) expect(officerIds).not.toContain(id);
  });

  it('calls one customer "Customer 360" and the list "Customers"', () => {
    const customer = findView('customer')!;
    expect([pageTitleOf(customer), pageTitleOf(customer, 'QID-1')]).toEqual(['Customers', 'Customer 360']);
  });

  it.each([
    ['Case Detail', 'case'], ['Template Library', 'templates'], ['Restructuring', 'restructure'], ['Portfolio MIS', 'mis'],
  ])('offers %s to nobody — %s stays a route, not a business area', (_label, id) => {
    for (const role of ROLES) expect(navigationFor(role).flatMap(group => group.items.map(item => item.id))).not.toContain(id);
  });

  it.each(['Customer & Loan 360', 'Customer 360', 'Communication', 'Legal', 'Deceased & Claims', 'Segmentation Matrix', 'Templates'])('never uses the retired word "%s"', word => {
    for (const role of ROLES) expect(navigationFor(role).flatMap(group => group.items.map(item => item.label))).not.toContain(word);
  });

  it('carries no phase or parked marker in any role\'s navigation', () => {
    for (const role of ROLES) expect(JSON.stringify(navigationFor(role))).not.toMatch(/\bP\d+\b|Parked/);
  });

  it('names only routes that exist, in sections that exist', () => {
    expect(NAVIGATION.map(entry => [findView(entry.id) !== undefined, NAVIGATION_SECTIONS.includes(entry.section)]).every(([a, b]) => a && b)).toBe(true);
  });

  it('keeps the route table\'s words in step with the navigation\'s', () => {
    for (const entry of NAVIGATION) expect(navigationLabelOf(findView(entry.id)!)).toBe(findView(entry.id)!.label);
  });
});

/**
 * WP2 moved six screens out of the officer's navigation. None of them may become unreachable: every
 * built route is either offered to the role, or contextual with a parent the role is offered.
 */
describe('no functionality became unreachable', () => {
  const BUILT = VIEWS.filter(view => !isPending(view) && !view.isParked).map(view => view.id);

  it.each(ROLES)('reaches every built route for the %s, from the navigation or from a screen it offers', role => {
    const offeredIds = navigationFor(role).flatMap(group => group.items.map(item => item.id));
    // A screen the model gives only to other roles (Portfolio & Strategy, Audit Trail) is theirs by design.
    const isOtherRolesScreen = (id: string) => NAVIGATION.some(entry => entry.id === id && entry.roles !== undefined && !entry.roles.includes(role));
    const unreachable = BUILT.filter(id => {
      if (!viewsForRole(role).some(view => view.id === id) || isOtherRolesScreen(id)) return false;
      if (offeredIds.includes(id)) return false;
      const contextual = CONTEXTUAL_ROUTES[id];
      return !contextual || !offeredIds.includes(contextual.parent);
    });
    expect(unreachable).toEqual([]);
  });

  it('names, for every contextual route, the screens an officer reaches it from', () => {
    for (const [id, contextual] of Object.entries(CONTEXTUAL_ROUTES)) {
      expect([id, findView(contextual.parent) !== undefined, contextual.reachedFrom.length > 0]).toEqual([id, true, true]);
    }
  });

  it.each(['disputes', 'legal', 'claims'])('keeps %s as a Work Queues bucket in both workspaces', id => {
    const bucket = { disputes: 'Disputes', legal: 'Legal', claims: 'DeceasedReview' }[id]!;
    expect(QUEUE_BUCKETS).toContain(bucket);
  });

  it.each([
    ['ptp', 'queues'], ['legal', 'queues'], ['comms', 'cases'], ['case', 'cases'],
  ])('highlights the officer\'s way in when %s is open: %s', (viewId, parent) => {
    expect(activeNavigationId(viewId, 'officer')).toBe(parent);
  });

  it('highlights a manager\'s own entry when the manager has one', () => {
    expect(activeNavigationId('comms', 'manager')).toBe('comms');
  });

  it.each([
    ['#ptp', 'ptp'], ['#comms/c-1', 'comms'], ['#comms/bulk', 'comms'], ['#disputes', 'disputes'], ['#legal', 'legal'],
    ['#claims', 'claims'], ['#actionplan', 'actionplan'], ['#case/c-1/workout', 'case'], ['#customer/QID-1', 'customer'],
  ])('still resolves the bookmark %s', (hash, viewId) => {
    expect(parseHash(hash).view.id).toBe(viewId);
  });
});

describe('the rail is usable by keyboard and when collapsed', () => {
  it('reaches every entry with Tab and opens it with Enter', async () => {
    const opened: string[] = [];
    render(<NavRail role="officer" activeId="myday" onNavigate={id => opened.push(id)} />);
    const entries = within(screen.getByTestId('nav-rail')).getAllByRole('button');

    for (const entry of entries) {
      await userEvent.tab();
      expect(document.activeElement).toBe(entry);
      await userEvent.keyboard('{Enter}');
    }
    expect(opened).toEqual(['myday', 'queues', 'cases', 'customer', 'dashboards']);
  });

  it('keeps every entry named when collapsed to icons', () => {
    render(<NavRail role="officer" activeId="myday" onNavigate={() => {}} isCollapsed />);
    const names = within(screen.getByTestId('nav-rail')).getAllByRole('button').map(button => button.getAttribute('title'));
    expect([screen.getByTestId('nav-rail').getAttribute('data-collapsed'), names]).toEqual(['true', ['My Day', 'Work Queues', 'Collection Cases', 'Customers', 'Dashboards']]);
  });

  it('marks a contextual screen\'s way in as the current page', () => {
    render(<NavRail role="officer" activeId="ptp" onNavigate={() => {}} />);
    expect(screen.getByTestId('nav-queues').getAttribute('aria-current')).toBe('page');
  });
});

describe('offering is not authorising', () => {
  it('still resolves every route by URL for an officer, hidden or not — CRM security decides what is read', () => {
    const hidden = VIEWS.filter(view => !navigationFor('officer').some(group => group.items.some(item => item.id === view.id)));
    expect(hidden.length).toBeGreaterThan(0);
    for (const view of hidden) expect(parseHash(`#${view.id}`).view.id).toBe(view.id);
  });

  it('leaves the route table\'s own role gating exactly as it was', () => {
    expect(viewsForRole('officer').map(view => view.id)).not.toContain('admin');
    expect(viewsForRole('officer').map(view => view.id)).toContain('audit');
  });

  it('keeps V1 as the default workspace', () => {
    expect(resolveWorkspaceVersion({ search: '' })).toBe('v1');
  });
});
