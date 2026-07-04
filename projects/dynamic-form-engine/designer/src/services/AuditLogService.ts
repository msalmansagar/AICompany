import type { IWebApiAdapter } from './IWebApiAdapter';
// Audit log service — append-only writes to qdb_form_audit_log.
// Every designer action that modifies form data must call this service.
// Records must never be updated or deleted.

import { ENTITY_NAMES } from '@/constants/entityNames';
import { FORM_AUDIT_LOG_ATTRS } from '@/constants/attributeNames';
import { withRetry } from './crmRetry';
import type { CrmUserContext } from './CrmContextService';

export type AuditAction =
  | 'OPEN_FORM'
  | 'SAVE_DRAFT'
  | 'PUBLISH'
  | 'CLONE'
  | 'RESTORE_VERSION'
  | 'DELETE_FORM'
  | 'ARCHIVE_FORM'
  | 'STYLE_CHANGE';

export interface AuditPayload {
  fieldCount?: number;
  tabCount?: number;
  versionNumber?: string;
  sourceFormId?: string;
  /** STYLE_CHANGE: which design entities changed. */
  styleEntities?: string[];
  /** STYLE_CHANGE: whether customCss changed — never log the CSS content itself (BR-012). */
  customCssChanged?: boolean;
  [key: string]: unknown;
}

export class AuditLogService {
  constructor(
    private readonly webApi: IWebApiAdapter,
    private readonly userContext: CrmUserContext
  ) {}

  async logAction(
    formId: string,
    action: AuditAction,
    payload: AuditPayload = {}
  ): Promise<void> {
    await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.FORM_AUDIT_LOG, {
          [`${FORM_AUDIT_LOG_ATTRS.FORM_ID}@odata.bind`]: `/qdb_form_definitions(${formId})`,
          [FORM_AUDIT_LOG_ATTRS.ACTION]: action,
          [FORM_AUDIT_LOG_ATTRS.ACTOR_ID]: this.userContext.userId,
          [FORM_AUDIT_LOG_ATTRS.ACTOR_NAME]: this.userContext.userFullName,
          [FORM_AUDIT_LOG_ATTRS.TIMESTAMP]: new Date().toISOString(),
          [FORM_AUDIT_LOG_ATTRS.PAYLOAD_JSON]: JSON.stringify(payload),
        }),
      `auditLog.${action}`
    );
  }
}
