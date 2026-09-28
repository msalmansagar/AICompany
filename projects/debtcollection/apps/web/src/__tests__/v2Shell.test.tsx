import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { V2Workspace } from '../v2/V2Workspace.js';
import { WorkspaceVersionRoot } from '../v2/version/WorkspaceVersionRoot.js';
import { navigationFor } from '../shell/navigation.js';
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
  it('offers an officer the business areas of their day, in the canonical order', () => {
    expect(itemIds('officer')).toEqual([
      'myday', 'queues', 'cases', 'customer', 'actionplan', 'ptp', 'comms', 'disputes', 'legal', 'claims',
    ]);
  });

  it('adds oversight, control and the manager tools for a manager', () => {
    expect(itemIds('manager')).toEqual(expect.arrayContaining(['buckets', 'dashboards', 'approvals', 'audit', 'rules', 'intake', 'admin']));
  });

  it.each(['templates', 'mis', 'case', 'restructure'])('does not advertise %s', id => {
    expect(itemIds('manager')).not.toContain(id);
  });

  it('draws no parked or phase badge', () => {
    renderV2('manager');

    expect(screen.getByRole('navigation', { name: 'Workspace' }).textContent).not.toMatch(/\bP\d+\b|Parked/);
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
  it('is collapsed from the header, not from an entry at the bottom of the rail', () => {
    renderV2();

    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    expect([within(nav).queryByText('Collapse'), screen.getByTestId('v2-nav-toggle').closest('header') !== null]).toEqual([null, true]);
  });

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

describe('keyboard access', () => {
  it('skips straight to the page content without changing the route', async () => {
    renderV2();

    await userEvent.click(screen.getByTestId('v2-skip'));

    expect([document.activeElement, window.location.hash]).toEqual([screen.getByTestId('v2-content'), '#cases']);
  });
});

describe('a route without a V2 page', () => {
  it('renders the V1 view inside the V2 frame', () => {
    window.location.hash = '#audit';
    renderV2();

    expect(screen.getByTestId('bridged-view').dataset['view']).toBe('audit');
  });
});
