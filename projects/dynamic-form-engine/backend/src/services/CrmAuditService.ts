import type { AuditLogEntry } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';

export class CrmAuditService extends CrmBaseService {
  constructor(authService: CrmAuthService) {
    super(authService);
  }

  // Append-only â€” never UPDATE or DELETE audit records
  async writeAuditEntry(entry: Omit<AuditLogEntry, 'id'>): Promise<void> {
    try {
      await this.crmFetch('/qdb_form_audit_logs', {
        method: 'POST',
        body: JSON.stringify({
          qdb_event_type: entry.eventType,
          qdb_form_definition_id: entry.formDefinitionId,
          qdb_form_definition_name: entry.formDefinitionName,
          qdb_user_id: entry.userId,
          qdb_user_display_name: entry.userDisplayName,
          qdb_timestamp_utc: entry.timestampUtc,
          qdb_record_id: entry.recordId,
          qdb_changed_data_json: entry.changedData
            ? JSON.stringify(entry.changedData)
            : undefined,
        }),
      });
    } catch (error) {
      // Audit failures must never propagate â€” log and continue
      logger.error({ error, entry }, 'Failed to write audit log entry');
    }
  }
}
