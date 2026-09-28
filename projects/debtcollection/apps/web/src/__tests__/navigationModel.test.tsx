import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NavRail } from '../shell/AppShell.js';
import { NAVIGATION, NAVIGATION_SECTIONS, navigationFor, navigationLabelOf } from '../shell/navigation.js';
import { VIEWS, findView, viewsForRole, type RoleKey } from '../shell/routes.js';
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
  it('lays the officer\'s areas out in the canonical sections and words', () => {
    expect(navigationFor('officer').map(group => [group.section, group.items.map(item => item.label)])).toEqual([
      ['Workspace', ['My Day', 'Work Queues', 'Collection Cases']],
      ['Customer', ['Customer 360']],
      ['Collection', ['Action Plan', 'Promise to Pay', 'Communications']],
      ['Resolution', ['Disputes', 'Legal Hand-off', 'Deceased Review']],
    ]);
  });

  it('adds Strategy & Oversight and Control for a manager, and the manager tools after them', () => {
    expect(navigationFor('manager').map(group => [group.section, group.items.map(item => item.label)])).toEqual([
      ['Workspace', ['My Day', 'Work Queues', 'Collection Cases']],
      ['Customer', ['Customer 360']],
      ['Collection', ['Action Plan', 'Promise to Pay', 'Communications']],
      ['Resolution', ['Disputes', 'Legal Hand-off', 'Deceased Review']],
      ['Strategy & Oversight', ['Portfolio & Strategy', 'Dashboards', 'Approvals']],
      ['Control', ['Audit Trail']],
      ['Administration', ['Delinquency Intake', 'Strategy Rules', 'Configuration']],
    ]);
  });

  it('gives a relationship manager oversight but not control or administration', () => {
    expect(navigationFor('rm').map(group => group.section)).toEqual(['Workspace', 'Customer', 'Collection', 'Resolution', 'Strategy & Oversight']);
  });

  it.each([
    ['Case Detail', 'case'], ['Template Library', 'templates'], ['Restructuring', 'restructure'], ['Portfolio MIS', 'mis'],
  ])('offers %s to nobody — %s stays a route, not a business area', (_label, id) => {
    for (const role of ROLES) expect(navigationFor(role).flatMap(group => group.items.map(item => item.id))).not.toContain(id);
  });

  it.each(['Customer & Loan 360', 'Communication', 'Legal', 'Deceased & Claims', 'Segmentation Matrix', 'Templates'])('never uses the retired word "%s"', word => {
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
