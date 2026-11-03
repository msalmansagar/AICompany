# DXP-P1-001 — Phase 7: CEO Final Decision

```
═══════════════════════════════════════════════════
CEO FINAL DECISION
═══════════════════════════════════════════════════
Project:        DXP-P1-001 — DXP Platform Phase 1 (Component Registry)
Engagement ID:  DXP-P1-001
Decision by:    CEO, Maqsad AI
Date:           2026-06-18
BRD Approval:   2026-06-17 (APPROVED WITH CONDITIONS)
═══════════════════════════════════════════════════
```

---

## 1. Executive Summary

DXP-P1-001 has delivered a versioned Component Registry for the QDB Digital Experience Platform. The backend API (11 routes, JWT-guarded, Fastify/TypeScript) is live against Dataverse org5869857f. The provisioning script created and post-validated the full Dataverse schema idempotently. All 16 E2E assertions against the live org passed for happy-path, business-rule enforcement, and unauthenticated access scenarios.

The quality gates tell a more complicated story. Phase 5 (QA) returned PASS WITH CONDITIONS with three release blockers. Phase 6 (Audit) returned NOT CLEARED FOR GO-LIVE with six blocking conditions and four conditional post-go-live items. The blockers are real and must be taken seriously — two of them (category mutability and schema truncation) are active data integrity gaps that exist in the running API right now, not theoretical future risks.

The blocking conditions sort into two categories. Four of them — GGAP-002 (category immutable), GGAP-003 (schema field length), GGAP-004 (403 live test), GGAP-005 (service principal privilege reduction) — are fixable within a single sprint by the backend engineer and the DevOps/infrastructure owner. One — GGAP-006 (automated test suite) — is a mandatory standards obligation that cannot be waived. One — GGAP-001 ($batch atomicity) — requires a deliberate architectural decision: either implement OData $batch, or accept the concurrency risk via a formal ADR with QDB sign-off. The CEO is prepared to allow the ADR path for GGAP-001, for reasons stated below.

The decision is APPROVED WITH CONDITIONS. Deployment to staging is gated on all six conditions.

---

## 2. Strategic Assessment

### 2.1 Business Value Delivered

The Component Registry is the identity and versioning foundation for the entire DXP platform. Without it, three downstream engagements cannot begin architecture:

- **DXP-P1-002** (RBAC) — needs stable component definition identity and category to scope feature access
- **DXP-P1-003** (Theme Tokens) — needs component category and version pointer for token binding
- **DXP-P1-004** (Versioning and Snapshots) — needs the is_latest invariant, the deprecated_on lifecycle field, and the GET /versions/latest endpoint for snapshot resolution

The core data model — definitions with slugs, versioned schemas, the is_latest pointer, the deactivate-not-delete pattern — is sound. The provisioning script is idempotent and has been validated three times. The API's business rule enforcement (duplicate slug prevention, duplicate version prevention, deactivate-latest guard) is working and has been verified end-to-end against the live org. The security architecture (JWT, Admin role guard, structured logging, no credentials in source) is substantially in place.

This engagement has delivered real, durable platform value. The open issues are not design flaws — they are implementation gaps and one deliberate scope trade-off.

### 2.2 Risk Posture

The risk posture at the end of Phase 6 is elevated but not unacceptable, provided the six blocking conditions are addressed before staging deployment. The risk breaks down as follows.

**Active risks in the running API (not theoretical):**

GGAP-002 and GGAP-003 are not pre-deployment risks — they are live defects in the API that is running against org5869857f right now. The category field is patchable. The schema field is capped at 4000 characters. Any admin action taken in the current state can corrupt data. These must be fixed immediately, not deferred to a sprint boundary.

**Structural risks requiring a deliberate decision:**

GGAP-001 ($batch atomicity) is the most technically complex item. The BRD required atomic set-latest via OData $batch (FR-053, NFR-005). The implementation delivered two sequential PATCH calls. The audit correctly rates the concurrency scenario as Medium likelihood because the admin population is small — this is not a high-traffic consumer API. At QDB's current scale, concurrent admin promotions are rare. However, rare is not never, and downstream engagements depend on the is_latest invariant being reliable. The CEO's position is that this can be resolved via an ADR that formally accepts the concurrency risk, documents what happens if a collision occurs (an admin sees two "latest" versions and must manually demote one — a recoverable, visible state), and commits to implementing $batch before DXP-P1-004 begins architecture. It cannot be left as an undocumented omission.

**Governance risks requiring confirmation, not code changes:**

GGAP-005 (service principal privilege reduction) requires the DevOps owner to confirm two facts: that the provisioning SP no longer holds System Administrator, and that the runtime SP has been granted only the minimum privileges on QdbDxpPlatform entities. This is an infrastructure confirmation task, not a development task.

**Data residency:**

The Audit raised a legitimate concern about org5869857f's EMEA (.crm4) region placement relative to QDB's data localisation obligations under QCB and QFC requirements. For the Component Registry specifically, the stored data is platform metadata (JSON Schemas, display names, version labels) — not citizen data or financial transaction data. The data residency question is a platform-level concern that applies to QdbPortalShell and QdbDynamicFormEngine equally. This CEO formally delegates the data residency question to QDB IT as a platform-level gate, not a DXP-P1-001 gate. Written confirmation from QDB IT must be in place before any DXP engagement goes to production. It is not a blocking condition for staging deployment of DXP-P1-001.

### 2.3 Downstream Dependency Impact

The downstream engagements cannot begin architecture until specific conditions in this document are cleared. The specific gates are defined in Section 5.

---

## 3. Decision

**APPROVED WITH CONDITIONS**

DXP-P1-001 is approved to proceed to staging deployment once all six conditions in Section 4 are satisfied and confirmed. No condition may be waived without a formal written decision from the CEO. The four post-go-live conditional items in Section 4.2 must be resolved within one sprint of staging deployment.

---

## 4. Conditions

### 4.1 Blocking Conditions (all six must be confirmed before staging deployment)

---

**CONDITION 1 — Fix GGAP-002: Remove category from PatchDefinitionSchema (Active defect)**

The category field is currently patchable via PATCH /definitions/:id. BRD FR-042 marks it immutable after creation. This is not a risk — it is an active defect in the running API. A caller can change the category of a component definition today.

Required action: Remove `category` from `PatchDefinitionSchema` and `PatchDefinitionBody`. Apply `.strict()` to ensure the field is permanently excluded and any future attempt to add it fails the schema parse. Add a test case confirming PATCH with `{ category: N }` returns HTTP 400.

Owner: Backend engineer.
Evidence required: Code change deployed to the API server; manual confirmation that PATCH /definitions/:id with a category field returns HTTP 400.
Priority: Immediate — this is live.

---

**CONDITION 2 — Fix GGAP-003: Correct qdb_propsschema field length or add pre-write guard (Active defect)**

The qdb_propsschema field is provisioned at Memo(4000). BRD FR-021 requires 1,048,576 characters. Any POST /versions call with a JSON Schema longer than 4000 characters currently returns HTTP 201 with silently truncated, broken data in Dataverse.

Required action: Re-provision qdb_propsschema with MaxLength 1048576 in the QdbDxpPlatform solution. As an interim measure (effective immediately, before re-provisioning completes), add a pre-write length check in createVersion() that returns HTTP 413 or HTTP 400 with code `props_schema_too_large` when the submitted schema string exceeds 4000 characters. Both steps are required — the interim guard prevents silent corruption now; re-provisioning resolves the root cause.

Owner: Backend engineer (interim guard); Power Platform engineer or DevOps owner (re-provisioning).
Evidence required: Interim guard deployed and confirmed to return 400/413 on oversized input. Re-provisioning confirmed with field MaxLength verified in Power Platform admin centre (screenshot or PAC CLI output).
Priority: Interim guard is immediate. Re-provisioning may be scheduled within the fix sprint.

---

**CONDITION 3 — Resolve GGAP-001: $batch atomicity — ADR or implementation (Architectural decision)**

The set-latest operation uses two sequential PATCH calls instead of OData $batch, violating BRD FR-053 and NFR-005. The is_latest invariant can be violated by concurrent admin promotions.

This condition may be resolved in one of two ways. The CEO accepts either path, but the path must be chosen explicitly and documented:

**Path A — Implement $batch:** Implement OData $batch support in DataverseClient and replace the two-step PATCH sequence. This fully satisfies FR-053 and NFR-005.

**Path B — Formal ADR with QDB acceptance:** Author and publish an ADR to `projects/dxp-p1-001/adr/` that documents: (a) why $batch was not implemented in Phase 1, (b) the exact concurrency scenario and its frequency assessment, (c) what the visible symptom is if a collision occurs (two versions showing is_latest = true), (d) the manual remediation path for an admin, and (e) the commitment to implement $batch before DXP-P1-004 architecture begins. The ADR must carry written acceptance from QDB's designated technical authority. Path B does not permanently excuse FR-053 — it formally defers it with a documented commitment and deadline.

Owner: Backend engineer (Path A) or Architect + QDB technical authority (Path B).
Evidence required: Either a confirmed $batch implementation with a passing test, or a signed ADR with QDB acceptance and a firm delivery commitment tied to the DXP-P1-004 start gate.
Priority: Must be resolved before staging deployment.

---

**CONDITION 4 — Confirm GGAP-004: Execute TC-052 live with a Viewer-role JWT**

The Admin role guard (app.requireRole('Admin')) exists in code on all 11 routes but has never been exercised against the running API with a real non-Admin token. Until this test is executed and passes, access control correctness for the entire Component Registry is unconfirmed.

Required action: Provision the viewer-test@qdb.qa test account (or equivalent) with Viewer role. Obtain a live JWT. Execute TC-052 (GET /api/admin/components with a Viewer token) and confirm HTTP 403 is returned. Add TC-052 to the automated CI security test suite.

Owner: QA engineer, with DevOps/infrastructure owner provisioning the test account.
Evidence required: TC-052 test output showing HTTP 403 from the live API with a confirmed Viewer-role JWT. Automated test case added to the Vitest suite.
Priority: Must be confirmed before staging deployment.

---

**CONDITION 5 — Confirm GGAP-005: Service principal privilege reduction**

The provisioning service principal was granted System Administrator at provisioning time (BRD A-002). There is no confirmed record that this privilege was revoked post-provisioning. The runtime service principal's privilege scope on QdbDxpPlatform entities is also unconfirmed.

Required action: (a) Confirm that the provisioning SP's System Administrator role in Dataverse has been revoked or reduced to a provisioning-scope custom role. (b) Create a dedicated Dataverse security role granting Read, Write, Create, Delete on qdb_component_definitions and qdb_component_versions only. Assign this role to the runtime SP. Revoke any broader scope. (c) Document both assignments in the deployment runbook.

Owner: DevOps owner or Power Platform administrator.
Evidence required: Screenshots or CLI output showing the provisioning SP's current Dataverse security role and the runtime SP's assigned custom role. Deployment runbook entry.
Priority: Must be confirmed before staging deployment.

---

**CONDITION 6 — GGAP-006: Write the automated Vitest test suite to 80% coverage**

No automated test files exist in `apps/api/src/__tests__/admin/components/`. The 24 test cases executed in Phase 5 were manual. The Maqsad AI coding standard mandates 80% line coverage on all new production code, and the Phase 5 Definition of Done explicitly includes this requirement. This is not negotiable — it is the engineering baseline for code that will be consumed by three downstream engagements.

Required action: Write the automated Vitest + Supertest test suite covering all 24 passing test cases plus TC-052, TC-053, and TC-054. The suite must execute against the live Dataverse org in the nightly CI run. The coverage report for ComponentRegistryService.ts and routes/admin/components.ts must show >= 80% line coverage.

Owner: Backend engineer.
Evidence required: Coverage report output (vitest --coverage) showing >= 80% for the two target files. CI run passing.
Priority: Must be completed before staging deployment.

---

### 4.2 Post-Go-Live Conditional Items (resolve within one sprint of staging deployment)

These four items do not block staging deployment once the six blocking conditions above are cleared. However, they block production go-live if not resolved, and GGAP-007 and GGAP-009 block downstream engagement architecture.

**POST-1 — GGAP-007: Implement GET /versions/latest endpoint**
The accidental route collision (a request to .../versions/latest currently matches .../versions/:versionId and returns HTTP 400) makes the missing endpoint invisible to callers. This must be implemented before DXP-P1-004 architecture begins.
Owner: Backend engineer. Deadline: Before DXP-P1-004 architecture start.

**POST-2 — GGAP-008: Apply .strict() to PatchVersionSchema and PatchDefinitionSchema**
PATCH /versions/:id currently silently strips isLatest, propsSchema, and versionNumber from the request body instead of returning HTTP 400 as BRD C-006 requires. This misleads callers into believing their isLatest write succeeded.
Owner: Backend engineer. Deadline: Same sprint as POST-1.

**POST-3 — GGAP-009: Provision and expose three missing BRD fields**
qdb_default_props (FR-022), qdb_bundle_url (FR-023), and qdb_deprecated_on (FR-027) are not provisioned in Dataverse and not exposed in the API. qdb_deprecated_on is required by DXP-P1-004 for version lifecycle management. Without it, P1-004 architecture cannot proceed.
Owner: Backend engineer + Power Platform engineer. Deadline: Before DXP-P1-004 architecture start.

**POST-4 — GGAP-011: Resolve seed data category assignments**
Two seed definitions (announcements and statistics) may be assigned incorrect category integer values. The provisioning script uses hardcoded org-specific option set integers rather than runtime label lookups.
Owner: Backend engineer. Deadline: Before cross-org deployment (staging, UAT, production).

---

## 5. Downstream Engagement Gates

The status of each downstream engagement is defined by which conditions from this document have been cleared.

---

**DXP-P1-002 (RBAC) — BLOCKED until:**
- All six blocking conditions in Section 4.1 are confirmed
- GGAP-002 (category mutability fix) is in place — P1-002 references component categories for feature-scoped access grants; a mutable category invalidates the RBAC data model

DXP-P1-002 BA may begin BRD drafting now. Architecture may not begin until the blocking conditions are confirmed.

---

**DXP-P1-003 (Theme Tokens) — BLOCKED until:**
- All six blocking conditions in Section 4.1 are confirmed
- GGAP-001 is resolved via Path A or Path B (the is_latest invariant must be reliable before P1-003 binds tokens to component versions)

DXP-P1-003 BA may begin BRD drafting now. Architecture may not begin until the blocking conditions are confirmed.

---

**DXP-P1-004 (Versioning and Snapshots) — BLOCKED until:**
- All six blocking conditions in Section 4.1 are confirmed
- GGAP-001 is resolved via Path A (implementation of $batch), not Path B (ADR-only deferral). P1-004 depends structurally on a reliable is_latest pointer; an ADR acceptance is insufficient for a snapshot engagement that is built on version promotion semantics
- POST-1 (GET /versions/latest endpoint) is implemented
- POST-3 (qdb_deprecated_on field) is provisioned and exposed in the API

DXP-P1-004 BA may not begin BRD drafting until GGAP-001 is resolved via Path A and POST-3 is delivered.

---

**Cross-engagement constraint (all DXP downstream engagements):**

BRD C-010 (established in the BRD Approval, 2026-06-17) applies to all three downstream engagements without exception: downstream consumers must resolve component definitions by qdb_name slug, not by Dataverse GUID, across environments. This constraint must be explicitly referenced in each downstream BRD. The BAs for P1-002, P1-003, and P1-004 are responsible for carrying this constraint forward.

---

## 6. Risk Acceptance and Escalation

### 6.1 Formally Accepted Risks

**Data residency (GGAP-014):** The CEO formally accepts that the data residency confirmation for org5869857f is a platform-level obligation on QDB IT, not a DXP-P1-001 delivery obligation. This acceptance applies to staging deployment only. Written confirmation from QDB IT that org5869857f satisfies applicable QCB and QFC data localisation requirements is a mandatory gate for production go-live of any DXP engagement.

**$batch ADR path (GGAP-001, Path B):** If QDB chooses Path B for GGAP-001, the CEO formally accepts the concurrency risk for staging deployment only. The is_latest invariant violation scenario (two versions showing is_latest = true) is recoverable by manual admin correction. The admin population is small. The risk is not zero but is proportionate to the realistic operational context. This acceptance is conditional on: (a) the ADR being signed by QDB's designated technical authority, (b) monitoring or alerting for the anomalous state being defined in the ADR, and (c) Path A being implemented before DXP-P1-004 architecture begins.

**Cursor pagination gap (no formal GGAP):** The $skip limitation is a documented deviation in phase-4-tech.md. For a registry capped at 500 records in Phase 1, this is accepted. The $skiptoken cursor implementation is deferred to a follow-up. This risk is accepted without conditions.

### 6.2 Escalation Items for QDB

The following items require action or confirmation from QDB before specific gates are cleared. Maqsad AI cannot complete these unilaterally.

1. **Test account provisioning:** viewer-test@qdb.qa with Viewer role is required to clear CONDITION 4. QDB IT or the system administrator for org5869857f must provision this account.

2. **Service principal audit:** QDB's Power Platform administrator or Azure Active Directory owner must confirm the provisioning SP privilege reduction and approve the custom security role definition for the runtime SP (CONDITION 5).

3. **Data residency confirmation:** QDB IT must provide written confirmation that org5869857f satisfies applicable QCB and QFC data localisation requirements before any DXP engagement reaches production go-live.

4. **GGAP-001 path selection:** If Path B (ADR) is chosen over Path A ($batch implementation), QDB's designated technical authority must sign the ADR. Maqsad AI can author the ADR; QDB must accept the residual concurrency risk in writing.

---

## 7. Summary Judgement

DXP-P1-001 has delivered a sound, well-architected platform foundation. The API is functional against live Dataverse. The business rules work. The security architecture is largely in place. Two of the six blocking conditions are active defects that must be fixed today; the other four are confirmations and a test suite — all achievable within a single sprint.

The engagement team should not interpret this decision as a failure. The quality gates caught real issues before they reached QDB's staging environment. That is precisely what the gate process is for. The issues are fixable. The platform is worth fixing them for.

The downstream engagements may begin BRD-level work in parallel with the fix sprint, with the architecture gates defined above. The DXP platform can move forward.

---

## 8. Approval Record

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | Maqsad AI CEO | APPROVED WITH CONDITIONS | 2026-06-18 |
| QDB Technical Authority | — | PENDING CLIENT SIGN-OFF | — |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-001 Component Registry — Phase 7 CEO Final Decision v1.0
CEO, Maqsad AI
2026-06-18
Decision: APPROVED WITH CONDITIONS
Blocking conditions: 6
Post-go-live items: 4
Downstream engagements unblocked for BRD: DXP-P1-002, DXP-P1-003
Downstream engagements fully gated: DXP-P1-004
═══════════════════════════════════════════════════
```
