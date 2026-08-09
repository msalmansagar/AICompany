import { useState, type ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { SitemapNav, type NavDestination } from './SitemapNav';
import { useTheme } from '@/theme/ThemeProvider';

interface AppShellProps {
  environmentLabel: string;
  /** Shown above the header when the designer is running outside CRM. */
  banner?: ReactNode;
  active: NavDestination;
  onNavigate: (destination: NavDestination) => void;
  sopEnabled: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  userInitials: string;
  /**
   * Hides the sitemap while a process is open, so the editor and the read-only
   * canvas get the full width they need. The header stays: a maker still has to
   * be able to change theme from inside the editor.
   */
  navHidden?: boolean;
  children: ReactNode;
}

export function AppShell({
  environmentLabel,
  banner,
  active,
  onNavigate,
  sopEnabled,
  search,
  onSearchChange,
  userInitials,
  navHidden = false,
  children,
}: AppShellProps) {
  const { theme, setTheme } = useTheme();
  const [isNavCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="app-shell">
      {banner ?? <div />}
      <AppHeader
        environmentLabel={environmentLabel}
        theme={theme}
        onThemeChange={setTheme}
        onToggleNav={() => setNavCollapsed((collapsed) => !collapsed)}
        search={search}
        onSearchChange={onSearchChange}
        userInitials={userInitials}
      />
      <div className="app-body" style={navHidden ? { gridTemplateColumns: '1fr' } : undefined}>
        {!navHidden && (
          <SitemapNav
            active={active}
            onNavigate={onNavigate}
            collapsed={isNavCollapsed}
            sopEnabled={sopEnabled}
          />
        )}
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
