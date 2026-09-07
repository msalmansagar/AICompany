/**
 * What a route's FetchXML filter means, in the two places it matters: what gets stored
 * when a route carries no condition, and whether a stored filter constrains anything.
 *
 * Both used to be answered by `filter.length > 0` or `!filter.trim()`, which is wrong
 * in the same way each time: a route with no condition does not store an empty string,
 * it stores the fragment below — 28 characters that every emptiness check read as
 * "this route has a condition".
 */

/** What a route stores when it carries no condition of its own. */
export const EMPTY_FILTER = '<filter type="and"></filter>';

/**
 * Whether a filter actually constrains anything.
 *
 * The engine's own rule, not an approximation: `ValidateFilter` rejects any filter on a
 * non-default route that contains no `<condition>` element, with "Please add any
 * condition in filter".
 *
 * @param filter the stored FetchXML filter, which may be empty or the empty fragment
 * @returns true when the filter contains at least one condition element
 */
export function hasRealCondition(filter: string | null | undefined): boolean {
  if (!filter) return false;
  return /<condition[\s/>]/i.test(filter);
}
