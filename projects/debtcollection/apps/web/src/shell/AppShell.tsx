import type { ReactNode } from 'react';
import { Icon } from '../components/primitives.js';
import { ROLE_LABELS, useCrmSession, useOrg, useRole } from './context.js';
import { GROUP_ORDER, isPending, viewsForRole, type ViewDefinition } from './routes.js';
import { useHashRoute } from './useHashRoute.js';

/**
 * The workspace chrome, as the approved prototype arranges it.
 *
 * Header, command bar, left navigation, content. The UCI styling is deliberate: this runs inside
 * Dynamics, and looking like part of it rather than like a foreign application embedded in a frame is
 * a large part of why the design was approved.
 */

export interface AppShellProps {
  /** Commands for the current view. The prototype gives each view its own set. */
  commands?: ReactNode;
  children: ReactNode;
}

export function AppShell({ commands, children }: AppShellProps) {
  const { context } = useCrmSession();
  const { role, setRole } = useRole();
  const { scope, setScope } = useOrg();
  const route = useHashRoute();
  const visible = viewsForRole(role);

  return (
    <div className="uci-shell">
      <header className="uci-header">
        <div className="uci-brand">
          <span className="uci-app">MSS Collections</span>
          <span className="uci-divider" />
          <span className="uci-area">Debt Collection</span>
          <span className="uci-env" data-testid="environment">
            {context.organizationUniqueName ?? 'CRM'}
          </span>
        </div>

        <div className="uci-search">
          <Icon name="search" />
          <input type="search" placeholder="Search customer, case or QID" aria-label="Search" />
        </div>

        <div className="uci-header-right">
          <label className="uci-role">
            <span className="uci-role-label">Role</span>
            <select
              value={role}
              aria-label="Working role"
              data-testid="role-switcher"
              onChange={e => setRole(e.target.value as typeof role)}
            >
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>

          <label className="uci-org">
            <span className="uci-org-label">CRM</span>
            <select
              value={scope}
              aria-label="Organisation scope"
              data-testid="org-scope"
              onChange={e => setScope(e.target.value as typeof scope)}
            >
              <option value="all">Both CRMs</option>
              <option value="HL">Housing Loan</option>
              <option value="BFD">BFD</option>
            </select>
          </label>

          <span className="uci-user" title={context.userName}>{context.userName}</span>
        </div>
      </header>

      {commands && <nav className="uci-cmdbar" aria-label="Commands">{commands}</nav>}

      <div className="uci-body">
        <NavRail views={visible} activeId={route.view.id} onNavigate={route.go} />
        <main className="uci-content" data-testid="content" data-view={route.view.id}>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The left navigation.
 *
 * Grouped and ordered exactly as the prototype. A view whose functionality belongs to a later phase
 * still appears, marked, because the approved information architecture is part of what was approved —
 * quietly dropping the Workout group until Phase 9 would change the shape of the product.
 */
export function NavRail({ views, activeId, onNavigate }: {
  views: readonly ViewDefinition[];
  activeId: string;
  onNavigate: (viewId: string) => void;
}) {
  return (
    <nav className="uci-nav" aria-label="Workspace navigation" data-testid="nav-rail">
      {GROUP_ORDER.map(group => {
        const inGroup = views.filter(v => v.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="uci-nav-group">
            <div className="uci-nav-group-label">{group}</div>
            {inGroup.map(view => (
              <button
                key={view.id}
                type="button"
                className={`uci-nav-item${view.id === activeId ? ' is-active' : ''}`}
                data-testid={`nav-${view.id}`}
                data-pending={isPending(view) ? String(view.phase) : undefined}
                aria-current={view.id === activeId ? 'page' : undefined}
                onClick={() => onNavigate(view.id)}
              >
                <Icon name={view.icon} />
                <span className="uci-nav-label">{view.label}</span>
                {isPending(view) && (
                  <span className="uci-nav-phase" title={`Phase ${view.phase} owns this functionality`}>
                    P{view.phase}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * A command bar button.
 *
 * `pendingPhase` renders it disabled with a tooltip naming the owning phase, which is how the
 * approved command set stays visible without anything pretending to work.
 */
export function Command({ icon, label, onClick, pendingPhase }: {
  icon: string; label: string; onClick?: () => void; pendingPhase?: number;
}) {
  const disabled = pendingPhase !== undefined;
  return (
    <button
      type="button"
      className="uci-cmd"
      disabled={disabled}
      data-testid={`cmd-${label.toLowerCase().replace(/\s+/g, '-')}`}
      title={disabled ? `Phase ${pendingPhase} owns this — not yet implemented` : label}
      onClick={disabled ? undefined : onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
