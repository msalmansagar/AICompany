# DXP-P1-002 — Phase 5: QA Document
**Engagement:** DXP-P1-002 — Role-Based Access Control
**Phase:** 5 — Quality Assurance
**Date:** 2026-06-21
**QA Engineer:** qa agent
**Status:** COMPLETE

---

## 1. Test Strategy Summary

### Approach

DXP-P1-002 introduces a security-critical subsystem: every permission decision flows through
`buildAbility` → `NodeCache` → `requirePermission`. A defect in any layer means either
unauthorized access or a denial of legitimate access. Testing discipline is therefore higher than
a typical feature phase.

TDD mandate (Article IV) is applied: the 30 existing tests (28 `RbacAbilityFactory` + 2
`RbacService` stubs) were written RED before Phase 4 implementation. Phase 5 expands the suite
to 72 tests total.

### Tools

| Concern | Tool | Scope |
|---|---|---|
| Unit tests | Vitest 2.x | Pure logic, mocked Dataverse |
| Route integration tests | Vitest + Fastify `inject()` | HTTP layer, mocked service |
| E2E | Playwright | Real browser + real Dataverse (out of scope this phase — blocked on real env) |
| Performance | k6 | Cache-hit latency, login flow p95, revocation propagation |
| Security | Manual + custom k6 script | JWT manipulation, cross-population bypass, self-approval |

### Coverage Targets

| Layer | Target | Rationale |
|---|---|---|
| `RbacAbilityFactory` | 100% branch coverage | Finite switch, no I/O — no excuse |
| `RbacService` (public methods) | 95%+ branch coverage | Mocked Dataverse; all guard paths exercised |
| `adminRbacRoutes` (HTTP) | 100% happy path + all error codes | Security surface — every 40x must be tested |
| `rbacPlugin` preHandler | 90% | Cache hit / miss and 403 paths covered |
| `RbacAuditWriter` | 80% | Tested indirectly through RbacService mocks |

### CI Integration Plan

```
Stage 1 — on every push (< 30 s):
  npx vitest run --reporter=verbose
  Covers: RbacAbilityFactory, RbacService, adminRbacRoutes unit + integration

Stage 2 — on PR (< 2 min):
  npx vitest run --coverage
  Fails if coverage drops below 80% on any metric

Stage 3 — nightly (10 min):
  k6 run perf/rbac-cache.k6.js
  k6 run perf/rbac-login-flow.k6.js
  Fails if p95 latency breaches defined benchmarks

Stage 4 — pre-release only (manual trigger):
  Playwright E2E against staging Dataverse environment
  Promotion approval flow end to end
```

---

## 2. Test Environment Requirements

### Data Setup

| Resource | Value | Notes |
|---|---|---|
| Portal-admin user | `user-admin-001` | Seed via provision script — bootstrap exception (ADR-RBAC-003) |
| Second portal-admin | `user-admin-002` | Required for four-eyes approve tests |
| Staff-viewer user | `user-viewer-001` | Used for 403 boundary tests |
| Support-agent user | `user-agent-001` | Used for PII access tests |
| Target user for promotion | `user-target-001` | No roles initially |
| JWT secret | `test-secret-at-least-32-characters-long!!` | Matches existing test suite |

### Service Dependencies

- `DataverseClient` — mocked via `vi.fn()` in all unit and route integration tests
- `RbacAuditWriter` — mocked via `vi.fn()` in `RbacService` tests
- `NodeCache` — real in-process instance; tested by importing the real `RbacAbilityCache`
- `@fastify/jwt` — real registration against test JWT secret in route tests
- Real Dataverse environment — required for E2E / performance stages only

### Test Account Requirements

Unit and integration tests: none — all Dataverse calls are mocked.
E2E (staging): service principal with `qdb_rbac_user_roles` Read + Append and
`qdb_rbac_promotion_requests` Read + Write + Append. No Write or Delete on
`qdb_rbac_audit_logs` (AC-RBAC-004).

---

## 3. Architecture Condition Verification Matrix

| Condition | Description | Test Cases Proving It |
|---|---|---|
| AC-RBAC-001 | `RbacAuditWriter` writes `pii_accessed` on every CitizenPII read | TC-SEC-003 (unit); TC-E2E-003 (E2E — deferred) |
| AC-RBAC-002 | `approvePromotion` rejects 409 `self_approval_prohibited` when actor === initiator | TC-SVC-015 |
| AC-RBAC-003 | JWT never exceeds 1 KB | TC-SEC-001 |
| AC-RBAC-004 | `qdb_rbac_audit_log` has no Write/Delete in security role — Append only | TC-AUDIT-001 (manual security role inspection); TC-AUDIT-002 (unit verifies no update/delete call is ever made by `RbacAuditWriter`) |
| AC-RBAC-005 | `buildAbility` result is cached; Dataverse not called on hot path | TC-CACHE-001, TC-CACHE-002 |
| AC-RBAC-006 | `qdb_population` derived from role slug server-side; client-supplied value rejected | TC-SVC-003, TC-ROUTE-003 |

---

## 4. Coverage Analysis — Existing 30 Tests

### What is covered

**`RbacAbilityFactory.test.ts` (28 tests):**
- All 7 defined roles: `portal-admin`, `staff-viewer`, `support-agent`, `content-editor`,
  `service-owner`, `registered-citizen`/`corporate-user`, `guest`
- Happy-path permission grants for each
- Explicit denials for PII (`staff-viewer`, `service-owner`, `guest`)
- Multi-role union (`content-editor` + `support-agent`)
- Unknown role slug → zero permissions
- Empty role list → zero permissions

**`RbacService.test.ts` (2 tests):**
- `RbacError` constructor correctness
- `instanceof` chain

### Gaps (to be closed by Phase 5 tests)

| Gap | Severity | Closed by |
|---|---|---|
| `assignRole` happy path | Critical | TC-SVC-001 |
| `assignRole` cross-population guard | Critical | TC-SVC-003 |
| `assignRole` portal-admin direct assign guard | Critical | TC-SVC-004 |
| `assignRole` Dataverse write failure | High | TC-SVC-005 |
| `revokeRole` happy path | Critical | TC-SVC-006 |
| `revokeRole` last-portal-admin guard | Critical | TC-SVC-007 |
| `initiatePromotion` happy path | Critical | TC-SVC-008 |
| `initiatePromotion` unsupported role | High | TC-SVC-009 |
| `initiatePromotion` duplicate pending | High | TC-SVC-010 |
| `approvePromotion` happy path | Critical | TC-SVC-011 |
| `approvePromotion` self-approval | Critical | TC-SVC-015 |
| `approvePromotion` not-pending | High | TC-SVC-013 |
| `approvePromotion` expired | High | TC-SVC-014 |
| `rejectPromotion` happy path | High | TC-SVC-016 |
| `rejectPromotion` self-approval | Critical | TC-SVC-017 |
| All route 401 / 403 / 400 / 422 paths | Critical | TC-ROUTE-* |
| Cache hit path (< 1 ms) | High | TC-CACHE-001 |
| Audit write called after role assign | Critical | TC-SVC-002 |

---

## 5. Test Cases

### 5.1 RbacService Unit Tests

```
TC-SVC-001: assignRole_happyPath_returnsRbacUserRole (US-RBAC-01 / FR-RBAC-001)
Given: DataverseClient.create resolves; fetchRoleByUserAndSlug returns a valid record;
       audit.logRoleAssigned resolves
When:  assignRole({ userId, roleSlug: 'staff-viewer' }, actorId) is called
Then:  resolved value has correct userId, roleSlug, population='staff'
       dataverse.create called once with correct entity and payload
       audit.logRoleAssigned called once with correct actorUserId and targetUserId
Priority: Critical | Type: Unit

TC-SVC-002: assignRole_happyPath_writesAuditEntry (US-RBAC-01 / FR-RBAC-001, AC-RBAC-001)
Given: Same setup as TC-SVC-001
When:  assignRole resolves
Then:  audit.logRoleAssigned was called exactly once
       call args contain actorUserId, targetUserId, roleSlug matching input
Priority: Critical | Type: Unit

TC-SVC-003: assignRole_crossPopulationGuard_throws400 (US-RBAC-04 / FR-RBAC-006, AC-RBAC-006)
Given: roleSlug = 'registered-citizen' (citizen population)
When:  assignRole is called
Then:  throws RbacError with code 'unknown_role' or 'cross_population_role_prohibited'
       statusCode 400
Priority: Critical | Type: Unit

TC-SVC-004: assignRole_portalAdminDirectAssign_throws400 (US-RBAC-03 / FR-RBAC-005)
Given: roleSlug = 'portal-admin'
When:  assignRole is called
Then:  throws RbacError with code 'portal_admin_requires_promotion', statusCode 400
Priority: Critical | Type: Unit

TC-SVC-005: assignRole_dataverseWriteFailure_rethrowsError (FR-RBAC-001)
Given: DataverseClient.create rejects with a generic Error
When:  assignRole is called
Then:  the error propagates — no silent swallowing
Priority: High | Type: Unit

TC-SVC-006: revokeRole_happyPath_deactivatesRecord (US-RBAC-02 / FR-RBAC-002)
Given: fetchRoleById returns a non-portal-admin record;
       guardLastPortalAdmin returns (>1 admin count not needed as slug != portal-admin);
       dataverse.update resolves
When:  revokeRole(assignmentId, actorId) is called
Then:  dataverse.update called with statecode=1, statuscode=2
       audit.logRoleRevoked called once with correct args
Priority: Critical | Type: Unit

TC-SVC-007: revokeRole_lastPortalAdmin_throws409 (US-RBAC-02 / FR-RBAC-003)
Given: fetchRoleById returns a portal-admin record;
       guardLastPortalAdmin query returns count=1
When:  revokeRole is called
Then:  throws RbacError with code 'last_portal_admin', statusCode 409
Priority: Critical | Type: Unit

TC-SVC-008: initiatePromotion_happyPath_returnsPendingRequest (US-RBAC-03 / FR-RBAC-004)
Given: targetRole = 'portal-admin'; no pending promotion exists;
       dataverse.create resolves; fetchLatestPendingPromotion returns valid record
When:  initiatePromotion({ targetUserId, targetRole: 'portal-admin' }, initiatorId) called
Then:  resolved promotion has status='pending'
       expiresAt is approximately 72 hours from now (within 5 seconds tolerance)
       audit.logPromotionInitiated called once
Priority: Critical | Type: Unit

TC-SVC-009: initiatePromotion_unsupportedRole_throws400 (FR-RBAC-004)
Given: targetRole = 'staff-viewer' (not 'portal-admin')
When:  initiatePromotion is called
Then:  throws RbacError with code 'unsupported_promotion_role', statusCode 400
Priority: High | Type: Unit

TC-SVC-010: initiatePromotion_pendingAlreadyExists_throws409 (FR-RBAC-004)
Given: guardNoPendingPromotion query returns value with 1 record
When:  initiatePromotion is called
Then:  throws RbacError with code 'promotion_already_pending', statusCode 409
Priority: High | Type: Unit

TC-SVC-011: approvePromotion_happyPath_returnsRbacUserRole (US-RBAC-03 / FR-RBAC-005, AC-RBAC-002)
Given: fetchPromotionById returns a pending, non-expired promotion;
       approverId !== initiatedBy; dataverse.update resolves;
       assignRoleDirectly resolves with a RbacUserRole
When:  approvePromotion(promotionId, approverId) called
Then:  dataverse.update called with status=approved and qdb_approved_by=approverId
       audit.logPromotionApproved called once
       returns RbacUserRole for the newly assigned portal-admin role
Priority: Critical | Type: Unit

TC-SVC-012: approvePromotion_happyPath_setsApprovedBy (US-RBAC-03 / FR-RBAC-005)
Given: Same setup as TC-SVC-011
When:  approvePromotion resolves
Then:  dataverse.update first call's payload has qdb_approved_by equal to approverId
Priority: High | Type: Unit

TC-SVC-013: approvePromotion_promotionNotPending_throws409 (FR-RBAC-005)
Given: fetchPromotionById returns a promotion with status=approved (code 2)
When:  approvePromotion is called
Then:  throws RbacError with code 'promotion_not_pending', statusCode 409
Priority: High | Type: Unit

TC-SVC-014: approvePromotion_promotionExpired_throws409 (FR-RBAC-005)
Given: fetchPromotionById returns a promotion with status=pending but
       qdb_expires_at is 1 hour in the past
When:  approvePromotion is called
Then:  throws RbacError with code 'promotion_expired', statusCode 409
Priority: High | Type: Unit

TC-SVC-015: approvePromotion_selfApproval_throws409 (US-RBAC-03 / FR-RBAC-005, AC-RBAC-002)
Given: fetchPromotionById returns pending promotion where qdb_initiated_by === approverId
When:  approvePromotion is called
Then:  throws RbacError with code 'self_approval_prohibited', statusCode 409
Priority: Critical | Type: Unit

TC-SVC-016: rejectPromotion_happyPath_setsRejectedStatus (US-RBAC-03 / FR-RBAC-005)
Given: fetchPromotionById returns pending, non-expired promotion; rejectorId !== initiatedBy
When:  rejectPromotion(promotionId, rejectorId, 'reason') called
Then:  dataverse.update called with status=rejected and qdb_rejection_reason='reason'
       audit.logPromotionRejected called once
Priority: High | Type: Unit

TC-SVC-017: rejectPromotion_selfApproval_throws409 (FR-RBAC-005, AC-RBAC-002)
Given: rejectorId === promotion.qdb_initiated_by
When:  rejectPromotion is called
Then:  throws RbacError with code 'self_approval_prohibited', statusCode 409
Priority: Critical | Type: Unit
```

### 5.2 Route Integration Tests

```
TC-ROUTE-001: POST /api/admin/rbac/roles/assign — happy path (US-RBAC-01 / FR-RBAC-001)
Given: Valid portal-admin JWT; rbacService.assignRole mock returns RbacUserRole;
       ability includes 'manage RbacRole'
When:  POST with { userId: valid-uuid, roleSlug: 'staff-viewer' }
Then:  HTTP 201; body.data has id, userId, roleSlug
Priority: Critical | Type: Integration

TC-ROUTE-002: POST /api/admin/rbac/roles/assign — validation failure (FR-RBAC-001)
Given: Valid portal-admin JWT
When:  POST with { userId: 'not-a-uuid', roleSlug: 'staff-viewer' }
Then:  HTTP 400 or 422 (Zod parse failure)
Priority: High | Type: Integration

TC-ROUTE-003: POST /api/admin/rbac/roles/assign — portal-admin blocked (FR-RBAC-005)
Given: Valid portal-admin JWT
When:  POST with { userId: valid-uuid, roleSlug: 'portal-admin' }
Then:  HTTP 400; body.code = 'portal_admin_requires_promotion'
       (roleSlug 'portal-admin' excluded from Zod enum in AssignRoleSchema)
Priority: Critical | Type: Integration

TC-ROUTE-004: POST /api/admin/rbac/roles/assign — no token (FR-RBAC-001)
Given: No Authorization header
When:  POST to assign route
Then:  HTTP 401; body.code = 'unauthorized'
Priority: Critical | Type: Integration

TC-ROUTE-005: POST /api/admin/rbac/roles/assign — insufficient permission (FR-RBAC-001)
Given: Valid JWT for 'staff-viewer' role (cannot manage RbacRole)
When:  POST to assign route
Then:  HTTP 403; body.code = 'forbidden'
Priority: Critical | Type: Integration

TC-ROUTE-006: DELETE /api/admin/rbac/roles/:assignmentId — happy path (US-RBAC-02 / FR-RBAC-002)
Given: Valid portal-admin JWT; rbacService.revokeRole mock resolves
When:  DELETE with valid UUID assignment id
Then:  HTTP 204 (no body)
Priority: Critical | Type: Integration

TC-ROUTE-007: DELETE /api/admin/rbac/roles/:assignmentId — bad UUID (FR-RBAC-002)
Given: Valid portal-admin JWT
When:  DELETE with assignmentId = 'not-a-uuid'
Then:  HTTP 400 or 422
Priority: High | Type: Integration

TC-ROUTE-008: DELETE /api/admin/rbac/roles/:assignmentId — no token (FR-RBAC-002)
Given: No Authorization header
When:  DELETE request
Then:  HTTP 401
Priority: Critical | Type: Integration

TC-ROUTE-009: DELETE /api/admin/rbac/roles/:assignmentId — non-admin token (FR-RBAC-002)
Given: Valid JWT for 'staff-viewer' role
When:  DELETE request with valid UUID
Then:  HTTP 403
Priority: Critical | Type: Integration

TC-ROUTE-010: POST /api/admin/rbac/promotions — happy path (US-RBAC-03 / FR-RBAC-004)
Given: Valid portal-admin JWT; rbacService.initiatePromotion resolves
When:  POST with { targetUserId: valid-uuid, targetRole: 'portal-admin' }
Then:  HTTP 201; body.data has status='pending', expiresAt defined
Priority: Critical | Type: Integration

TC-ROUTE-011: POST /api/admin/rbac/promotions — validation failure (FR-RBAC-004)
Given: Valid portal-admin JWT
When:  POST with { targetUserId: valid-uuid, targetRole: 'staff-viewer' }
       (targetRole must be literal 'portal-admin' per Zod schema)
Then:  HTTP 400 or 422
Priority: High | Type: Integration

TC-ROUTE-012: POST /api/admin/rbac/promotions — no token (FR-RBAC-004)
Given: No Authorization header
When:  POST to promotions route
Then:  HTTP 401
Priority: Critical | Type: Integration

TC-ROUTE-013: POST /api/admin/rbac/promotions — non-admin token (FR-RBAC-004)
Given: Valid JWT for 'staff-viewer'
When:  POST to promotions route
Then:  HTTP 403
Priority: Critical | Type: Integration

TC-ROUTE-014: POST /api/admin/rbac/promotions/:id/approve — happy path (US-RBAC-03 / FR-RBAC-005)
Given: Valid portal-admin JWT; rbacService.approvePromotion resolves with RbacUserRole
When:  POST to /api/admin/rbac/promotions/{uuid}/approve
Then:  HTTP 200; body.data has id, userId, roleSlug='portal-admin'
Priority: Critical | Type: Integration

TC-ROUTE-015: POST /api/admin/rbac/promotions/:id/approve — bad UUID (FR-RBAC-005)
Given: Valid portal-admin JWT
When:  POST with id = 'not-a-uuid'
Then:  HTTP 400 or 422
Priority: High | Type: Integration

TC-ROUTE-016: POST /api/admin/rbac/promotions/:id/approve — no token (FR-RBAC-005)
Given: No Authorization header
When:  POST to approve route
Then:  HTTP 401
Priority: Critical | Type: Integration

TC-ROUTE-017: POST /api/admin/rbac/promotions/:id/approve — non-admin token (FR-RBAC-005)
Given: Valid JWT for 'staff-viewer'
When:  POST to approve route
Then:  HTTP 403
Priority: Critical | Type: Integration

TC-ROUTE-018: POST /api/admin/rbac/promotions/:id/reject — happy path (US-RBAC-03 / FR-RBAC-005)
Given: Valid portal-admin JWT; rbacService.rejectPromotion resolves
When:  POST with id=valid-uuid and body { reason: 'insufficient justification' }
Then:  HTTP 204 (no body)
Priority: High | Type: Integration

TC-ROUTE-019: POST /api/admin/rbac/promotions/:id/reject — missing reason (FR-RBAC-005)
Given: Valid portal-admin JWT
When:  POST with empty body or { reason: '' }
Then:  HTTP 400 or 422 (reason min(1))
Priority: High | Type: Integration

TC-ROUTE-020: POST /api/admin/rbac/promotions/:id/reject — no token (FR-RBAC-005)
Given: No Authorization header
When:  POST to reject route
Then:  HTTP 401
Priority: Critical | Type: Integration

TC-ROUTE-021: POST /api/admin/rbac/promotions/:id/reject — non-admin token (FR-RBAC-005)
Given: Valid JWT for 'staff-viewer'
When:  POST to reject route
Then:  HTTP 403
Priority: Critical | Type: Integration

TC-ROUTE-022: GET /api/admin/rbac/audit — happy path (US-RBAC-05 / FR-RBAC-008)
Given: Valid JWT (auth-only, any authenticated user); rbacService.queryAuditLog returns array
When:  GET /api/admin/rbac/audit
Then:  HTTP 200; body.data is an array
Priority: High | Type: Integration

TC-ROUTE-023: GET /api/admin/rbac/audit — invalid query param (FR-RBAC-008)
Given: Valid JWT
When:  GET /api/admin/rbac/audit?top=999 (max is 200)
Then:  HTTP 400 or 422
Priority: Medium | Type: Integration

TC-ROUTE-024: GET /api/admin/rbac/audit — no token (FR-RBAC-008)
Given: No Authorization header
When:  GET to audit route
Then:  HTTP 401
Priority: Critical | Type: Integration
```

### 5.3 Cache Tests

```
TC-CACHE-001: getCachedAbility_cacheHit_returnsAbilityWithoutDataverseCall (ADR-RBAC-001, AC-RBAC-005)
Given: setCachedAbility called with userId='u1', rbacVersion=3, ability=buildAbility(['staff-viewer'])
When:  getCachedAbility('u1', 3) is called
Then:  returns the same AppAbility instance
       ability.can('read', 'PortalRequest') is true
Priority: High | Type: Unit

TC-CACHE-002: getCachedAbility_cacheMiss_returnsUndefined (ADR-RBAC-001, AC-RBAC-005)
Given: No entry stored for userId='u2', rbacVersion=1
When:  getCachedAbility('u2', 1) is called
Then:  returns undefined
Priority: High | Type: Unit
```

### 5.4 Security Test Cases

```
TC-SEC-001: JWT_sizeUnder1KB_satisfied (AC-RBAC-003)
Given: A TokenClaims object with sub (36 chars), email (50 chars),
       roles: ['portal-admin'], rbac_version: 99999, jti: uuid, iat, exp
When:  Signed with HS256 and measured
Then:  Buffer.byteLength(token) < 1024
Confidence: 98% (deterministic calculation)
Priority: Critical | Type: Unit (manual measurement)

TC-SEC-002: requirePermission_403_writesPermissionDeniedAuditEntry (AC-RBAC-001)
Given: staff-viewer token; route protected by requirePermission('manage','RbacRole')
When:  Request is made without sufficient permission
Then:  HTTP 403 returned; auditWriter.logPermissionDenied invoked
Confidence: 95%
Priority: Critical | Type: Integration

TC-SEC-003: piiAccessed_auditEntry_written_on_CitizenPII_read (AC-RBAC-001)
Given: support-agent JWT; endpoint that reads CitizenPII data calls audit.logPiiAccessed
When:  PII endpoint is hit
Then:  logPiiAccessed is called with correct actorUserId and resourceId
Note:  Requires a PII-serving endpoint to be wired. Deferred to E2E if no unit-testable hook.
Confidence: 90% (AC-RBAC-001 compliance obligation is real; endpoint wiring not yet confirmed)
Priority: Critical | Type: Integration (deferred to E2E)

TC-SEC-004: crossPopulation_citizenRoleSlug_rejectedBySchema (AC-RBAC-006)
Given: Valid portal-admin JWT; AssignRoleSchema allows only staff role slugs
       (registered-citizen, corporate-user, guest are NOT in the enum)
When:  POST /api/admin/rbac/roles/assign with roleSlug='registered-citizen'
Then:  HTTP 400 (Zod enum parse failure at route level)
Confidence: 97%
Priority: Critical | Type: Integration

TC-SEC-005: selfApprovalProhibited_409_returned (AC-RBAC-002, FR-RBAC-005)
Given: approvePromotion called where approverId equals promotion.qdb_initiated_by
When:  approvePromotion service method executes
Then:  RbacError code='self_approval_prohibited' statusCode=409 is thrown
Confidence: 99% (deterministic guard check in service layer)
Priority: Critical | Type: Unit
```

### 5.5 Edge Cases

```
TC-EDGE-001: buildAbility_emptyRoleList_denyAll (FR-RBAC-009)
Given: buildAbility([])
When:  ability queried for any action on any subject
Then:  all ability.can() calls return false
Covered by: existing test 'should_return_empty_ability_when_no_roles'
Priority: High | Type: Unit

TC-EDGE-002: getActiveRoles_expiredAssignment_filtered (FR-RBAC-001)
Given: Dataverse returns a role record with qdb_expires_at in the past
When:  getActiveRoles maps the result
Then:  expired record is filtered out; returned array excludes it
Note:  Logic tested indirectly; filterExpired is a pure function inside service.
Priority: High | Type: Unit

TC-EDGE-003: approvePromotion_expiredPromotion_throws409 (FR-RBAC-005)
Given: Promotion record has qdb_expires_at = 1 hour ago; status = pending
When:  approvePromotion called
Then:  RbacError code='promotion_expired' statusCode=409
Covered by: TC-SVC-014
Priority: High | Type: Unit

TC-EDGE-004: revokeRole_lastPortalAdmin_blockedAt409 (FR-RBAC-003)
Given: Only 1 active portal-admin record exists in Dataverse
When:  revokeRole called on that record
Then:  RbacError code='last_portal_admin' statusCode=409; Dataverse.update NOT called
Covered by: TC-SVC-007
Priority: Critical | Type: Unit

TC-EDGE-005: rbacVersion_mismatch_triggersCacheRebuild (ADR-RBAC-001, AC-RBAC-005)
Given: User has rbac_version=3 in JWT; cache has entry for version=2 but not 3
When:  requirePermission preHandler executes
Then:  getCachedAbility('userId', 3) returns undefined → Dataverse fetch triggered
       setCachedAbility stores fresh ability under key 'userId:3'
Confidence: 95%
Priority: High | Type: Integration

TC-EDGE-006: multipleRoles_unionPermissions (FR-RBAC-009)
Given: buildAbility(['content-editor', 'support-agent'])
When:  ability.can('manage','CmsContent') and ability.can('read','CitizenPII')
Then:  both return true
Covered by: existing test 'should_union_permissions_when_user_holds_multiple_roles'
Priority: Medium | Type: Unit

TC-EDGE-007: initiatePromotion_duplicatePending_blocked (FR-RBAC-004)
Given: Pending promotion already exists for targetUserId + targetRole pair
When:  initiatePromotion called again for same pair
Then:  RbacError code='promotion_already_pending' statusCode=409
Covered by: TC-SVC-010
Priority: High | Type: Unit
```

---

## 6. Performance Benchmarks

| Scenario | Target p95 | Target Throughput | Measurement Tool | Notes |
|---|---|---|---|---|
| `getCachedAbility` in-process (cache hit) | < 1 ms | N/A | Vitest benchmark / `performance.now()` | Key ADR-RBAC-001 commitment |
| `buildAbility(['portal-admin'])` cold call | < 5 ms | N/A | Vitest benchmark | CASL rule build has no I/O |
| Login flow (POST /api/auth/login) end-to-end | < 800 ms p95 | 50 req/s | k6 | Includes Dataverse auth call |
| `requirePermission` preHandler (cache hit) | < 5 ms added latency | N/A | k6 + trace headers | Hot path: only NodeCache.get + ability.can() |
| Forced role revocation → new request reflects change | < 60 s | N/A | k6 scenario | JWT TTL = 900s; new JWT issued post-revoke carries new rbac_version |
| Promotion approval full flow (API only, no DB) | < 200 ms p95 | 10 req/s | k6 | Two Dataverse writes (update + create) |

### Performance Notes

The 60-second revocation propagation SLA is achievable: when a role is revoked the
`rbac_version` increments. The user's existing JWT carries the old version. The user must
re-login (or the access token must expire and refresh) to receive a new JWT with the updated
`rbac_version`. The 60-second target applies to the NodeCache valid-JTI window (see
`auth-guard.ts` `validJtiCache` TTL = 60 s), not to the RBAC version cache (900 s TTL matches
JWT lifetime). This distinction must be re-verified with the architect before the benchmark is
committed.

---

## 7. Audit Trail Tests

```
TC-AUDIT-001: auditWriter_never_calls_update_or_delete (AC-RBAC-004)
Given: RbacAuditWriter is instantiated with a mock DataverseClient
When:  All 7 log methods are called (logRoleAssigned, logRoleRevoked,
       logPromotionInitiated, logPromotionApproved, logPromotionRejected,
       logPiiAccessed, logPermissionDenied)
Then:  dataverse.update was never called
       dataverse.delete was never called
       dataverse.create was called exactly 7 times
Confidence: 99%
Priority: Critical | Type: Unit

TC-AUDIT-002: auditWriter_logRoleAssigned_writesCorrectEventTypeCode (AC-RBAC-004)
Given: Mock DataverseClient.create resolves
When:  logRoleAssigned({ actorUserId, correlationId, ipAddress }) called
Then:  dataverse.create called with qdb_event_type = 1
Priority: High | Type: Unit
```

---

## 8. Pass/Fail Criteria for Phase 5 Sign-Off

All of the following must be true before Phase 5 is signed off:

- [ ] `npx vitest run` exits with code 0 — zero failures
- [ ] Coverage report: lines >= 80%, functions >= 80%, branches >= 80%
- [ ] All TC-SVC-001 through TC-SVC-017 pass (RbacService unit tests)
- [ ] All TC-ROUTE-001 through TC-ROUTE-024 pass (route integration tests)
- [ ] TC-AUDIT-001 passes — confirms append-only constraint in code
- [ ] TC-SEC-001 passes — JWT size verified < 1 KB
- [ ] TC-SEC-004 passes — cross-population blocked at schema level
- [ ] AC-RBAC-001 through AC-RBAC-006 each have at least one passing test referencing them
- [ ] No test uses a real Dataverse connection (unit/integration stages must be offline-capable)
- [ ] Test execution time for full suite < 30 seconds

### Deferred to E2E Phase (requires real Dataverse / staging environment)

- TC-SEC-003 (pii_accessed audit write in production path)
- TC-EDGE-005 (rbac_version mismatch live cache rebuild)
- Full promotion flow browser-level (Playwright)
- k6 performance benchmarks against staging API

---

## 9. Defects and Risks Identified During Phase 5

| # | Finding | Confidence | Severity | Recommendation |
|---|---|---|---|---|
| D-001 | `validateCrossPopulation` currently only validates that the roleSlug is known — it does NOT check whether the user already holds a role of the opposite population. The cross-population guard is only enforced by the Dataverse alternate key constraint, not in service layer code. AC-RBAC-006 says "client-supplied population must be rejected" — population is correctly derived from slug (not accepted from client), but same-account cross-population assignment (e.g. a portal-user getting both `staff-viewer` and `registered-citizen`) is not blocked in code. | 92% | High | Add a Dataverse lookup of the user's existing roles before assigning; compare population sets. Raise as defect against Phase 4. |
| D-002 | `GET /api/admin/rbac/audit` uses `preHandler: authOnly` (authenticate only), not `adminGuard`. Any authenticated user — including `registered-citizen` — can query the full audit log. The Phase 3 architecture table says this route requires `portal-admin`. | 96% | Critical | Change preHandler to `adminGuard` on the audit GET route. Raise as Phase 4 defect. |
| D-003 | `bumpRbacVersionForUser` updates only the first active role record's `qdb_rbac_version`, not all records. If a user has two active roles, the second record retains a lower version. `getCurrentRbacVersion` uses `Math.max` across all records, which reads correctly, but if only one record is bumped, the max is correctly the new value — this works. However, the comment in the architecture doc says "max across user's records = user's `rbac_version` in JWT" — needs re-verification that single-record bump always produces the correct max. Risk is low in practice but the logic is subtle. | 82% | Medium | Add a unit test that exercises a two-role user and verifies max version is correct after revoke. |

---

*Phase 5 QA complete. Total new tests produced: 42 (17 RbacService unit + 24 route integration + 1 cache). Combined with 30 existing tests = 72 tests total.*
