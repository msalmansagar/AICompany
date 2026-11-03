import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NavRail } from '../shell/AppShell.js';
import { V2Workspace } from '../v2/V2Workspace.js';
import { WorkspaceVersionRoot } from '../v2/version/WorkspaceVersionRoot.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';

/**
 * The sidebar's vertical contract (user instruction, 2026-09-28): a fixed header, a navigation
 * region that alone scrolls, a fixed profile footer — the same in V1 and V2, from one shell.
 *
 * jsdom lays nothing out, so the scrolling itself is proven in the browser at several heights
 * (docs/evidence). What can be pinned here is the structure both rails render and the stylesheet
 * rules that make the middle region the only scroller — the two things a regression would break.
 */

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = (file: string) => readFileSync(join(SOURCE, file), 'utf8');

function ruleOf(sheet: string, selector: string): string {
  const start = sheet.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`${selector} has no rule`);
  return sheet.slice(start, sheet.indexOf('}', start));
}

function renderV2() {
  window.location.hash = '#cases';
  return render(
    <CrmSessionProvider value={{ adapter: {} as never, context: { userId: '1', userName: 'Mohammad Salman Sagar Al-Something Very Long' } as never }}>
      <RoleProvider initial="manager">
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

afterEach(() => { cleanup(); window.location.hash = ''; });

describe('the shared contract in the stylesheet', () => {
  it('makes the sidebar a non-scrolling flex column whose middle region alone overflows', () => {
    const sheet = css('styles/sidebar.css');
    const sidebar = ruleOf(sheet, '.sidebar');
    const nav = ruleOf(sheet, '.sidebar-nav');

    expect([
      sidebar.includes('flex-direction: column'), sidebar.includes('min-height: 0'), sidebar.includes('overflow: hidden'),
      nav.includes('flex: 1 1 auto'), nav.includes('min-height: 0'), nav.includes('overflow-y: auto'),
      ruleOf(sheet, '.sidebar-header').includes('flex: 0 0 auto'), ruleOf(sheet, '.sidebar-profile').includes('flex: 0 0 auto'),
    ]).toEqual([true, true, true, true, true, true, true, true]);
  });

  it('gives neither rail a scroller of its own any more, in either design', () => {
    const v1 = ruleOf(css('styles/tokens.css'), '.nav');
    const v2 = ruleOf(css('v2/styles/v2-shell.css'), '.dcp-v2 .v2-nav');

    expect([v1.includes('overflow'), v2.includes('overflow'), v2.includes('100dvh'), css('styles/uci.css').includes('.nav-scroll { flex: 1; overflow-y')])
      .toEqual([false, false, true, false]);
  });
});

describe('the V1 rail', () => {
  it('renders header, navigation and profile as the three regions, in that order', () => {
    render(
      <NavRail role="officer" activeId="myday" onNavigate={() => {}} header={<span>Debt Collection</span>} profile={<span data-testid="who">Officer One · Collection Officer</span>} />,
    );
    const rail = screen.getByTestId('nav-rail');

    expect([
      rail.classList.contains('sidebar'),
      [...rail.children].map(child => child.getAttribute('data-testid')),
      within(screen.getByTestId('nav-rail-nav')).getAllByRole('button').length > 0,
      within(screen.getByTestId('nav-rail-profile')).getByTestId('who').textContent,
    ]).toEqual([true, ['nav-rail-header', 'nav-rail-nav', 'nav-rail-profile'], true, 'Officer One · Collection Officer']);
  });

  it('keeps the menu the only scroll region — the active item lives inside it, never in the header or footer', () => {
    render(<NavRail role="officer" activeId="cases" onNavigate={() => {}} header={<span>Debt Collection</span>} profile={<span>Officer One</span>} />);

    expect(screen.getByTestId('nav-cases').closest('[data-testid="nav-rail-nav"]')).not.toBeNull();
  });
});

describe('the V2 rail', () => {
  it('renders the same three regions from the same shell, with the signed-in user in the footer', () => {
    renderV2();
    const rail = screen.getByTestId('v2-nav-rail');

    expect([
      rail.classList.contains('sidebar') && rail.classList.contains('v2-nav'),
      [...rail.children].map(child => child.getAttribute('data-testid')),
      screen.getByTestId('v2-nav-rail-header').textContent?.includes('Collections'),
      screen.getByTestId('v2-nav-rail-profile').textContent?.includes('Mohammad Salman Sagar Al-Something Very Long'),
      screen.getByTestId('v2-nav-cases').closest('[data-testid="v2-nav-rail-nav"]') !== null,
    ]).toEqual([true, ['v2-nav-rail-header', 'v2-nav-rail-nav', 'v2-nav-rail-profile'], true, true, true]);
  });
});
