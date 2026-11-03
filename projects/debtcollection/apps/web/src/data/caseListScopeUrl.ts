import { REPORTING_DIMENSIONS, ReportingScopeSchema, type ReportingScope } from '@dcp/domain';

/**
 * A reporting scope, in the URL of the list it drills into.
 *
 * The shared router carries `#view/recordId/tab`. A scoped list is `#cases/scope/<pairs>`: the
 * literal `scope` in the record position and the dimensions as `key=value` pairs in the tab
 * position — the same `ReportingScope` a Report Engine card was run with, so the list an officer
 * lands on is the population the card counted. Codes and ids only; never a name or an identifier
 * of a person.
 */
export const SCOPE_SEGMENT = 'scope';

export function encodeScope(scope: ReportingScope): string {
  const params = new URLSearchParams();
  for (const dimension of REPORTING_DIMENSIONS) {
    const value = scope[dimension];
    if (value !== undefined) params.set(dimension, String(value));
  }
  return params.toString();
}

/** The scope a URL carries, with anything the contract does not recognise dropped. */
export function decodeScope(encoded: string | undefined): ReportingScope {
  if (!encoded) return {};
  const params = new URLSearchParams(encoded);
  const candidate = Object.fromEntries(REPORTING_DIMENSIONS.filter(d => params.has(d)).map(d => [d, params.get(d)]));
  const parsed = ReportingScopeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

export function hasScope(scope: ReportingScope): boolean {
  return REPORTING_DIMENSIONS.some(dimension => scope[dimension] !== undefined);
}
