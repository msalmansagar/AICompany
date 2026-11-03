import { z } from 'zod';
import { ARREAR_BUCKET_CODES } from '../misNormalization.js';

/**
 * One semantic scope for every reporting question — the Report Engine's parameters, DCP's
 * drill-down lists and the counts beside them are all rendered from it, so a card and the list it
 * opens describe one population.
 *
 * Every dimension is optional: absent means "not narrowed". Nothing here is a value from a record;
 * it is only *which* records a question is about. Dimensions that a dataset cannot honour are
 * declared per definition (`ReportDefinitionEntry.dimensions`) and refused if sent.
 */
export const SOURCE_SYSTEMS = ['HL', 'BFD'] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

export const ReportingScopeSchema = z.object({
  sourceSystem: z.enum(SOURCE_SYSTEMS).optional(),
  bucket: z.enum(ARREAR_BUCKET_CODES).optional(),
  /** A strategy id, or `'none'` for cases with no resolved strategy. */
  strategy: z.string().min(1).optional(),
  /** A case status label as the platform names it (e.g. "New", "PTP Active"). */
  caseStatus: z.string().min(1).optional(),
  /** A user id — the owner of the case or activity. */
  owner: z.string().min(1).optional(),
  /** An activity type id. */
  activityType: z.string().min(1).optional(),
  /** An activity's open/closed state. */
  activityState: z.enum(['open', 'closed']).optional(),
  /** An inclusive ISO date (yyyy-mm-dd) lower bound on the definition's own date column. */
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** An exclusive ISO date upper bound on the definition's own date column. */
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

export type ReportingScope = z.infer<typeof ReportingScopeSchema>;
export type ReportingDimension = keyof ReportingScope;

export const REPORTING_DIMENSIONS = [
  'sourceSystem', 'bucket', 'strategy', 'caseStatus', 'owner', 'activityType', 'activityState', 'dateFrom', 'dateTo',
] as const satisfies readonly ReportingDimension[];

export const EMPTY_SCOPE: ReportingScope = {};

/** The dimensions a scope actually narrows by. */
export function activeDimensions(scope: ReportingScope): ReportingDimension[] {
  return REPORTING_DIMENSIONS.filter(dimension => scope[dimension] !== undefined);
}

/** The scope with the dimensions a definition cannot honour removed, and which those were. */
export function restrictScope(
  scope: ReportingScope,
  supported: readonly ReportingDimension[],
): { scope: ReportingScope; dropped: ReportingDimension[] } {
  const dropped = activeDimensions(scope).filter(dimension => !supported.includes(dimension));
  const kept = Object.fromEntries(
    Object.entries(scope).filter(([dimension]) => supported.includes(dimension as ReportingDimension)),
  );
  return { scope: kept as ReportingScope, dropped };
}

/** Scopes are compared by content, so two renderings of one question fingerprint the same. */
export function scopeKey(scope: ReportingScope): string {
  return REPORTING_DIMENSIONS
    .filter(dimension => scope[dimension] !== undefined)
    .map(dimension => `${dimension}=${String(scope[dimension])}`)
    .join('&');
}
