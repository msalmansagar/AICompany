import type { ReportingScope } from '@dcp/domain';
import { BUCKET_LABELS, CASE_STATUS_LABELS } from '../data/schema.js';
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
 * so `SourceSystem` in a definition always means the scope's `sourceSystem`.
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

/**
 * A scope value the Engine cannot take as written.
 *
 * Proven on org5869857f (2026-09-26): a choice filter given its **label** fails the whole run with
 * `unexpected_error`, while the option value narrows correctly. The scope carries labels because
 * the lists and the URL do; the Engine gets codes. A label with no code is refused here rather than
 * sent — a dropped filter would answer for a wider population than the one asked about.
 */
export class ScopeEncodingError extends Error {
  constructor(readonly dimension: keyof ReportingScope, value: string) {
    super(`The ${dimension} "${value}" has no code the reporting service accepts.`);
    this.name = 'ScopeEncodingError';
  }
}

/** The parameters a scope becomes: codes and ids only. Absent dimensions are absent parameters. */
export function scopeToParameters(scope: ReportingScope): Record<string, string> {
  return Object.fromEntries(
    (Object.entries(scope) as [keyof ReportingScope, string | undefined][])
      .filter(([, value]) => value !== undefined)
      .map(([dimension, value]) => [SCOPE_PARAMETERS[dimension], encodeDimension(dimension, String(value))]),
  );
}

function encodeDimension(dimension: keyof ReportingScope, value: string): string {
  if (dimension === 'bucket') return String(codeOf(BUCKET_LABELS, value) ?? refuse(dimension, value));
  if (dimension === 'caseStatus') return String(codeOf(CASE_STATUS_LABELS, value) ?? refuse(dimension, value));
  if (dimension === 'activityState') return value === 'open' ? '0' : '1';
  return value;
}

function codeOf(labels: Readonly<Record<number, string>>, label: string): number | undefined {
  const match = Object.entries(labels).find(([, text]) => text === label);
  return match ? Number(match[0]) : undefined;
}

function refuse(dimension: keyof ReportingScope, value: string): never {
  throw new ScopeEncodingError(dimension, value);
}
