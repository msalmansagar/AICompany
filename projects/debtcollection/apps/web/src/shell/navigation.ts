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

export type NavigationSection = 'My Work' | 'Insights' | 'Manager' | 'Administration';

/** Section order, as the canonical model lays it out (WP2 officer simplification, 2026-10-06). */
export const NAVIGATION_SECTIONS: readonly NavigationSection[] = ['My Work', 'Insights', 'Manager', 'Administration'];

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
const MANAGER_ONLY: readonly RoleKey[] = ['manager'];
const ADMINISTRATION: readonly RoleKey[] = ['manager'];

/**
 * The officer's primary navigation is My Work + Insights and nothing else.
 *
 * Action Plan, Promise to Pay, Communications, Disputes, Legal Hand-off and Deceased Review are no
 * longer primary entries for an officer. **Their routes and screens are untouched**: an officer
 * reaches them from the case (Promises, Communications, Action Plan and Workout & Legal tabs) and
 * from Work Queues (the Disputes, Legal and Deceased Review buckets, and the Promise to Pay link).
 * `CONTEXTUAL_ROUTES` below records where each one is reached from, and a test holds it to that.
 */
export const NAVIGATION: readonly NavigationEntry[] = [
  { id: 'myday', label: 'My Day', section: 'My Work', icon: 'home' },
  { id: 'queues', label: 'Work Queues', section: 'My Work', icon: 'queue' },
  { id: 'cases', label: 'Collection Cases', section: 'My Work', icon: 'case' },
  { id: 'customer', label: 'Customers', section: 'My Work', icon: 'users' },

  { id: 'dashboards', label: 'Dashboards', section: 'Insights', icon: 'chart' },

  // No "Team Work" entry: no screen shows a team's work yet, and an entry must not promise one.
  { id: 'approvals', label: 'Approvals', section: 'Manager', icon: 'approve', roles: SUPERVISION, isAdvertisedWhilePending: true },
  { id: 'buckets', label: 'Portfolio & Strategy', section: 'Manager', icon: 'strategy', roles: SUPERVISION },
  // The portfolio list of strategy actions is strategy configuration, not officer work; the plan
  // for one case is on that case. Kept here so the portfolio list is not orphaned.
  { id: 'actionplan', label: 'Action Plan', section: 'Manager', icon: 'check', roles: SUPERVISION },
  // Bulk SMS & Email runs. One customer's messages are sent from the case's Communications tab.
  { id: 'comms', label: 'Communications', section: 'Manager', icon: 'send', roles: MANAGER_ONLY },
  { id: 'audit', label: 'Audit Trail', section: 'Manager', icon: 'audit', roles: MANAGER_ONLY },

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

/**
 * Every built route that is not a primary entry for an officer, and where the officer reaches it.
 * Moving an entry out of the navigation must never make its screen unreachable.
 */
export const CONTEXTUAL_ROUTES: Readonly<Record<string, { parent: string; reachedFrom: string }>> = {
  case: { parent: 'cases', reachedFrom: 'any case number in a list, preview, queue, My Day or Customer 360' },
  // An officer works the plan of one case, on that case. The portfolio list of every strategy action
  // is a Manager entry; an officer can still open it by URL, and CRM decides what it shows.
  actionplan: { parent: 'cases', reachedFrom: 'the case\'s Action Plan (that case\'s plan); the portfolio list from Manager › Action Plan' },
  ptp: { parent: 'queues', reachedFrom: 'the case\'s Promises tab, Work Queues › Promise to Pay, and My Day' },
  comms: { parent: 'cases', reachedFrom: 'the case\'s Communications tab (which also opens Bulk SMS & Email)' },
  disputes: { parent: 'queues', reachedFrom: 'Work Queues › Disputes, and the case\'s Workout & Legal tab' },
  legal: { parent: 'queues', reachedFrom: 'Work Queues › Legal, and the case\'s Workout & Legal tab' },
  claims: { parent: 'queues', reachedFrom: 'Work Queues › Deceased Review, and the case\'s Workout & Legal tab' },
};

/**
 * Which entry is current. A contextual route highlights the primary entry it is reached from, so the
 * officer always sees where they are in the navigation they have.
 */
export function activeNavigationId(viewId: string, role: RoleKey = 'officer'): string {
  const isOffered = navigationFor(role).some(group => group.items.some(item => item.id === viewId));
  if (isOffered) return viewId;
  return CONTEXTUAL_ROUTES[viewId]?.parent ?? viewId;
}

/** A page's heading: one customer is "Customer 360"; the list of them is "Customers". */
export function pageTitleOf(view: ViewDefinition, recordId?: string): string {
  if (view.id === 'customer' && recordId) return 'Customer 360';
  return navigationLabelOf(view);
}

/** The business name of a route — the navigation's word for it, or the route table's own. */
export function navigationLabelOf(view: ViewDefinition): string {
  return NAVIGATION.find(entry => entry.id === view.id)?.label ?? view.label;
}

/** The section a route belongs to, for a breadcrumb or a page subtitle. */
export function navigationSectionOf(view: ViewDefinition): NavigationSection {
  const entry = NAVIGATION.find(candidate => candidate.id === view.id)
    ?? NAVIGATION.find(candidate => candidate.id === CONTEXTUAL_ROUTES[view.id]?.parent);
  return entry?.section ?? view.group;
}
