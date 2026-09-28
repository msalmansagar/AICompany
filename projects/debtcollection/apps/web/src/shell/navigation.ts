import type { IconName } from '../components/icons.js';
import { findView, isPending, type RoleKey, type ViewDefinition } from './routes.js';

/**
 * The one business navigation both workspaces draw (user instruction, 2026-09-28).
 *
 * The left navigation answers *where does the officer need to work?* — the business areas — and
 * nothing else. What can be done with one case is the case workspace's, so Case Detail is not
 * here; what a phase or a component is called is engineering's, so no phase badge is here either.
 * V1 and V2 read this same table and draw it in their own styles: the information architecture,
 * the words, the order and the visibility rules are shared, the look is not.
 *
 * Every entry names an existing route by its id. The route table stays the source of routing
 * truth; this table only says which routes are business work areas, what they are called there,
 * and who sees them. **Seeing an entry authorises nothing**: a user who opens a hidden route by URL
 * gets whatever CRM's own security lets them read, exactly as before.
 */

export type NavigationSection =
  | 'Workspace' | 'Customer' | 'Collection' | 'Resolution' | 'Strategy & Oversight' | 'Control' | 'Administration';

/** Section order, as the canonical model lays it out. Administration holds the manager tools. */
export const NAVIGATION_SECTIONS: readonly NavigationSection[] = [
  'Workspace', 'Customer', 'Collection', 'Resolution', 'Strategy & Oversight', 'Control', 'Administration',
];

export interface NavigationEntry {
  /** The route id, as `routes.ts` defines it. Never renamed here: bookmarks carry it. */
  id: string;
  /** The business name, identical in V1 and V2. */
  label: string;
  section: NavigationSection;
  icon: IconName;
  /** Who sees the entry. Absent means every role. Presentation only — CRM RBAC stays authoritative. */
  roles?: readonly RoleKey[];
  /**
   * Part of the business model although its screen is not built yet. Such an entry is offered and
   * its screen says plainly that it is still to come; every other pending route is left out.
   */
  isAdvertisedWhilePending?: true;
}

const SUPERVISION: readonly RoleKey[] = ['manager', 'rm'];
const CONTROL: readonly RoleKey[] = ['manager'];
const ADMINISTRATION: readonly RoleKey[] = ['manager'];

export const NAVIGATION: readonly NavigationEntry[] = [
  { id: 'myday', label: 'My Day', section: 'Workspace', icon: 'home' },
  { id: 'queues', label: 'Work Queues', section: 'Workspace', icon: 'queue' },
  { id: 'cases', label: 'Collection Cases', section: 'Workspace', icon: 'case' },

  { id: 'customer', label: 'Customer 360', section: 'Customer', icon: 'users' },

  { id: 'actionplan', label: 'Action Plan', section: 'Collection', icon: 'check' },
  { id: 'ptp', label: 'Promise to Pay', section: 'Collection', icon: 'promise' },
  { id: 'comms', label: 'Communications', section: 'Collection', icon: 'send' },

  { id: 'disputes', label: 'Disputes', section: 'Resolution', icon: 'dispute' },
  { id: 'legal', label: 'Legal Hand-off', section: 'Resolution', icon: 'legal' },
  // "Deceased Review", not "Deceased & Claims": the screen is the deceased-review queue and says
  // itself that insurance claims are not offered. The label must not promise more than the page.
  { id: 'claims', label: 'Deceased Review', section: 'Resolution', icon: 'shield' },

  { id: 'buckets', label: 'Portfolio & Strategy', section: 'Strategy & Oversight', icon: 'strategy', roles: SUPERVISION },
  { id: 'dashboards', label: 'Dashboards', section: 'Strategy & Oversight', icon: 'chart', roles: SUPERVISION },
  { id: 'approvals', label: 'Approvals', section: 'Strategy & Oversight', icon: 'approve', roles: SUPERVISION, isAdvertisedWhilePending: true },

  { id: 'audit', label: 'Audit Trail', section: 'Control', icon: 'audit', roles: CONTROL },

  // Manager tools outside the officer's business model, kept reachable rather than orphaned.
  { id: 'intake', label: 'Delinquency Intake', section: 'Administration', icon: 'refresh', roles: ADMINISTRATION },
  { id: 'rules', label: 'Strategy Rules', section: 'Administration', icon: 'settings', roles: ADMINISTRATION },
  { id: 'admin', label: 'Configuration', section: 'Administration', icon: 'settings', roles: ADMINISTRATION },
];

export interface NavigationItem {
  id: string;
  label: string;
  icon: IconName;
}

export interface NavigationGroup {
  section: NavigationSection;
  items: readonly NavigationItem[];
}

/**
 * The navigation a role sees: each section in order, holding only entries whose route exists, that
 * the role may see, and whose screen is built — or advertised while pending. A parked route is
 * never offered; its route and screen stay, so it can be reactivated by listing it here again.
 */
export function navigationFor(role: RoleKey): readonly NavigationGroup[] {
  return NAVIGATION_SECTIONS
    .map(section => ({
      section,
      items: NAVIGATION.filter(entry => entry.section === section && isOffered(entry, role)).map(toItem),
    }))
    .filter(group => group.items.length > 0);
}

function isOffered(entry: NavigationEntry, role: RoleKey): boolean {
  const view = findView(entry.id);
  if (!view || view.isParked) return false;
  if (entry.roles && !entry.roles.includes(role)) return false;
  if (view.roles && !view.roles.includes(role)) return false;
  return !isPending(view) || entry.isAdvertisedWhilePending === true;
}

function toItem(entry: NavigationEntry): NavigationItem {
  return { id: entry.id, label: entry.label, icon: entry.icon };
}

/** Which entry is current. A case is reached from a list, so the case view highlights Collection Cases. */
export function activeNavigationId(viewId: string): string {
  return viewId === 'case' ? 'cases' : viewId;
}

/** The business name of a route — the navigation's word for it, or the route table's own. */
export function navigationLabelOf(view: ViewDefinition): string {
  return NAVIGATION.find(entry => entry.id === view.id)?.label ?? view.label;
}

/** The section a route belongs to, for a breadcrumb or a page subtitle. */
export function navigationSectionOf(view: ViewDefinition): NavigationSection {
  const entry = NAVIGATION.find(candidate => candidate.id === activeNavigationId(view.id));
  return entry?.section ?? view.group;
}
