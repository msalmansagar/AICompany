import { NAVIGATION_PROPERTIES } from './schema.js';

/**
 * An organisation scope is a clause on the **case** (`qdb_organizationcode eq …`); the activity has
 * no such column, and sending the clause as-is was answered 400 (KI-147). The activity reaches its
 * case through the lookup's navigation property, so the same clause is applied there — the platform
 * still does the narrowing, and both CRMs' work stays one list when no scope is chosen.
 */
export function scopeThroughCase(caseClause: string): string {
  return `${NAVIGATION_PROPERTIES.activityToCase}/${caseClause}`;
}
