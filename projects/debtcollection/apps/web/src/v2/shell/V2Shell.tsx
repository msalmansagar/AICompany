import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '../../components/primitives.js';
import { ROLE_LABELS, useCrmSession, useOrg, useRole } from '../../shell/context.js';
import type { Route } from '../../shell/useHashRoute.js';
import { useWorkspaceVersion } from '../version/WorkspaceVersionRoot.js';
import { activeNavId, navigationFor, v2GroupFor, v2LabelFor } from './v2Navigation.js';

/**
 * The V2 application shell: navy navigation rail, a sticky header, and the page.
 *
 * The rail collapses to icons (the user's choice, remembered in this browser, and automatically on a
 * narrower window) and becomes a drawer on a small one. The header's search is real — it opens the
 * case list searched by case number or customer id — and the scope and role pickers are the same ones
 * V1 uses, so both versions read the same records.
 */

type Go = (viewId: string, recordId?: string, tab?: string) => void;

interface V2ShellContextValue {
  /** A search asked for from the header, for the case list to pick up once. */
  search: string;
  setSearch: (term: string) => void;
  go: Go;
}

const V2ShellContext = createContext<V2ShellContextValue | null>(null);

export function useV2Shell(): V2ShellContextValue {
  const value = useContext(V2ShellContext);
  if (!value) throw new Error('useV2Shell must be used inside the V2 shell.');
  return value;
}

const COLLAPSE_KEY = 'dcp.v2.navCollapsed';

export function V2Shell({ route, children }: { route: Route & { go: Go }; children: ReactNode }) {
  const [isCollapsed, setCollapsed] = useState(() => readFlag(COLLAPSE_KEY));
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const main = useRef<HTMLElement | null>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(previous => { writeFlag(COLLAPSE_KEY, !previous); return !previous; });
  }, []);

  const navigate = useCallback<Go>((viewId, recordId, tab) => {
    setDrawerOpen(false);
    route.go(viewId, recordId, tab);
  }, [route]);

  const context = useMemo(() => ({ search, setSearch, go: navigate }), [search, navigate]);

  return (
    <V2ShellContext.Provider value={context}>
      <div
        className="v2-shell"
        data-collapsed={String(isCollapsed)}
        data-drawer={isDrawerOpen ? 'open' : 'closed'}
        data-testid="v2-shell"
      >
        {/* A button, not an anchor: an in-page link would change the hash, and the hash is the route. */}
        <button type="button" className="v2-skip" onClick={() => main.current?.focus()} data-testid="v2-skip">
          Skip to content
        </button>
        <button
          type="button" className="v2-scrim" aria-label="Close navigation" tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
        />
        <V2Nav activeId={activeNavId(route.view.id)} onNavigate={navigate} onToggle={toggleCollapsed} isCollapsed={isCollapsed} />
        <div className="v2-main">
          <V2Header route={route} onOpenDrawer={() => setDrawerOpen(true)} />
          <main ref={main} tabIndex={-1} className="v2-page" data-testid="v2-content" data-view={route.view.id}>{children}</main>
        </div>
      </div>
    </V2ShellContext.Provider>
  );
}

function V2Nav({ activeId, onNavigate, onToggle, isCollapsed }: {
  activeId: string; onNavigate: Go; onToggle: () => void; isCollapsed: boolean;
}) {
  const { role } = useRole();
  const { scope } = useOrg();
  const { context } = useCrmSession();
  const groups = navigationFor(role);

  return (
    <nav className="v2-nav" aria-label="Workspace">
      <div className="v2-nav-brand">
        <span className="v2-nav-logo" aria-hidden="true">DC</span>
        <span className="v2-nav-brandtext">
          <span className="v2-nav-title">Collections</span>
          <span className="v2-nav-sub">{SCOPE_LABELS[scope]}</span>
        </span>
      </div>

      <div className="v2-nav-groups">
        {groups.map(group => (
          <div key={group.label} className="v2-nav-group" role="group" aria-label={group.label}>
            <div className="v2-nav-section">{group.label}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                type="button"
                className="v2-nav-item"
                aria-current={item.id === activeId ? 'page' : undefined}
                title={item.label}
                data-testid={`v2-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} className="v2-nav-icon" />
                <span className="v2-nav-label">{item.label}</span>
                {item.isParked && <span className="v2-nav-badge">Parked</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <button
        type="button" className="v2-nav-toggle" onClick={onToggle}
        aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        data-testid="v2-nav-toggle"
      >
        <Icon name={isCollapsed ? 'forward' : 'back'} className="v2-nav-icon" />
        <span className="v2-nav-label">Collapse</span>
      </button>

      <div className="v2-nav-user" title={context.userName}>
        <span className="v2-nav-avatar" aria-hidden="true">{initialsOf(context.userName)}</span>
        <span className="v2-nav-usermeta">
          <span className="v2-nav-username">{context.userName}</span>
          <span className="v2-nav-sub">{ROLE_LABELS[role]}</span>
        </span>
      </div>
    </nav>
  );
}

function V2Header({ route, onOpenDrawer }: { route: Route; onOpenDrawer: () => void }) {
  const { setSearch, go } = useV2Shell();
  const { role, setRole } = useRole();
  const { scope, setScope } = useOrg();
  const [term, setTerm] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    setSearch(trimmed);
    go('cases');
  };

  return (
    <header className="v2-header">
      <button type="button" className="v2-burger" aria-label="Open navigation" onClick={onOpenDrawer}>
        <Icon name="grid" className="v2-nav-icon" />
      </button>
      <div className="v2-header-title">
        <div className="v2-crumb">{v2GroupFor(route.view)}</div>
        <h1 className="v2-title">{v2LabelFor(route.view)}</h1>
      </div>
      <div className="v2-header-tools">
        <form className="v2-search" role="search" onSubmit={submit}>
          <Icon name="search" className="v2-search-icon" />
          <input
            className="v2-search-input" type="search" value={term} onChange={e => setTerm(e.target.value)}
            placeholder="Search cases, customers, facilities" aria-label="Search cases by case number, customer name or id, or facility number"
            data-testid="v2-search"
          />
        </form>
        <label className="v2-picker" title="Which CRM's records are in scope">
          <span className="v2-picker-label">CRM</span>
          <select className="v2-select" value={scope} onChange={e => setScope(e.target.value as typeof scope)} data-testid="v2-org-scope">
            <option value="all">Both CRMs</option>
            <option value="HL">Housing Loan</option>
            <option value="BFD">BFD</option>
          </select>
        </label>
        <label className="v2-picker" title="The working role. Presentation only — CRM security decides what you may read.">
          <span className="v2-picker-label">Role</span>
          <select className="v2-select" value={role} onChange={e => setRole(e.target.value as typeof role)} data-testid="v2-role">
            {Object.entries(ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button
          type="button" className="v2-btn v2-btn-subtle" onClick={() => window.location.reload()}
          title="Read everything again from CRM" aria-label="Refresh"
        >
          <Icon name="refresh" className="v2-btn-icon" />
        </button>
        <VersionSwitch />
      </div>
    </header>
  );
}

/** The temporary V1 / V2 switch. Changes the presentation only, in place. */
export function VersionSwitch() {
  const { version, switchTo } = useWorkspaceVersion();
  return (
    <div className="v2-segmented" role="group" aria-label="Workspace version">
      {(['v1', 'v2'] as const).map(option => (
        <button
          key={option}
          type="button"
          className="v2-segment"
          aria-pressed={version === option}
          onClick={() => switchTo(option)}
          data-testid={option === 'v1' ? 'switch-to-v1' : 'switch-to-v2'}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  all: 'HL + BFD', HL: 'Housing Loan', BFD: 'BFD',
};

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '·';
}

/** A per-browser convenience; blocked storage simply means the default. */
function readFlag(key: string): boolean {
  try { return window.localStorage.getItem(key) === 'true'; } catch { return false; }
}

function writeFlag(key: string, value: boolean): void {
  try { window.localStorage.setItem(key, String(value)); } catch { /* tolerated: the default returns next time */ }
}
