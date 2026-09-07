// The sitemap, over the screens that mean something on their own.
//
// Most of the designer's screens do not. The option set, lookup and field label
// editors all open onto "No field selected — return to the designer"; business
// rules read the loaded form's fields; submission mapping and access policies
// read the loaded form itself; and the editor, preview, publish validation,
// version history and new-form wizard are all reached from a form.
//
// Listing any of those would offer a destination that dead-ends until something
// is open, so the sitemap carries only the three that do not: the form list and
// the two libraries. They are reached from inside a form instead, which is where
// they already have their own way back.

import React from 'react';
import type { DesignerScreen } from '@/state/designerStore';

interface SitemapNavProps {
  currentScreen: DesignerScreen;
  onNavigate: (screen: DesignerScreen) => void;
  isCollapsed: boolean;
}

interface NavEntry {
  screen: DesignerScreen;
  label: string;
  path: string;
}

interface NavGroup {
  label: string;
  entries: readonly NavEntry[];
}

// 16x16 stroke paths, matching the reference's weight.
const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Forms',
    entries: [
      { screen: 'form-list', label: 'All Forms', path: 'M2 2h9l3 3v9H2V2zm9 0v3h3M4 8h8M4 10h8M4 12h5' },
    ],
  },
  {
    label: 'Libraries',
    entries: [
      { screen: 'rule-template-editor', label: 'Rule Templates', path: 'M2 3h5l1.5 2H14v8H2V3z' },
      { screen: 'theme-editor', label: 'Themes & Styles', path: 'M8 2a6 6 0 000 12c1 0 1.4-.8.8-1.4-.6-.6-.2-1.6.7-1.6H11a3 3 0 000-6' },
    ],
  },
];

function NavIcon({ path }: { path: string }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function SitemapNav({ currentScreen, onNavigate, isCollapsed }: SitemapNavProps): React.ReactElement {
  return (
    <nav className={isCollapsed ? 'nav collapsed' : 'nav'} aria-label="Designer sections">
      {NAV_GROUPS.map((group) => (
        <React.Fragment key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          {group.entries.map((entry) => {
            const isActive = entry.screen === currentScreen;
            return (
              <button
                key={entry.screen}
                type="button"
                className={isActive ? 'nav-item active' : 'nav-item'}
                onClick={() => onNavigate(entry.screen)}
                aria-current={isActive ? 'page' : undefined}
                // Collapsed, the label is hidden and the icon alone has to say what
                // this is, so the accessible name comes from the title instead.
                title={entry.label}
              >
                <NavIcon path={entry.path} />
                <span>{entry.label}</span>
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );
}
