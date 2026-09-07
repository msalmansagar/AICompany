import type { WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';
import { hasRealCondition } from '@/services/routeFilter';

/**
 * The states the engine will refuse to store, checked before anything is written.
 *
 * This is deliberately narrower than ValidationService. That answers "is this process
 * complete enough to publish?", and a half-built draft must still be saveable. This
 * answers a different question: "will the server reject one of these writes?" — and it
 * matters because the save is a sequence of independent requests with no rollback. A
 * rejection partway through leaves the process, steps and outcomes already written and
 * the routes not, so catching it before the first request is what keeps a failed save
 * from leaving half a process behind.
 *
 * Every rule here mirrors a specific throw in the engine, quoted at the rule.
 */

/** One reason a save would be rejected, and the record it concerns. */
export interface SaveBlocker {
  readonly outcomeId: string;
  readonly routeId?: string;
  readonly message: string;
}

interface RouteState {
  readonly outcomes: Readonly<Record<string, WorkflowOutcome>>;
  readonly routes: Readonly<Record<string, WorkflowRoute>>;
}

/**
 * Finds every state that would be rejected by the engine on save.
 * @param state the outcomes and routes as they stand in the store
 * @returns one blocker per offending record, empty when the save can proceed
 */
export function findSaveBlockers(state: RouteState): SaveBlocker[] {
  const blockers: SaveBlocker[] = [];
  for (const outcome of Object.values(state.outcomes)) {
    const routes = Object.values(state.routes).filter((r) => r.outcomeId === outcome.crmId);
    blockers.push(...findDuplicateDefaults(outcome, routes));
    blockers.push(...findConditionlessRoutes(outcome, routes));
  }
  return blockers;
}

/**
 * Engine: ValidateDefaultCondition throws "You cann't define multiple default
 * conditions" when a second route on the same outcome is flagged as the default.
 */
function findDuplicateDefaults(outcome: WorkflowOutcome, routes: WorkflowRoute[]): SaveBlocker[] {
  const defaults = routes.filter((r) => r.isDefault);
  if (defaults.length < 2) return [];
  const names = defaults.map((r) => `"${r.name || 'unnamed'}"`).join(', ');
  return [{
    outcomeId: outcome.crmId,
    message: `Decision "${outcome.name}" has ${defaults.length} fallback routes (${names}). Only one route can be the fallback.`,
  }];
}

/**
 * Engine: ValidateFilter throws "Please add any condition in filter" for any route not
 * flagged as the default whose filter carries no condition element.
 */
function findConditionlessRoutes(outcome: WorkflowOutcome, routes: WorkflowRoute[]): SaveBlocker[] {
  return routes
    .filter((route) => !route.isDefault && !hasRealCondition(route.filter))
    .map((route) => ({
      outcomeId: outcome.crmId,
      routeId: route.crmId,
      message: `Route "${route.name || 'unnamed'}" on decision "${outcome.name}" has no condition. Give it a condition, or mark it as the fallback.`,
    }));
}

/**
 * Turns blockers into a message that says what to fix rather than how many.
 * @param blockers the blockers found, in discovery order
 * @returns a message for the user, or null when the save can proceed
 */
export function describeSaveBlockers(blockers: readonly SaveBlocker[]): string | null {
  if (blockers.length === 0) return null;
  if (blockers.length === 1) return `Cannot save: ${blockers[0]!.message}`;
  return `Cannot save — ${blockers.length} problems:\n${blockers.map((b) => `• ${b.message}`).join('\n')}`;
}
