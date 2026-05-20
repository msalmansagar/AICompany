# Phase 7 — CEO Final Decision
## Customer Loan Portal & RM Workspace
**Decision Authority:** CEO, Maqsad AI (Muhammad Salman Sagar)
**Date:** 2026-05-09
**Engagement Version:** BRD v1.1 / Architecture v1.1 / Tech Build v1.1 / QA v1.0 / Audit v1.0
**Status:** APPROVED WITH CONDITIONS — UAT BLOCKED PENDING SPRINT 1 REMEDIATION

---

## 1. Executive Summary

Maqsad AI has designed and built a two-surface digital lending origination system for Qatar Development Bank (QDB): a customer self-service portal in Next.js 15 that replaces free-text email submissions with a structured four-step wizard, and an RM Workspace in Dynamics CRM on-premise that provides merge/split operations, DOA-based BMP workflow routing, and an append-only regulatory audit trail. The strategic objective — eliminating manual RM data-entry error and compressing credit cycle time through a structured, auditable origination channel — is fully realized in the design and technical build. The QA plan demonstrates rigorous test coverage across 91 test cases with appropriate prioritization of business-critical paths (merge/split logic, DOA routing, audit trail integrity). The audit, however, has surfaced seven go-live blockers and six governance gaps, all of which are correctable at the implementation level without any architectural rework. This decision approves the engagement for Sprint 1 remediation and conditional UAT, not for production deployment.

---

## 2. Phase 1 Conditions — Status Check

The CEO BRD approval (2026-05-06) established six binding conditions before downstream phases could proceed. The audit has assessed each. I am confirming the status here at the Phase 7 gate.

| # | CEO Condition (from brd-approval.md) | Status | Basis |
|---|--------------------------------------|--------|-------|
| 1 | Platform confirmed as Dynamics CRM on-premise, not Dynamics 365 cloud | OPEN | C-007 identified `plugins/dataverse.ts`, `fastify.dataverse` decorator, and a `// Power Automate handles BPF stage transition` comment in production code. These naming artifacts directly contradict the platform confirmation. The condition is not fully met until C-007 is resolved. |
| 2 | Workflow automation confirmed via the bank's internal BMP module, not Power Automate | OPEN | The stale comment in `CrmRepository.resetApplicationWorkflowStage` explicitly attributes workflow stage transitions to Power Automate — a platform explicitly prohibited by this condition. C-007 covers this. The underlying implementation is correct (OData PATCH to `maq_workflowstage` triggers BMP via its configured event listener), but the comment creates an ambiguous and incorrect audit trail. |
| 3 | Current QDB portal capabilities and actual RM pain points reflected | MET | BRD v1.1 accurately documents QDB's existing portal limitations and the RM pain points (manual data entry, duplicate submissions, no structured request-type capture). No deviation found across architecture or technical build. |
| 4 | Correct approval chain with DOA-based routing | MET | DOA routing is externalized entirely to the BMP module configuration. No hardcoded thresholds exist in any TypeScript or JavaScript source file reviewed. The code audit confirmed zero hardcoded DOA values. Architecture section 7.2 and the stage transition table correctly describe BMP as the routing authority. |
| 5 | Correct workflow stages (7 stages, not 11) | MET | Architecture v1.1 implements exactly the seven approved stages: Draft, Submitted, RM Review, RM Merge/Split Review, Credit Review, Approval, Completed/Rejected/Cancelled. No extraneous stages exist. |
| 6 | Downstream phases (Architecture, Technical Build) to be revised before QA and Audit proceed | PARTIALLY MET | Architecture v1.1 and Technical Build v1.1 exist and are substantially revised. However, the presence of `plugins/dataverse.ts` and the Power Automate comment demonstrates the revision was incomplete. The auditor correctly flagged this as a breach of this condition. The audit proceeded on the revised documents, which was the correct operational decision; the naming gap must now be closed before production deployment. |

**Summary:** Four of six Phase 1 conditions are fully met. Two conditions are open due to the same root cause — incomplete eradication of pre-revision Dataverse and Power Automate terminology in production code (C-007). All six conditions must reach MET status before production go-live.

---

## 3. Audit Blocker Classification

The auditor identified seven go-live blockers (C-001 through C-007). I am classifying each as a Release Blocker (blocks UAT), Sprint 1 item (UAT can proceed, must fix before production), or Accepted Risk (document and accept). Given the regulatory environment (QCB, FATF, PDPPL) and the financial data involved, I am applying a conservative standard.

### C-001: OData Filter String Interpolation — OData Injection Vector

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** OData injection is an injection vulnerability (OWASP A03). The CrmRepository constructs filter strings by direct interpolation of application IDs, facility IDs, and customer IDs without GUID validation. In the context of a multi-customer financial system, a crafted ID value could return records belonging to other customers. This is a cross-customer data exposure risk — the single most unacceptable failure mode in a regulated commercial lending platform. UAT will exercise the CRM integration layer; running UAT against an injection-vulnerable repository means testers are operating against a system that could leak test customer data across accounts. The fix is a single `assertGuid` guard function applied at every CrmRepository method entry — one hour of work that must precede any test run against real CRM data.

---

### C-002: Silent Error Swallowing in Critical CRM Write Paths

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** Silent error swallowing on audit log writes, merge history writes, and facility reassignments means that during UAT, testers executing merge and split scenarios may observe a success response from the API while the underlying CRM records were never written. The test results would be meaningless — pass results would reflect a broken system in a way that is invisible until production data integrity is examined. This directly undermines the validity of TC-045, TC-072, TC-061, and TC-020. Additionally, C-002 compounds C-004 (no atomicity): without error surfacing, partial state cannot be detected. The `assertOk` pattern described in the audit is a straightforward addition to one class.

---

### C-003: Missing Master Application Status Validation in Merge Eligibility

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** The merge eligibility check validates source applications against `ELIGIBLE_MERGE_STATUSES` but does not validate the master application's status. An RM could designate an application in `credit_review` as the merge master. This would corrupt an active credit assessment — a credit risk control failure. UAT must include merge scenario testing (TC-072, TC-073). Those tests must be run against a system that correctly validates the master application. The fix is three lines of code in `validateMergeEligibility`.

---

### C-004: No Atomicity Guarantee for Multi-Step Merge/Split Operations

**Classification: SPRINT 1 — UAT may proceed with documented risk**

**Justification:** This is the most architecturally complex of the seven blockers. The Dynamics CRM on-premise OData API does not support ACID transactions natively. The auditor has correctly identified this gap and proposed three remediation paths (OData $batch change sets, idempotency job table, compensating rollback). UAT can proceed because: (a) UAT operates against synthetic data in a staging environment — a partial state during UAT produces a recoverable test record, not a regulatory violation; (b) the fix requires coordination with the BMP team to understand whether $batch affects BMP event listeners; (c) C-002 being resolved as a Release Blocker means errors in intermediate steps will now surface rather than be swallowed, providing partial protection even without full atomicity. However, C-004 must be fully resolved before production deployment. I am accepting the UAT risk on the basis that GG-002 (incident response runbook for partial state) is produced before UAT begins, so the bank's team knows how to identify and recover a partial state if it occurs during testing.

**Conditions for UAT with C-004 open:** GG-002 runbook must be complete and reviewed by the bank's IT operations team before UAT begins.

---

### C-005: No CSRF Protection Evidence on State-Changing API Routes

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** The auth mechanism (cookie vs. Authorization header) directly determines whether CSRF is a live risk for the portal. This ambiguity must be resolved before UAT because UAT involves real browser sessions against the staging portal with real B2C test accounts. If the portal uses cookie-based token storage (common in Next.js server-side rendering), running UAT without CSRF protection means the test environment is open to CSRF attacks from within the same test network. The fix is not large: document the token storage mechanism in `plugins/auth.ts` and either confirm Bearer-only auth (making CSRF inherently mitigated) or implement `fastify-csrf-protection`. This must be confirmed before testers log into the portal with their test accounts.

---

### C-006: Missing Server-Side Document Filename Sanitization

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** UAT will involve real document uploads by bank test users. Allowing unsanitized filenames into `maq_documentname` and `DraftDocument.documentName` during UAT would seed the staging CRM and PostgreSQL with potentially malformed data that persists beyond the test run. More critically, if a tester uploads a file with a path-traversal filename, the Azure Blob Storage path could be corrupted, producing a defect that is difficult to trace. The `sanitizeDocumentName` function is a ten-line utility that must be in place before the first upload test.

---

### C-007: Residual Power Automate and Dataverse References in Production Code

**Classification: RELEASE BLOCKER — must fix before UAT**

**Justification:** This finding directly violates two CEO Phase 1 conditions. Running UAT against code that names its CRM plugin `plugins/dataverse.ts` and contains a comment attributing workflow transitions to Power Automate means UAT results would be formally logged against a system that does not comply with the approved BRD. Any UAT sign-off document produced from such a test run would carry an asterisk: the system under test was not fully aligned with the approved architecture. The fix is a rename and a comment replacement — less than thirty minutes of work that must be done before the first UAT session.

---

## 4. Governance Gap Classification

The auditor identified six governance gaps (GG-001 through GG-006). I am classifying each.

### GG-001: No Data Retention and Erasure Procedure (PDPPL Compliance Failure)

**Classification: SPRINT 1 — must resolve before production go-live**

**Justification:** PDPPL compliance is a legal requirement in Qatar. The right-to-erasure gap is a go-live blocker for production but not for UAT, because UAT uses synthetic data under a test data management agreement. The retention policy must define: draft abandonment purge (PostgreSQL, recommended 90 days), submitted application retention (CRM, 7 years per NFR-009), document retention (Blob Storage, 7 years), and audit log retention (CRM, 7 years). The bank's Data Protection Officer or legal team must sign off. This cannot be deferred past production go-live.

---

### GG-002: No Incident Response Procedure for Merge/Split Partial State

**Classification: RELEASE BLOCKER (conditional) — required before UAT given C-004 open**

**Justification:** I am elevating this from Sprint 1 to a UAT precondition because C-004 (no atomicity) is not being resolved before UAT. The runbook must exist so that if a partial merge state occurs during UAT, the bank's test team knows how to identify it (query `maq_applicationmergehistory` for orphaned source records) and revert it. Without this runbook, a partial state during UAT would be an unrecoverable test incident. The runbook is a documentation artifact that can be produced in one working day.

---

### GG-003: BMP Module Documentation and Sign-Off Gap

**Classification: SPRINT 1 — must resolve before production go-live**

**Justification:** BRD Risk R-004 rated BMP integration as High risk. The entire workflow routing, DOA evaluation, task creation, and notification mechanism depends on BMP being correctly configured per the specification in phase-3-tech.md C.2. UAT can begin without formal BMP sign-off (the staging BMP configuration will be tested empirically through TC-055, TC-056, TC-057), but production go-live requires written confirmation from the bank's BMP team that the production BMP configuration matches the approved specification. This prevents a scenario where staging BMP and production BMP diverge.

---

### GG-004: No Formal Data Classification Document

**Classification: SPRINT 1 — must resolve before production go-live**

**Justification:** BRD Constraint 4 requires compliance with the bank's data classification and security policy. A data classification matrix mapping every CRM entity and field to the bank's classification tiers (Public, Internal, Confidential, Highly Confidential) is required for regulatory examination readiness. This is a documentation deliverable, not a code change. It should be produced as part of the operational handover package by the backend and CRM agents in Sprint 1.

---

### GG-005: Rule Change Chain of Custody (BMP Configuration Change Management)

**Classification: SPRINT 1 — must resolve before production go-live**

**Justification:** BRD Constraint 5 mandates that DOA thresholds are managed through BMP configuration, not hard-coded. This is correctly implemented. However, there is no change management gate controlling who can change BMP configuration, and how those changes are authorized. Without this gate, a misconfigured DOA threshold could route applications to the wrong approval tier. A change management procedure requires minimum dual-sign-off (Credit Director + Compliance Officer), a change log, and a test gate before production deployment. This is a bank governance process that must be agreed with the client before go-live.

---

### GG-006: Controls Testing After Platform Upgrade

**Classification: ACCEPTED RISK — first post-go-live sprint**

**Justification:** This is a DevOps maturity improvement, not a gap that creates immediate risk. The existing CI pipeline (as described in phase-2-arch.md section 11.2) includes lint, type check, unit tests, integration tests, build, and E2E tests. Dependency update automation (Dependabot / Renovate) and a "full suite on version bump" trigger are best practice but are not prerequisites for UAT or initial production go-live. This will be a tracked item in the first post-go-live sprint and must appear in the project backlog before the engagement is closed.

---

## 5. ROI Assessment

### Development Effort

| Phase | Estimated Effort |
|-------|-----------------|
| BA + BRD (Phase 1-2) | 8 development days |
| Architecture and ADRs (Phase 2) | 6 development days |
| Technical Build — Portal (Next.js, TypeScript, Tailwind, MSAL) | 22 development days |
| Technical Build — Backend API (Fastify, Prisma, PostgreSQL) | 18 development days |
| Technical Build — CRM On-Premise (entities, forms, JS web resources, BMP) | 20 development days |
| QA Strategy and Test Execution Setup | 8 development days |
| Audit and Remediation (Sprint 1) | 6 development days |
| **Total Estimated Engagement Effort** | **88 development days** |

Sprint 1 remediation (C-001 through C-007 plus GG-002 runbook) is estimated at 6 additional development days, bringing total to approximately 88 days of billable engagement.

### Annual Value to QDB

| Value Driver | Current State | Post-Implementation | Estimated Annual Value |
|--------------|--------------|--------------------|-----------------------|
| RM data-entry time per application | 45-60 minutes manual (free-text email, spreadsheet re-entry) | Under 10 minutes (structured CRM record created automatically on submission) | 500 applications/year x 40 minutes saved x 1 RM hour cost = significant FTE saving |
| Application error rate (missing data, wrong facility ref, duplicate requests) | Estimated 30-40% of submissions require RM callback to customer for clarification | Under 5% (Zod validation, conflict matrix, required fields enforced at portal) | Reduced credit cycle time by estimated 2-3 days per application requiring callback |
| Merge/split operations | Manual copy-paste between CRM records; no audit trail; estimated 2-3 hours per merge | Under 15 minutes with wizard; full audit trail automatically generated | 50 merge/split operations/year x 2 hours saved = 100 hours RM time |
| Credit cycle time (Draft to First Credit Decision) | Estimated 14-21 days due to email handoffs and re-entry | Estimated 8-12 days with structured portal submission directly into BMP workflow | Earlier credit decisions = faster facility disbursement = revenue impact for QDB |
| Regulatory audit preparation | Manual log collation from email and CRM notes; estimated 40+ hours per examination | Structured append-only audit log with full field-level old/new values; examination preparation estimated at under 4 hours | Reduced compliance cost and examination risk |

**Estimated Annual Value to QDB (conservative):** QAR 1.2M - 1.8M in combined RM efficiency, credit cycle compression, and reduced compliance cost.

**Engagement Investment:** At Maqsad AI standard rates for an 88-day full-stack enterprise engagement, estimated total engagement cost falls well below the single-year value delivered.

**Payback Period:** Under 12 months from production go-live on conservative estimates. Likely 6-8 months on moderate volume assumptions (500+ applications per year).

---

## 6. Final Decision

**APPROVED WITH CONDITIONS**

Seven blockers must be resolved. C-001, C-002, C-003, C-005, C-006, C-007, and GG-002 must be resolved before UAT begins. C-004 is accepted for UAT with GG-002 as the compensating control. All Sprint 1 items (C-004 in full, GG-001, GG-003, GG-004, GG-005) must be resolved before production go-live.

UAT is not authorized until all Release Blockers listed in Section 3 are remediated and evidence is submitted to this office.

Production go-live is not authorized until all Sprint 1 items are resolved, BMP team sign-off is obtained (GG-003), data retention policy is signed by the bank's DPO (GG-001), Azure regions are confirmed as Qatar North or UAE North (audit condition 11), and a QA re-run on the ten affected test cases passes cleanly in staging.

---

## 7. Sprint 1 Remediation Plan

The following remediation items are assigned to the correct specialist agents. All Sprint 1 items must be completed within one sprint (10 working days) from the date of this decision. Release Blockers (marked RB) must be completed before UAT begins.

### Backend Agent

**C-001 — OData GUID Injection Guard (RB)**
- Create a private `assertGuid(value: string, fieldName: string): void` function in `CrmRepository.ts`.
- Apply it at the entry of every method that accepts an ID parameter before constructing a URL: `getApplication`, `getFacilityRequestKeys`, `reassignFacilitiesToApplication`, `reassignRequestTypesToApplication`, `reassignDocumentsToApplication`, `reassignDocumentsForFacilitiesToApplication`, `userHasPrivilege`, `resetApplicationWorkflowStage`, `recalculateApplicationTotals`, and all related private update helpers.
- The GUID regex must be: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- Add unit tests: `assertGuid_ValidGuid_DoesNotThrow`, `assertGuid_InvalidString_ThrowsValidationError`, `assertGuid_ODataInjectionAttempt_ThrowsValidationError`.
- Evidence required: diff of `CrmRepository.ts` showing guard at every entry point + CI pass.

**C-002 — CrmRepository Response Checking (RB)**
- Create a private `assertOk(response: Response, operation: string): Promise<void>` method in `CrmRepository.ts`.
- Apply `await this.assertOk(response, '<operationName>')` after every `fetch` call in the repository, including: `createMergeHistory`, `createSplitHistory`, `recalculateApplicationTotals`, `updateFacility`, `updateRequestType`, `updateDocument`, `resetApplicationWorkflowStage`, `createApplication`, `updateApplication`.
- `assertOk` must log the CRM response status and error body to pino at `error` level, then throw a typed `CrmError`.
- Evidence required: diff showing `assertOk` applied to all fetch calls + updated TC-020 test passing.

**C-003 — Master Application Status Validation (RB)**
- Add master application status check at the top of `MergeService.validateMergeEligibility`, before the source application loop.
- Throw `ValidationError` with code `INELIGIBLE_MASTER_STATUS_FOR_MERGE` if the master application is not in `ELIGIBLE_MERGE_STATUSES`.
- Add unit test: `mergeApplications_MasterApplicationInCreditReviewStatus_ThrowsValidationError`.
- Evidence required: diff + CI test pass.

**C-004 — Merge/Split Atomicity (Sprint 1, production gate)**
- Implement OData `$batch` change set semantics for the critical writes within each per-source-app merge loop iteration: `moveRecordsToMaster` + `markSourceAsMerged` + `createMergeHistoryRecord` must be submitted as a single OData change set.
- If OData $batch is incompatible with the BMP event listener (confirm with BMP team), implement the PostgreSQL idempotency job table approach instead: record each step before execution, allow a recovery job to detect and revert partial state.
- Add a `maq_mergestatus` option set field to `maq_loanapplication` with values: `None`, `MergeInProgress`, `MergeComplete`, `MergeFailed`.
- Evidence required: architecture decision note + implementation diff + TC-081 (concurrent merge test) passing.

**C-005 — CSRF Protection Clarification and Implementation (RB)**
- Document in `plugins/auth.ts` whether B2C tokens are stored in `httpOnly` cookies or in memory/Authorization headers.
- If cookie storage: register `@fastify/csrf-protection` and apply the CSRF preHandler to all state-changing routes (`POST`, `PUT`). Set `SameSite=Strict` on all cookies.
- If Authorization-header-only Bearer: add an explicit comment in `plugins/auth.ts` stating this is the CSRF mitigation and ensure no state-changing route accepts session cookies as the sole auth mechanism. Document this in the security architecture section of the handover package.
- Evidence required: `plugins/auth.ts` diff + TC-091 re-executed passing.

**C-006 — Document Filename Sanitization (RB)**
- Implement `sanitizeDocumentName(rawName: string): string` in `DocumentService.ts` using `path.basename`, null-byte stripping, alphanumeric-safe character enforcement, and 200-character truncation.
- Add the corresponding Zod validation rule to the document upload schema: `documentName: z.string().max(200).regex(/^[a-zA-Z0-9._\- ]+$/)`.
- Apply `sanitizeDocumentName` before writing to `DraftDocument.documentName` and `maq_applicationdocument.maq_documentname`.
- Add unit tests: `sanitizeDocumentName_PathTraversalAttempt_StripsPaths`, `sanitizeDocumentName_NullBytes_Stripped`, `sanitizeDocumentName_ExcessiveLength_Truncated`.
- Evidence required: diff + unit tests passing.

**H-002 — saveDraft Error Handling**
- Add `response.ok` check and error state to `saveDraft` in `ApplicationWizard.tsx`.
- Surface a user-visible error message when the draft save fails. Do not silently resolve the `isSaving` state on failure.
- Evidence required: diff + TC-032 updated.

**H-005 — Token Refresh and 401 Handling**
- Implement a central `apiFetch` wrapper in the portal that attaches the B2C token from the NextAuth session to the `Authorization` header and handles 401 by redirecting to the B2C login page.
- Replace all bare `fetch` calls in `ApplicationWizard.tsx` and `DocumentUploadZone.tsx` with `apiFetch`.
- Evidence required: diff + TC-070 passing in staging.

**H-010 — Idempotency Key Enforcement on Submit and Merge Routes**
- Implement idempotency key processing as a Fastify preHandler plugin.
- Store processed keys in PostgreSQL with a 24-hour TTL.
- Apply to `POST /api/v1/applications/:id/submit` and `POST /api/v1/applications/merge`.
- Evidence required: diff + integration test for double-submit returning cached response.

**H-011 — userHasPrivilege CRM Error Distinction**
- Change `if (!resp.ok) return false;` to throw a `CrmError('PRIVILEGE_CHECK_FAILED', ...)` so that CRM unavailability is distinguished from an authorization denial in the audit trail.
- Evidence required: diff + unit test `userHasPrivilege_CrmReturns500_ThrowsCrmError`.

---

### CRM On-Premise Agent (crm-developer)

**C-007 — Dataverse and Power Automate Terminology Eradication (RB)**
- Rename `plugins/dataverse.ts` to `plugins/crmClient.ts`.
- Rename the Fastify decorator from `fastify.dataverse` to `fastify.crmClient` in all route handlers, service constructors, and app registration.
- Remove the comment `// Power Automate handles BPF stage transition via SetStage action` from `CrmRepository.resetApplicationWorkflowStage`. Replace with: `// BMP module reacts to the maq_workflowstage field update via its configured plugin event listener. No additional API call is required from this layer.`
- Remove `PowerAutomate` from the `maq_actorsource` option set in CRM. Add `BMP` as a replacement option.
- Rename `maq_workflowinstance.maq_bpfinstanceid` to `maq_bmpinstanceid` and update the field description to "BMP module workflow instance identifier." Coordinate with the BMP team on whether this field is needed or should be removed.
- Evidence required: grep search returning zero matches for `dataverse` (in plugin names), `PowerAutomate`, `BPF` in production TypeScript and JavaScript source files, plus CRM option set export showing updated `maq_actorsource` values.

**H-004 — isSplitEligible Ribbon Rule Synchronization**
- Add `'disbursement'` and `'branched'` to the `ineligibleStatuses` array in `maq_ribbonrules.js` `isSplitEligible` function, to match `SplitService.NON_SPLITTABLE_STATUSES`.
- Evidence required: diff of `maq_ribbonrules.js` + TC-051 and TC-052 re-executed passing.

**H-006 — AuditService Actor Source Corrections**
- Remove `PowerAutomate` option from `maq_actorsource` option set (covered by C-007 above).
- Ensure the application submission route in `routes/applications/submit.ts` writes an audit event with `actorSource: 'Portal'` for submission events.
- Add `actorSource` as a validated enum parameter in `AuditEventPayload` type.
- Evidence required: diff + updated TC-020 test.

**H-007 — maq_workflowinstance BPF Field (covered by C-007)**
- This is addressed as part of the C-007 remediation above.

**GG-002 — Merge/Split Partial State Incident Response Runbook (RB precondition for UAT)**
- Produce a "Merge/Split Recovery Runbook" document.
- The runbook must include: (1) how to detect partial state (OData query pattern against `maq_applicationmergehistory` for orphaned source records), (2) how to revert a partial merge (step-by-step OData API calls to reassign facilities back to source application, reset source status, delete orphaned merge history record), (3) who is authorized to execute recovery (named role: CRM Administrator or Senior RM Manager), and (4) how to escalate if CRM OData is unavailable.
- This document must be reviewed and signed off by the bank's IT operations team before UAT begins.

---

### DevOps Agent

**M-006 — Dockerfile and CI Pipeline**
- Provide and commit a `Dockerfile` for the Fastify backend API using a multi-stage build with `USER node` in the final stage.
- Provide and commit a `Dockerfile` for the Next.js portal.
- Add `trivy image` and `npm audit` steps to the GitHub Actions CI pipeline.
- Add `SBOM generation` step (e.g., using `@cyclonedx/cyclonedx-npm`) to the CI pipeline.
- Evidence required: Dockerfiles committed and passing CI with trivy reporting zero critical or high CVEs.

**GG-006 — Controls Testing After Platform Upgrade (post-go-live sprint — tracked)**
- Add Dependabot or Renovate configuration to the repository for automated dependency update PRs.
- Add a CI step that runs the full E2E and security test suite when a dependency version bump is merged to the main branch.
- This item is tracked in the engagement backlog and must be completed in the first post-go-live sprint.

---

### Frontend Agent

**H-003 — DocumentUploadZone Error Handler**
- Add an `else` branch to the `onDrop` handler in `DocumentUploadZone.tsx` that calls `onUploadError(file.name, errorMessage)` and displays an error toast.
- Wrap the entire upload loop in a try/catch to handle network-level failures.
- Evidence required: diff + TC-029 updated with error path test.

**M-001 — onSubmit Stub (ApplicationWizard)**
- Implement or explicitly wire the `onSubmit` function in `ApplicationWizard.tsx` to call the submit API and redirect to the confirmation page with the reference number.
- If `StepReviewSubmit` handles submission directly, remove the stub and add a comment explaining the delegation.
- Evidence required: TC-034 passing end-to-end.

---

### All Agents — Azure Region Confirmation

Before production go-live, the DevOps agent must confirm in writing (IaC configuration or Azure Policy export) that all cloud resources are provisioned in the Qatar North or UAE North Azure region. This covers: Azure App Service, Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Azure Blob Storage, Azure Application Insights, and Azure AD B2C tenant region.

---

## 8. Strategic Notes

This engagement yields several lessons that must inform all future banking and CRM on-premise engagements at Maqsad AI.

**Platform Confirmation is a Gate, Not a Formality**
The BRD v1.0 was built on incorrect platform assumptions (Dynamics 365 cloud, Dataverse, Power Automate). The revision to v1.1 was done correctly at the BRD and architecture level, but incomplete at the code level — the `plugins/dataverse.ts` artifact is evidence that the build phase did not fully internalize the platform revision. Going forward, the first step in every Sprint planning session after a BRD revision must be a grep across the entire codebase for terminology associated with the rejected platform. A five-minute search would have caught C-007 before the audit.

**OData Is Not Parameterized SQL — Treat It As An Injection Surface**
The CRM OData filter string interpolation (C-001) is a category of vulnerability that is easy to miss because OData is not SQL. Developers who correctly use Prisma's parameterized queries for PostgreSQL may not apply the same discipline to OData filter construction. The `assertGuid` pattern is the correct mitigation and must be included in the Maqsad AI standard CRM repository template for all future on-premise CRM engagements.

**Silent CRM Write Failures Are a Systemic Pattern Risk**
C-002 (silent error swallowing) is not unique to this engagement. Any backend API that communicates with Dynamics CRM on-premise via OData fetch calls is vulnerable to this pattern. The `assertOk` helper must be codified as a required component in the Maqsad AI CRM repository template. Every CRM repository class produced by any agent must include this pattern before code review sign-off.

**Distributed Transactions Across CRM Are Not Free**
C-004 (no atomicity) reflects a fundamental constraint of Dynamics CRM on-premise: the OData API does not support ACID transactions across entity types. The architecture document correctly specified "BEGIN TRANSACTION" in the algorithm pseudocode, but the implementation silently dropped this requirement. Going forward, any multi-entity write sequence in a CRM on-premise engagement must be explicitly designed with either OData $batch change sets or a compensating transaction pattern. This must be an architecture-level decision (ADR), not an implementation assumption.

**Regulatory Terminology in Code Has Governance Weight**
In a regulated banking environment, code comments are discoverable artifacts. An auditor examining `resetApplicationWorkflowStage` and finding `// Power Automate handles BPF stage transition` would have legitimate grounds to question whether the system complies with the approved architecture. Future agents must be instructed that in financial services engagements, code comments referencing external systems, platforms, or regulatory frameworks are subject to the same accuracy standard as formal documents.

**Data Residency Must Be Specified in the Architecture, Not Assumed**
The PDPPL data residency gap (Section 7 of the audit) was caused by the architecture document listing Azure services without specifying the Azure region. In every future engagement involving Azure services for a Qatar-domiciled client, the architecture document must explicitly state the Azure region for every service listed, and the DevOps agent must enforce this via Azure Policy before the first infrastructure deployment. Region specification is not optional — it is a legal requirement.

**BMP Integration Risk Must Be Signed Off Before UAT**
This engagement correctly identified BRD Risk R-004 (BMP integration complexity: High) but did not obtain BMP team sign-off before build completion. In future engagements where a third-party module (BMP, SAP, custom middleware) owns critical business logic, a formal sign-off from the third-party team must be a Phase 2 (Architecture) exit criterion, not a post-audit remediation item. Discovering at Phase 6 that BMP configuration has never been formally confirmed is too late.

**The Merge/Split Wizard Is Reusable IP**
The Merge Wizard and Split Wizard implemented as Dynamics CRM on-premise JavaScript web resources (not PCF) represent a reusable pattern for any multi-entity consolidation workflow in on-premise CRM. Maqsad AI should document this as a reusable component in the company's internal asset library. Future engagements requiring similar RM-facing workflow tooling in on-premise CRM can reuse the wizard framework, reducing build time by an estimated 8-12 days.

---

*Phase 7 — CEO Final Decision*
*Maqsad AI — CEO (Muhammad Salman Sagar)*
*Date: 2026-05-09*
*Next action: Backend agent (C-001, C-002, C-003, C-005, C-006, H-002, H-005, H-010, H-011) + CRM agent (C-007, GG-002, H-004, H-006) + DevOps agent (M-006) + Frontend agent (H-003, M-001) to execute Sprint 1 remediation. Re-audit of blocker items required before UAT authorization is issued.*
