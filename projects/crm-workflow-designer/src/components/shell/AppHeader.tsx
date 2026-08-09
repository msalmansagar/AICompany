import { useState } from 'react';
import { ThemeMenu } from './ThemeMenu';
import type { ThemeName } from '@/theme/ThemeProvider';

interface AppHeaderProps {
  /** The environment the designer is pointed at, shown beside the product name. */
  environmentLabel: string;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onToggleNav: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Initials for the signed-in user, when the host tells us who that is. */
  userInitials: string;
}

export function AppHeader({
  environmentLabel,
  theme,
  onThemeChange,
  onToggleNav,
  search,
  onSearchChange,
  userInitials,
}: AppHeaderProps) {
  const [isThemeMenuOpen, setThemeMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <button type="button" className="waffle" onClick={onToggleNav} title="Toggle navigation" aria-label="Toggle navigation">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          {[1, 7, 13].flatMap((y) => [1, 7, 13].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" fill="currentColor" />
          )))}
        </svg>
      </button>

      <span className="header-accent" aria-hidden="true" />

      <div className="app-title">
        <span className="name">Process Engine</span>
        <span className="env" title={environmentLabel}>{environmentLabel}</span>
      </div>

      <span className="header-spacer" />

      <div className="header-search">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={search}
          placeholder="Search processes"
          aria-label="Search processes"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="icon-btn"
        title="Theme"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={isThemeMenuOpen}
        onClick={() => setThemeMenuOpen((open) => !open)}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M10 2.5a7.5 7.5 0 000 15c.9 0 1.5-.7 1.5-1.5 0-.4-.16-.75-.4-1a1.5 1.5 0 011.1-2.5H14a3.5 3.5 0 003.5-3.5C17.5 5.2 14.1 2.5 10 2.5z"
            stroke="currentColor" strokeWidth="1.4" fill="none"
          />
          <circle cx="6.75" cy="9" r="1.1" fill="currentColor" />
          <circle cx="9" cy="6" r="1.1" fill="currentColor" />
          <circle cx="12.5" cy="6.75" r="1.1" fill="currentColor" />
        </svg>
      </button>

      <span className="avatar" title="Signed in">{userInitials}</span>

      {isThemeMenuOpen && (
        <ThemeMenu theme={theme} onSelect={onThemeChange} onDismiss={() => setThemeMenuOpen(false)} />
      )}
    </header>
  );
}
