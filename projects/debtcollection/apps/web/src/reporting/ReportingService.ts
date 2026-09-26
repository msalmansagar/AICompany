import type { ReportingScope } from '@dcp/domain';
import type { DashboardResult, ReportResult } from './reportEngineContracts.js';

/**
 * DCP's one door to the QDB Report Engine.
 *
 * The Engine owns what a report or dashboard contains; DCP asks for it by definition id, in a
 * scope, and shows the answer. Every outcome that is not an answer is named — refused, denied,
 * unavailable, malformed, timed out — so a screen can say the right thing and the operational
 * workspace never depends on the Engine being there.
 */
export interface RunReportRequest {
  reportId: string;
  scope?: ReportingScope;
  /** Already-mapped Engine parameters, when the caller knows the definition's parameter names. */
  parameters?: Readonly<Record<string, string | number | boolean | null>>;
  /** A related-record run behind a row: the Engine builds the child query, DCP never composes one. */
  drill?: { relationshipId: string; parentKey: string };
}

export type ReportingFailureKind = 'refused' | 'accessDenied' | 'unavailable' | 'malformed' | 'timeout';

export type ReportingOutcome<T> =
  | { status: 'ok'; result: T; executionId?: string }
  | { status: ReportingFailureKind; message: string; code?: string; executionId?: string };

export interface IReportingService {
  runReport(request: RunReportRequest): Promise<ReportingOutcome<ReportResult>>;
  runDashboard(dashboardId: string): Promise<ReportingOutcome<DashboardResult>>;
}

/**
 * The scope's dimensions as Engine parameter names. One mapping, shared by every DCP definition,
 * so `@SourceSystem` in an authored FetchXML always means the scope's `sourceSystem`.
 */
export const SCOPE_PARAMETERS: Readonly<Record<keyof ReportingScope, string>> = {
  sourceSystem: 'SourceSystem',
  bucket: 'Bucket',
  strategy: 'Strategy',
  caseStatus: 'CaseStatus',
  owner: 'Owner',
  activityType: 'ActivityType',
  activityState: 'ActivityState',
  dateFrom: 'DateFrom',
  dateTo: 'DateTo',
};

/** The parameters a scope becomes. Absent dimensions are absent parameters, never empty strings. */
export function scopeToParameters(scope: ReportingScope): Record<string, string> {
  return Object.fromEntries(
    (Object.entries(scope) as [keyof ReportingScope, string | undefined][])
      .filter(([, value]) => value !== undefined)
      .map(([dimension, value]) => [SCOPE_PARAMETERS[dimension], String(value)]),
  );
}
