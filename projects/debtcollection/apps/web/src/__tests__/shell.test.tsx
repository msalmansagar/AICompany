import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MisResponseMeta } from '@dcp/domain';
import { FreshnessIndicator, StaleReason } from '../components/Freshness.js';
import { ICON_NAMES } from '../components/icons.js';
import { PendingPhaseNotice, formatCount, formatMoney } from '../components/primitives.js';
import { NavRail } from '../shell/AppShell.js';
import {
  DEFAULT_VIEW_ID, GROUP_ORDER, VIEWS, findView, isPending, viewsForRole,
} from '../shell/routes.js';
import { buildHash, parseHash } from '../shell/useHashRoute.js';

describe('the approved navigation is complete', () => {
  it('carries all 21 views from the approved prototype', () => {
    expect(VIEWS).toHaveLength(21);
  });

  it('assigns every view to one of the approved groups', () => {
    for (const view of VIEWS) expect(GROUP_ORDER).toContain(view.group);
  });

  it('gives every view a unique id', () => {
    expect(new Set(VIEWS.map(v => v.id)).size).toBe(VIEWS.length);
  });

  it('gives every view an icon that exists in the ported set', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(50);
    for (const view of VIEWS) expect(ICON_NAMES).toContain(view.icon);
  });

  it('states an owning phase for every view', () => {
    expect(VIEWS.length).toBe(21);
    for (const view of VIEWS) expect(view.phase).toBeGreaterThanOrEqual(5);
  });

  it('explains every future-phase view rather than leaving it blank', () => {
    expect(VIEWS.filter(isPending).length).toBe(7);
    for (const view of VIEWS.filter(isPending)) {
      expect(view.pendingSummary, `${view.id} must say what it will do`).toBeTruthy();
    }
  });

  /**
   * A screen owned by a later phase must not deny capability this one shipped.
   *
   * Disputes said "No entity exists for them yet" while the workspace was already recording
   * collection disputes and raising complaints as Cases in QDB's own process. A pending screen is
   * the only place an officer is told what a capability is, so a stale denial there is not a
   * cosmetic error — it is the workspace contradicting itself.
   */
  it('never denies a capability that is already delivered from the case', () => {
    const DELIVERED_ELSEWHERE = ['disputes', 'legal', 'claims'];

    for (const id of DELIVERED_ELSEWHERE) {
      const summary = VIEWS.find(view => view.id === id)?.pendingSummary ?? '';
      expect(summary, `${id} must not claim its capability is absent`)
        .not.toMatch(/no entity exists|does not exist|nothing exists/i);
      expect(summary, `${id} must say the Collection-side capability is delivered`)
        .toMatch(/delivered already/i);
    }
  });

  /** Parked is not the same as unbuilt, and the screen must not collapse the two. */
  it('describes restructuring as parked rather than simply future work', () => {
    const summary = VIEWS.find(view => view.id === 'restructure')?.pendingSummary ?? '';

    expect(summary).toMatch(/parked/i);
  });

  it('keeps thirteen views functional in Phase 5, as the matrix states', () => {
    expect(VIEWS.filter(v => v.phase === 5)).toHaveLength(13);
  });
});

describe('role gating is presentation only', () => {
  it('shows an officer every ungated view', () => {
    const officer = viewsForRole('officer');
    expect(officer.every(v => v.roles === undefined)).toBe(true);
  });

  it('shows a manager the manager-only views', () => {
    const manager = viewsForRole('manager').map(v => v.id);
    expect(manager).toContain('intake');
    expect(manager).toContain('rules');
    expect(manager).toContain('admin');
  });

  it('hides manager-only views from an officer', () => {
    const officer = viewsForRole('officer').map(v => v.id);
    expect(officer).not.toContain('admin');
  });

  it('shows Portfolio MIS to a relationship manager but not an officer', () => {
    expect(viewsForRole('rm').map(v => v.id)).toContain('mis');
    expect(viewsForRole('officer').map(v => v.id)).not.toContain('mis');
  });

  it('still resolves a hidden view by id, because hiding is not authorisation', () => {
    // A user who reaches a gated view by URL gets whatever CRM permits. The route exists; the menu
    // entry is what is hidden.
    expect(findView('admin')).toBeDefined();
  });
});

describe('routing survives being a web resource', () => {
  it('reads the view from the hash', () => {
    expect(parseHash('#cases').view.id).toBe('cases');
  });

  it('reads a record id from the hash, so a case deep-links', () => {
    const route = parseHash('#case/abc-123');
    expect(route.view.id).toBe('case');
    expect(route.recordId).toBe('abc-123');
  });

  it('falls back to the default view for an unknown hash rather than rendering nothing', () => {
    expect(parseHash('#no-such-view').view.id).toBe(DEFAULT_VIEW_ID);
  });

  it('falls back for an empty hash, which is what a fresh open looks like', () => {
    expect(parseHash('').view.id).toBe(DEFAULT_VIEW_ID);
  });

  it('round-trips a hash it built', () => {
    expect(parseHash(buildHash('cases')).view.id).toBe('cases');
    expect(parseHash(buildHash('case', 'x-1')).recordId).toBe('x-1');
  });
});

describe('the nav rail', () => {
  const renderNav = (role: Parameters<typeof viewsForRole>[0] = 'manager') =>
    render(<NavRail views={viewsForRole(role)} activeId="cases" onNavigate={() => {}} />);

  it('renders every visible view', () => {
    renderNav();
    expect(viewsForRole('manager').length).toBeGreaterThan(0);
    for (const view of viewsForRole('manager')) {
      expect(screen.getByTestId(`nav-${view.id}`)).toBeInTheDocument();
    }
  });

  it('marks the active view for assistive technology', () => {
    renderNav();
    expect(screen.getByTestId('nav-cases')).toHaveAttribute('aria-current', 'page');
  });

  it('marks a view that is still to be built with the phase that owns it', () => {
    renderNav();
    expect(screen.getByTestId('nav-disputes')).toHaveAttribute('data-pending', '9');
  });

  it('stops marking a view as pending once it is built', () => {
    // The Communication Centre is a Phase 7 view and is implemented. A nav rail that still said
    // "Phase 7" over a working screen would be the route table contradicting the router.
    renderNav();
    expect(screen.getByTestId('nav-comms')).not.toHaveAttribute('data-pending');
  });

  it('does not mark a Phase 5 view as pending', () => {
    renderNav();
    expect(screen.getByTestId('nav-cases')).not.toHaveAttribute('data-pending');
  });

  it('navigates when a view is chosen', async () => {
    const chosen: string[] = [];
    render(<NavRail views={viewsForRole('officer')} activeId="myday" onNavigate={id => chosen.push(id)} />);
    await userEvent.click(screen.getByTestId('nav-cases'));
    expect(chosen).toEqual(['cases']);
  });
});

describe('a future-phase screen is preserved, not faked', () => {
  it('names the phase that owns it', () => {
    render(<PendingPhaseNotice view={findView('comms')!} />);
    expect(screen.getByText(/Phase 7 owns this/)).toBeInTheDocument();
  });

  it('says plainly that no data is shown because none would be real', () => {
    render(<PendingPhaseNotice view={findView('restructure')!} />);
    expect(screen.getByText(/No data is\s+shown here, because none would be real/)).toBeInTheDocument();
  });

  it('carries the owning phase as data, so a test can assert coverage', () => {
    render(<PendingPhaseNotice view={findView('mis')!} />);
    expect(screen.getByTestId('pending-mis')).toHaveAttribute('data-owning-phase', '10');
  });
});

describe('MIS freshness is visible and honest', () => {
  const live: MisResponseMeta = {
    provider: 'Api', freshness: 'Live', misAsOfDate: '2026-06-30', retrievedAt: '2026-09-18T12:00:00.000Z',
  };
  const cached: MisResponseMeta = {
    provider: 'Api', freshness: 'Cached', misAsOfDate: '2026-05-31',
    retrievedAt: '2026-09-18T12:00:00.000Z', cachedAt: '2026-06-01T09:00:00.000Z',
    staleReason: 'MIS was unavailable (Timeout)',
  };

  it('labels live data as live', () => {
    render(<FreshnessIndicator meta={live} />);
    expect(screen.getByTestId('freshness')).toHaveAttribute('data-freshness', 'Live');
    expect(screen.getByText('Live MIS')).toBeInTheDocument();
  });

  it('labels cached data as cached, and never as live', () => {
    render(<FreshnessIndicator meta={cached} />);
    expect(screen.getByText('Cached — not live MIS')).toBeInTheDocument();
    expect(screen.queryByText('Live MIS')).not.toBeInTheDocument();
  });

  it('shows the as-of date and the retrieval time, which answer different questions', () => {
    render(<FreshnessIndicator meta={live} />);
    expect(screen.getByTestId('freshness-asof')).toHaveTextContent('2026-06-30');
    expect(screen.getByTestId('freshness-retrieved')).toHaveTextContent('2026-09-18');
  });

  it('shows when cached figures were originally obtained', () => {
    render(<FreshnessIndicator meta={cached} />);
    expect(screen.getByTestId('freshness-cachedat')).toHaveTextContent('2026-06-01');
  });

  it('states why the figures are stale', () => {
    render(<StaleReason meta={cached} />);
    expect(screen.getByTestId('stale-reason')).toHaveTextContent('Timeout');
  });

  it('says nothing about staleness when the data is live', () => {
    render(<StaleReason meta={live} />);
    expect(screen.queryByTestId('stale-reason')).not.toBeInTheDocument();
  });

  it('marks mock data as mock, so it can never pass for real MIS', () => {
    render(<FreshnessIndicator meta={{ ...live, provider: 'Mock' }} />);
    expect(screen.getByTestId('freshness-mock')).toHaveTextContent('not real MIS data');
  });
});

describe('formatting never invents a value', () => {
  it('renders an absent amount as an em dash, not as zero', () => {
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(null)).toBe('—');
  });

  it('renders an absent count as an em dash', () => {
    expect(formatCount(undefined)).toBe('—');
  });

  it('formats a real amount', () => {
    expect(formatMoney(12500)).toMatch(/12,500/);
  });

  it('distinguishes zero from absent, because zero is a real answer', () => {
    expect(formatMoney(0)).not.toBe('—');
    expect(formatCount(0)).toBe('0');
  });
});
