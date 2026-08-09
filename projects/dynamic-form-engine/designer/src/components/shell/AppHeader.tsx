// The 48px app bar. Model-driven shape: waffle, product name, then the controls
// that stay reachable from every screen — including from inside the form editor,
// where the sitemap is hidden and this is the only chrome left.

import React, { useState } from 'react';
import { AppearanceMenu } from './AppearanceMenu';

interface AppHeaderProps {
  /** Shown as the avatar's initials and title. Absent outside CRM. */
  userFullName?: string;
  onToggleNav: () => void;
  isNavVisible: boolean;
}

/** Up to two initials, so "Mohammad Salman Sagar" reads as MS rather than MSS. */
function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.slice(0, 2).map((word) => word[0]);
  return letters.join('').toUpperCase();
}

function WaffleIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <g fill="currentColor">
        {[3, 9, 15].map((y) => [3, 9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
      </g>
    </svg>
  );
}

function PaletteIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 1.5A7.5 7.5 0 001.5 9c0 3.6 3 5.5 5.7 5.1 1-.15 1.3-1.2.7-1.9-.6-.7-.2-1.7.7-1.7H12a4.5 4.5 0 004.5-4.5C16.5 3.9 13 1.5 9 1.5zM5 8a1 1 0 110-2 1 1 0 010 2zm2.6-2.6a1 1 0 110-2 1 1 0 010 2zm3.8 0a1 1 0 110-2 1 1 0 010 2zM13 8a1 1 0 110-2 1 1 0 010 2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AppHeader({ userFullName, onToggleNav, isNavVisible }: AppHeaderProps): React.ReactElement {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="app-header">
      <button
        type="button"
        className="waffle"
        onClick={onToggleNav}
        title="Show or hide navigation"
        aria-label="Show or hide navigation"
        aria-expanded={isNavVisible}
      >
        <WaffleIcon />
      </button>
      <div className="header-accent" />
      <div className="app-title">
        <span className="env">Power Apps</span>
        <span className="name">Form Designer</span>
      </div>
      <div className="header-spacer" />
      <button
        type="button"
        className="icon-btn"
        title="Change appearance"
        aria-label="Change appearance"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        // Without this the document listener the menu installs would see the very
        // click that opened it and close it again.
        onClick={(event) => {
          event.stopPropagation();
          setIsMenuOpen((open) => !open);
        }}
      >
        <PaletteIcon />
      </button>
      {isMenuOpen && <AppearanceMenu onDismiss={() => setIsMenuOpen(false)} />}
      {userFullName && (
        <div className="avatar" title={userFullName}>
          {initialsOf(userFullName)}
        </div>
      )}
    </header>
  );
}
