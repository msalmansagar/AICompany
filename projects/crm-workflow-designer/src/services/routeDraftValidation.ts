import { hasRealCondition } from '@/services/routeFilter';

/**
 * What a route needs before it can be saved, checked while it is being filled in.
 *
 * Every rule here is one the route would otherwise fail later and less helpfully: two
 * are refused by the engine, one is dropped by the save path. Checking them on the form
 * turns a rejected write into a disabled button next to the field that is wrong.
 */

/** A route being filled in on the Route Configuration screen. */
export interface RouteDraft {
  readonly name: string;
  readonly sequenceNumber: number;
  readonly nextStepId: string | null;
  readonly isDefault: boolean;
  readonly filter: string;
}

/** Which field a problem belongs to, so the form can mark it. */
export type RouteDraftField = 'name' | 'sequenceNumber' | 'nextStepId' | 'condition';

export interface RouteDraftError {
  readonly field: RouteDraftField;
  readonly message: string;
}

/**
 * Finds everything that would stop this route being saved.
 * @param draft the route as currently filled in
 * @returns one error per problem, empty when the route is ready to save
 */
export function findRouteDraftErrors(draft: RouteDraft): RouteDraftError[] {
  const errors: RouteDraftError[] = [];

  if (draft.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Give the route a name so it can be identified later.' });
  }

  if (!Number.isInteger(draft.sequenceNumber) || draft.sequenceNumber < 1) {
    errors.push({ field: 'sequenceNumber', message: 'Sequence must be a whole number of 1 or more.' });
  }

  // The save path cannot write a route with no target, and the engine would create
  // nothing if it could — so this is refused here rather than dropped silently.
  if (!draft.nextStepId) {
    errors.push({ field: 'nextStepId', message: 'Choose the step this route leads to.' });
  }

  // The engine refuses a non-fallback route whose filter carries no condition:
  // "Please add any condition in filter".
  if (!draft.isDefault && !hasRealCondition(draft.filter)) {
    errors.push({
      field: 'condition',
      message: 'Add a condition, or mark this route as the fallback.',
    });
  }

  return errors;
}

/**
 * Whether the route can be saved.
 * @param draft the route as currently filled in
 * @param isConditionBuilderReady whether the condition builder has finished loading
 * @returns true only when nothing is outstanding
 */
export function canSaveRouteDraft(draft: RouteDraft, isConditionBuilderReady: boolean): boolean {
  return isConditionBuilderReady && findRouteDraftErrors(draft).length === 0;
}

/**
 * Looks up the problem attached to one field.
 * @param errors every problem found on the draft
 * @param field the field being rendered
 * @returns the message to show under that field, or null
 */
export function errorFor(errors: readonly RouteDraftError[], field: RouteDraftField): string | null {
  return errors.find((error) => error.field === field)?.message ?? null;
}
