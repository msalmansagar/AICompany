import type { ReactNode } from 'react';

/**
 * The sidebar's vertical contract, shared by V1 and V2 (user instruction, 2026-09-28).
 *
 * Three regions in a flex column: a fixed header, a navigation region that takes the remaining
 * height and is the **only** thing that scrolls, and a fixed profile footer. Whatever the viewport
 * height, the header and the signed-in user stay visible and the menu shrinks and scrolls instead.
 * The behaviour lives in `styles/sidebar.css`; each workspace passes its own classes for the look,
 * so the two rails share the contract and nothing of the styling.
 */
export function Sidebar({ className, label, header, profile, children, regionClassNames = {}, testId = 'sidebar', ...attributes }: {
  className: string;
  label: string;
  header: ReactNode;
  profile?: ReactNode;
  children: ReactNode;
  /** The workspace's own classes for the three regions, beside the shared behavioural ones. */
  regionClassNames?: { header?: string; nav?: string; profile?: string };
  testId?: string;
  'data-collapsed'?: string;
}) {
  return (
    <nav className={`sidebar ${className}`} aria-label={label} data-testid={testId} {...attributes}>
      <div className={joined('sidebar-header', regionClassNames.header)} data-testid={`${testId}-header`}>{header}</div>
      <div className={joined('sidebar-nav', regionClassNames.nav)} data-testid={`${testId}-nav`}>{children}</div>
      {profile !== undefined && (
        <div className={joined('sidebar-profile', regionClassNames.profile)} data-testid={`${testId}-profile`}>{profile}</div>
      )}
    </nav>
  );
}

function joined(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base;
}
