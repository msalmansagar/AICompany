import { useState, type ReactNode } from 'react';
import { Icon } from '../components/primitives.js';
import { Sidebar } from '../components/Sidebar.js';
import { ROLE_LABELS, useCrmSession, useOrg, useRole } from './context.js';
import { activeNavigationId, navigationFor, navigationSectionOf, pageTitleOf, type NavigationGroup } from './navigation.js';
import type { RoleKey } from './routes.js';
import { useHashRoute } from './useHashRoute.js';
import { announceHandedOverSearch, handOverSearch } from '../data/workContext.js';
import { initialsOf } from '../components/initials.js';

/** The rail's collapsed state, remembered in this browser — a convenience, never state that matters. */
export const NAV_COLLAPSED_KEY = 'dcp.v1.navCollapsed';

function readCollapsed(): boolean {
  try { return window.localStorage.getItem(NAV_COLLAPSED_KEY) === 'true'; } catch { return false; }
}

function writeCollapsed(value: boolean): void {
  try { window.localStorage.setItem(NAV_COLLAPSED_KEY, String(value)); } catch { /* tolerated: the default returns next time */ }
}

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
  const [isCollapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed(previous => { writeCollapsed(!previous); return !previous; });

  return (
    <div className="app">
      <header className="app-header">
        {/* The navigation toggle, where Power Platform puts it: collapses the sitemap to icons and back. */}
        <button
          type="button" className="icon-btn nav-toggle" onClick={toggleCollapsed}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-pressed={isCollapsed}
          data-testid="nav-toggle"
        >
          <Icon name="menu" />
        </button>
        <div className="app-title">
          <span className="env">MSS Collections</span>
          <span className="name">Debt Collection</span>
        </div>
        <div className="header-spacer" />
        {/*
          The Dynamics organisation unique name used to be rendered here, so every officer saw
          `unq8e28c4d88f8f4c42aa0a31a680cc0` across the top of every screen. It is an internal
          identifier, it means nothing to a Collection Officer, and Phase 7 runtime validation
          raised it as information leakage (KI-93).

          Nothing replaces it. `qdb_environmentcode` was the candidate, but this organisation holds
          two active configurations with two different codes — DEMO-HL-CLOUD and DEMO-BFD-CLOUD —
          while this header is global and the workspace may be scoped to both. Showing one would be
          a label that is wrong half the time, which is worse than no label. The officer already has
          what they need: the CRM scope picker names which organisations are in view, and Dynamics'
          own chrome marks the environment.
        */}

        <HeaderSearch onSearch={term => searchCases(term, route.view.id === 'cases', route.go)} />

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
        <NavRail
          role={role} activeId={route.view.id} onNavigate={route.go} isCollapsed={isCollapsed}
          header={<RailBrand scope={scope} />}
          profile={<RailProfile userName={context.userName} roleLabel={ROLE_LABELS[role]} />}
        />
        <main className="content">
          {commands && <div className="cmdbar" role="toolbar" aria-label="Commands">{commands}</div>}
          <div className="scroll">
            <div className="page" data-testid="content" data-view={route.view.id}>
              <div className="page-head">
                <div>
                  <h1>{pageTitleOf(route.view, route.recordId)}</h1>
                  <div className="page-sub">{navigationSectionOf(route.view)}</div>
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

/**
 * The header search (WP6; it used to do nothing). Enter takes the term to Collection Cases, which
 * searches case number and customer id there — V1's identifier search — and a row opens the case.
 */
function HeaderSearch({ onSearch }: { onSearch: (term: string) => void }) {
  const [term, setTerm] = useState('');
  return (
    <form className="header-search" role="search" onSubmit={event => { event.preventDefault(); if (term.trim()) onSearch(term.trim()); }}>
      <Icon name="search" />
      <input
        type="search" placeholder="Case number or customer id" aria-label="Search collection cases by case number or customer id"
        value={term} onChange={event => setTerm(event.target.value)} data-testid="header-search"
      />
    </form>
  );
}

/**
 * Hands the term to Collection Cases. On another page the route change mounts the list, which takes
 * it; on Collection Cases itself the route does not change, so the open list is told instead.
 */
function searchCases(term: string, isOnCases: boolean, go: (viewId: string) => void): void {
  handOverSearch(term);
  if (isOnCases) announceHandedOverSearch();
  else go('cases');
}

/**
 * The left navigation: the shared business model (`navigation.ts`), drawn in the prototype's rail.
 *
 * V2 draws the same sections, words and order in its own style. Nothing here decides what is
 * offered; it only renders what the model offers this role.
 */
export function NavRail({ role, activeId, onNavigate, isCollapsed = false, header, profile }: {
  role: RoleKey;
  activeId: string;
  onNavigate: (viewId: string) => void;
  /** Icons only; every entry keeps its name as a tooltip so nothing becomes unreachable by name. */
  isCollapsed?: boolean;
  /** The fixed header above the menu — the product and the CRM scope. */
  header?: ReactNode;
  /** The fixed footer below the menu — who is signed in. Always visible, never scrolled to. */
  profile?: ReactNode;
}) {
  const groups: readonly NavigationGroup[] = navigationFor(role);
  const current = activeNavigationId(activeId, role);
  return (
    <Sidebar
      className={isCollapsed ? 'nav collapsed' : 'nav'} label="Workspace navigation" testId="nav-rail" data-collapsed={String(isCollapsed)}
      header={header ?? null} {...(profile !== undefined ? { profile } : {})}
      regionClassNames={{ nav: 'nav-scroll' }}
    >
      <>
        {groups.map(group => (
          <div key={group.section} role="group" aria-label={group.section}>
            <div className="nav-group-label">{group.section}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                type="button"
                className={item.id === current ? 'nav-item active' : 'nav-item'}
                data-testid={`nav-${item.id}`}
                aria-current={item.id === current ? 'page' : undefined}
                title={item.label}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </>
    </Sidebar>
  );
}

/** The rail's fixed header: the product and the CRM scope in view, in the prototype's type. */
function RailBrand({ scope }: { scope: string }) {
  return (
    <div className="nav-brand">
      <span className="nav-brand-name">Debt Collection</span>
      <span className="nav-brand-scope">{RAIL_SCOPE_LABELS[scope] ?? scope}</span>
    </div>
  );
}

/** The rail's fixed footer: who is signed in and the working role. Long names truncate, never wrap the rail. */
function RailProfile({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  return (
    <div className="nav-user" title={`${userName} · ${roleLabel}`} data-testid="nav-user">
      <span className="nav-user-avatar" aria-hidden="true">{initialsOf(userName)}</span>
      <span className="nav-user-meta">
        <span className="nav-user-name">{userName}</span>
        <span className="nav-user-role">{roleLabel}</span>
      </span>
    </div>
  );
}

const RAIL_SCOPE_LABELS: Readonly<Record<string, string>> = { all: 'HL + BFD', HL: 'Housing Loan', BFD: 'BFD' };

/**
 * A command bar button.
 *
 * `pendingPhase` renders it disabled with a tooltip naming the owning phase, which is how the
 * approved command set stays visible without anything pretending to work.
 */
export function Command({ icon, label, onClick, pendingPhase, disabledReason }: {
  icon: string;
  label: string;
  onClick?: () => void;
  pendingPhase?: number;
  /**
   * Why an implemented command is unavailable *here*.
   *
   * Distinct from `pendingPhase`, which means the capability does not exist yet. "Open a case first"
   * and "Phase 7 owns this" are different statements, and a command bar that made them look the same
   * would teach a user that half of it is permanently dead.
   */
  disabledReason?: string;
}) {
  const disabled = pendingPhase !== undefined || disabledReason !== undefined;
  const title = pendingPhase !== undefined
    ? 'Not available yet'
    : disabledReason ?? label;
  return (
    <button
      type="button"
      className="cmd"
      disabled={disabled}
      data-testid={`cmd-${label.toLowerCase().replace(/\s+/g, '-')}`}
      title={title}
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
