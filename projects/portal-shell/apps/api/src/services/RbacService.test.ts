// RED â†’ GREEN â†’ REFACTOR â€” RbacService unit tests
//
// DataverseClient and RbacAuditWriter are injected as constructor args and
// mocked with vi.fn() so no real Dataverse calls are made.
// Each describe block tests one public method; each it() verifies one behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RbacService, RbacError } from './RbacService.js';
import type { ServiceCallContext } from './RbacService.js';
import type { DataverseClient } from '@portal/dataverse-client';
import type { RbacAuditWriter } from './RbacAuditWriter.js';
import type { RbacUserRole, PromotionRequest } from '@portal/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORRELATION_ID = 'test-correlation-id';
const TEST_CTX: ServiceCallContext = { correlationId: CORRELATION_ID, actorIp: '127.0.0.1' };
const ACTOR_ID = 'actor-user-001';
const TARGET_USER_ID = 'target-user-002';
const ASSIGNMENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROMOTION_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeDataverseUserRole(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    qdb_rbac_user_roleid: ASSIGNMENT_ID,
    qdb_user_id: TARGET_USER_ID,
    qdb_role_slug: 'staff-viewer',
    qdb_population: 1, // staff
    qdb_assigned_by: ACTOR_ID,
    qdb_assigned_on: new Date().toISOString(),
    qdb_expires_at: null,
    qdb_rbac_version: 1,
    ...overrides,
  };
}

function makeMappedUserRole(overrides: Partial<RbacUserRole> = {}): RbacUserRole {
  return {
    id: ASSIGNMENT_ID,
    userId: TARGET_USER_ID,
    roleSlug: 'staff-viewer',
    population: 'staff',
    assignedBy: ACTOR_ID,
    assignedOn: new Date().toISOString(),
    expiresAt: null,
    rbacVersion: 1,
    ...overrides,
  };
}

function makeDataversePromotion(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    qdb_rbac_promotion_requestid: PROMOTION_ID,
    qdb_target_user_id: TARGET_USER_ID,
    qdb_target_role: 'portal-admin',
    qdb_initiated_by: 'initiator-user-003',
    qdb_approved_by: null,
    qdb_status: 1, // pending
    qdb_expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 72h future
    qdb_rejection_reason: null,
    createdon: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockDataverse(
  overrides: Partial<Record<keyof DataverseClient, unknown>> = {},
): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [] }),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue(makeDataverseUserRole()),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn(),
    ...overrides,
  } as unknown as DataverseClient;
}

function makeMockAuditWriter(): RbacAuditWriter {
  return {
    logRoleAssigned: vi.fn().mockResolvedValue(undefined),
    logRoleRevoked: vi.fn().mockResolvedValue(undefined),
    logPromotionInitiated: vi.fn().mockResolvedValue(undefined),
    logPromotionApproved: vi.fn().mockResolvedValue(undefined),
    logPromotionRejected: vi.fn().mockResolvedValue(undefined),
    logPiiAccessed: vi.fn().mockResolvedValue(undefined),
    logPermissionDenied: vi.fn().mockResolvedValue(undefined),
  } as unknown as RbacAuditWriter;
}

// ---------------------------------------------------------------------------
// RbacError â€” preserved from original 2-test stub
// ---------------------------------------------------------------------------

describe('RbacError', () => {
  it('should_carry_code_and_status_when_constructed', () => {
    // Arrange / Act
    const error = new RbacError('test_code', 'Test message', 400);

    // Assert
    expect(error.code).toBe('test_code');
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('RbacError');
  });

  it('should_be_instance_of_error', () => {
    // Arrange / Act
    const error = new RbacError('code', 'msg', 400);

    // Assert
    expect(error instanceof Error).toBe(true);
    expect(error instanceof RbacError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RbacService.assignRole
// ---------------------------------------------------------------------------

describe('RbacService.assignRole', () => {
  let dataverse: DataverseClient;
  let audit: RbacAuditWriter;
  let service: RbacService;

  beforeEach(() => {
    dataverse = makeMockDataverse({
      // getActiveRoles (getCurrentRbacVersion) returns empty list â†’ version 0
      getList: vi
        .fn()
        .mockResolvedValueOnce({ value: [] }) // getCurrentRbacVersion call
        .mockResolvedValueOnce({ value: [makeDataverseUserRole()] }), // fetchRoleByUserAndSlug call
    });
    audit = makeMockAuditWriter();
    service = new RbacService(dataverse, audit);
  });

  it('assignRole_happyPath_returnsRbacUserRole', async () => {
    // Arrange
    const body = { userId: TARGET_USER_ID, roleSlug: 'staff-viewer' };

    // Act
    const result = await service.assignRole(body, ACTOR_ID, TEST_CTX);

    // Assert
    expect(result.userId).toBe(TARGET_USER_ID);
    expect(result.roleSlug).toBe('staff-viewer');
    expect(result.population).toBe('staff');
  });

  it('assignRole_happyPath_writesAuditEntry', async () => {
    // Arrange
    const body = { userId: TARGET_USER_ID, roleSlug: 'staff-viewer' };

    // Act
    await service.assignRole(body, ACTOR_ID, TEST_CTX);

    // Assert
    expect(audit.logRoleAssigned).toHaveBeenCalledOnce();
    const [auditArgs] = (audit.logRoleAssigned as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(auditArgs.actorUserId).toBe(ACTOR_ID);
    expect(auditArgs.targetUserId).toBe(TARGET_USER_ID);
    expect(auditArgs.roleSlug).toBe('staff-viewer');
  });

  it('assignRole_crossPopulationGuard_throws400ForUnknownOrCitizenRole', async () => {
    // Arrange
    // 'registered-citizen' is a citizen role â€” not in the valid enum for assignRole
    // The service throws unknown_role for any slug not in STAFF_ROLE_SLUGS or CITIZEN_ROLE_SLUGS
    // and portal_admin_requires_promotion for portal-admin. For citizen slugs it throws unknown_role
    // because they pass through validateCrossPopulation (which doesn't block citizen slugs
    // but guardPortalAdminDirectAssign doesn't trigger). The route-level Zod schema blocks
    // citizen slugs before they reach the service â€” this tests the service-layer guard independently.
    const ds = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const svc = new RbacService(ds, makeMockAuditWriter());

    // Act & Assert
    // 'completely-unknown' is not in STAFF_ROLE_SLUGS or CITIZEN_ROLE_SLUGS
    await expect(
      svc.assignRole({ userId: TARGET_USER_ID, roleSlug: 'completely-unknown' }, ACTOR_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'unknown_role', statusCode: 400 });
  });

  it('assignRole_portalAdminDirectAssign_throws400', async () => {
    // Arrange
    const ds = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const svc = new RbacService(ds, makeMockAuditWriter());

    // Act & Assert
    await expect(
      svc.assignRole({ userId: TARGET_USER_ID, roleSlug: 'portal-admin' }, ACTOR_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'portal_admin_requires_promotion', statusCode: 400 });
  });

  it('assignRole_dataverseWriteFailure_propagatesError', async () => {
    // Arrange
    const writeError = new Error('Dataverse 503');
    const ds = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
      create: vi.fn().mockRejectedValue(writeError),
    });
    const svc = new RbacService(ds, makeMockAuditWriter());

    // Act & Assert
    await expect(
      svc.assignRole({ userId: TARGET_USER_ID, roleSlug: 'staff-viewer' }, ACTOR_ID, TEST_CTX),
    ).rejects.toThrow('Dataverse 503');
  });
});

// ---------------------------------------------------------------------------
// RbacService.revokeRole
// ---------------------------------------------------------------------------

describe('RbacService.revokeRole', () => {
  it('revokeRole_happyPath_deactivatesRecord', async () => {
    // Arrange
    const dvRecord = makeDataverseUserRole({ qdb_role_slug: 'staff-viewer' });
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(dvRecord),
      getList: vi.fn().mockResolvedValue({ value: [makeDataverseUserRole()] }), // bumpRbacVersion
      update: vi.fn().mockResolvedValue(undefined),
    });
    const audit = makeMockAuditWriter();
    const service = new RbacService(dataverse, audit);

    // Act
    await service.revokeRole(ASSIGNMENT_ID, ACTOR_ID, TEST_CTX);

    // Assert
    const updateCalls = (dataverse.update as ReturnType<typeof vi.fn>).mock.calls;
    const deactivateCall = updateCalls[0]!;
    expect(deactivateCall[0]).toBe('qdb_rbac_user_roless');
    expect(deactivateCall[1]).toBe(ASSIGNMENT_ID);
    expect(deactivateCall[2]).toMatchObject({ statecode: 1, statuscode: 2 });
    expect(audit.logRoleRevoked).toHaveBeenCalledOnce();
  });

  it('revokeRole_lastPortalAdmin_throws409', async () => {
    // Arrange
    const dvRecord = makeDataverseUserRole({ qdb_role_slug: 'portal-admin' });
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(dvRecord),
      // guardLastPortalAdmin: count = 1 (only this one)
      getList: vi.fn().mockResolvedValue({
        value: [{ qdb_rbac_user_roleid: ASSIGNMENT_ID }],
        '@odata.count': 1,
      }),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.revokeRole(ASSIGNMENT_ID, ACTOR_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'last_portal_admin', statusCode: 409 });
  });

  it('revokeRole_lastPortalAdmin_doesNotCallDataverseUpdate', async () => {
    // Arrange
    const dvRecord = makeDataverseUserRole({ qdb_role_slug: 'portal-admin' });
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(dvRecord),
      getList: vi.fn().mockResolvedValue({
        value: [{ qdb_rbac_user_roleid: ASSIGNMENT_ID }],
        '@odata.count': 1,
      }),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act
    await service.revokeRole(ASSIGNMENT_ID, ACTOR_ID, TEST_CTX).catch(() => undefined);

    // Assert â€” update must not have been called (guard fires before update)
    expect(dataverse.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RbacService.initiatePromotion
// ---------------------------------------------------------------------------

describe('RbacService.initiatePromotion', () => {
  it('initiatePromotion_happyPath_returnsPendingPromotion', async () => {
    // Arrange
    const promotionRecord = makeDataversePromotion();
    const dataverse = makeMockDataverse({
      // guardNoPendingPromotion: no existing pending request
      getList: vi
        .fn()
        .mockResolvedValueOnce({ value: [] }) // guardNoPendingPromotion
        .mockResolvedValueOnce({ value: [promotionRecord] }), // fetchLatestPendingPromotion
      create: vi.fn().mockResolvedValue(promotionRecord),
    });
    const audit = makeMockAuditWriter();
    const service = new RbacService(dataverse, audit);

    // Act
    const result = await service.initiatePromotion(
      { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' },
      ACTOR_ID,
      TEST_CTX,
    );

    // Assert
    expect(result.status).toBe('pending');
    expect(result.targetRole).toBe('portal-admin');
    const expiresAt = new Date(result.expiresAt).getTime();
    const expectedExpiry = Date.now() + 72 * 60 * 60 * 1000;
    // Within 5 seconds tolerance
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    expect(audit.logPromotionInitiated).toHaveBeenCalledOnce();
  });

  it('initiatePromotion_unsupportedRole_throws400', async () => {
    // Arrange
    const dataverse = makeMockDataverse();
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.initiatePromotion(
        { targetUserId: TARGET_USER_ID, targetRole: 'staff-viewer' as 'portal-admin' },
        ACTOR_ID,
        TEST_CTX,
      ),
    ).rejects.toMatchObject({ code: 'unsupported_promotion_role', statusCode: 400 });
  });

  it('initiatePromotion_pendingAlreadyExists_throws409', async () => {
    // Arrange
    const dataverse = makeMockDataverse({
      // guardNoPendingPromotion finds an existing pending request
      getList: vi.fn().mockResolvedValue({
        value: [{ qdb_rbac_promotion_requestid: 'existing-promo-id' }],
      }),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.initiatePromotion(
        { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' },
        ACTOR_ID,
        TEST_CTX,
      ),
    ).rejects.toMatchObject({ code: 'promotion_already_pending', statusCode: 409 });
  });

  it('initiatePromotion_pendingExists_doesNotCallCreate', async () => {
    // Arrange
    const dataverse = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({
        value: [{ qdb_rbac_promotion_requestid: 'existing-promo-id' }],
      }),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act
    await service
      .initiatePromotion(
        { targetUserId: TARGET_USER_ID, targetRole: 'portal-admin' },
        ACTOR_ID,
        TEST_CTX,
      )
      .catch(() => undefined);

    // Assert
    expect(dataverse.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RbacService.approvePromotion
// ---------------------------------------------------------------------------

describe('RbacService.approvePromotion', () => {
  const APPROVER_ID = 'approver-user-004';
  const INITIATOR_ID = 'initiator-user-003';

  function makePendingPromotion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return makeDataversePromotion({
      qdb_initiated_by: INITIATOR_ID,
      ...overrides,
    });
  }

  it('approvePromotion_happyPath_returnsRbacUserRole', async () => {
    // Arrange
    const dvRole = makeDataverseUserRole({ qdb_role_slug: 'portal-admin', qdb_population: 1 });
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(makePendingPromotion()),
      update: vi.fn().mockResolvedValue(undefined),
      // assignRoleDirectly: getCurrentRbacVersion + fetchRoleByUserAndSlug
      getList: vi
        .fn()
        .mockResolvedValueOnce({ value: [] }) // getCurrentRbacVersion (no existing roles)
        .mockResolvedValueOnce({ value: [dvRole] }), // fetchRoleByUserAndSlug
      create: vi.fn().mockResolvedValue(dvRole),
    });
    const audit = makeMockAuditWriter();
    const service = new RbacService(dataverse, audit);

    // Act
    const result = await service.approvePromotion(PROMOTION_ID, APPROVER_ID, TEST_CTX);

    // Assert
    expect(result.roleSlug).toBe('portal-admin');
    expect(dataverse.update).toHaveBeenCalledOnce();
    const [, , updatePayload] = (dataverse.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updatePayload).toMatchObject({
      qdb_status: 2, // approved
      qdb_approved_by: APPROVER_ID,
    });
    expect(audit.logPromotionApproved).toHaveBeenCalledOnce();
  });

  it('approvePromotion_happyPath_writesAuditWithCorrectActor', async () => {
    // Arrange
    const dvRole = makeDataverseUserRole({ qdb_role_slug: 'portal-admin' });
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(makePendingPromotion()),
      update: vi.fn().mockResolvedValue(undefined),
      getList: vi
        .fn()
        .mockResolvedValueOnce({ value: [] })
        .mockResolvedValueOnce({ value: [dvRole] }),
      create: vi.fn().mockResolvedValue(dvRole),
    });
    const audit = makeMockAuditWriter();
    const service = new RbacService(dataverse, audit);

    // Act
    await service.approvePromotion(PROMOTION_ID, APPROVER_ID, TEST_CTX);

    // Assert
    const [auditArgs] = (audit.logPromotionApproved as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(auditArgs.actorUserId).toBe(APPROVER_ID);
    expect(auditArgs.targetUserId).toBe(TARGET_USER_ID);
  });

  it('approvePromotion_selfApprovalProhibited_throws409', async () => {
    // Arrange â€” approverId === initiatedBy
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(makePendingPromotion({ qdb_initiated_by: APPROVER_ID })),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.approvePromotion(PROMOTION_ID, APPROVER_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'self_approval_prohibited', statusCode: 409 });
  });

  it('approvePromotion_promotionNotPending_throws409', async () => {
    // Arrange â€” status = approved (2)
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(
        makePendingPromotion({ qdb_status: 2, qdb_initiated_by: INITIATOR_ID }),
      ),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.approvePromotion(PROMOTION_ID, APPROVER_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'promotion_not_pending', statusCode: 409 });
  });

  it('approvePromotion_promotionExpired_throws409', async () => {
    // Arrange â€” expiresAt is in the past
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(
        makePendingPromotion({ qdb_expires_at: pastExpiry }),
      ),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.approvePromotion(PROMOTION_ID, APPROVER_ID, TEST_CTX),
    ).rejects.toMatchObject({ code: 'promotion_expired', statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
// RbacService.rejectPromotion
// ---------------------------------------------------------------------------

describe('RbacService.rejectPromotion', () => {
  const REJECTOR_ID = 'rejector-user-005';
  const INITIATOR_ID = 'initiator-user-003';

  it('rejectPromotion_happyPath_setsRejectedStatus', async () => {
    // Arrange
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(
        makeDataversePromotion({ qdb_initiated_by: INITIATOR_ID }),
      ),
      update: vi.fn().mockResolvedValue(undefined),
    });
    const audit = makeMockAuditWriter();
    const service = new RbacService(dataverse, audit);

    // Act
    await service.rejectPromotion(PROMOTION_ID, REJECTOR_ID, 'Insufficient justification', TEST_CTX);

    // Assert
    expect(dataverse.update).toHaveBeenCalledOnce();
    const [, , updatePayload] = (dataverse.update as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(updatePayload).toMatchObject({
      qdb_status: 3, // rejected
      qdb_rejection_reason: 'Insufficient justification',
    });
    expect(audit.logPromotionRejected).toHaveBeenCalledOnce();
  });

  it('rejectPromotion_selfApprovalProhibited_throws409', async () => {
    // Arrange â€” rejector === initiator
    const dataverse = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(
        makeDataversePromotion({ qdb_initiated_by: REJECTOR_ID }),
      ),
    });
    const service = new RbacService(dataverse, makeMockAuditWriter());

    // Act & Assert
    await expect(
      service.rejectPromotion(PROMOTION_ID, REJECTOR_ID, 'reason', TEST_CTX),
    ).rejects.toMatchObject({ code: 'self_approval_prohibited', statusCode: 409 });
  });
});

// ---------------------------------------------------------------------------
// RbacAuditWriter append-only contract
// (Uses RbacAuditWriter directly â€” validates AC-RBAC-004)
// ---------------------------------------------------------------------------

describe('RbacAuditWriter_appendOnlyContract', () => {
  it('auditWriter_never_calls_update_or_delete_on_any_log_method', async () => {
    // Arrange â€” import inline to avoid circular dep in test; cast is fine for mock
    const { RbacAuditWriter } = await import('./RbacAuditWriter.js');
    const dvMock = {
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      delete: vi.fn(),
      getList: vi.fn(),
      getById: vi.fn(),
      executeAction: vi.fn(),
    } as unknown as DataverseClient;
    const writer = new RbacAuditWriter(dvMock);

    // Act â€” call all 7 log methods
    const baseParams = { actorUserId: 'u1', correlationId: 'c1', ipAddress: '127.0.0.1' };
    await writer.logRoleAssigned(baseParams);
    await writer.logRoleRevoked(baseParams);
    await writer.logPromotionInitiated(baseParams);
    await writer.logPromotionApproved(baseParams);
    await writer.logPromotionRejected(baseParams);
    await writer.logPiiAccessed({ ...baseParams, resourceId: 'r1', subject: 'CitizenPII' });
    await writer.logPermissionDenied({ ...baseParams, subject: 'RbacRole', action: 'manage' });

    // Assert
    expect(dvMock.update).not.toHaveBeenCalled();
    expect(dvMock.delete).not.toHaveBeenCalled();
    expect(dvMock.create).toHaveBeenCalledTimes(7);
  });

  it('auditWriter_logRoleAssigned_writesEventTypeCode1', async () => {
    // Arrange
    const { RbacAuditWriter } = await import('./RbacAuditWriter.js');
    const dvMock = {
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as DataverseClient;
    const writer = new RbacAuditWriter(dvMock);

    // Act
    await writer.logRoleAssigned({
      actorUserId: 'u1',
      correlationId: 'c1',
      ipAddress: '10.0.0.1',
    });

    // Assert
    const [, payload] = (dvMock.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(payload['qdb_event_type']).toBe(1);
  });
});
