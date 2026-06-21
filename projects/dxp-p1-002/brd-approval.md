# CEO BRD Review — DXP-P1-002
**Date:** 2026-06-18
**Reviewer:** Maqsad AI — CEO
**Decision:** APPROVED WITH CONDITIONS

---

## Executive Assessment

DXP-P1-002 addresses a genuine and urgent gap in the QDB Digital Experience Platform. The current state — a single string-based role check with no stored permission model, no admin interface, and no audit trail — is not acceptable for a government-owned development bank serving both staff and external citizens with financing applications. This BRD closes that gap with a well-structured RBAC system that correctly separates the two user populations, stores all state in Dataverse within Qatar/GCC data residency boundaries, and keeps the API hot path free of Dataverse calls by embedding permissions in JWT claims. That architectural decision is sound and future-proof for the scale targets stated.

The role taxonomy is proportionate to QDB's operational reality. The five staff roles and three citizen roles cover the population without over-engineering. The permission matrix in Section 5 is explicit, defensible, and appropriately conservative — citizens cannot reach admin routes, guests cannot reach authenticated routes, and staff cannot reach citizen-only application submission flows. The cross-population prohibition with a hard API-layer enforcement rule (HTTP 400 `cross_population_role_prohibited`) is exactly the right posture for a regulated entity.

The integration strategy is professionally handled. Extending `TokenClaims` with an optional `permissions` field ensures zero breaking changes to the existing DXP-P1-001 auth infrastructure, and the transition period fallback (treat missing `permissions` as guest) is clearly specified. The architecture gate — blocking DXP-P1-002 build until DXP-P1-001's six release blockers are cleared — is correctly carried forward from DXP-P1-001 and must be honoured without exception.

One area requires resolution before architecture proceeds: OQ-007 (support-agent access to citizen data) carries regulatory exposure that the BA has not sufficiently characterised, and the four-eyes principle for portal-admin promotion (OQ-002 / A-007) needs a formal answer from the QDB IT Director before the architect designs the assignment flow. These are not reasons to reject or restart the BRD — they are conditions that must be satisfied at the architecture gate, not before.

---

## Strengths

- Role taxonomy covers both user populations with clear separation; citizen and staff roles are structurally incompatible by design, enforced at the API layer, not just the frontend.
- JWT embedding of permissions eliminates Dataverse dependency on the API hot path, which directly satisfies NFR-001 (< 1 ms) and NFR-007 (availability when Dataverse is down).
- C-010 slug-based identity is correctly honoured throughout: role slugs are used as cross-environment keys, GUIDs are never exposed as references, and denormalised slug columns are included in every join entity for query efficiency.
- The append-only `qdb_rbac_user_roles` design (deactivate, never delete) is correct for a government context where assignment history is itself a compliance record.
- `qdb_rbac_audit_log` is insert-only with Dataverse table-level permission enforcement — this satisfies the NIAP audit trail requirement and the 7-year retention mandate.
- The architecture gate referencing DXP-P1-001's six blocking conditions (target 2026-06-18) is explicitly stated and correctly scoped.
- Backward compatibility commitments are precise: `TokenClaims`, `fastify.authenticate`, and `fastify.requireRole` signatures are frozen; new decorators are additive only.
- The "last admin" guard (AC-015, HTTP 409 `last_admin_removal_prohibited`) prevents an unrecoverable lockout state.
- Out-of-scope list is well-bounded and explicitly defers row-level security, SSO/Entra ID federation, time-limited roles, and mobile RBAC — all correct deferrals for Phase 2.
- 20 acceptance criteria are individually traceable to functional requirements and most are directly automatable.
- Non-functional requirements include concrete, measurable targets (p95 login < 800 ms, hot path < 1 ms, forced revocation < 60 s).
- Data classification under Qatar NIAP is explicitly stated for each entity class — this is the right level of regulatory specificity at BRD stage.

---

## Issues Found

1. **[BLOCKER] OQ-007 — Support-agent access to citizen PII without consent basis identified.**
   The `support-agent` role is granted `view` permission on `form` and `data-display` categories and read access to `/documents`. The BRD acknowledges this as an open question but does not identify whether QDB has an established legal basis under Qatar's Personal Data Privacy Protection Law (Law No. 13 of 2016) for staff to view citizen documents without explicit citizen consent or a documented operational necessity exemption. For a government bank, operating without a documented legal basis for this access pattern is a regulatory liability. This must be answered by QDB Compliance before the architect designs the support-agent data access paths — it may constrain which fields are visible, require a "break-glass" audit mechanism, or mandate citizen notification.

2. **[BLOCKER] OQ-002 — Four-eyes principle for portal-admin promotion has no formal answer.**
   Section 10.5 states the portal-admin role cannot be self-assigned and references a four-eyes principle, then immediately flags it as an open question deferred to A-007 ("desirable but not formally mandated"). The QDB IT Director must provide a formal yes/no answer before the architect designs the admin assignment flow. If the answer is yes, the flow adds a secondary confirmation step, a pending-approval state, and an additional audit event type — all of which have cascading implications for the data model and UI. If the answer is no, the architect can simplify the flow. Proceeding to architecture with this unresolved means the architect will have to design two variants or make an assumption that may need to be reversed.

3. **[CONDITION] No explicit session invalidation path for corporate-user KYC reversal.**
   Section 6.1 states that `corporate-user` is assigned after a KYC callback. The BRD does not specify what happens if KYC is later revoked or the corporate account is suspended. This is a role lifecycle gap: the assignment path is defined but the revocation path for system-triggered events (not admin-triggered) is not. The architect must define this before building the KYC integration.

4. **[CONDITION] `qdb_rbac_audit_log.qdb_actor_user_id` stores a string, not a Lookup.**
   The field is typed as `Single Line of Text` to accommodate both Dataverse user GUIDs and the literal string `system` for automated events. This is a pragmatic choice, but it means referential integrity is not enforced at the Dataverse layer for actor identity. The architect must specify whether the audit log service validates that the actor GUID resolves to a real `systemuser` record before writing, and what happens if the actor is a service principal with no `systemuser` record. Without this constraint, audit log actor fields could contain invalid values that fail compliance review.

5. **[CONDITION] JWT payload size upper-bound analysis is deferred but must precede architecture.**
   OQ-001 flags this as an architect concern, but the BRD should have established a business constraint: is there a maximum JWT size mandated by QDB's infrastructure (e.g. load balancer header size limits, cookie size limits for portal usage)? Without a stated upper bound from the business side, the architect has no acceptance threshold to design against. This condition requires the BA to confirm with QDB IT whether a header/cookie size limit exists before the architecture phase begins.

6. **[CONDITION] The `service-owner` role has no scoping mechanism in this phase.**
   The taxonomy describes a `service-owner` as managing "a specific QDB product/service offering." However, the permission model grants `service-owner` a single flat permission level per category — there is no binding between a `service-owner` and the specific service they own. This means all `service-owner` users share identical permissions today. The BRD correctly defers row-level security to DXP-P1-003, but the architect must explicitly acknowledge this gap and ensure the data model does not close off the future addition of service-scoped ownership without a breaking schema change.

7. **[CONDITION] Audit log 7-year retention mechanism is not specified.**
   NFR-011 mandates 7-year retention, and Section 10.3 states records may not be deleted. However, the BRD does not specify the archival or tiering strategy for records older than the Dataverse storage tier's cost-effective window. For a 7-year horizon at a government bank, there must be a defined data lifecycle policy (e.g. archive to Azure Blob after year 2, retain in Dataverse for active query). The architect must produce a retention architecture decision before build begins.

8. **[ADVISORY] The `/applications` page grants `staff-viewer` read access, but the permission matrix shows no `interact` level for this route.**
   The page permission table uses "yes (read)" for `staff-viewer` on `/applications` and `/documents`. The permission matrix in Section 5.1 does not distinguish read-within-a-page from full page access — this is a detail the architect must resolve in the route-level permission enforcement design. Not a blocker, but an ambiguity that could produce inconsistent implementations across frontend and API layers.

9. **[ADVISORY] No explicit mention of rate limiting or brute-force protection on the `/admin/rbac` endpoints.**
   The RBAC admin endpoints modify role assignments, which are high-value targets. The BRD does not state whether the existing Fastify rate-limiter (if any) applies to admin routes, or whether admin-specific rate limits should be set. The auditor should flag this in Phase 6 if the architect does not address it in Phase 3.

10. **[ADVISORY] AC-016 (< 1 ms hot path) is measured by Vitest benchmark, which runs in a Node.js process without real network I/O.**
    This is correct for a JWT claim read — the test is valid. However, the acceptance criterion should specify that the benchmark is run against a token with the maximum expected `permissions` payload (50 roles × N categories, per NFR-006), not a minimal 7-role token. Without this qualifier, the benchmark could pass on the small case and fail in production. Recommend the QA agent add this constraint when writing the test plan.

---

## Conditions (if APPROVED WITH CONDITIONS)

1. **OQ-007 must be answered by QDB Compliance before architecture phase begins.** The BA must obtain a formal written statement from QDB Compliance (or the QDB IT Director acting as compliance proxy) confirming either: (a) the legal basis under Qatar Law No. 13 of 2016 under which `support-agent` may access citizen PII without individual consent; or (b) the constraints that must be placed on the `support-agent` role to operate within the law (e.g. field-level masking, break-glass mechanism). This answer must be appended to the BRD as an addendum before the architect begins the data access design for `support-agent`.

2. **OQ-002 must receive a formal yes/no decision from the QDB IT Director before architecture phase begins.** The BA must document the client's position on the four-eyes principle for `portal-admin` promotion in the BRD addendum. If the answer is yes, the architect must include a pending-approval workflow and the associated data model extensions in Phase 3. If the answer is no, this must be explicitly noted with the IT Director's name and date of decision.

3. **The BA must confirm whether QDB's infrastructure imposes a maximum JWT / HTTP header size.** The answer must be documented in the BRD addendum before the architect designs the `permissions` claim structure (OQ-001). The architect must not begin the JWT payload design without this constraint.

4. **The architect must explicitly address the `service-owner` scoping gap.** The Phase 3 architecture document must include a statement on how the data model preserves the ability to add service-scoped ownership in DXP-P1-003 without a breaking Dataverse schema change. A placeholder column or a design note is acceptable — silence is not.

5. **The architect must produce a Dataverse audit log retention and archival architecture decision** covering the 7-year NFR-011 mandate before build begins. This must be included in the Phase 3 output.

6. **The architect must confirm and document the corporate-user KYC revocation path** — specifically, the mechanism by which the system triggers a role revocation (not admin-triggered) when KYC status changes, and how this event is recorded in the audit log.

---

## Open Questions Disposition

| ID | Question | Disposition | Rationale |
|---|---|---|---|
| OQ-001 | JWT payload size: full object vs compressed bitmap | BLOCKER — must answer before arch | The architect cannot design the `permissions` claim structure without a client-stated upper bound on JWT/header size. See Condition 3. |
| OQ-002 | Four-eyes principle for portal-admin promotion | BLOCKER — must answer before arch | The admin assignment flow design forks entirely depending on the answer. See Condition 2. |
| OQ-003 | Per-request Dataverse evaluation vs JWT-only for category permissions | DEFER TO ARCHITECT | The BRD has already committed to JWT-embedded permissions on the hot path (Section 8.2). The architect confirms caching strategy and the transition fallback behaviour. No business decision is pending. |
| OQ-004 | Exact vs glob pattern matching for `requirePageAccess` | DEFER TO ARCHITECT | This is a performance and implementation design question with no business policy dimension. The architect benchmarks and decides. |
| OQ-005 | Write-only service account for audit log | DEFER TO ARCHITECT | The BRD correctly states the requirement (no update, no delete). The mechanism for enforcing it (separate service account, Dataverse table permissions) is an architecture and security implementation decision. |
| OQ-006 | Push notification to client on role change vs passive refresh | DEFER TO ARCHITECT | The business SLA is defined (≤ 60 s with forced revocation, ≤ 1 hour passive). Whether to implement push notification is an architectural choice within those SLAs. The architect should confirm with QDB whether the 1-hour passive delay is acceptable for non-sensitive role changes. |
| OQ-007 | Support-agent access to citizen PII — legal basis | BLOCKER — must answer before arch | Regulatory exposure. A government bank cannot proceed to build a feature that accesses citizen PII without a confirmed legal basis. See Condition 1. |

---

## Architecture Gate Status

The BRD is ready to hand to the Architect once the following are confirmed:

1. DXP-P1-001's six release blockers are cleared (target 2026-06-18 — this is the existing architecture gate).
2. Conditions 1, 2, and 3 above are satisfied (OQ-007, OQ-002, and OQ-001 answered by the appropriate stakeholders).

Conditions 4, 5, and 6 are architecture-phase deliverables — the architect owns them and must address them within Phase 3.

The BRD must not be handed to the Architect until Conditions 1, 2, and 3 are met. Conditions 4–6 are gates for architecture sign-off, not for BRD handoff.

---

## Decision Rationale

This BRD is approved with conditions because the core business logic, data model, integration design, and security posture are sound and appropriately matched to QDB's regulatory context as a government development bank. The 20 acceptance criteria are specific, testable, and traceable. The C-010 constraint is correctly honoured throughout. The architecture gate for DXP-P1-001 is properly enforced.

The two blockers (OQ-002 and OQ-007) are not deficiencies in the BA's work — they are legitimate open questions that require client decisions, and the BA correctly flagged them. They cannot, however, be left to the architect to discover mid-design. OQ-007 in particular carries regulatory risk under Qatar's data privacy law that is not acceptable to carry into an architecture phase for a government-owned bank. The conditions attached to this approval are the minimum necessary to protect QDB, Maqsad AI, and the integrity of the platform before substantial design investment begins.

Once the three BRD-gate conditions are satisfied and the DXP-P1-001 architecture gate is cleared, this engagement may proceed to Phase 3 (Architecture) without further CEO review.
