import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { isTemporaryId } from '@/services/assertGuid';

/**
 * Decides what a save can do with one route, before anything is written.
 *
 * This exists because the save loop used to answer the question inline with a bare
 * `continue`, which conflated two very different situations: a route the engine is
 * perfectly happy with (no next step — a legal dead end, and one exists on the org
 * today) and a route that genuinely cannot be written yet because the record it hangs
 * off never persisted. Both were dropped, and the save still reported success.
 *
 * Separating the decision from the writing makes it testable, and makes an unsaveable
 * route something the caller has to deal with rather than something it can ignore.
 */

/** New ids and dirty ids as the store tracks them, plus the maps built during a save. */
export interface RouteSaveContext {
  readonly outcomeIdMap: Readonly<Record<string, string>>;
  readonly stepIdMap: Readonly<Record<string, string>>;
  readonly newIds: readonly string[];
  readonly dirtyIds: readonly string[];
}

/** Ids resolved from temporary to real, ready to write. */
export interface ResolvedRouteIds {
  readonly outcomeId: string;
  readonly nextStepId: string | null;
}

export type RouteSavePlan =
  | { readonly action: 'create'; readonly ids: ResolvedRouteIds }
  | { readonly action: 'update'; readonly ids: ResolvedRouteIds }
  | { readonly action: 'unchanged' }
  | { readonly action: 'blocked'; readonly reason: string };

/**
 * Works out whether a route can be written, and with which ids.
 * @param route the route as it stands in the store
 * @param context the id maps and dirty tracking for this save
 * @returns what the caller should do with this route
 */
export function planRouteSave(route: WorkflowRoute, context: RouteSaveContext): RouteSavePlan {
  const outcomeId = context.outcomeIdMap[route.outcomeId] ?? route.outcomeId;
  if (!outcomeId || isTemporaryId(outcomeId)) {
    return { action: 'blocked', reason: 'its outcome was not saved' };
  }

  const nextStepId = resolveNextStep(route.nextStepId, context.stepIdMap);
  if (nextStepId !== null && isTemporaryId(nextStepId)) {
    return { action: 'blocked', reason: 'its next step was not saved' };
  }

  const ids: ResolvedRouteIds = { outcomeId, nextStepId };
  if (isTemporaryId(route.crmId) || context.newIds.includes(route.crmId)) {
    return { action: 'create', ids };
  }
  return context.dirtyIds.includes(route.crmId) ? { action: 'update', ids } : { action: 'unchanged' };
}

/**
 * Maps a route's next step through the ids created earlier in this save.
 *
 * A null next step is legal and must survive as null: the engine simply creates no
 * following task, and `ICC Approval Path` on org5869857f is configured that way.
 *
 * @param nextStepId the next step as stored, possibly temporary or absent
 * @param stepIdMap temporary-to-real ids for steps created during this save
 * @returns the real id, or null when the route deliberately leads nowhere
 */
function resolveNextStep(nextStepId: string | null, stepIdMap: Readonly<Record<string, string>>): string | null {
  if (!nextStepId) return null;
  return stepIdMap[nextStepId] ?? nextStepId;
}

/**
 * Describes routes that could not be written, for a message the user can act on.
 * @param blocked route name and reason pairs, in save order
 * @returns a single sentence, or null when everything was written
 */
export function describeBlockedRoutes(blocked: readonly { name: string; reason: string }[]): string | null {
  if (blocked.length === 0) return null;
  const detail = blocked.map((b) => `"${b.name || 'unnamed route'}" (${b.reason})`).join(', ');
  return blocked.length === 1
    ? `1 route was not saved: ${detail}.`
    : `${blocked.length} routes were not saved: ${detail}.`;
}
