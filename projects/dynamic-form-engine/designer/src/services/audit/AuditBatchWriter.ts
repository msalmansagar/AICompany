/**
 * AuditBatchWriter — ENT-005 (DFE-ENH-001 Phase 1, Workstream E4)
 *
 * Writes AuditEntry[] produced by AuditPatchMapper to qdb_dfe_audit_log via
 * per-row Dataverse createRecord calls. Failures are non-blocking: each entry
 * failure is logged and skipped so a partial audit failure can never abort the
 * designer save flow.
 *
 * The entity (qdb_dfe_audit_log) is provisioned by provision-dfe-audit-log.mjs
 * and is NOT yet live in org5869857f — these writes are exercised via a mocked
 * IWebApiAdapter in tests only until LO-002 is executed.
 */

import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { AuditEntry } from '@/services/AuditPatchMapper';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  DFE_AUDIT_LOG_ATTRS,
  DFE_AUDIT_ACTION_PICKLIST,
  DFE_AUDIT_EVENT_TYPE_PICKLIST,
} from '@/constants/dfeAuditLogAttributeNames';

export class AuditBatchWriter {
  constructor(private readonly webApi: IWebApiAdapter) {}

  /**
   * Writes each AuditEntry as a separate createRecord call.
   * Never throws — any individual write failure is logged and skipped.
   * Caller must not await this method if non-blocking behaviour is required;
   * it is a fire-and-forget async operation from the save pipeline's perspective.
   */
  async writeEntries(entries: readonly AuditEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Parallel writes — same per-entry failure isolation as sequential but
    // avoids N+1 round-trips when a single save produces many changed properties.
    await Promise.allSettled(entries.map(entry => this.writeSingleEntry(entry)));
  }

  private async writeSingleEntry(entry: AuditEntry): Promise<void> {
    try {
      await this.webApi.createRecord(
        ENTITY_NAMES.DFE_AUDIT_LOG,
        this.buildRecord(entry),
      );
    } catch (error) {
      // Non-blocking: audit write failure must never propagate to the save caller.
      // The user's save result is unaffected; the audit gap is observable in dev tools.
      console.error('[AuditBatchWriter] Failed to write audit entry', {
        error,
        changePath: entry.changePath,
        eventType: entry.eventType,
      });
    }
  }

  private buildRecord(entry: AuditEntry): Record<string, unknown> {
    const record: Record<string, unknown> = {
      [`${DFE_AUDIT_LOG_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${entry.formId})`,
      [DFE_AUDIT_LOG_ATTRS.FIELD_SCHEMA_NAME]: entry.fieldSchemaName,
      [DFE_AUDIT_LOG_ATTRS.CHANGE_PATH]: entry.changePath,
      [DFE_AUDIT_LOG_ATTRS.ACTION]: DFE_AUDIT_ACTION_PICKLIST[entry.action],
      [DFE_AUDIT_LOG_ATTRS.EVENT_TYPE]: DFE_AUDIT_EVENT_TYPE_PICKLIST[entry.eventType],
      [DFE_AUDIT_LOG_ATTRS.CHANGED_ON]: entry.changedOn,
      // TODO(DFE-ENH-001): populate qdb_session_id once the EditLock session
      // identifier is surfaced from the concurrency layer.
    };

    if (entry.before !== null) {
      record[DFE_AUDIT_LOG_ATTRS.BEFORE_VALUE] = entry.before;
    }
    if (entry.after !== null) {
      record[DFE_AUDIT_LOG_ATTRS.AFTER_VALUE] = entry.after;
    }
    if (entry.formVersionId !== null) {
      record[`${DFE_AUDIT_LOG_ATTRS.FORM_VERSION_ID}@odata.bind`] =
        `/qdb_form_versions(${entry.formVersionId})`;
    }
    if (entry.changedBy) {
      record[`${DFE_AUDIT_LOG_ATTRS.CHANGED_BY}@odata.bind`] =
        `/systemusers(${entry.changedBy})`;
    }

    return record;
  }
}
