// The sitemap, over the screens a maker navigates to directly.
//
// The editor, preview, publish validation, version history and the new-form
// wizard are deliberately absent: each is reached from a form rather than from
// the sitemap, and listing them would offer a destination that means nothing
// until a form is open.

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
    label: 'Configuration',
    entries: [
      { screen: 'option-set-editor', label: 'Option Sets', path: 'M3 4h10M3 8h10M3 12h10M1.5 4h.01M1.5 8h.01M1.5 12h.01' },
      { screen: 'lookup-config', label: 'Lookups', path: 'M11 11l3 3M7 12A5 5 0 107 2a5 5 0 000 10z' },
      { screen: 'rule-config', label: 'Business Rules', path: 'M3 2h7l3 3v9H3V2zm3 7l1.5 1.5L11 7' },
      { screen: 'rule-template-editor', label: 'Rule Templates', path: 'M2 3h5l1.5 2H14v8H2V3z' },
      { screen: 'submission-mapping', label: 'Submission Mapping', path: 'M3 4h4v3H3V4zm6 5h4v3H9V9zM7 5.5h2v5h0' },
      { screen: 'field-label-editor', label: 'Field Labels', path: 'M2 5h9l3 3-3 3H2V5z' },
    ],
  },
  {
    label: 'Appearance',
    entries: [
      { screen: 'theme-editor', label: 'Themes & Styles', path: 'M8 2a6 6 0 000 12c1 0 1.4-.8.8-1.4-.6-.6-.2-1.6.7-1.6H11a3 3 0 000-6' },
    ],
  },
  {
    label: 'Governance',
    entries: [
      { screen: 'access-policy-editor', label: 'Access Policies', path: 'M8 1.5l5 2v4c0 3-2.2 5.6-5 7-2.8-1.4-5-4-5-7v-4l5-2z' },
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
