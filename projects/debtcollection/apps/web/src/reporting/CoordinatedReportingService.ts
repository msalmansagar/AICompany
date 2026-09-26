import type { DashboardResult, ReportResult } from './reportEngineContracts.js';
import type { IReportingService, ReportingOutcome, RunReportRequest } from './ReportingService.js';

/**
 * One Engine run per question, however many panels ask it.
 *
 * A dashboard is several components each asking for its own report; a tab switch remounts them; React's
 * development mode mounts every effect twice. Without coordination one screen could run the same
 * definition in the same scope several times, and the Engine — which reads the whole book for every
 * run — would pay for each. This decorator shares an in-flight run between identical requests and
 * keeps an answer for a short time afterwards, keyed by everything the Engine would see: the definition,
 * the mapped parameters and the drill. The key never includes the caller, so a different user's session
 * (a different service instance) never shares an answer.
 *
 * The retention is deliberately short and only for successful answers: a refusal or an outage is asked
 * again on the next request, and a figure is never older than the retention window. Nothing here is
 * business data; it is the same answer the Engine gave a moment ago.
 */
export const DEFAULT_RETENTION_MS = 60_000;

interface Held<T> { outcome: Promise<ReportingOutcome<T>>; settledAt: number | undefined }

export class CoordinatedReportingService implements IReportingService {
  private readonly reports = new Map<string, Held<ReportResult>>();
  private readonly dashboards = new Map<string, Held<DashboardResult>>();
  /** Runs handed to the inner service, for tests and for the closure evidence. */
  runsIssued = 0;

  constructor(
    private readonly inner: IReportingService,
    private readonly retentionMs: number = DEFAULT_RETENTION_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  runReport(request: RunReportRequest): Promise<ReportingOutcome<ReportResult>> {
    return this.share(this.reports, keyOfReport(request), () => this.inner.runReport(request));
  }

  runDashboard(dashboardId: string): Promise<ReportingOutcome<DashboardResult>> {
    return this.share(this.dashboards, dashboardId, () => this.inner.runDashboard(dashboardId));
  }

  /** Forgets every held answer — a screen that must re-read after a write calls this. */
  invalidate(): void {
    this.reports.clear();
    this.dashboards.clear();
  }

  private share<T>(held: Map<string, Held<T>>, key: string, run: () => Promise<ReportingOutcome<T>>): Promise<ReportingOutcome<T>> {
    const existing = held.get(key);
    if (existing && this.isCurrent(existing)) return existing.outcome;
    const entry: Held<T> = { outcome: run(), settledAt: undefined };
    this.runsIssued += 1;
    held.set(key, entry);
    entry.outcome.then(outcome => {
      if (outcome.status === 'ok') entry.settledAt = this.now();
      else if (held.get(key) === entry) held.delete(key);
    }).catch(() => { if (held.get(key) === entry) held.delete(key); });
    return entry.outcome;
  }

  private isCurrent<T>(entry: Held<T>): boolean {
    if (entry.settledAt === undefined) return true;
    return this.now() - entry.settledAt < this.retentionMs;
  }
}

function keyOfReport(request: RunReportRequest): string {
  return JSON.stringify([request.reportId, request.scope ?? {}, request.parameters ?? {}, request.drill ?? null]);
}
