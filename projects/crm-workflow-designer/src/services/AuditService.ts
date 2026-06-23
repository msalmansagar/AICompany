import type { ICrmAdapter } from './ICrmAdapter';

/**
 * Logs workflow designer actions to qdb_form_audit_log.
 * Falls back silently — audit failure must never block user operations.
 */
export class AuditService {
  private readonly adapter: ICrmAdapter;

  constructor(adapter: ICrmAdapter) {
    this.adapter = adapter;
  }

  async log(action: string, entityId: string, detail?: object): Promise<void> {
    try {
      await this.adapter.logAuditEntry({
        action,
        entityId,
        detail: detail ? JSON.stringify(detail) : undefined,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Audit logging is best-effort — 404 from missing entity is expected in some envs.
      reportAuditFailure(action, entityId, error);
    }
  }
}

function reportAuditFailure(action: string, entityId: string, error: unknown): void {
  // Structured error output — not console.log
  const message = error instanceof Error ? error.message : String(error);
  const errorEvent = new ErrorEvent('error', {
    message: `[AuditService] Failed to log "${action}" for "${entityId}": ${message}`,
  });
  window.dispatchEvent(errorEvent);
}
