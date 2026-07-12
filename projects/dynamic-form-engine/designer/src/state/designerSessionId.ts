/**
 * Stable per-page-load designer session identifier — DFE-ENH-001 PC-1.
 *
 * Evaluated once at module init and reused for the entire designer lifecycle.
 * Follows the same pattern as EditLockService.sessionId but exposed as a
 * module-level constant so every consumer in the same page load shares the
 * same ID without needing a service instance.
 *
 * Populated on qdb_session_id in qdb_dfe_audit_log records (ENT-005).
 */
export const DESIGNER_SESSION_ID: string = crypto.randomUUID();
