// ---------------------------------------------------------------------------
// RBAC domain types — DXP-P1-002
// ---------------------------------------------------------------------------

import type { MongoAbility, InferSubjects } from '@casl/ability';

export type RbacAction = 'create' | 'read' | 'update' | 'delete' | 'manage';

export type RbacSubject =
  | 'PortalRequest'
  | 'CitizenPII'
  | 'PortalService'
  | 'CmsContent'
  | 'PortalUser'
  | 'RbacRole'
  | 'PortalConfig'
  | 'ComponentRegistry'
  | 'AdminResource'
  | 'all';

export type AppAbility = MongoAbility<[RbacAction, InferSubjects<RbacSubject>]>;

export interface RbacUserRole {
  id: string;
  userId: string;
  roleSlug: string;
  population: 'staff' | 'citizen';
  assignedBy: string;
  assignedOn: string;
  expiresAt: string | null;
  rbacVersion: number;
}

export interface PromotionRequest {
  id: string;
  targetUserId: string;
  targetRole: string;
  initiatedBy: string;
  approvedBy: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  rejectionReason: string | null;
  createdOn: string;
}

export interface AuditLogEntry {
  id: string;
  eventType: RbacAuditEventType;
  actorUserId: string;
  targetUserId: string | null;
  roleSlug: string | null;
  subject: string | null;
  action: string | null;
  resourceId: string | null;
  correlationId: string;
  ipAddress: string;
  detail: string | null;
  createdOn: string;
}

export type RbacAuditEventType =
  | 'role_assigned'
  | 'role_revoked'
  | 'promotion_initiated'
  | 'promotion_approved'
  | 'promotion_rejected'
  | 'pii_accessed'
  | 'permission_denied';
