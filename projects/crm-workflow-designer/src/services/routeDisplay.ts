import { conditionLabel } from './WorkflowGraphBuilder';
import { hasRealCondition } from './routeFilter';

/**
 * The one voice for what a route calls itself (CWFD-019 PR2).
 *
 * Route language used to be decided independently by four builders and the
 * label-resolution effect, which is how "∕ else" reached business users. The
 * rules live here now:
 *
 * - NAME FIRST. A named route shows its name and nothing else — "CEO Route",
 *   not "CEO Route: Approval Authority = CEO AND …". The full condition
 *   belongs to the Decision and Route panels, which already render it with
 *   fetchXmlReadable.
 * - The default route says "Default" — business language, not "/else". Its
 *   calm green dashed styling still marks it apart on the canvas.
 * - Only a NAMELESS conditional route shows its condition, short.
 */

const MAX_CANVAS_LABEL_CHARS = 34;

/** What a default route is, spelled out for panels and tooltips. */
export const DEFAULT_ROUTE_DESCRIPTION = 'Default — used when no other route matches';

export interface RouteLabelSource {
  name: string;
  filter: string;
  isDefault: boolean;
}

/** Clamps a label to canvas width; the panels always carry the full text. */
export function truncateRouteLabel(value: string): string {
  return value.length > MAX_CANVAS_LABEL_CHARS
    ? `${value.slice(0, MAX_CANVAS_LABEL_CHARS - 1)}…`
    : value;
}

/** The label a route edge wears on any canvas. */
export function routeCanvasLabel(route: RouteLabelSource): string {
  const name = route.name?.trim();
  if (route.isDefault) return truncateRouteLabel(name || 'Default');
  if (name) return truncateRouteLabel(name);
  if (hasRealCondition(route.filter)) {
    const condition = conditionLabel(route.filter);
    if (condition && condition !== 'else') return truncateRouteLabel(condition);
  }
  return 'Route';
}

/**
 * Whether the async metadata-resolved condition should replace this route's
 * canvas label: only when the route has no name of its own — a name always
 * wins, and Default stays Default.
 */
export function wantsResolvedConditionLabel(route: RouteLabelSource): boolean {
  return !route.isDefault && !route.name?.trim();
}
