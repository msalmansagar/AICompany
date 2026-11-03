import type { ReactNode } from 'react';

// The sitemap, in the shape a model-driven app uses: grouped destinations with
// an accent bar on the active one. Destinations are what a maker can navigate
// TO; the editor is not one of them, because it is opened from a process rather
// than chosen from the sitemap.

/** Where the sitemap can take you. */
export type NavDestination =
  | 'processes-all'
  | 'processes-draft'
  | 'processes-published'
  | 'sop-library'
  | 'roles';

interface NavEntry {
  id: NavDestination;
  label: string;
  icon: ReactNode;
}

interface NavGroup {
  label: string;
  entries: NavEntry[];
}

interface SitemapNavProps {
  active: NavDestination;
  onNavigate: (destination: NavDestination) => void;
  collapsed: boolean;
  /** SOP destinations only exist when the adapter can serve them. */
  sopEnabled: boolean;
}

export function SitemapNav({ active, onNavigate, collapsed, sopEnabled }: SitemapNavProps) {
  const groups = buildGroups(sopEnabled);

  return (
    <nav className={collapsed ? 'nav collapsed' : 'nav'} aria-label="Sitemap">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          {group.entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === active ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(entry.id)}
              title={collapsed ? entry.label : undefined}
              aria-current={entry.id === active ? 'page' : undefined}
            >
              {entry.icon}
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function buildGroups(sopEnabled: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: 'Processes',
      entries: [
        { id: 'processes-all', label: 'All processes', icon: <IconFlow /> },
        { id: 'processes-draft', label: 'Drafts', icon: <IconDraft /> },
        { id: 'processes-published', label: 'Published', icon: <IconPublished /> },
      ],
    },
  ];
  if (sopEnabled) {
    groups.push({
      label: 'Standard operating procedures',
      entries: [
        { id: 'sop-library', label: 'SOP library', icon: <IconLibrary /> },
        { id: 'roles', label: 'Roles', icon: <IconRoles /> },
      ],
    });
  }
  return groups;
}

// --- icons (16px, currentColor so they follow the nav item's state) ---

const ICON_PROPS = {
  width: 16, height: 16, viewBox: '0 0 16 16',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconFlow() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="1.5" y="1.5" width="5" height="4" rx="1" />
      <rect x="9.5" y="10.5" width="5" height="4" rx="1" />
      <path d="M4 5.5v4a3 3 0 003 3h2.5" />
    </svg>
  );
}

function IconDraft() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5z" />
      <path d="M9 1.5v4h4" />
    </svg>
  );
}

function IconPublished() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.3 8.2l1.9 1.9 3.6-3.9" />
    </svg>
  );
}

function IconLibrary() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2.5 3.2h3.2a1.8 1.8 0 011.8 1.8v8a1.5 1.5 0 00-1.5-1.5H2.5z" />
      <path d="M13.5 3.2h-3.2a1.8 1.8 0 00-1.8 1.8v8a1.5 1.5 0 011.5-1.5h3.5z" />
    </svg>
  );
}

function IconRoles() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="5.5" r="2.4" />
      <path d="M1.8 13.5c0-2.3 1.9-3.8 4.2-3.8s4.2 1.5 4.2 3.8" />
      <path d="M11 3.6a2.2 2.2 0 010 4.3M12.4 9.9c1.2.5 2 1.6 2 3.1" />
    </svg>
  );
}
