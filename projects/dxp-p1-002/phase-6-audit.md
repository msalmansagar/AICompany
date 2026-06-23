# DXP-P1-002 — Phase 6: Security & Compliance Audit
**Engagement:** DXP-P1-002 — Role-Based Access Control
**Phase:** 6 — Security & Compliance Audit
**Date:** 2026-06-21
**Auditor:** auditor agent
**Client:** Qatar Development Bank (QDB)
**Applicable Law:** Qatar Personal Data Protection Law No. 13 of 2016
**Status:** COMPLETE

---

## 1. Executive Summary

The RBAC implementation is structurally sound and demonstrates deliberate security engineering: CASL permission evaluation is correctly integrated, the four-eyes promotion flow enforces self-approval prohibition at the service layer, Zod validation covers all route inputs, and the audit writer is correctly append-only in code. One **Critical** finding was resolved during Phase 5 (D-002: audit log route was auth-only; corrected to `adminGuard` before sign-off). The remaining findings that require CEO attention are: a **High** deficiency where the IP address is never passed to service-layer audit calls for role mutations (resulting in blank `qdb_ip_address` stored against all RBAC events — a direct Qatar Law No. 13 obligation), and a **High** gap where the `pii_accessed` audit log hook exists in the writer but is never invoked from any route serving `CitizenPII` data, leaving the primary PII compliance obligation (AC-RBAC-001) unverified and likely unmet in production. Overall risk posture is **High** — the system must not go live until SEC-02 and SEC-03 are resolved.

---

## 2. Findings Summary Table

| ID | Severity | Category | Finding | File:Line | Recommendation |
|---|---|---|---|---|---|
| SEC-01 | High | Audit Integrity | `ipAddress` hardcoded to empty string in all service-layer audit calls for role assign, revoke, promote, and reject operations | `RbacService.ts:189, 220, 264, 300, 334` | Pass `ipAddress` through from the HTTP request layer into every service method that calls the audit writer |
| SEC-02 | High | PII Compliance (Qatar Law 13) | `logPiiAccessed` is defined and wired but never called from any route that returns CitizenPII data — AC-RBAC-001 is unfulfilled | `requests.ts` (entire file); `RbacService.ts` (no call site) | Add `requirePermission('read','CitizenPII')` and `logPiiAccessed` invocation to all support-agent and admin request-detail endpoints that return `qdb_form_data` or `qdb_user_id` |
| SEC-03 | Medium | Governance — Version Fragility (D-003) | `bumpRbacVersionForUser` updates only the first active role record; a multi-role user who gains a third role after a revoke may have the max version on an unmodified record, making the logic correct but fragile and unit-test coverage absent | `RbacService.ts:590–605` | Add a unit test proving max version correctness for a three-role user; document this as a known constraint in the runbook |
| SEC-04 | Medium | Token Security — Fail-Open JTI Blocklist | When the Dataverse blocklist query fails, the auth guard silently allows the request. A revoked token is treated as valid during Dataverse unavailability | `auth-guard.ts:51–57` | Document the fail-open decision as a signed-off risk in the runbook; add a Dataverse health metric alert so operations can detect the degraded-mode window |
| SEC-05 | Medium | Race Condition — Last-Admin Guard | `guardLastPortalAdmin` reads then revokes in two separate Dataverse calls with no transactional lock; two concurrent `revokeRole` calls on two different portal-admin records with count=2 could both pass the guard and leave zero admins | `RbacService.ts:544–564` | Implement an optimistic lock or serialise revoke operations behind a Dataverse batch request; alternatively check count again inside a server-side lock or use a DB-level serialisable transaction |
| SEC-06 | Medium | Promotion Expiry — No Background Enforcement | Expired promotions are detected on read (`validatePromotionNotExpired`) but no background job sets status to `expired` in Dataverse; a stale pending record remains in `pending` state indefinitely, and the duplicate-pending guard blocks new promotions for the same user | `RbacService.ts:642–645`; architecture OI-002 | Implement the expiry background job (Fastify cron or Azure Logic App per OI-002) before go-live; the duplicate-pending guard must not be permanently blocked by a phantom pending record |
| SEC-07 | Low | Cache Poisoning — NodeCache Key Predictability | The cache key `${userId}:${rbacVersion}` is deterministic and based entirely on JWT claims; an attacker who can forge a JWT (i.e. has the signing secret) can inject any `rbac_version` and cause a Dataverse refetch — but only for their own legitimate userId | `RbacAbilityCache.ts:24` | No immediate action required; risk is subsumed by JWT secret protection. Document in threat model |
| SEC-08 | Low | Multi-Instance Cache Inconsistency | NodeCache is in-process; with N API instances, a role revocation causes the permission update to propagate only to the instance that handled the revoke request; other instances serve stale ability for up to 900s (JWT TTL) | `RbacAbilityCache.ts:1–6`; `phase-3-arch.md section 7` | Accepted per ADR-RBAC-001 (Redis deferred to P1-003/OQ-003). Document the 900s propagation window in the runbook and ensure QDB operations understand the SLA |
| SEC-09 | Low | IDOR — Audit Log Allows Cross-User Query | `GET /api/admin/rbac/audit` accepts a `userId` filter but does not validate that the requesting portal-admin is permitted to view another user's audit history; any portal-admin can query the full log for any user | `rbac.ts:287–303` | Acceptable for portal-admin role (full-manage permission). Document in runbook that audit log access is a privileged operation and requires portal-admin role (which it already requires) |
| SEC-10 | Info | OData Escaping Adequacy | `escapeODataString` replaces single-quotes with doubled single-quotes; this is the correct and complete defence for OData string literals | `RbacService.ts:672–674` | No action required — finding is a confirmation of correct implementation |
| SEC-11 | Info | D-002 (QA Defect) — Resolved Before Sign-Off | Audit log `GET /api/admin/rbac/audit` was originally `authOnly` (any authenticated user); the route file shows `adminGuard` (`requirePermission('manage','RbacRole')`) at line 289. Defect is resolved | `rbac.ts:289` | Confirmed closed |

---

## 3. Finding Detail

### SEC-01 — IP Address Blank in Service-Layer Audit Entries
**Severity:** High
**Confidence:** 99%

**Description:** Every call from `RbacService` to `RbacAuditWriter` passes `ipAddress: ''` as a hardcoded empty string. This affects `assignRole` (line 189), `revokeRole` (line 220), `initiatePromotion` (line 264), `approvePromotion` (line 300), and `rejectPromotion` (line 334).

**Evidence:**
```typescript
// RbacService.ts:184–190
await this.audit.logRoleAssigned({
  actorUserId: actorId,
  targetUserId: body.userId,
  roleSlug: body.roleSlug,
  correlationId,
  ipAddress: '',   // <-- hardcoded blank
});
```
The same pattern repeats at lines 220, 264, 300, and 334.

By contrast, the `rbac.ts` plugin correctly captures `request.ip` at line 75 when logging `permission_denied` events, demonstrating that the IP is available in the request context.

**Risk:** Every `qdb_rbac_audit_log` record written by service-layer methods has `qdb_ip_address = ''`. Under Qatar Law No. 13, audit records must be sufficient to identify the actor; a missing IP address weakens forensic traceability and may not satisfy a regulatory examination. If QDB's internal policy requires IP-level traceability (common for government-sector systems), this is a data quality defect in every stored audit entry.

**Recommendation:** Refactor `RbacService` method signatures to accept `ipAddress: string` as a parameter alongside `correlationId`. Route handlers already have `request.ip`; they must pass it through when calling service methods. Alternatively, thread a `RequestContext` object containing both `correlationId` and `ipAddress` through the service layer.

**Effort:** Medium — 5 method signatures and their callers in the route file.

---

### SEC-02 — PII Access Audit Hook Not Wired to Any Endpoint
**Severity:** High
**Confidence:** 96%

**Description:** `RbacAuditWriter.logPiiAccessed()` is implemented and available (lines 78–83 of `RbacAuditWriter.ts`). Architecture condition AC-RBAC-001 states: "RbacAuditWriter must write a `pii_accessed` log entry on every request that reads CitizenPII-scoped data." The permission matrix grants `support-agent` and `portal-admin` access to `CitizenPII`. The `requests.ts` route file returns `qdb_form_data` and `qdb_user_id` (both designated PII fields per the architecture document) but has no `requirePermission('read','CitizenPII')` guard and no call to `logPiiAccessed`.

**Evidence:**
```typescript
// requests.ts:26–36
interface DataverseRequest {
  ...
  qdb_form_data: string;   // PII
  qdb_user_id: string;     // PII
}
```
A search across all files under `src/routes/` for `logPiiAccessed` returns zero results outside test fixtures. The method is mocked in tests but never called from production route handlers.

**Risk:** Every support-agent PII access is unlogged. This is a direct violation of AC-RBAC-001 and of the Qatar Law No. 13 obligation that personal data access be auditable. A regulatory examination would find no `pii_accessed` entries in the audit log despite PII being served. This is a go-live blocker.

**Recommendation:**
1. All endpoints that return `qdb_form_data` or `qdb_user_id` (or equivalent PII fields on citizen request records) must add `requirePermission('read', 'CitizenPII')` as a preHandler.
2. Inside those handlers, after data is fetched, call `rbacAuditWriter.logPiiAccessed({ actorUserId, resourceId: requestId, subject: 'CitizenPII', correlationId, ipAddress: request.ip })`.
3. TC-SEC-003 (currently deferred to E2E) must be promoted to an integration test and must pass before go-live.

**Effort:** High — requires identifying all PII-serving routes, adding guards, and adding audit calls. The `requests.ts` route already serves PII; additional routes may exist as the platform grows.

---

### SEC-03 — bumpRbacVersionForUser Updates Only First Active Role Record
**Severity:** Medium
**Confidence:** 85%

**Description:** `bumpRbacVersionForUser` (lines 590–605) reads all active roles, computes the max version + 1, then updates only `roles[0]` — the first record returned by the Dataverse query (ordered by no explicit ordering, so the return order is non-deterministic). For a user with two active roles `[version=3, version=2]`, after bump the records will be `[version=4, version=2]`. `getCurrentRbacVersion` uses `Math.max` across records, so it correctly returns 4. The JWT will carry version=4 after re-login, which is correct.

**The actual risk** is subtler: `getActiveRoles` in `RbacAbilityCache` uses `${userId}:${rbacVersion}` as the key. Version 4 will not be in cache after revoke, so a fresh fetch occurs — this is correct behaviour. However, the unmodified second record (version=2) is a stale artifact that will never match a future JWT version, creating orphan version integers in the data. Over many role changes on multi-role users, this produces multiple records with stale version numbers, which has no functional impact today but complicates future version-history queries.

**Risk:** Low functional risk; medium data quality risk. If a future query relies on per-record version integrity (e.g. point-in-time reconstruction in DXP-P1-004), the stale version records will produce misleading results.

**Recommendation:** Update all active role records for the user to the new max version (not just `roles[0]`), or document explicitly in the runbook that `qdb_rbac_version` on individual records is not a reliable point-in-time version and only the JWT-carried version (derived from `Math.max`) is authoritative. Add a unit test exercising a three-role user through revoke + version bump.

**Effort:** Low — a simple `Promise.all` over all role records' update calls, or a clear code comment.

---

### SEC-04 — Fail-Open JTI Blocklist During Dataverse Unavailability
**Severity:** Medium
**Confidence:** 90%

**Description:** `auth-guard.ts` lines 51–57 catch any error from the Dataverse blocklist check and allow the request to proceed with a warning log. During a Dataverse outage, any revoked token (e.g. a token from a terminated employee) will pass authentication.

**Evidence:**
```typescript
// auth-guard.ts:51–57
} catch (error) {
  log.warn({ error, jti }, 'JTI blocklist check failed — allowing request (fail-open)');
  return false;  // false = not revoked = allow
}
```

**Risk:** Acceptable design tradeoff (documented in arch comment: "fail-closed would cause full outage"). However, for a government banking portal, the window of risk during Dataverse unavailability is real. A terminated employee's token could be used to access the system during the outage window.

**Recommendation:** Ensure the fail-open decision is formally recorded in the runbook as a signed-off risk with QDB operations sign-off. Add a Dataverse availability alert so the operations team can detect and manually respond (force-expire affected sessions) if the blocklist becomes unavailable. The 60-second `validJtiCache` TTL means the window is bounded.

**Effort:** Low — documentation and alerting only.

---

### SEC-05 — Last-Admin Guard Race Condition
**Severity:** Medium
**Confidence:** 88%

**Description:** `guardLastPortalAdmin` (lines 544–564) queries the count of active portal-admin records, then the caller proceeds to deactivate the record. If two concurrent HTTP requests revoke two different portal-admin records from a pool of exactly two admins, both will read count=2, both will pass the guard, and both will then deactivate their respective records — leaving zero active portal-admins. No transactional lock protects this window.

**Risk:** The portal becomes ungovernable — no user can manage RBAC, and the only recovery is direct Dataverse intervention. For a government banking system this is a significant operational risk.

**Recommendation:** Either (a) use Dataverse optimistic concurrency (ETag-based update) to detect concurrent modification, or (b) add a second count check after the update and roll back if count drops to zero. A pragmatic alternative is to require a minimum of two portal-admins to exist before any single revoke is permitted (i.e. change the guard threshold from >1 to >2), accepting slightly over-conservative protection.

**Effort:** Medium.

---

### SEC-06 — Promotion Expiry Not Enforced by Background Job
**Severity:** Medium
**Confidence:** 92%

**Description:** Promotion expiry is checked lazily on read (inside `validatePromotionNotExpired`). The `guardNoPendingPromotion` check at line 575 filters on `qdb_status eq ${PROMOTION_STATUS_CODE.pending}`. A promotion that has passed its 72-hour window but has not been explicitly expired still has `qdb_status = 1 (pending)` in Dataverse. The duplicate guard will therefore block any new promotion attempt for the same user-role pair.

**Evidence:**
```typescript
// RbacService.ts:575
filter: `qdb_target_user_id eq '...' and qdb_target_role eq '...' and qdb_status eq ${PROMOTION_STATUS_CODE.pending}`,
```

A phantom pending promotion with `qdb_expires_at` in the past matches this filter and blocks new requests indefinitely.

**Risk:** A portal-admin who allowed a promotion to expire cannot initiate a new one for the same target user until the stale record is manually updated in Dataverse. Architecture OI-002 acknowledged this gap but left resolution to DevOps. This is an operational blocker, not merely a governance gap.

**Recommendation:** Before go-live, resolve OI-002: implement a background job (Fastify cron preferred — no external dependency) that periodically queries promotions where `qdb_expires_at lt now() and qdb_status eq 1` and updates them to status=4 (expired). As a fallback, update `guardNoPendingPromotion` to also require `qdb_expires_at ge <now>` so that stale-pending records do not block new requests.

**Effort:** Medium (cron job) or Low (guard filter fix as an immediate mitigation).

---

### SEC-07 — Cache Key Predictability
**Severity:** Low
**Confidence:** 82%

**Description:** The NodeCache key `${userId}:${rbacVersion}` is derived entirely from JWT claims. An attacker who can forge a JWT can generate any cache key. However, JWT forgery requires the signing secret, at which point the attacker already has full system access. The cache key provides no additional attack surface.

**Risk:** Negligible. Included for completeness.

**Recommendation:** No action. Document in threat model.

---

### SEC-08 — In-Process Cache Creates Stale-Permissions Window Under Multi-Instance Deployment
**Severity:** Low
**Confidence:** 95%

**Description:** NodeCache is in-process. In a multi-replica deployment (e.g. two Kubernetes pods), a role revocation handled by Pod A will not purge Pod B's cache. Pod B will serve the old ability until the JWT expires (900s / 15 min) and the user re-authenticates with a new JWT carrying the incremented `rbac_version`.

**Risk:** Accepted by ADR-RBAC-001. Maximum stale-permissions window = 900 seconds. For a government banking portal this should be explicitly communicated to QDB operations as a known SLA constraint.

**Recommendation:** Document the 900-second worst-case window in the runbook. Prioritise Redis (OQ-003 from P1-003) if QDB cannot accept this SLA.

---

### SEC-09 — Audit Log Cross-User Query (IDOR Assessment)
**Severity:** Low
**Confidence:** 90%

**Description:** `GET /api/admin/rbac/audit?userId=<any-uuid>` allows a portal-admin to read the audit log for any user. This is not an IDOR vulnerability — it is a legitimate admin function gated behind `requirePermission('manage','RbacRole')`. However, there is no additional scoping to prevent a portal-admin from querying another portal-admin's actions.

**Risk:** Acceptable. Portal-admins are privileged users with full manage access. The ability to audit peers is a feature, not a vulnerability. Confirm this aligns with QDB's internal access policy.

**Recommendation:** Confirm with QDB governance that mutual admin auditability is acceptable. If four-eyes separation is required for the audit log itself (i.e. no admin can see their own entries), add a server-side filter excluding the requesting user's own entries.

---

### SEC-10 — OData Injection Assessment (Confirmed Safe)
**Severity:** Info
**Confidence:** 97%

**Description:** All user-controlled strings inserted into OData `$filter` expressions pass through `escapeODataString` (line 672–674), which replaces `'` with `''`. This is the complete and correct escaping strategy for OData string literals in Dataverse Web API. No other OData injection vector (numeric parameters, enum codes) is present — integer codes are hardcoded constants, not user-supplied.

**Evidence:**
```typescript
// RbacService.ts:672–674
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
```

**Risk:** None. Correctly implemented.

---

### SEC-11 — D-002 Confirmed Resolved (Audit Log Route Was Auth-Only)
**Severity:** Info
**Confidence:** 99%

**Description:** Phase 5 identified D-002: `GET /api/admin/rbac/audit` used `preHandler: authOnly` allowing any authenticated user to query the audit log. The route file at line 289 now shows `preHandler: adminGuard` (which is `[app.authenticate, app.requirePermission('manage','RbacRole')]`). The defect is closed.

---

## 4. Architecture Conditions Verification

| Condition | Description | Status | Evidence |
|---|---|---|---|
| AC-RBAC-001 | `RbacAuditWriter` writes `pii_accessed` on every CitizenPII read | **NOT MET** | `logPiiAccessed` is implemented but no production route calls it. `requests.ts` returns PII fields (`qdb_form_data`, `qdb_user_id`) without calling the audit hook. See SEC-02. |
| AC-RBAC-002 | `approvePromotion` rejects 409 `self_approval_prohibited` if actor === initiator | **MET** | `validateSelfApprovalProhibited` at `RbacService.ts:648–659` correctly compares `actorId === promotion.qdb_initiated_by`. Same guard applied in `rejectPromotion`. TC-SVC-015 and TC-SVC-017 cover both paths. |
| AC-RBAC-003 | JWT never exceeds 1 KB | **MET** | `TokenClaims` carries `sub`, `email`, `roles[]`, `rbac_version`, `jti`, `iat`, `exp`. With typical field lengths this is well under 1 KB. TC-SEC-001 (deterministic calculation) confirms compliance. |
| AC-RBAC-004 | `qdb_rbac_audit_log` has no Write/Delete in code — Append only | **MET IN CODE** | `RbacAuditWriter` uses only `dataverse.create`. No `update` or `delete` call exists in the writer. TC-AUDIT-001 verifies this. **Note:** The Dataverse security role configuration must also remove Write/Delete privileges at the Dataverse layer — this is a deployment obligation, not verifiable from code alone. |
| AC-RBAC-005 | `buildAbility` result is cached; Dataverse not called on hot path | **MET** | `requirePermission` preHandler checks `getCachedAbility` first; Dataverse is only fetched on miss. TC-CACHE-001 and TC-CACHE-002 verify both paths. |
| AC-RBAC-006 | `qdb_population` derived server-side; client-supplied population rejected | **MET** | `resolvePopulation(roleSlug)` at `RbacService.ts:661–665` derives population from slug server-side. `AssignRoleSchema` does not accept a `population` field. `validateCrossPopulation` enforces the constraint. TC-SVC-003 and TC-ROUTE-003 verify. |

---

## 5. OWASP Top 10 Assessment

| # | Category | Applicable | Mitigated How | Gaps |
|---|---|---|---|---|
| A01 Broken Access Control | Yes | `requirePermission('manage','RbacRole')` guards all admin RBAC routes. CASL ability checks `ability.can(action, subject)`. `guardPortalAdminDirectAssign` blocks schema-level bypass. Cross-population guard at service layer. | AC-RBAC-001 not met: PII endpoints lack `requirePermission('read','CitizenPII')` — partial broken access control for the PII subject. |
| A02 Cryptographic Failures | Yes | JWT signed with HS256; password minimum 12 chars with complexity rules in `auth.ts`; no secrets visible in any audited source file. | No findings. Key management (secret rotation) is an operational concern outside code scope. |
| A03 Injection | Yes | OData injection mitigated by `escapeODataString` on all user-controlled filter values. Zod schema validation at all route boundaries before any service call. No SQL concatenation (Dataverse Web API only). | No findings. |
| A04 Insecure Design | Yes | Four-eyes promotion design prevents single-admin escalation. Deactivate-not-delete pattern ensures audit trail. Cross-population guard. | Race condition in last-admin guard (SEC-05) is a minor insecure design gap. |
| A05 Security Misconfiguration | Yes | `useClones: false` on NodeCache is intentional (performance). Append-only audit log requires Dataverse security role configuration at deployment time (not verifiable from code). | Deployment checklist must confirm `qdb_rbac_audit_log` security role is Append-only (no Write/Delete). |
| A06 Vulnerable and Outdated Components | Yes | `@casl/ability` MIT, 7k stars, active maintenance. `node-cache` widely used. Full dependency audit is outside code-review scope. | Recommend `npm audit` in CI as a standard gate. |
| A07 Identification and Authentication Failures | Yes | JWT verified via `@fastify/jwt`. JTI revocation blocklist in Dataverse. `validJtiCache` limits Dataverse round-trips. | Fail-open blocklist (SEC-04) is a documented risk. |
| A08 Software and Data Integrity Failures | Yes | No dynamic imports or `eval()`. Audit log is append-only. Role assignments use Dataverse alternate key to prevent duplicates. | No findings. |
| A09 Security Logging and Monitoring Failures | Partial | Structured logging via `app.log`. Correlation IDs on all operations. Audit log for role mutations. | `pii_accessed` events are not written (SEC-02). IP address is blank on all service-layer audit entries (SEC-01). Monitoring/alerting infrastructure is outside this code review scope. |
| A10 Server-Side Request Forgery | No | No user-controlled URLs are fetched server-side in the RBAC subsystem. | Not applicable. |

---

## 6. PII & Compliance Assessment — Qatar Law No. 13 of 2016

### 6.1 PII Access Logging Obligation

**Requirement:** Every access to personal data must be logged with sufficient information to identify the actor, the data accessed, and the time of access.

**Finding:** `RbacAuditWriter.logPiiAccessed` is implemented and includes `actorUserId`, `resourceId`, `subject`, `correlationId`, `ipAddress`, and a timestamp (`createdon` system field). The schema is compliant. However, the method is never called from any production endpoint. (See SEC-02.)

**Gap:** The obligation exists but is not technically enforced. The audit log will have no `pii_accessed` entries in a production deployment.

**Remediation:** Wire `logPiiAccessed` to all endpoints returning PII fields. Promote TC-SEC-003 to an integration test that must pass before go-live.

### 6.2 Audit Log Immutability

**Requirement:** Audit records must not be modifiable or deletable once written.

**Finding:** `RbacAuditWriter` only calls `dataverse.create` — never `update` or `delete`. This is confirmed by TC-AUDIT-001. The Dataverse security role for the service account must have `qdb_rbac_audit_log` set to Append + Read only (no Write, no Delete). This must be verified at deployment.

**Status:** Met in code. Deployment verification required.

### 6.3 Seven-Year Retention

**Requirement:** Qatar Law No. 13 / QDB internal policy mandates 7-year retention.

**Finding:** The architecture specifies "7-year active in Dataverse; archival to Azure Blob at year 2 (DXP-P1-004 scope)." The active retention in Dataverse is architecturally stated. No technical enforcement of a 7-year floor exists in this codebase — there is no delete-prevention trigger, no Dataverse retention policy configuration verifiable from code. The archival job is deferred to DXP-P1-004.

**Gap (Medium):** The 7-year floor depends on Dataverse environment configuration (retention policies or the absence of a delete security privilege on the entity) and on DXP-P1-004 archival job delivery. This is not a code deficiency but a deployment and programme governance obligation.

**Remediation:** Before go-live, confirm in writing that the Dataverse environment has no delete permission on `qdb_rbac_audit_log` for any service account, and that a Dataverse retention policy or legal hold covers the 7-year window. Track DXP-P1-004 archival delivery as a post-go-live obligation with a hard deadline.

### 6.4 IP Address Capture

**Requirement:** Audit entries must identify the origin of each action.

**Finding:** `request.ip` is captured correctly by the Fastify plugin layer and passed to the `permission_denied` audit entry. However, all service-layer audit entries (role assign, revoke, promote, approve, reject) have `ipAddress: ''`. See SEC-01.

**Gap (High):** All service-layer audit records have a blank IP address field.

### 6.5 Data Residency

**Finding:** Dataverse is hosted in the Azure region configured at the Dataverse environment level. The architecture document does not specify the Dataverse environment's Azure region. For Qatar government data, the data must reside in-country (Qatar) or in an approved jurisdiction per MOTC data localisation guidance.

**Gap:** Data residency cannot be confirmed from code alone. QDB must confirm the Dataverse environment is provisioned in the GCC (Gulf Cooperation Council) or Qatar-local Azure region.

**Remediation:** QDB IT to confirm in writing that the Dataverse environment (org5869857f per memory context) is hosted in a Qatar-compliant Azure region before go-live.

---

## 7. Dependency Risk Assessment

### 7.1 `@casl/ability`

| Attribute | Assessment |
|---|---|
| Stars | ~7,000 GitHub stars |
| License | MIT — compatible with commercial use |
| Maintenance | Active (releases in 2024–2025) |
| Usage pattern | In-process evaluation only; no storage adapter adopted; Dataverse is the policy store |
| Supply chain risk | Low — single focused library; well-known in Node.js ecosystem |
| Version pinning | Recommend pinning to a specific minor version (`^6.x.x`) and running `npm audit` in CI |
| Verdict | Approved for use as documented in ADR-RBAC-002 |

### 7.2 `node-cache`

| Attribute | Assessment |
|---|---|
| Stars | ~2,000 GitHub stars |
| License | MIT |
| Maintenance | Active |
| In-process limitation | Creates stale-permissions window in multi-instance deployments (SEC-08). Acknowledged in ADR-RBAC-001; Redis replacement deferred to P1-003 |
| `useClones: false` | Performance-correct setting; means cached `AppAbility` objects are shared references. Since CASL ability instances are read-only after `build()`, no mutation risk exists |
| Verdict | Approved for current single-instance deployment. Redis migration is a prerequisite for horizontal scaling |

---

## 8. Audit Trail Validation

### Can every state transition be reconstructed from the audit log alone?

**Role assignments:** Yes. `role_assigned` events include `actorUserId`, `targetUserId`, `roleSlug`, `correlationId`, and `createdon`. Combined with the append-only `qdb_rbac_user_roles` (deactivate-not-delete), every assignment and revocation can be reconstructed.

**Four-eyes promotion flow:** Yes. `promotion_initiated`, `promotion_approved`/`promotion_rejected` events include both initiator and approver IDs. The chain of custody is complete.

**PII access:** No. `pii_accessed` entries are never written. The access log for CitizenPII is empty. A regulatory examination would find zero PII access records despite PII being served.

**Permission denials:** Yes. `permission_denied` entries are written with `actorUserId`, `subject`, `action`, `correlationId`, and `ipAddress` (correctly populated from `request.ip` in the plugin).

### Is the audit log tamper-proof and append-only?

**In code:** Yes — `RbacAuditWriter` uses only `dataverse.create`. No update or delete paths exist.

**At the Dataverse layer:** Requires confirmation that the service account's Dataverse security role omits Write and Delete privileges on `qdb_rbac_audit_log`. This cannot be verified from code.

### Is the log sufficient for a regulatory examination?

**Qualified yes** — subject to two conditions: (1) SEC-01 must be resolved (IP addresses must be populated), and (2) SEC-02 must be resolved (PII access must be logged). Without these two fixes, the audit log is incomplete and would not support a regulatory examination of PII access patterns.

---

## 9. Service Account Review

The codebase does not contain explicit service account credentials (no findings from Pass 7). The `DataverseClient` is injected via dependency injection and the service account configuration is assumed to be in environment variables (not in source).

**Required Dataverse security role configuration (to verify at deployment):**

| Entity | Required Privileges | Must NOT Have |
|---|---|---|
| `qdb_rbac_user_roles` | Create, Read, Write, Append | Delete |
| `qdb_rbac_audit_log` | Create (Append), Read | Write, Delete |
| `qdb_rbac_promotion_requests` | Create, Read, Write, Append | Delete |
| `qdb_portal_revoked_tokens` | Read | Write, Delete, Create |

**Least-privilege assessment:** The Dataverse security role must be provisioned per the above table. Delete must be absent on all RBAC entities. Write must be absent on the audit log. This is an AC-RBAC-004 condition and a go-live prerequisite that cannot be verified from code alone.

---

## 10. Governance Gaps — Ranked by Risk

| Rank | Gap | Risk if Unaddressed | Remediation |
|---|---|---|---|
| 1 | AC-RBAC-001 not met — `logPiiAccessed` never called from any production route (SEC-02) | Direct Qatar Law No. 13 violation; regulatory penalty risk; zero PII access audit trail | Wire `logPiiAccessed` to all PII-returning endpoints before go-live |
| 2 | IP address blank on all service-layer audit entries (SEC-01) | Incomplete audit records; weakened forensic traceability; potential regulatory examination failure | Pass `ipAddress` from route layer through all service method calls |
| 3 | Promotion expiry not enforced by background job (SEC-06) | Portal-admins blocked from initiating new promotions after 72h window lapses; manual Dataverse intervention required | Implement expiry cron job or update `guardNoPendingPromotion` filter before go-live |
| 4 | Last-admin guard race condition (SEC-05) | Two concurrent revokes could leave zero portal-admins; recovery requires direct Dataverse access | Implement optimistic lock or second-check-after-revoke |
| 5 | Fail-open JTI blocklist during Dataverse outage (SEC-04) | Revoked tokens valid during Dataverse unavailability | Document as signed-off risk; add Dataverse availability alert |
| 6 | `bumpRbacVersionForUser` updates only first role record (SEC-03 / D-003) | Stale version integers on multi-role users; risk to DXP-P1-004 point-in-time reconstruction | Add unit test; consider updating all role records or document constraint |
| 7 | Seven-year retention not technically enforced in code | Qatar Law No. 13 retention obligation unmet | Confirm Dataverse retention configuration and track DXP-P1-004 archival job delivery |
| 8 | Data residency not confirmed | Potential Qatar data localisation violation | QDB IT to confirm Dataverse region before go-live |
| 9 | Dataverse security role for audit log not verifiable from code | Audit log Write/Delete could be enabled by misconfiguration | Verify and document security role configuration in deployment checklist |
| 10 | Multi-instance cache staleness documented but no operational SLA communicated | Operations may not understand 900s stale-permissions window | Document in runbook; confirm with QDB operations |

---

## 11. Go-Live Clearance

**Verdict: NOT CLEARED**

The system must not go live until the following conditions are met:

### Hard Blockers (must be resolved before CEO Phase 7 review)

**Condition P6-C1:** SEC-02 resolved — `logPiiAccessed` called from all endpoints returning `qdb_form_data`, `qdb_user_id`, or any field designated as CitizenPII. TC-SEC-003 must be promoted to an integration test and must pass. This is a Qatar Law No. 13 compliance obligation and AC-RBAC-001.

**Condition P6-C2:** SEC-01 resolved — `ipAddress` parameter populated in all five service-layer audit writer calls. Every `qdb_rbac_audit_log` record must store the requesting party's IP address.

**Condition P6-C3:** SEC-06 mitigated — either the expiry background job is implemented, or `guardNoPendingPromotion` is updated to exclude records where `qdb_expires_at` is in the past. The duplicate-pending block must not be permanently triggered by a stale expired record.

### Deployment Checklist (must be verified before go-live, not code changes)

**Condition P6-C4:** Dataverse security role for the API service account confirmed: `qdb_rbac_audit_log` has Append + Read only (no Write, no Delete). Evidence to be attached to the deployment runbook.

**Condition P6-C5:** QDB IT to confirm in writing that the Dataverse environment is hosted in a Qatar-compliant Azure region (data residency).

**Condition P6-C6:** QDB operations to sign off on SEC-04 (fail-open JTI blocklist) and SEC-08 (900-second stale-permissions window) as accepted risks with documented runbook entries.

### Accepted and Deferred

- SEC-03 (D-003 version fragility) — accepted with unit test addition. Deferred to Phase 4 patch.
- SEC-05 (last-admin race condition) — recommended for a follow-on hardening ticket. Accepted as medium risk given the operational steps required to trigger it (two concurrent revokes with exactly two admins).
- SEC-07, SEC-08, SEC-09 — accepted as documented.
- Seven-year retention technical enforcement — deferred to DXP-P1-004 (archival job), contingent on P6-C4 deployment verification.

---

*Phase 6 Audit complete. Cleared for Phase 7 CEO review only after P6-C1, P6-C2, and P6-C3 are resolved by the backend team and P6-C4, P6-C5, P6-C6 are verified by QDB IT and operations.*
