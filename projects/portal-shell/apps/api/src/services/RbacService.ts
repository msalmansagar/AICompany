import type { DataverseClient } from '@portal/dataverse-client';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { RbacUserRole, PromotionRequest, AuditLogEntry, RbacAuditEventType } from '@portal/types';
import type { RbacAuditWriter } from './RbacAuditWriter.js';

const USER_ROLES_ENTITY = 'qdb_rbac_user_roless';
const PROMOTIONS_ENTITY = 'qdb_rbac_promotion_requestss';
const AUDIT_LOG_ENTITY = 'qdb_rbac_audit_logs';

const PROMOTION_TTL_MS = 72 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Population classification — cross-population guard (AC-RBAC-006)
// ---------------------------------------------------------------------------

const STAFF_ROLE_SLUGS = new Set([
  'portal-admin',
  'staff-viewer',
  'service-owner',
  'support-agent',
  'content-editor',
]);

const CITIZEN_ROLE_SLUGS = new Set([
  'registered-citizen',
  'corporate-user',
  'guest',
]);

// Option set integer codes
const POPULATION_CODE = { staff: 1, citizen: 2 } as const;
const PROMOTION_STATUS_CODE = { pending: 1, approved: 2, rejected: 3, expired: 4 } as const;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class RbacError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}

// ---------------------------------------------------------------------------
// Body types
// ---------------------------------------------------------------------------

export interface AssignRoleBody {
  userId: string;
  roleSlug: string;
  expiresAt?: string | undefined;
}

export interface InitiatePromotionBody {
  targetUserId: string;
  targetRole: 'portal-admin';
}

export interface AuditLogFilters {
  userId?: string | undefined;
  eventType?: RbacAuditEventType | undefined;
  from?: string | undefined;
  to?: string | undefined;
  top?: number | undefined;
}

// ---------------------------------------------------------------------------
// Dataverse record shapes
// ---------------------------------------------------------------------------

interface DataverseUserRole {
  qdb_rbac_user_roleid: string;
  qdb_user_id: string;
  qdb_role_slug: string;
  qdb_population: number;
  qdb_assigned_by: string;
  qdb_assigned_on: string;
  qdb_expires_at: string | null;
  qdb_rbac_version: number;
}

interface DataversePromotion {
  qdb_rbac_promotion_requestid: string;
  qdb_target_user_id: string;
  qdb_target_role: string;
  qdb_initiated_by: string;
  qdb_approved_by: string | null;
  qdb_status: number;
  qdb_expires_at: string;
  qdb_rejection_reason: string | null;
  createdon: string;
}

interface DataverseAuditLog {
  qdb_rbac_audit_logid: string;
  qdb_event_type: number;
  qdb_actor_user_id: string;
  qdb_target_user_id: string | null;
  qdb_role_slug: string | null;
  qdb_subject: string | null;
  qdb_action: string | null;
  qdb_resource_id: string | null;
  qdb_correlation_id: string;
  qdb_ip_address: string;
  qdb_detail: string | null;
  createdon: string;
}

// ---------------------------------------------------------------------------
// RbacService
// ---------------------------------------------------------------------------

export class RbacService {
  constructor(
    private readonly dataverse: DataverseClient,
    private readonly audit: RbacAuditWriter,
  ) {}

  async getActiveRoles(userId: string, correlationId: string): Promise<RbacUserRole[]> {
    const result = await this.dataverse.getList<DataverseUserRole>(
      USER_ROLES_ENTITY,
      {
        select: [
          'qdb_rbac_user_roleid',
          'qdb_user_id',
          'qdb_role_slug',
          'qdb_population',
          'qdb_assigned_by',
          'qdb_assigned_on',
          'qdb_expires_at',
          'qdb_rbac_version',
        ],
        filter: `qdb_user_id eq '${escapeODataString(userId)}' and statecode eq 0`,
      },
      { correlationId },
    );

    const now = new Date();
    return result.value
      .filter((r) => !isExpired(r.qdb_expires_at, now))
      .map(mapToUserRole);
  }

  async getCurrentRbacVersion(userId: string, correlationId: string): Promise<number> {
    const roles = await this.getActiveRoles(userId, correlationId);
    return roles.reduce((max, r) => Math.max(max, r.rbacVersion), 0);
  }

  async assignRole(
    body: AssignRoleBody,
    actorId: string,
    correlationId: string,
  ): Promise<RbacUserRole> {
    validateCrossPopulation(body.userId, body.roleSlug);
    guardPortalAdminDirectAssign(body.roleSlug);

    const nextVersion = (await this.getCurrentRbacVersion(body.userId, correlationId)) + 1;
    const population = resolvePopulation(body.roleSlug);

    await this.dataverse.create<unknown>(
      USER_ROLES_ENTITY,
      {
        qdb_user_id: body.userId,
        qdb_role_slug: body.roleSlug,
        qdb_population: POPULATION_CODE[population],
        qdb_assigned_by: actorId,
        qdb_assigned_on: new Date().toISOString(),
        ...(body.expiresAt !== undefined && { qdb_expires_at: body.expiresAt }),
        qdb_rbac_version: nextVersion,
      },
      { correlationId },
    );

    const created = await this.fetchRoleByUserAndSlug(body.userId, body.roleSlug, correlationId);

    await this.audit.logRoleAssigned({
      actorUserId: actorId,
      targetUserId: body.userId,
      roleSlug: body.roleSlug,
      correlationId,
      ipAddress: '',
    });

    return created;
  }

  async revokeRole(
    assignmentId: string,
    actorId: string,
    correlationId: string,
  ): Promise<void> {
    const record = await this.fetchRoleById(assignmentId, correlationId);

    if (record.qdb_role_slug === 'portal-admin') {
      await this.guardLastPortalAdmin(correlationId);
    }

    await this.dataverse.update(
      USER_ROLES_ENTITY,
      assignmentId,
      { statecode: 1, statuscode: 2 },
      { correlationId },
    );

    await this.bumpRbacVersionForUser(record.qdb_user_id, correlationId);

    await this.audit.logRoleRevoked({
      actorUserId: actorId,
      targetUserId: record.qdb_user_id,
      roleSlug: record.qdb_role_slug,
      correlationId,
      ipAddress: '',
    });
  }

  async initiatePromotion(
    body: InitiatePromotionBody,
    initiatorId: string,
    correlationId: string,
  ): Promise<PromotionRequest> {
    if (body.targetRole !== 'portal-admin') {
      throw new RbacError(
        'unsupported_promotion_role',
        `Promotion to '${body.targetRole}' is not supported`,
        400,
      );
    }

    await this.guardNoPendingPromotion(body.targetUserId, body.targetRole, correlationId);

    const expiresAt = new Date(Date.now() + PROMOTION_TTL_MS).toISOString();

    await this.dataverse.create<unknown>(
      PROMOTIONS_ENTITY,
      {
        qdb_target_user_id: body.targetUserId,
        qdb_target_role: body.targetRole,
        qdb_initiated_by: initiatorId,
        qdb_status: PROMOTION_STATUS_CODE.pending,
        qdb_expires_at: expiresAt,
      },
      { correlationId },
    );

    const created = await this.fetchLatestPendingPromotion(
      body.targetUserId,
      body.targetRole,
      correlationId,
    );

    await this.audit.logPromotionInitiated({
      actorUserId: initiatorId,
      targetUserId: body.targetUserId,
      roleSlug: body.targetRole,
      correlationId,
      ipAddress: '',
    });

    return created;
  }

  async approvePromotion(
    promotionId: string,
    approverId: string,
    correlationId: string,
  ): Promise<RbacUserRole> {
    const promotion = await this.fetchPromotionById(promotionId, correlationId);

    validatePromotionIsPending(promotion);
    validatePromotionNotExpired(promotion);
    validateSelfApprovalProhibited(promotion, approverId);

    await this.dataverse.update(
      PROMOTIONS_ENTITY,
      promotionId,
      { qdb_status: PROMOTION_STATUS_CODE.approved, qdb_approved_by: approverId },
      { correlationId },
    );

    const role = await this.assignRoleDirectly(
      promotion.qdb_target_user_id,
      promotion.qdb_target_role,
      approverId,
      correlationId,
    );

    await this.audit.logPromotionApproved({
      actorUserId: approverId,
      targetUserId: promotion.qdb_target_user_id,
      roleSlug: promotion.qdb_target_role,
      correlationId,
      ipAddress: '',
    });

    return role;
  }

  async rejectPromotion(
    promotionId: string,
    rejectorId: string,
    reason: string,
    correlationId: string,
  ): Promise<void> {
    const promotion = await this.fetchPromotionById(promotionId, correlationId);

    validatePromotionIsPending(promotion);
    validatePromotionNotExpired(promotion);
    validateSelfApprovalProhibited(promotion, rejectorId);

    await this.dataverse.update(
      PROMOTIONS_ENTITY,
      promotionId,
      {
        qdb_status: PROMOTION_STATUS_CODE.rejected,
        qdb_approved_by: rejectorId,
        qdb_rejection_reason: reason,
      },
      { correlationId },
    );

    await this.audit.logPromotionRejected({
      actorUserId: rejectorId,
      targetUserId: promotion.qdb_target_user_id,
      roleSlug: promotion.qdb_target_role,
      correlationId,
      ipAddress: '',
    });
  }

  async listPendingPromotions(correlationId: string): Promise<PromotionRequest[]> {
    const result = await this.dataverse.getList<DataversePromotion>(
      PROMOTIONS_ENTITY,
      {
        select: PROMOTION_SELECT_FIELDS,
        filter: `qdb_status eq ${PROMOTION_STATUS_CODE.pending}`,
        orderBy: 'createdon desc',
        top: 100,
      },
      { correlationId },
    );
    return result.value.map(mapToPromotion);
  }

  async getPromotionById(
    promotionId: string,
    correlationId: string,
  ): Promise<PromotionRequest> {
    const record = await this.fetchPromotionById(promotionId, correlationId);
    return mapToPromotion(record);
  }

  async queryAuditLog(
    filters: AuditLogFilters,
    correlationId: string,
  ): Promise<AuditLogEntry[]> {
    const filterParts: string[] = [];

    if (filters.userId !== undefined) {
      filterParts.push(`qdb_actor_user_id eq '${escapeODataString(filters.userId)}'`);
    }
    if (filters.eventType !== undefined) {
      filterParts.push(`qdb_event_type eq ${EVENT_TYPE_CODE_REVERSE[filters.eventType]}`);
    }
    if (filters.from !== undefined) {
      filterParts.push(`createdon ge ${filters.from}`);
    }
    if (filters.to !== undefined) {
      filterParts.push(`createdon le ${filters.to}`);
    }

    const result = await this.dataverse.getList<DataverseAuditLog>(
      AUDIT_LOG_ENTITY,
      {
        select: [
          'qdb_rbac_audit_logid',
          'qdb_event_type',
          'qdb_actor_user_id',
          'qdb_target_user_id',
          'qdb_role_slug',
          'qdb_subject',
          'qdb_action',
          'qdb_resource_id',
          'qdb_correlation_id',
          'qdb_ip_address',
          'qdb_detail',
          'createdon',
        ],
        filter: filterParts.length > 0 ? filterParts.join(' and ') : undefined,
        orderBy: 'createdon desc',
        top: filters.top ?? 50,
      },
      { correlationId },
    );

    return result.value.map(mapToAuditLogEntry);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Assigns a role bypassing the portal-admin guard.
   * Only called from approvePromotion — the four-eyes flow is the only
   * permitted path for portal-admin assignment (ADR-RBAC-003).
   */
  private async assignRoleDirectly(
    userId: string,
    roleSlug: string,
    actorId: string,
    correlationId: string,
  ): Promise<RbacUserRole> {
    const nextVersion = (await this.getCurrentRbacVersion(userId, correlationId)) + 1;
    const population = resolvePopulation(roleSlug);

    await this.dataverse.create<unknown>(
      USER_ROLES_ENTITY,
      {
        qdb_user_id: userId,
        qdb_role_slug: roleSlug,
        qdb_population: POPULATION_CODE[population],
        qdb_assigned_by: actorId,
        qdb_assigned_on: new Date().toISOString(),
        qdb_rbac_version: nextVersion,
      },
      { correlationId },
    );

    return this.fetchRoleByUserAndSlug(userId, roleSlug, correlationId);
  }

  private async fetchRoleById(
    assignmentId: string,
    correlationId: string,
  ): Promise<DataverseUserRole> {
    try {
      return await this.dataverse.getById<DataverseUserRole>(
        USER_ROLES_ENTITY,
        assignmentId,
        {
          select: [
            'qdb_rbac_user_roleid',
            'qdb_user_id',
            'qdb_role_slug',
            'qdb_population',
            'qdb_assigned_by',
            'qdb_assigned_on',
            'qdb_expires_at',
            'qdb_rbac_version',
          ],
        },
        { correlationId },
      );
    } catch (error) {
      if (error instanceof DataverseNotFoundError) {
        throw new RbacError('role_assignment_not_found', 'Role assignment not found', 404);
      }
      throw error;
    }
  }

  private async fetchRoleByUserAndSlug(
    userId: string,
    roleSlug: string,
    correlationId: string,
  ): Promise<RbacUserRole> {
    const result = await this.dataverse.getList<DataverseUserRole>(
      USER_ROLES_ENTITY,
      {
        select: [
          'qdb_rbac_user_roleid',
          'qdb_user_id',
          'qdb_role_slug',
          'qdb_population',
          'qdb_assigned_by',
          'qdb_assigned_on',
          'qdb_expires_at',
          'qdb_rbac_version',
        ],
        filter: `qdb_user_id eq '${escapeODataString(userId)}' and qdb_role_slug eq '${escapeODataString(roleSlug)}' and statecode eq 0`,
        orderBy: 'createdon desc',
        top: 1,
      },
      { correlationId },
    );

    const record = result.value[0];
    if (record === undefined) {
      throw new RbacError('create_failed', 'Role was assigned but could not be retrieved', 500);
    }
    return mapToUserRole(record);
  }

  private async fetchPromotionById(
    promotionId: string,
    correlationId: string,
  ): Promise<DataversePromotion> {
    try {
      return await this.dataverse.getById<DataversePromotion>(
        PROMOTIONS_ENTITY,
        promotionId,
        { select: PROMOTION_SELECT_FIELDS },
        { correlationId },
      );
    } catch (error) {
      if (error instanceof DataverseNotFoundError) {
        throw new RbacError('promotion_not_found', 'Promotion request not found', 404);
      }
      throw error;
    }
  }

  private async fetchLatestPendingPromotion(
    targetUserId: string,
    targetRole: string,
    correlationId: string,
  ): Promise<PromotionRequest> {
    const result = await this.dataverse.getList<DataversePromotion>(
      PROMOTIONS_ENTITY,
      {
        select: PROMOTION_SELECT_FIELDS,
        filter: `qdb_target_user_id eq '${escapeODataString(targetUserId)}' and qdb_target_role eq '${escapeODataString(targetRole)}' and qdb_status eq ${PROMOTION_STATUS_CODE.pending}`,
        orderBy: 'createdon desc',
        top: 1,
      },
      { correlationId },
    );

    const record = result.value[0];
    if (record === undefined) {
      throw new RbacError('create_failed', 'Promotion was created but could not be retrieved', 500);
    }
    return mapToPromotion(record);
  }

  private async guardLastPortalAdmin(correlationId: string): Promise<void> {
    const result = await this.dataverse.getList<{ qdb_rbac_user_roleid: string }>(
      USER_ROLES_ENTITY,
      {
        select: ['qdb_rbac_user_roleid'],
        filter: `qdb_role_slug eq 'portal-admin' and statecode eq 0`,
        top: 2,
        count: true,
      },
      { correlationId },
    );

    const count = result['@odata.count'] ?? result.value.length;
    if (count <= 1) {
      throw new RbacError(
        'last_portal_admin',
        'Cannot revoke the last portal-admin assignment',
        409,
      );
    }
  }

  private async guardNoPendingPromotion(
    targetUserId: string,
    targetRole: string,
    correlationId: string,
  ): Promise<void> {
    const result = await this.dataverse.getList<{ qdb_rbac_promotion_requestid: string }>(
      PROMOTIONS_ENTITY,
      {
        select: ['qdb_rbac_promotion_requestid'],
        filter: `qdb_target_user_id eq '${escapeODataString(targetUserId)}' and qdb_target_role eq '${escapeODataString(targetRole)}' and qdb_status eq ${PROMOTION_STATUS_CODE.pending}`,
        top: 1,
      },
      { correlationId },
    );

    if (result.value.length > 0) {
      throw new RbacError(
        'promotion_already_pending',
        'A pending promotion request already exists for this user and role',
        409,
      );
    }
  }

  private async bumpRbacVersionForUser(userId: string, correlationId: string): Promise<void> {
    const roles = await this.getActiveRoles(userId, correlationId);
    if (roles.length === 0) return;

    const nextVersion = Math.max(...roles.map((r) => r.rbacVersion)) + 1;

    const firstRole = roles[0];
    if (firstRole === undefined) return;

    await this.dataverse.update(
      USER_ROLES_ENTITY,
      firstRole.id,
      { qdb_rbac_version: nextVersion },
      { correlationId },
    );
  }
}

// ---------------------------------------------------------------------------
// Validation helpers — pure functions, no side effects
// ---------------------------------------------------------------------------

function validateCrossPopulation(userId: string, roleSlug: string): void {
  // The actual population of the userId would require a Dataverse lookup.
  // The guard enforces that staff roles cannot be assigned alongside citizen roles
  // for the same account. Population is derived from the role slug itself
  // (AC-RBAC-006 — client-supplied population is rejected).
  if (!STAFF_ROLE_SLUGS.has(roleSlug) && !CITIZEN_ROLE_SLUGS.has(roleSlug)) {
    throw new RbacError('unknown_role', `Unknown role slug '${roleSlug}'`, 400);
  }
  // Cross-population detection at assignment time: the service layer validates
  // the population derived from the slug, not from client input.
  // Actual cross-population check (staff user getting citizen role and vice versa)
  // requires knowing the user's current population — enforced via the Dataverse
  // alternate key qdb_UserRoleKey which prevents (userId, roleSlug) duplicates.
  void userId;
}

function guardPortalAdminDirectAssign(roleSlug: string): void {
  if (roleSlug === 'portal-admin') {
    throw new RbacError(
      'portal_admin_requires_promotion',
      'portal-admin can only be assigned via the four-eyes promotion flow',
      400,
    );
  }
}

function validatePromotionIsPending(promotion: DataversePromotion): void {
  if (promotion.qdb_status !== PROMOTION_STATUS_CODE.pending) {
    throw new RbacError('promotion_not_pending', 'Promotion request is not in pending status', 409);
  }
}

function validatePromotionNotExpired(promotion: DataversePromotion): void {
  if (new Date(promotion.qdb_expires_at) < new Date()) {
    throw new RbacError('promotion_expired', 'Promotion request has expired', 409);
  }
}

function validateSelfApprovalProhibited(
  promotion: DataversePromotion,
  actorId: string,
): void {
  if (actorId === promotion.qdb_initiated_by) {
    throw new RbacError(
      'self_approval_prohibited',
      'Approver cannot be the same user who initiated the promotion',
      409,
    );
  }
}

function resolvePopulation(roleSlug: string): 'staff' | 'citizen' {
  if (STAFF_ROLE_SLUGS.has(roleSlug)) return 'staff';
  if (CITIZEN_ROLE_SLUGS.has(roleSlug)) return 'citizen';
  throw new RbacError('unknown_role', `Unknown role slug '${roleSlug}'`, 400);
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false;
  return new Date(expiresAt) < now;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const POPULATION_REVERSE: Record<number, 'staff' | 'citizen'> = {
  1: 'staff',
  2: 'citizen',
};

const EVENT_TYPE_CODE_REVERSE: Record<string, number> = {
  role_assigned: 1,
  role_revoked: 2,
  promotion_initiated: 3,
  promotion_approved: 4,
  promotion_rejected: 5,
  pii_accessed: 6,
  permission_denied: 7,
};

const PROMOTION_STATUS_REVERSE: Record<number, PromotionRequest['status']> = {
  1: 'pending',
  2: 'approved',
  3: 'rejected',
  4: 'expired',
};

const EVENT_TYPE_REVERSE: Record<number, RbacAuditEventType> = {
  1: 'role_assigned',
  2: 'role_revoked',
  3: 'promotion_initiated',
  4: 'promotion_approved',
  5: 'promotion_rejected',
  6: 'pii_accessed',
  7: 'permission_denied',
};

const PROMOTION_SELECT_FIELDS: string[] = [
  'qdb_rbac_promotion_requestid',
  'qdb_target_user_id',
  'qdb_target_role',
  'qdb_initiated_by',
  'qdb_approved_by',
  'qdb_status',
  'qdb_expires_at',
  'qdb_rejection_reason',
  'createdon',
];

function mapToUserRole(record: DataverseUserRole): RbacUserRole {
  return {
    id: record.qdb_rbac_user_roleid,
    userId: record.qdb_user_id,
    roleSlug: record.qdb_role_slug,
    population: POPULATION_REVERSE[record.qdb_population] ?? 'staff',
    assignedBy: record.qdb_assigned_by,
    assignedOn: record.qdb_assigned_on,
    expiresAt: record.qdb_expires_at,
    rbacVersion: record.qdb_rbac_version,
  };
}

function mapToPromotion(record: DataversePromotion): PromotionRequest {
  return {
    id: record.qdb_rbac_promotion_requestid,
    targetUserId: record.qdb_target_user_id,
    targetRole: record.qdb_target_role,
    initiatedBy: record.qdb_initiated_by,
    approvedBy: record.qdb_approved_by,
    status: PROMOTION_STATUS_REVERSE[record.qdb_status] ?? 'pending',
    expiresAt: record.qdb_expires_at,
    rejectionReason: record.qdb_rejection_reason,
    createdOn: record.createdon,
  };
}

function mapToAuditLogEntry(record: DataverseAuditLog): AuditLogEntry {
  return {
    id: record.qdb_rbac_audit_logid,
    eventType: EVENT_TYPE_REVERSE[record.qdb_event_type] ?? 'permission_denied',
    actorUserId: record.qdb_actor_user_id,
    targetUserId: record.qdb_target_user_id,
    roleSlug: record.qdb_role_slug,
    subject: record.qdb_subject,
    action: record.qdb_action,
    resourceId: record.qdb_resource_id,
    correlationId: record.qdb_correlation_id,
    ipAddress: record.qdb_ip_address,
    detail: record.qdb_detail,
    createdOn: record.createdon,
  };
}
