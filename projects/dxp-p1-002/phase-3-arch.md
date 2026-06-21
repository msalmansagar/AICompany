# DXP-P1-002 — Architecture Document
**Engagement:** DXP-P1-002 — Role-Based Access Control  
**Phase:** 3 — Architecture  
**Date:** 2026-06-21  
**Architect:** architect agent  
**Status:** COMPLETE

---

## 1. Stakeholder Answers (Gate 2 — cleared 2026-06-21)

| # | Question | Answer | Architectural Impact |
|---|---|---|---|
| Cond-1 | PII access for support-agent? | **Yes — scoped to active requests, under access control + audit** | `support-agent` gets field-level PII read via CASL subject conditions; every PII access written to audit log |
| Cond-2 | Four-eyes for portal-admin promotion? | **Yes** | Requires a separate `qdb_rbac_promotion_requests` entity and a two-step API; single-write promotion is prohibited for this role |
| Cond-3 | Max JWT / header size? | **8 KB ceiling; use reference-token / server-side cache** | JWT embeds only `rbac_version` (integer); full `AppAbility` rules cached in NodeCache, re-fetched from Dataverse on version mismatch |

---

## 2. Architecture Decisions (ADRs)

### ADR-RBAC-001 — Reference-Token Pattern (not JWT-embedded permissions)
**Decision:** The JWT carries only `{ sub, email, role, rbac_version, jti, iat, exp }`. Full permission rules are stored in a server-side NodeCache keyed by `${userId}:${rbac_version}`.

**Rejected:** Embedding CASL `packRules()` output in a JWT claim (as originally proposed in BRD). Reason: QDB infrastructure enforces an 8 KB header ceiling; 8 roles × multiple subject/action/condition tuples can exceed this. A single `rbac_version` integer is always < 50 bytes.

**Consequence:** Cache miss on a role change adds one Dataverse round-trip (~150 ms). Hot path (cache hit) remains < 1 ms.

---

### ADR-RBAC-002 — CASL `@casl/ability` for permission evaluation
**Decision:** Adopt `@casl/ability` (7 000 ★, MIT). Used exclusively for in-process `ability.can(action, subject, field?)` evaluation. Dataverse is the policy store; CASL is the evaluator. No CASL storage adapters adopted.

**Rationale:** Avoids writing and unit-testing a bespoke bit-mask evaluator; provides field-level permission checking needed for PII scoping (Cond-1); future-proofs for ABAC when DXP-P1-003 service-owner row-level scoping is required.

---

### ADR-RBAC-003 — Four-eyes via Promotion Requests entity
**Decision:** Promoting any user to `portal-admin` requires a separate `qdb_rbac_promotion_requests` record in `pending` state. A *different* `portal-admin` must approve it. The role assignment only occurs on approval.

**Rejected:** Inline two-param confirm on the same endpoint. Reason: doesn't provide an audit trail of who initiated vs who approved, and doesn't support async workflows where the approver acts hours later.

**Bootstrap exception:** Seed data provisions the first `portal-admin` directly (bypasses four-eyes). Documented in runbook. All subsequent `portal-admin` promotions require the approval flow.

---

### ADR-RBAC-004 — Append-only role store, deactivate not delete
**Decision:** `qdb_rbac_user_roles` records are never deleted. Role removal sets `statecode = 1` (inactive). Effective roles = active records for a user. Audit log is a separate append-only table.

**Rationale:** QFC/QCB audit obligation — must reconstruct role state at any point in time (feeds DXP-P1-004 snapshot model).

---

### ADR-RBAC-005 — Backward-compatible Fastify plugin
**Decision:** `fastify.requireRole(roleName)` continues to work unchanged (string comparison against `request.user.role`). New `fastify.requirePermission(action, subject)` is added alongside it. Existing routes need not be migrated immediately.

**Migration path:** Routes migrated opportunistically. `portal-admin` check on all `/api/admin/*` routes migrates to `requirePermission('manage', 'AdminResource')` in DXP-P1-002. Other routes migrate in later phases.

---

## 3. Data Model — Dataverse Entities (QdbDxpPlatform solution)

### 3.1 `qdb_rbac_user_roles` — Role Assignment Store
| Field | Type | Notes |
|---|---|---|
| `qdb_rbac_user_roleid` | GUID PK | |
| `qdb_user_id` | String(100) | Portal user sub (from JWT) |
| `qdb_role_slug` | String(64) | e.g. `portal-admin`, `support-agent` |
| `qdb_population` | OptionSet | `staff` (1) / `citizen` (2) — enforces cross-population guard |
| `qdb_assigned_by` | String(100) | userId of assigning admin |
| `qdb_assigned_on` | DateTime | |
| `qdb_expires_at` | DateTime (nullable) | null = permanent |
| `qdb_rbac_version` | Integer | Incremented on this user's role record; max across user's records = user's `rbac_version` in JWT |
| `statecode` | System | 0 = active, 1 = inactive (deactivated = role removed) |
| `createdon`, `modifiedon` | System | |

**Alternate key:** `qdb_UserRoleKey` on `(qdb_user_id, qdb_role_slug)` — prevents duplicate active role assignments.

---

### 3.2 `qdb_rbac_audit_log` — Immutable Audit Trail
| Field | Type | Notes |
|---|---|---|
| `qdb_rbac_audit_logid` | GUID PK | |
| `qdb_event_type` | OptionSet | `role_assigned`, `role_revoked`, `promotion_initiated`, `promotion_approved`, `promotion_rejected`, `pii_accessed`, `permission_denied` |
| `qdb_actor_user_id` | String(100) | Who performed the action |
| `qdb_target_user_id` | String(100, nullable) | Who was affected (null for permission_denied) |
| `qdb_role_slug` | String(64, nullable) | Which role |
| `qdb_subject` | String(255, nullable) | CASL subject (e.g. `CitizenRequest`) |
| `qdb_action` | String(64, nullable) | CASL action (e.g. `read`) |
| `qdb_resource_id` | String(100, nullable) | Specific record GUID if applicable |
| `qdb_correlation_id` | String(100) | HTTP request correlationId |
| `qdb_ip_address` | String(45) | IPv4/IPv6 of actor |
| `qdb_detail` | Memo(4000, nullable) | JSON blob for extra context |
| `createdon` | System | Insert timestamp — **no UPDATE or DELETE ever** |

**Retention:** 7-year active in Dataverse. Archival to Azure Blob at year 2 (DXP-P1-004 scope).

---

### 3.3 `qdb_rbac_promotion_requests` — Four-Eyes Approval Workflow
| Field | Type | Notes |
|---|---|---|
| `qdb_rbac_promotion_requestid` | GUID PK | |
| `qdb_target_user_id` | String(100) | User being promoted |
| `qdb_target_role` | String(64) | Role being promoted to (initially always `portal-admin`) |
| `qdb_initiated_by` | String(100) | userId of initiating admin |
| `qdb_approved_by` | String(100, nullable) | userId of approving admin (set on approval) |
| `qdb_status` | OptionSet | `pending`(1), `approved`(2), `rejected`(3), `expired`(4) |
| `qdb_expires_at` | DateTime | 72 hours after initiation; job sets to `expired` after cutoff |
| `qdb_rejection_reason` | String(500, nullable) | |
| `createdon`, `modifiedon` | System | |

**Constraint enforced in service layer:** `qdb_approved_by` must differ from `qdb_initiated_by` (HTTP 409 `self_approval_prohibited`).

---

## 4. Permission Matrix

CASL subject types map to portal domain concepts. `manage` = all CRUD actions.

| Role | PortalRequest | CitizenPII | PortalService | CmsContent | PortalUser | RbacRole | PortalConfig | ComponentRegistry |
|---|---|---|---|---|---|---|---|---|
| `portal-admin` | manage | manage | manage | manage | manage | manage | manage | manage |
| `staff-viewer` | read (no PII) | ❌ | read | read | read (no PII) | read | read | read |
| `service-owner` | read (own service)* | ❌ | manage (own)* | manage (own)* | ❌ | ❌ | ❌ | ❌ |
| `support-agent` | read + update | **read (PII)** | read | ❌ | read (PII) | ❌ | ❌ | ❌ |
| `content-editor` | ❌ | ❌ | read | manage | ❌ | ❌ | ❌ | ❌ |
| `registered-citizen` | create + read (own) | read (own) | read | read (published) | read (own) | ❌ | ❌ | ❌ |
| `corporate-user` | create + read (own) | read (own) | read | read (published) | read (own) | ❌ | ❌ | ❌ |
| `guest` | ❌ | ❌ | read | read (published) | ❌ | ❌ | ❌ | ❌ |

\* `service-owner` row-level scoping deferred to DXP-P1-003 (Cond-4 from CEO approval). Data model must not block it — `qdb_role_slug` is a string, not a FK, so service slug can be appended (e.g. `service-owner:loan-services`) without schema change.

**PII fields on `PortalRequest`:** `qdb_form_data`, `qdb_user_id`. Accessible to `support-agent` and `portal-admin` only. CASL field-level restriction applied to `staff-viewer` read rule.

**Cross-population prohibition:** `qdb_population` field on `qdb_rbac_user_roles`. Staff roles (`portal-admin`, `staff-viewer`, `service-owner`, `support-agent`, `content-editor`) = population `staff`. Citizen roles (`registered-citizen`, `corporate-user`, `guest`) = population `citizen`. Assigning a staff role to a citizen user → HTTP 400 `cross_population_role_prohibited`.

---

## 5. CASL `AppAbility` Definition

```typescript
// packages/types/src/rbac.ts  (new file)
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
```

### `buildAbility(roleSlugs: string[]): AppAbility`
Called on cache miss. Maps role slugs to CASL rules:

```typescript
// services/RbacAbilityFactory.ts
import { createMongoAbility, AbilityBuilder } from '@casl/ability';
import type { AppAbility } from '@portal/types';

const STAFF_ROLES = new Set(['portal-admin','staff-viewer','service-owner','support-agent','content-editor']);

export function buildAbility(roleSlugs: string[]): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  for (const slug of roleSlugs) {
    switch (slug) {
      case 'portal-admin':
        can('manage', 'all');
        break;
      case 'staff-viewer':
        can('read', ['PortalRequest', 'PortalService', 'CmsContent', 'PortalUser',
                     'RbacRole', 'PortalConfig', 'ComponentRegistry']);
        cannot('read', 'CitizenPII'); // explicitly blocked
        break;
      case 'support-agent':
        can('read', 'PortalRequest');
        can('read', 'CitizenPII');    // Cond-1 answer
        can('update', 'PortalRequest');
        can('read', 'PortalUser');
        break;
      case 'content-editor':
        can('read', 'PortalService');
        can('manage', 'CmsContent');
        break;
      case 'service-owner':
        can('read', 'PortalRequest');
        can(['manage'], 'PortalService');
        can(['manage'], 'CmsContent');
        break;
      case 'registered-citizen':
      case 'corporate-user':
        can(['create', 'read'], 'PortalRequest');
        can('read', ['PortalService', 'CmsContent', 'PortalUser']);
        can('read', 'CitizenPII');    // own PII only — conditions enforced in service layer
        break;
      case 'guest':
        can('read', ['PortalService', 'CmsContent']);
        break;
    }
  }

  return build();
}
```

---

## 6. JWT Claim Structure (updated)

```jsonc
{
  "sub": "user-guid-from-dataverse",
  "email": "user@example.com",
  "role": "portal-admin",        // primary role (backward compat with requireRole)
  "rbac_version": 7,             // monotonically increasing per user; changes on any role add/remove
  "jti": "uuid-v4",
  "iat": 1750000000,
  "exp": 1750003600
}
```

`role` is the highest-privilege role slug held by the user (for backward-compat `requireRole` checks). `rbac_version` is the cache invalidation key.

**JWT size:** ~350 bytes — well within the 8 KB ceiling.

---

## 7. Server-Side Permission Cache

```
NodeCache (in-process, per API instance)
  key:   "${userId}:${rbac_version}"
  value: AppAbility (CASL MongoAbility instance)
  TTL:   900 seconds (15 min, matches access token lifetime)
```

**Request flow:**
```
1. JWT validated (fastify.authenticate) → request.user populated
2. requirePermission preHandler:
   a. cacheKey = `${request.user.sub}:${request.user.rbac_version}`
   b. ability = cache.get(cacheKey)
   c. if (ability === undefined):
        roles = await RbacService.getActiveRoles(request.user.sub)
        ability = buildAbility(roles.map(r => r.slug))
        cache.set(cacheKey, ability)
   d. if (!ability.can(action, subject)) return reply.status(403).send(...)
3. Handler runs
```

**Cache invalidation:** When any role is assigned or revoked, the service increments the user's `rbac_version` in `qdb_rbac_user_roles` (by updating the `qdb_rbac_version` on the affected record and storing the new max). The next request by that user will carry the stale `rbac_version` in their current JWT — cache miss on old version → fresh fetch. The old cache entry is naturally evicted at TTL.

**Multi-instance:** NodeCache is in-process. With multiple API instances, each instance builds its own cache independently on cache miss. This is acceptable — worst case is N instances × 1 Dataverse fetch per role change. Redis (if QDB confirms availability in P1-003/OQ-003) can replace NodeCache for a shared cache.

---

## 8. API Surface

### Role Assignment
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/roles/users/:userId` | portal-admin | Get active roles for a user |
| `POST` | `/api/admin/roles/assign` | portal-admin | Assign a non-portal-admin role immediately |
| `DELETE` | `/api/admin/roles/:assignmentId` | portal-admin | Revoke a role (deactivates record) |

### Four-Eyes Promotion (portal-admin only)
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/admin/roles/promotions` | portal-admin | Initiate portal-admin promotion request |
| `GET` | `/api/admin/roles/promotions` | portal-admin | List promotion requests (pending/recent) |
| `GET` | `/api/admin/roles/promotions/:id` | portal-admin | Get single promotion request |
| `POST` | `/api/admin/roles/promotions/:id/approve` | portal-admin (different user) | Approve promotion — creates role record |
| `POST` | `/api/admin/roles/promotions/:id/reject` | portal-admin (different user) | Reject promotion |

### Audit Log
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/roles/audit` | portal-admin | Query audit log (filter: userId, eventType, dateRange) |

### Guard Rules
- `POST /api/admin/roles/promotions/:id/approve`: HTTP 409 `self_approval_prohibited` if `request.user.sub === promotion.initiatedBy`
- `DELETE /api/admin/roles/:assignmentId`: HTTP 409 `last_portal_admin` if removing the last active `portal-admin` record
- `POST /api/admin/roles/assign`: HTTP 400 `cross_population_role_prohibited` if assigning staff role to citizen user or vice versa

---

## 9. Fastify Plugin Design

### New decorator: `fastify.requirePermission`

```typescript
// plugins/rbac.ts
fastify.decorate('requirePermission', (action: RbacAction, subject: RbacSubject) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ability = await resolveAbility(request.user, rbacService, abilityCache);
    if (!ability.can(action, subject)) {
      await auditService.logPermissionDenied(request, action, subject);
      return reply.status(403).send({ code: 'forbidden', message: `Cannot ${action} ${subject}` });
    }
  };
});
```

### Existing `fastify.requireRole` — unchanged
All existing routes using `requireRole('Admin')` continue to function. Migration is optional and additive.

### `request.ability` decoration (optional, for service-layer checks)
```typescript
// After authenticate + requirePermission:
request.ability // AppAbility instance — available in handler for field-level checks
```

---

## 10. Service Layer — `RbacService`

```
RbacService
  ├── getActiveRoles(userId)          → RbacUserRole[]
  ├── assignRole(body, actorId)       → RbacUserRole       [validates cross-pop, writes audit]
  ├── revokeRole(assignmentId, actor) → void               [validates last-admin, writes audit]
  ├── initiatePromotion(body, actor)  → PromotionRequest   [portal-admin only]
  ├── approvePromotion(id, actor)     → RbacUserRole       [validates self-approval, assigns role]
  ├── rejectPromotion(id, actor)      → void
  └── queryAuditLog(filters)          → AuditLogEntry[]
```

`RbacAuditWriter` (separate class, single responsibility):
```
RbacAuditWriter
  ├── logRoleAssigned(...)
  ├── logRoleRevoked(...)
  ├── logPromotionInitiated(...)
  ├── logPromotionApproved(...)
  ├── logPiiAccessed(request, resourceId)    ← called from support-agent PII endpoints
  └── logPermissionDenied(request, action, subject)
```

---

## 11. Dataverse Schema Additions (QdbDxpPlatform solution)

3 new entities added to the existing solution:
1. `qdb_Rbac_User_Roles` → entity + 9 custom attributes + alternate key
2. `qdb_Rbac_Audit_Log` → entity + 11 custom attributes (no UPDATE/DELETE in security role)
3. `qdb_Rbac_Promotion_Requests` → entity + 8 custom attributes

Provisioned via `provision-schema` script extension (new `rbacEntities.ts` batch group).

---

## 12. Open Items for Builder

| # | Item | Owner |
|---|---|---|
| OI-001 | `service-owner` slug format for row-level scoping (`service-owner:loan-services` vs separate field) | Architect decision deferred to P1-003 |
| OI-002 | Promotion request expiry job — Fastify cron or Azure Logic App? | DevOps |
| OI-003 | Notification to other portal-admins when promotion is initiated — reuse existing NotificationService or email? | BA clarification |
| OI-004 | Redis for shared RBAC cache (multi-instance) — pending OQ-003 answer from P1-003 | QDB IT |

---

## 13. Architecture Conditions (for Phase 4 builder)

| # | Condition | Reason |
|---|---|---|
| AC-RBAC-001 | `RbacAuditWriter` must write a `pii_accessed` log entry on every request that reads `CitizenPII`-scoped data | Cond-1 compliance obligation |
| AC-RBAC-002 | `approvePromotion` must reject with 409 `self_approval_prohibited` if actor === initiator | Cond-2 four-eyes integrity |
| AC-RBAC-003 | JWT must never exceed 1 KB in total size | Cond-3 — keeps well under 8 KB even with other middleware headers |
| AC-RBAC-004 | `qdb_rbac_audit_log` must have no Write or Delete in the security role — Read + Append only | ADR-RBAC-004 |
| AC-RBAC-005 | `buildAbility` result must be cached; a Dataverse call on every request is a performance violation | ADR-RBAC-001 |
| AC-RBAC-006 | `qdb_population` field must be validated server-side; client-supplied population must be rejected | Cross-population guard |

---

*Architecture complete. GitHub Research (Phase 2) and Architecture (Phase 3) are done. Ready for Phase 4 build once builder is engaged.*
