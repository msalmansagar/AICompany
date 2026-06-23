import type { DataverseClient } from '@portal/dataverse-client';
import type { RbacAuditEventType } from '@portal/types';

const AUDIT_LOG_ENTITY = 'qdb_rbac_audit_logs';

// ---------------------------------------------------------------------------
// Option set codes — must match the Dataverse option set provisioned by
// rbacEntities.ts. These are constants, not configurable values.
// ---------------------------------------------------------------------------

const EVENT_TYPE_CODE: Record<RbacAuditEventType, number> = {
  role_assigned: 1,
  role_revoked: 2,
  promotion_initiated: 3,
  promotion_approved: 4,
  promotion_rejected: 5,
  pii_accessed: 6,
  permission_denied: 7,
};

// ---------------------------------------------------------------------------
// Param types — kept narrow to enforce what each method needs
// ---------------------------------------------------------------------------

export interface AuditParams {
  actorUserId: string;
  targetUserId?: string | undefined;
  roleSlug?: string | undefined;
  correlationId: string;
  ipAddress: string;
  detail?: string | undefined;
}

export interface PiiAuditParams extends AuditParams {
  resourceId: string;
  subject: string;
}

export interface DeniedAuditParams extends AuditParams {
  subject: string;
  action: string;
}

// ---------------------------------------------------------------------------
// RbacAuditWriter — single responsibility: write append-only audit records
// ---------------------------------------------------------------------------

/**
 * Writes immutable audit log records to `qdb_rbac_audit_logs` in Dataverse.
 *
 * All methods POST a new record. No UPDATE or DELETE is ever performed here.
 * AC-RBAC-004: the Dataverse security role for this service account must have
 * Append privileges only — Write and Delete must be absent on this table.
 */
export class RbacAuditWriter {
  constructor(private readonly dataverse: DataverseClient) {}

  async logRoleAssigned(params: AuditParams): Promise<void> {
    await this.writeEntry('role_assigned', params);
  }

  async logRoleRevoked(params: AuditParams): Promise<void> {
    await this.writeEntry('role_revoked', params);
  }

  async logPromotionInitiated(params: AuditParams): Promise<void> {
    await this.writeEntry('promotion_initiated', params);
  }

  async logPromotionApproved(params: AuditParams): Promise<void> {
    await this.writeEntry('promotion_approved', params);
  }

  async logPromotionRejected(params: AuditParams): Promise<void> {
    await this.writeEntry('promotion_rejected', params);
  }

  async logPiiAccessed(params: PiiAuditParams): Promise<void> {
    await this.writeEntry('pii_accessed', {
      ...params,
      detail: JSON.stringify({ resourceId: params.resourceId, subject: params.subject }),
    });
  }

  async logPermissionDenied(params: DeniedAuditParams): Promise<void> {
    await this.writeEntry('permission_denied', {
      ...params,
      detail: JSON.stringify({ subject: params.subject, action: params.action }),
    });
  }

  private async writeEntry(
    eventType: RbacAuditEventType,
    params: AuditParams,
  ): Promise<void> {
    await this.dataverse.create<unknown>(
      AUDIT_LOG_ENTITY,
      {
        qdb_event_type: EVENT_TYPE_CODE[eventType],
        qdb_actor_user_id: params.actorUserId,
        ...(params.targetUserId !== undefined && { qdb_target_user_id: params.targetUserId }),
        ...(params.roleSlug !== undefined && { qdb_role_slug: params.roleSlug }),
        qdb_correlation_id: params.correlationId,
        qdb_ip_address: params.ipAddress,
        ...(params.detail !== undefined && { qdb_detail: params.detail }),
      },
      { correlationId: params.correlationId },
    );
  }
}
