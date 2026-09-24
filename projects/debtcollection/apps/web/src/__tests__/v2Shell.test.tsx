import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { V2Workspace } from '../v2/V2Workspace.js';
import { WorkspaceVersionRoot } from '../v2/version/WorkspaceVersionRoot.js';
import { navigationFor } from '../v2/shell/v2Navigation.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';
import type { RoleKey } from '../shell/routes.js';

/**
 * The V2 shell: navigation drawn from the real route table, a header whose search works, and the
 * collapse, drawer and version controls. Routes without a V2 page still render — V1's own view,
 * inside the V2 frame.
 */

const COLLAPSE_KEY = 'dcp.v2.navCollapsed';

function renderV2(role: RoleKey = 'officer') {
  return render(
    <CrmSessionProvider value={{ adapter: {} as never, context: { userId: '1', userName: 'Salman Sagar' } as never }}>
      <RoleProvider initial={role}>
        <OrgProvider>
          <WorkspaceVersionRoot
            search="?ui=v2"
            storage={undefined as never}
            renderV1={() => <div data-testid="v1" />}
            renderV2={() => (
              <V2Workspace renderView={request => <div data-testid="bridged-view" data-view={request.view.id} />} />
            )}
          />
        </OrgProvider>
      </RoleProvider>
    </CrmSessionProvider>,
  );
}

beforeEach(() => {
  window.location.hash = '#cases';
  window.localStorage.removeItem(COLLAPSE_KEY);
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(COLLAPSE_KEY);
});

const itemIds = (role: RoleKey) => navigationFor(role).flatMap(group => group.items.map(item => item.id));

describe('navigation', () => {
  it('offers an officer only built or parked routes they may see', () => {
    expect(itemIds('officer')).toEqual([
      'myday', 'queues', 'cases', 'customer', 'ptp', 'comms',
      'disputes', 'legal', 'claims', 'restructure', 'actionplan', 'buckets', 'dashboards', 'audit',
    ]);
  });

  it('adds the manager-only routes for a manager', () => {
    expect(itemIds('manager')).toEqual(expect.arrayContaining(['rules', 'intake', 'admin']));
  });

  it.each(['templates', 'mis', 'approvals', 'case'])('does not advertise %s', id => {
    expect(itemIds('manager')).not.toContain(id);
  });

  it('marks restructuring as parked', () => {
    renderV2();

    expect(screen.getByTestId('v2-nav-restructure').textContent).toContain('Parked');
  });

  it('marks the current route', () => {
    renderV2();

    expect(screen.getByTestId('v2-nav-cases').getAttribute('aria-current')).toBe('page');
  });

  it('highlights Cases while a case is open', () => {
    window.location.hash = '#case/c-1';
    renderV2();

    expect(screen.getByTestId('v2-nav-cases').getAttribute('aria-current')).toBe('page');
  });

  it('navigates through the shared router', async () => {
    renderV2();

    await userEvent.click(screen.getByTestId('v2-nav-ptp'));

    expect(window.location.hash).toBe('#ptp');
  });
});

describe('the header', () => {
  it('titles the page with the V2 name', () => {
    window.location.hash = '#claims';
    renderV2();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Deceased Review');
  });

  it('searches cases from anywhere', async () => {
    window.location.hash = '#myday';
    renderV2();

    await userEvent.type(screen.getByTestId('v2-search'), 'COL-HL-1{Enter}');

    expect(window.location.hash).toBe('#cases');
  });

  it('shows the version switch with V2 pressed', () => {
    renderV2();

    const v2 = screen.getByTestId('switch-to-v2');
    expect([v2.getAttribute('aria-pressed'), screen.getByTestId('switch-to-v1').getAttribute('aria-pressed')])
      .toEqual(['true', 'false']);
  });
});

describe('the rail', () => {
  it('collapses and remembers it', async () => {
    renderV2();

    await userEvent.click(screen.getByTestId('v2-nav-toggle'));

    expect([screen.getByTestId('v2-shell').dataset['collapsed'], window.localStorage.getItem(COLLAPSE_KEY)])
      .toEqual(['true', 'true']);
  });

  it('keeps every entry reachable by name when collapsed', async () => {
    renderV2();
    await userEvent.click(screen.getByTestId('v2-nav-toggle'));

    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(nav).getAllByRole('button').filter(b => !b.getAttribute('title'))).toEqual([]);
  });

  it('opens as a drawer and closes from the scrim', async () => {
    renderV2();

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const opened = screen.getByTestId('v2-shell').dataset['drawer'];
    await userEvent.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect([opened, screen.getByTestId('v2-shell').dataset['drawer']]).toEqual(['open', 'closed']);
  });
});

describe('a route without a V2 page', () => {
  it('renders the V1 view inside the V2 frame', () => {
    window.location.hash = '#audit';
    renderV2();

    expect(screen.getByTestId('bridged-view').dataset['view']).toBe('audit');
  });
});
