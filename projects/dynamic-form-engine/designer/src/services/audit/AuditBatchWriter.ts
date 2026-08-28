/**
 * AuditBatchWriter — ENT-005 (DFE-ENH-001 Phase 1, Workstream E4)
 *
 * Writes AuditEntry[] produced by AuditPatchMapper to qdb_dfe_audit_log via
 * per-row Dataverse createRecord calls. Failures are non-blocking: each entry
 * failure is caught and the entry is returned to the caller for buffered retry
 * (PC-3). A partial audit failure can never abort the designer save flow.
 *
 * The entity (qdb_dfe_audit_log) is provisioned by provision-dfe-audit-log.mjs
 * and is NOT yet live in org5869857f — these writes are exercised via a mocked
 * IWebApiAdapter in tests only until LO-002 is executed.
 */

import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { AuditEntry } from '@/services/AuditPatchMapper';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { isGuid } from '@/services/assertGuid';
import {
  DFE_AUDIT_LOG_ATTRS,
  DFE_AUDIT_ACTION_PICKLIST,
  DFE_AUDIT_EVENT_TYPE_PICKLIST,
} from '@/constants/dfeAuditLogAttributeNames';

export class AuditBatchWriter {
  constructor(
    private readonly webApi: IWebApiAdapter,
    private readonly sessionId: string,
  ) {}

  /**
   * Writes each AuditEntry as a separate createRecord call.
   *
   * Returns the entries that could not be written so the caller can buffer
   * them for retry on the next successful save (PC-3). Never throws — any
   * individual write failure is logged and the entry is returned rather than
   * propagated, keeping the save pipeline unaffected.
   */
  async writeEntries(entries: readonly AuditEntry[]): Promise<readonly AuditEntry[]> {
    if (entries.length === 0) return [];

    // Parallel writes — same per-entry failure isolation as sequential but
    // avoids N+1 round-trips when a single save produces many changed properties.
    const outcomes = await Promise.all(entries.map(entry => this.writeSingleEntry(entry)));
    return outcomes.filter((entry): entry is AuditEntry => entry !== null);
  }

  /**
   * Attempts a single createRecord call.
   * Returns null on success; returns the entry on failure so the caller can buffer it.
   */
  private async writeSingleEntry(entry: AuditEntry): Promise<AuditEntry | null> {
    try {
      await this.webApi.createRecord(
        ENTITY_NAMES.DFE_AUDIT_LOG,
        this.buildRecord(entry),
      );
      return null;
    } catch (error) {
      // Non-blocking: audit write failure must never propagate to the save caller.
      // The entry is returned for buffered retry rather than silently discarded.
      console.error('[AuditBatchWriter] Failed to write audit entry', {
        error,
        changePath: entry.changePath,
        eventType: entry.eventType,
      });
      return entry;
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
      [DFE_AUDIT_LOG_ATTRS.SESSION_ID]: this.sessionId,
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
    // Bound only when the actor is a real record id. Running the designer standalone there is
    // no signed-in user, so the context substitutes the placeholder 'rest-mode-user'; bound
    // into /systemusers(...) Dataverse rejects the entire create — "')' or ',' expected at
    // position 5" — and every save reported that its change history could not be written.
    // The entry is more useful without an actor than not written at all.
    if (entry.changedBy && isGuid(entry.changedBy)) {
      record[`${DFE_AUDIT_LOG_ATTRS.CHANGED_BY}@odata.bind`] =
        `/systemusers(${entry.changedBy})`;
    }

    return record;
  }
}
