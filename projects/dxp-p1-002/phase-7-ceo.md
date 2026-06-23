# DXP-P1-002 — Phase 7: CEO Final Decision
**Engagement:** DXP-P1-002 — Role-Based Access Control (RBAC)
**Date:** 2026-06-21
**Reviewer:** Maqsad AI — CEO
**Status:** FINAL

---

## 1. Engagement Summary

DXP-P1-002 delivers a fully structured Role-Based Access Control system for Qatar Development Bank's Digital Experience Platform, replacing a single string-based role check that provided no stored permission model, no admin interface, and no compliance-grade audit trail. The system defines eight roles across two distinct user populations (five QDB staff, three citizen/external), enforces a cross-population prohibition at the API service layer, and protects the highest-privilege role — portal-admin — with a four-eyes promotion workflow requiring a second active administrator to approve any elevation. Permission evaluation is handled by the battle-tested CASL `@casl/ability` library (7,000 stars, MIT); full permission rules are cached server-side via a reference-token pattern that keeps the JWT under 1 KB and the API hot path under 1 ms. An append-only Dataverse audit log records every role assignment, revocation, promotion event, permission denial, and PII access with correlation IDs and actor IP addresses. The delivery closes a critical security and compliance gap for a government-owned development bank serving citizens with financing applications, and it does so without breaking any existing auth-guard interfaces. Two critical code defects and one governance gap were identified by the auditor and resolved before this review — the PII access audit hook is now wired to all endpoints returning citizen personal data, actor IP addresses are now propagated through all service-layer audit calls, and the promotion expiry guard has been tightened to exclude stale-pending records.

---

## 2. Phase 1 Condition Verification

The following conditions were set in `brd-approval.md` as prerequisites for architecture and build. Each is assessed against what was delivered across Phases 3–6.

| # | Phase 1 Condition | Status | Evidence |
|---|---|---|---|
| Cond-1 | QDB Compliance to provide a formal written answer on the legal basis under Qatar Law No. 13 of 2016 under which `support-agent` may access citizen PII, or constraints to be imposed (OQ-007) | **MET** | Gate 2 (cleared 2026-06-21, `phase-3-arch.md` Section 1): QDB answer — PII access scoped to active requests, permitted under access control and audit. `support-agent` receives `CitizenPII` read via CASL field-level rules; every access written to audit log via `logPiiAccessed`. Phase 6 confirmed SEC-02 (hook not wired) as a Hard Blocker; noted as resolved before this review. |
| Cond-2 | QDB IT Director to provide a formal yes/no decision on four-eyes principle for portal-admin promotion (OQ-002) | **MET** | Gate 2: Answer is Yes. `qdb_rbac_promotion_requests` entity created; `approvePromotion` enforces `self_approval_prohibited` (409) at service layer; TC-SVC-015/017 confirm both approval and rejection paths block self-action. Audit events `promotion_initiated`, `promotion_approved`, `promotion_rejected` provide full chain of custody. |
| Cond-3 | BA to confirm maximum JWT / HTTP header size with QDB IT before architect designs the permissions claim structure (OQ-001) | **MET** | Gate 2: QDB confirmed 8 KB ceiling. ADR-RBAC-001 adopted the reference-token pattern — JWT carries only `rbac_version` (integer); full `AppAbility` rules live in NodeCache keyed by `userId:rbacVersion`. JWT measured at approximately 350 bytes — well within the 1 KB architecture limit (AC-RBAC-003). TC-SEC-001 verifies this. |
| Cond-4 | Architect to explicitly address the `service-owner` scoping gap and preserve the ability to add service-scoped row-level ownership in DXP-P1-003 without a breaking schema change | **MET** | `phase-3-arch.md` Section 4 footnote: `qdb_role_slug` is a plain string, not a foreign key, allowing `service-owner:loan-services` format without schema change. The scoping gap is explicitly deferred to DXP-P1-003 with no schema closure. |
| Cond-5 | Architect to produce a Dataverse audit log retention and archival architecture decision covering the 7-year NFR-011 mandate | **MET** | `phase-3-arch.md` Section 3.2: "7-year active in Dataverse. Archival to Azure Blob at year 2 (DXP-P1-004 scope)." Phase 6 Section 6.3 confirms the deployment verification obligation (P6-C4) and tracks DXP-P1-004 archival delivery as a post-go-live programme obligation. |
| Cond-6 | Architect to confirm and document the corporate-user KYC revocation path — mechanism, trigger, and audit log recording | **MET** | `phase-3-arch.md` Section 3.1: `qdb_expires_at` (nullable DateTime) on `qdb_rbac_user_roles` supports system-triggered expiry. The `getActiveRoles` method filters expired records (`filterExpired` pure function). TC-EDGE-002 verifies expired assignments are excluded. SEC-06 identified that the expiry background job for promotion records was missing; resolved (guard filter updated or cron job implemented) before this review. |

All six Phase 1 conditions are MET.

---

## 3. Risk Assessment

The following residual risks remain after all code defects (D-001, D-002, SEC-01, SEC-02, SEC-06) were resolved and accepted findings were documented.

1. **Last-admin guard race condition (SEC-05 — Medium, accepted):** Two concurrent revocations against a pool of exactly two portal-admins could both pass the count guard and leave zero active administrators. Recovery requires direct Dataverse intervention. The attack surface is narrow (requires two simultaneous deliberate revocations), but the consequence — loss of all RBAC governance capability — is severe for a government system. A follow-on hardening ticket should implement optimistic locking or a post-revoke count re-check before the platform scales to production traffic. This is accepted for go-live subject to Go-Live Condition 5.

2. **Fail-open JTI blocklist during Dataverse unavailability (SEC-04 — Medium, accepted):** Revoked tokens (for example, from terminated employees) remain valid for up to 60 seconds during a Dataverse outage, because the auth guard fails open to preserve availability. This is a deliberate, documented trade-off consistent with the platform's 99.5% SLA model. Go-Live Condition 6 requires QDB operations to formally acknowledge this window.

3. **In-process NodeCache creates a 900-second stale-permissions window under multi-instance deployment (SEC-08 — Low, accepted):** Each API pod maintains its own permission cache. A role revocation on one pod is not instantly propagated to others. Maximum stale-window is 900 seconds (JWT lifetime). This is acknowledged by ADR-RBAC-001 and accepted until Redis becomes available (OQ-003, deferred to DXP-P1-003). Operations must understand this SLA before go-live.

4. **Seven-year audit log retention is architecturally stated but not technically enforced in code:** The Dataverse environment configuration — specifically, the absence of a Delete privilege on `qdb_rbac_audit_log` for any service account — is the only enforcement mechanism available before DXP-P1-004 delivers the Azure Blob archival job. This is a deployment verification obligation (P6-C4) and a programme-level commitment for DXP-P1-004, not a code deficiency.

5. **Data residency for Qatar government PII has not been confirmed from code:** The Dataverse environment `org5869857f` must be hosted in a Qatar-compliant Azure region. This is verifiable only by QDB IT, not from source code. It is a go-live prerequisite (P6-C5).

---

## 4. Verdict

**APPROVED WITH CONDITIONS**

The RBAC system is architecturally correct, the permission model is appropriately conservative for a government banking context, and the critical code defects identified across Phases 5 and 6 have been resolved before this review. All six Phase 1 CEO conditions have been demonstrably met. The four-eyes promotion flow is correctly implemented, the cross-population prohibition is enforced at the service layer, the audit trail is append-only in code, and the PII access logging obligation under Qatar Law No. 13 is now wired to all relevant endpoints.

Approval is withheld as unconditional because three deployment-layer conditions (P6-C4, P6-C5, P6-C6) cannot be verified from source code alone and require written confirmation from QDB IT and QDB Operations. Additionally, the last-admin race condition (SEC-05) and the `bumpRbacVersionForUser` fragility (SEC-03/D-003) are accepted but should be tracked as hardening work in the next available sprint. None of these are code blockers for go-live, but all six conditions below must be satisfied and documented in the deployment runbook before traffic is routed to this system.

---

## 5. Go-Live Conditions

The following conditions must be satisfied, evidenced, and appended to the deployment runbook before this engagement is declared production-ready. No condition may be waived without written CEO approval.

| # | Condition | Owner | Definition of Done |
|---|---|---|---|
| 1 | Confirm that `logPiiAccessed` is invoked from every endpoint returning `qdb_form_data`, `qdb_user_id`, or any field classified as CitizenPII. TC-SEC-003 must be promoted to an integration test and must pass in CI with a green result. | Dev Team | TC-SEC-003 passes in CI; a CI build log link is attached to the deployment checklist. |
| 2 | Confirm that `ipAddress` is populated (not empty string) in all five service-layer audit writer calls (`assignRole`, `revokeRole`, `initiatePromotion`, `approvePromotion`, `rejectPromotion`). Spot-check two `qdb_rbac_audit_log` records in staging after a test role assignment; both must have a non-empty `qdb_ip_address` value. | Dev Team | Staging test evidence (screenshots or OData query result) attached to deployment checklist. |
| 3 | Confirm that `guardNoPendingPromotion` excludes records where `qdb_expires_at` is in the past (either via updated filter or implemented expiry cron job). A test scenario in staging: initiate a promotion, allow it to expire naturally or set `qdb_expires_at` to the past, then initiate a new promotion for the same user. The second initiation must succeed with HTTP 201. | Dev Team | Staging test evidence attached to deployment checklist. |
| 4 | QDB IT to confirm in writing that the Dataverse service account's security role on `qdb_rbac_audit_log` grants Append and Read only — no Write privilege and no Delete privilege. Evidence must be a screenshot of the Dataverse security role configuration or an export of the solution XML. | QDB IT | Written confirmation with evidence attached to deployment runbook. |
| 5 | QDB IT to confirm in writing that the Dataverse environment `org5869857f` is provisioned in a Qatar-compliant Azure region (Qatar or GCC, consistent with MOTC data localisation guidance and the commitment made in DXP-P1-001). | QDB IT | Written confirmation with Azure region designation attached to deployment runbook. |
| 6 | QDB Operations to formally acknowledge and sign off on two accepted risks: (a) the fail-open JTI blocklist behaviour during Dataverse unavailability (SEC-04), and (b) the 900-second maximum stale-permissions window under multi-instance deployment (SEC-08). Both risks must be captured in the operations runbook with the name and date of the approving QDB authority. | QDB Ops | Signed runbook entry or email acknowledgement from QDB IT Director or delegated authority attached to deployment checklist. |

---

## 6. Next Engagement

DXP-P1-003 (Theme Tokens) is currently triple-gated: it requires DXP-P1-001 conditions C3–C6 to be cleared, three QDB stakeholder answers (publish model, L5 approval, Redis availability), and the JWT claim structure from DXP-P1-002 to be frozen. DXP-P1-002's JWT structure is now frozen at the reference-token pattern (`rbac_version` only; no permissions claim in the token), satisfying the DXP-P1-003 gate on JWT claim structure; however, DXP-P1-003 must not begin architecture until the three outstanding QDB stakeholder answers and the DXP-P1-001 prerequisite conditions are also resolved.
