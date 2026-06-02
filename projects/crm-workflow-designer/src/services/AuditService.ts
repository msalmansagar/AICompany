import type { ICrmAdapter } from './ICrmAdapter';

/**
 * Logs workflow designer actions.
 * Attempts to write to qdb_form_audit_log if available.
 * Falls back silently — audit failure must never block user operations.
 */
export class AuditService {
  private readonly adapter: ICrmAdapter;

  constructor(adapter: ICrmAdapter) {
    this.adapter = adapter;
  }

  async log(action: string, entityId: string, detail?: object): Promise<void> {
    try {
      await this.writeAuditEntry(action, entityId, detail);
    } catch (error) {
      // Audit logging is best-effort. Surface to structured error channel, not user.
      reportAuditFailure(action, entityId, error);
    }
  }

  private async writeAuditEntry(
    action: string,
    entityId: string,
    detail: object | undefined
  ): Promise<void> {
    // Attempt via adapter — if qdb_form_audit_log is not deployed this will 404
    // The 404 is caught above and suppressed.
    await (this.adapter as unknown as { _auditLog?: (e: AuditEntry) => Promise<void> })._auditLog?.({
      action,
      entityId,
      detail: detail ? JSON.stringify(detail) : undefined,
      timestamp: new Date().toISOString(),
    });
  }
}

interface AuditEntry {
  action: string;
  entityId: string;
  detail: string | undefined;
  timestamp: string;
}

function reportAuditFailure(action: string, entityId: string, error: unknown): void {
  // Structured error output — not console.log
  const message = error instanceof Error ? error.message : String(error);
  const errorEvent = new ErrorEvent('error', {
    message: `[AuditService] Failed to log "${action}" for "${entityId}": ${message}`,
  });
  window.dispatchEvent(errorEvent);
}
