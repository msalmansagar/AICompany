import { findView, isPending, viewsForRole, type RoleKey, type ViewDefinition } from '../../shell/routes.js';

/**
 * Workspace V2's navigation, drawn from the real route table.
 *
 * Every entry is an existing route: V2 groups and names them for the officer's day (the reference's
 * *Work · Customer · Resolution · Control*), but adds no module and invents no screen. Role filtering
 * is the route table's own, and a route that is still pending is left out rather than advertised —
 * except Restructuring, which is shown as **parked**, because QDB parked it and the workspace says so.
 */

export interface V2NavItem {
  id: string;
  label: string;
  icon: string;
  isParked: boolean;
}

export interface V2NavGroup {
  label: string;
  items: readonly V2NavItem[];
}

/**
 * V2's order and wording for **every** route in the table. The id is the shared route; the label is
 * V2's. Pending routes are listed too, so the filter below — not an omission here — keeps them out.
 */
const LAYOUT: readonly { label: string; items: readonly (readonly [string, string])[] }[] = [
  { label: 'Work', items: [['myday', 'My Day'], ['queues', 'Work Queues'], ['cases', 'Collection Cases']] },
  {
    label: 'Customer',
    items: [['customer', 'Customer 360'], ['ptp', 'Promise to Pay'], ['comms', 'Communications'], ['templates', 'Templates']],
  },
  {
    label: 'Resolution',
    items: [['disputes', 'Disputes'], ['legal', 'Legal'], ['claims', 'Deceased Review'], ['restructure', 'Restructuring']],
  },
  { label: 'Strategy', items: [['actionplan', 'Action Plan'], ['buckets', 'Segmentation'], ['rules', 'Strategy Rules']] },
  {
    label: 'Control',
    items: [
      ['dashboards', 'Dashboards'], ['mis', 'Portfolio MIS'], ['approvals', 'Approvals'], ['audit', 'Audit Trail'],
      ['intake', 'Delinquency Intake'], ['admin', 'Configuration'],
    ],
  },
];

/** The groups a role sees, each holding only routes that exist, are permitted, and are built or parked. */
export function navigationFor(role: RoleKey): readonly V2NavGroup[] {
  const permitted = new Set(viewsForRole(role).map(view => view.id));
  return LAYOUT
    .map(group => ({
      label: group.label,
      items: group.items.flatMap(([id, label]) => toItem(findView(id), label, permitted)),
    }))
    .filter(group => group.items.length > 0);
}

function toItem(view: ViewDefinition | undefined, label: string, permitted: ReadonlySet<string>): V2NavItem[] {
  if (!view || !permitted.has(view.id)) return [];
  const isParked = view.isParked === true;
  if (isPending(view) && !isParked) return [];
  return [{ id: view.id, label, icon: view.icon, isParked }];
}

/**
 * Which entry is current. A case is reached from a list, so the case view highlights Cases — the
 * place the officer came from — rather than an entry of its own.
 */
export function activeNavId(viewId: string): string {
  return viewId === 'case' ? 'cases' : viewId;
}

/** The V2 name of a route, for the page title; the route table's own label otherwise. */
export function v2LabelFor(view: ViewDefinition): string {
  for (const group of LAYOUT) {
    const match = group.items.find(([id]) => id === view.id);
    if (match) return match[1];
  }
  return view.id === 'case' ? 'Case' : view.label;
}

/** The group a route belongs to, for the breadcrumb. */
export function v2GroupFor(view: ViewDefinition): string {
  const id = activeNavId(view.id);
  return LAYOUT.find(group => group.items.some(([itemId]) => itemId === id))?.label ?? view.group;
}
