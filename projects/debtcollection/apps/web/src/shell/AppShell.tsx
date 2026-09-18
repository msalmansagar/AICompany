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
 *
 * **The class names here are the prototype's, not new ones.** `.app`, `.app-header`, `.app-title`,
 * `.cmdbar`/`.cmd`, `.nav`/`.nav-item`, `.content`/`.scroll`/`.page` are what the ported stylesheets
 * define. The first version of this file invented a parallel `.uci-*` vocabulary, so the ported CSS
 * matched nothing and the workspace rendered as unstyled HTML inside Dynamics. A class name is part
 * of the contract with the design, not an implementation detail of the component.
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
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="env">MSS Collections</span>
          <span className="name">Debt Collection</span>
        </div>
        <div className="header-spacer" />
        <div className="env-name" data-testid="environment">
          {context.organizationUniqueName ?? 'CRM'}
        </div>
        <div className="header-spacer" />

        <div className="header-search">
          <Icon name="search" />
          <input type="search" placeholder="Search customer, case or QID" aria-label="Search" />
        </div>

        <div className="role-pick" title="The working role. Presentation only — CRM security decides what you may read.">
          <span className="rp-lbl">Role</span>
          <select
            className="fluent-select"
            value={role}
            aria-label="Working role"
            data-testid="role-switcher"
            onChange={e => setRole(e.target.value as typeof role)}
          >
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="role-pick" title="Which CRM's records are in scope">
          <span className="rp-lbl">CRM</span>
          <select
            className="fluent-select"
            value={scope}
            aria-label="Organisation scope"
            data-testid="org-scope"
            onChange={e => setScope(e.target.value as typeof scope)}
          >
            <option value="all">Both CRMs</option>
            <option value="HL">Housing Loan</option>
            <option value="BFD">BFD</option>
          </select>
        </div>

        <div className="avatar" title={context.userName}>{initialsOf(context.userName)}</div>
      </header>

      <div className="body">
        <NavRail views={visible} activeId={route.view.id} onNavigate={route.go} />
        <main className="content">
          {commands && <div className="cmdbar" role="toolbar" aria-label="Commands">{commands}</div>}
          <div className="scroll">
            <div className="page" data-testid="content" data-view={route.view.id}>
              <div className="page-head">
                <div>
                  <h1>{route.view.label}</h1>
                  <div className="page-sub">{route.view.group}</div>
                </div>
              </div>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** The avatar shows initials, as the prototype does — a full name does not fit a 28px circle. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
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
    <nav className="nav" aria-label="Workspace navigation" data-testid="nav-rail">
      <div className="nav-scroll">
        {GROUP_ORDER.map(group => {
          const inGroup = views.filter(v => v.group === group);
          if (inGroup.length === 0) return null;
          return (
            <div key={group}>
              <div className="nav-group-label">{group}</div>
              {inGroup.map(view => (
                <button
                  key={view.id}
                  type="button"
                  className={view.id === activeId ? 'nav-item active' : 'nav-item'}
                  data-testid={`nav-${view.id}`}
                  data-pending={isPending(view) ? String(view.phase) : undefined}
                  aria-current={view.id === activeId ? 'page' : undefined}
                  onClick={() => onNavigate(view.id)}
                >
                  <Icon name={view.icon} />
                  <span>{view.label}</span>
                  {isPending(view) && (
                    <span className="nav-count" title={`Phase ${view.phase} owns this functionality`}>
                      P{view.phase}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
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
      className="cmd"
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

/** A divider between command groups, as the prototype's command bar uses. */
export function CommandSeparator() {
  return <div className="cmd-sep" />;
}
