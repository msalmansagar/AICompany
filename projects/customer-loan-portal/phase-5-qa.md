# QA Strategy & Test Plan
## Customer Loan Portal & RM Workspace
**QA Lead:** Maqsad AI — QA Agent
**Date:** 2026-05-09
**Version:** 1.0
**Status:** Final — Pending CEO Sign-Off
**References:** BRD v1.1, Architecture v1.1, Technical Build v1.1

---

## Table of Contents

1. Test Strategy Overview
2. Unit Tests — Backend API (Fastify + Prisma)
3. Unit Tests — Frontend React (Next.js + @testing-library)
4. Integration Tests — API + Database
5. CRM / Plugin Tests (Dynamics CRM On-Premise)
6. E2E Tests — Playwright
7. Performance Tests
8. Security Tests
9. Test Data Strategy
10. Coverage Targets and Definition of Done

---

## 1. Test Strategy Overview

### 1.1 Scope and Objectives

This test plan covers all components delivered in the Customer Loan Portal & RM Workspace engagement:

- **Surface A:** Next.js 15 customer-facing portal (authentication, 4-step application wizard, document upload, application tracking, notifications)
- **Surface B:** Dynamics CRM on-premise RM Workspace (model-driven forms, JS web resources, merge wizard, split wizard, BMP workflow integration)
- **Integration Spine:** Fastify v5 + Prisma v5 + PostgreSQL backend API bridging portal to CRM on-premise

The primary quality objective is ensuring that no defect in the merge/split business logic, DOA routing, or audit trail reaches production. These three areas carry the highest regulatory and operational risk.

### 1.2 Testing Levels

| Level | Scope | Tool | Environment |
|-------|-------|------|-------------|
| Unit — Backend | Services, validation rules, merge/split algorithms, Zod schemas | Vitest | Local / CI |
| Unit — Frontend | React components, wizard state, Yup validation | Vitest + @testing-library/react | Local / CI |
| Integration — API | Full HTTP request through Fastify → Prisma → PostgreSQL | Supertest + Vitest | CI (Docker Compose) |
| Integration — CRM | OData calls, CRM entity writes, BMP stage transitions | Jest / Vitest + real CRM sandbox | Staging CRM |
| E2E — Portal | Customer journey: login → apply → track | Playwright | Staging |
| E2E — CRM | RM journey: merge, split, approve, reject | Playwright (browser automation against CRM UCI) | Staging CRM |
| Performance | Load, stress, concurrency | k6 | Staging / Load env |
| Security | Auth bypass, IDOR, injection, CSRF | OWASP ZAP + manual + k6 | Staging |

### 1.3 Testing Tools and Justification

| Tool | Purpose | Justification |
|------|---------|---------------|
| Vitest | Unit + integration test runner | Constitutional default; fast, TypeScript-native, compatible with ts-node |
| @testing-library/react | React component tests | Industry standard; tests from user perspective, not implementation |
| Supertest | HTTP integration tests against Fastify | Constitutional default; real HTTP layer exercised |
| Playwright | E2E browser automation | Constitutional default; cross-browser; supports Next.js and CRM UCI (Chromium) |
| k6 | Performance and load testing | Scripted in JS/TS; rich metrics; integrates with Grafana |
| OWASP ZAP | Automated security scanning | Industry standard; DAST; configured for REST API and portal |
| Prisma CLI | Database state management in tests | Native to the stack; schema migrations in test setup |
| MSW (Mock Service Worker) | External API mocking in unit tests | Intercept fetch at network boundary; avoids mock pollution in unit scope |
| Docker Compose | Test infrastructure | Spins up PostgreSQL + API container for integration tests in CI |

### 1.4 Coverage Targets Per Layer

| Layer | Minimum Line Coverage | Minimum Branch Coverage | Rationale |
|-------|-----------------------|------------------------|-----------|
| Backend services (ValidationService, MergeService, SplitService, AuditService) | 95% | 95% | Business-critical logic; every branch is a regulatory risk |
| Backend API routes | 90% | 85% | Every route has auth + validation + error path |
| Frontend components (wizard, upload, timeline) | 80% | 80% | Constitutional minimum |
| CRM JS web resources (ribbonrules, application.js, facilitygrid.js) | 85% | 80% | Tested via Playwright + unit harness |
| CrmRepository | 85% | 80% | All OData operations including error paths |

### 1.5 CI Integration Plan

```
Push to feature branch
  └── Stage 1: Lint + TypeScript strict check (fail fast)
  └── Stage 2: Unit tests — backend + frontend (Vitest, parallel)
  └── Stage 3: Integration tests — API + PostgreSQL (Docker Compose, Supertest)
  └── Stage 4: Build artifacts (Next.js + API Docker image)

Push to staging branch (merge to staging)
  └── Stage 5: Deploy to staging environment
  └── Stage 6: CRM integration tests against staging CRM sandbox
  └── Stage 7: E2E tests — Portal (Playwright, headless Chromium)
  └── Stage 8: E2E tests — CRM UCI (Playwright, headless Chromium)
  └── Stage 9: Security scan (OWASP ZAP baseline scan)

Manual gate: QA sign-off required before production promotion
  └── Stage 10: Performance tests (k6, staging load environment)
  └── Stage 11: CEO final review
```

---

## 2. Unit Tests — Backend API

**Framework:** Vitest
**Location:** `packages/api/tests/unit/`
**Conventions:** `MethodName_Scenario_ExpectedResult`; Arrange / Act / Assert; one logical assertion per test

---

### TC-001: validateConflicts_RenewalAndReschedulingOnSameFacility_ThrowsValidationError
**References:** FR-006, ADR-007
**Layer:** ValidationService
**Arrange:** Create a DraftFacility with `requestTypes: ['Renewal', 'Rescheduling']` on the same facility record.
**Act:** Call `validationService.validateConflicts([facility])`.
**Assert:** Throws `ValidationError` with code `CONFLICTING_REQUEST_TYPES`; error message names both `Renewal` and `Rescheduling`.
**Why this matters:** Renewal + Rescheduling is the most likely combination a customer will attempt. Allowing it through would produce an invalid credit submission that BMP cannot process.
**Priority:** Critical
**Type:** Unit

---

### TC-002: validateConflicts_RenewalAndExtensionOfDrawdownOnSameFacility_ThrowsValidationError
**References:** FR-006, ADR-007
**Layer:** ValidationService
**Arrange:** DraftFacility with `requestTypes: ['Renewal', 'ExtensionOfDrawdown']`.
**Act:** `validationService.validateConflicts([facility])`.
**Assert:** Throws `ValidationError` with code `CONFLICTING_REQUEST_TYPES`.
**Why this matters:** Second entry in the conflict matrix; must be independently verified.
**Priority:** Critical
**Type:** Unit

---

### TC-003: validateConflicts_LimitIncreaseAndOwnershipChangeOnSameFacility_ThrowsValidationError
**References:** FR-006, ADR-007
**Layer:** ValidationService
**Arrange:** DraftFacility with `requestTypes: ['LimitIncrease', 'OwnershipChange']`.
**Act:** `validationService.validateConflicts([facility])`.
**Assert:** Throws `ValidationError` with code `CONFLICTING_REQUEST_TYPES`.
**Why this matters:** Ownership change invalidates the credit assessment underpinning limit increase; passing both through is a credit risk control failure.
**Priority:** Critical
**Type:** Unit

---

### TC-004: validateConflicts_ReschedulingAndExtensionOfDrawdownOnSameFacility_ThrowsValidationError
**References:** FR-006, ADR-007
**Layer:** ValidationService
**Arrange:** DraftFacility with `requestTypes: ['Rescheduling', 'ExtensionOfDrawdown']`.
**Act:** `validationService.validateConflicts([facility])`.
**Assert:** Throws `ValidationError` with code `CONFLICTING_REQUEST_TYPES`.
**Why this matters:** Fourth conflict pair; tests all four matrix entries are independently enforced.
**Priority:** Critical
**Type:** Unit

---

### TC-005: validateConflicts_RenewalAndLimitIncreaseOnSameFacility_DoesNotThrow
**References:** FR-006, ADR-007
**Layer:** ValidationService
**Arrange:** DraftFacility with `requestTypes: ['Renewal', 'LimitIncrease']`. This combination is NOT in the conflict matrix.
**Act:** `validationService.validateConflicts([facility])`.
**Assert:** No exception thrown; method returns void.
**Why this matters:** False-positive prevention. Blocking valid combinations would prevent customers from submitting legitimate bundled applications — the core purpose of the system.
**Priority:** High
**Type:** Unit

---

### TC-006: validateNoDuplicateRequests_SameFacilityReferenceSameRequestTypeTwice_ThrowsValidationError
**References:** FR-006, BRD entity rule on maq_applicationrequesttype
**Layer:** ValidationService
**Arrange:** Two DraftFacility records share the same `existingRef` ("FAC-001") and both have `requestTypes: ['Renewal']`.
**Act:** `validationService.validateNoDuplicateRequests([facility1, facility2])`.
**Assert:** Throws `ValidationError` with code `DUPLICATE_REQUEST_TYPE`.
**Why this matters:** Duplicate request types on the same facility reference would create duplicate CRM records and corrupt the application. This is the guard against the existing pain point (free-text multiline was previously abused to enter duplicates).
**Priority:** Critical
**Type:** Unit

---

### TC-007: validateMinimumFacilities_ZeroFacilities_ThrowsValidationError
**References:** FR-006, FR-003
**Layer:** ValidationService
**Arrange:** `facilitiesCount = 0`.
**Act:** `validationService.validateMinimumFacilities(0)`.
**Assert:** Throws `ValidationError` with code `NO_FACILITIES`.
**Why this matters:** Empty application submission would create a CRM record with no payload, producing a corrupted workflow instance in BMP.
**Priority:** Critical
**Type:** Unit

---

### TC-008: mergeApplications_SourceApplicationBelongsToDifferentCustomer_ThrowsValidationError
**References:** FR-010, AC-009
**Layer:** MergeService
**Arrange:** Master application with `customerCif = 'CIF-001'`; one source application with `customerCif = 'CIF-002'`. CrmRepository returns these records via mock responses.
**Act:** `mergeService.mergeApplications({ masterApplicationId, sourceApplicationIds, ... })`.
**Assert:** Throws `ValidationError` with code `CROSS_CUSTOMER_MERGE`; no CRM write operations occur.
**Why this matters:** Cross-customer merge would expose one customer's financial data in another's application — a data privacy and regulatory violation.
**Priority:** Critical
**Type:** Unit

---

### TC-009: mergeApplications_SourceApplicationInCreditReviewStatus_ThrowsValidationError
**References:** FR-010, AC-009
**Layer:** MergeService
**Arrange:** Source application with `maq_status = 'credit_review'` (not in ELIGIBLE_MERGE_STATUSES).
**Act:** `mergeService.mergeApplications(...)`.
**Assert:** Throws `ValidationError` with code `INELIGIBLE_STATUS_FOR_MERGE`; error includes the application reference number.
**Why this matters:** Merging an application already in credit review would corrupt an active BMP workflow instance. The eligible status list is the primary guard.
**Priority:** Critical
**Type:** Unit

---

### TC-010: mergeApplications_DuplicateFacilityRequestKeyAcrossApplications_ThrowsValidationError
**References:** FR-010, AC-009
**Layer:** MergeService
**Arrange:** Master application already has facility key `FAC-001:Renewal`; source application also has `FAC-001:Renewal` in its request types.
**Act:** `mergeService.mergeApplications(...)`.
**Assert:** Throws `ValidationError` with code `DUPLICATE_FACILITY_REQUEST_IN_MERGE`; duplicate key named in error details.
**Why this matters:** Duplicate facility-request pairs in a merged application would produce ambiguous credit submissions and violate the uniqueness rule on `maq_applicationrequesttype`.
**Priority:** Critical
**Type:** Unit

---

### TC-011: mergeApplications_MasterApplicationNotFound_ThrowsDomainError
**References:** FR-010
**Layer:** MergeService
**Arrange:** CrmRepository.getApplication returns `null` for the master ID.
**Act:** `mergeService.mergeApplications(...)`.
**Assert:** Throws `DomainError` with code `MASTER_APP_NOT_FOUND`.
**Why this matters:** Null-safety guard; prevents a downstream `Cannot read property of null` crash deep in the merge algorithm.
**Priority:** High
**Type:** Unit

---

### TC-012: splitApplication_AllFacilitiesSelectedLeavingZeroInParent_ThrowsValidationError
**References:** FR-011, AC-009
**Layer:** SplitService
**Arrange:** Parent application has 2 facilities. `selectedFacilityIds` contains both facility IDs. CrmRepository.countFacilities returns 2.
**Act:** `splitService.splitApplication({ parentApplicationId, selectedFacilityIds: [id1, id2], ... })`.
**Assert:** Throws `ValidationError` with code `INSUFFICIENT_REMAINING_FACILITIES`.
**Why this matters:** Architecture spec requires at least one facility to remain in the parent after split. Zero-facility parent would be a zombie application in BMP.
**Priority:** Critical
**Type:** Unit

---

### TC-013: splitApplication_ApplicationInApprovedStatus_ThrowsValidationError
**References:** FR-011, NON_SPLITTABLE_STATUSES constant in SplitService
**Layer:** SplitService
**Arrange:** Parent application with `maq_status = 'approved'`.
**Act:** `splitService.splitApplication(...)`.
**Assert:** Throws `ValidationError` with code `INELIGIBLE_STATUS_FOR_SPLIT`.
**Why this matters:** Splitting an approved application would retroactively change the scope of a credit decision — an audit and regulatory violation.
**Priority:** Critical
**Type:** Unit

---

### TC-014: splitApplication_UserLacksMergeSplitPrivilege_ThrowsValidationError
**References:** FR-015, AC-010
**Layer:** SplitService
**Arrange:** CrmRepository.userHasPrivilege returns `false` for `maq_CanMergeSplit`.
**Act:** `splitService.splitApplication(...)`.
**Assert:** Throws `ValidationError` with code `INSUFFICIENT_PRIVILEGE`; no child application created.
**Why this matters:** Privilege check is the security enforcement point. If bypassed, any CRM user could split applications regardless of their role.
**Priority:** Critical
**Type:** Unit

---

### TC-015: splitApplication_SecondSplit_ChildReferenceNumberIncludesB2Suffix
**References:** FR-011 (child reference format: original-ref + "-B" + sequence)
**Layer:** SplitService
**Arrange:** Parent application reference = `APP-20260506-0042`. CrmRepository.countExistingSplits returns `1` (one prior split).
**Act:** `splitService.splitApplication(...)`.
**Assert:** Child application is created in CrmRepository with `maq_referencenumber = 'APP-20260506-0042-B2'`.
**Why this matters:** Reference number traceability is mandatory for regulators and audit. B1 vs B2 must be correct; incorrect suffix would create ambiguity in the audit trail.
**Priority:** High
**Type:** Unit

---

### TC-016: createDraftApplication_ValidPayload_PersistsToPostgresWithDraftStatus
**References:** FR-003, ADR-006
**Layer:** ApplicationService / DraftRepository
**Arrange:** Valid CreateDraftSchema payload; Prisma mock client.
**Act:** `applicationService.createDraft({ customerId, customerCif, customerRemarks })`.
**Assert:** Prisma `create` called with `status: DraftStatus.DRAFT`; returned draft ID is a UUID string.
**Why this matters:** ADR-006 mandates PostgreSQL as the draft store. Verifies the boundary between draft (PostgreSQL) and submitted (CRM) is respected.
**Priority:** High
**Type:** Unit

---

### TC-017: submitApplication_DraftBelongsToAnotherCustomer_ThrowsDomainError
**References:** FR-007, FR-015
**Layer:** ApplicationService
**Arrange:** Draft record exists in Prisma with `customerCif = 'CIF-001'`; requesting user JWT has `customerCif = 'CIF-002'`.
**Act:** `applicationService.getDraftForCustomer(draftId, 'CIF-002')`.
**Assert:** Throws `DomainError`; CRM write never called.
**Why this matters:** Customers must only access their own drafts. This is the server-side IDOR guard beyond JWT authentication.
**Priority:** Critical
**Type:** Unit

---

### TC-018: documentUpload_FileSizeExceeds25MB_ThrowsValidationError
**References:** FR-005, NFR-004
**Layer:** DocumentService
**Arrange:** Multipart file payload with `size = 26_214_400` bytes (26 MB).
**Act:** `documentService.validateAndUpload(fileMetadata)`.
**Assert:** Throws `ValidationError` with message referencing the 25 MB limit; Azure Blob upload not called.
**Why this matters:** Oversized files can exhaust blob storage throughput and degrade upload performance for concurrent users. The 25 MB limit is an explicit NFR.
**Priority:** High
**Type:** Unit

---

### TC-019: documentUpload_UnsupportedMimeType_ThrowsValidationError
**References:** FR-005
**Layer:** DocumentService
**Arrange:** Uploaded file with `mimeType = 'application/zip'` and `documentName = 'files.zip'`.
**Act:** `documentService.validateAndUpload(fileMetadata)`.
**Assert:** Throws `ValidationError` naming the rejected MIME type; Blob upload not called.
**Why this matters:** Unsupported file types could introduce malware vectors or break CRM document rendering.
**Priority:** High
**Type:** Unit

---

### TC-020: auditService_logEvent_WritesAppendOnlyRecordToCrm
**References:** FR-013, AC-006, Article VI (constitution)
**Layer:** AuditService
**Arrange:** Valid `AuditEventPayload` with `actionType = 'MergeCompleted'`, actor, timestamps, old/new values.
**Act:** `auditService.logEvent(payload)`.
**Assert:** CrmRepository receives a POST (create) call to `maq_auditlog` entity; no PATCH or DELETE call issued. Returned record contains all required fields: `maq_entityname`, `maq_recordid`, `maq_actoruserid`, `maq_timestamp`, `maq_correlationid`.
**Why this matters:** Audit trail integrity is a regulatory requirement (NFR-009: 7-year retention). Append-only enforcement must be tested at the service boundary.
**Priority:** Critical
**Type:** Unit

---

### TC-021: zodSchema_MergeApplicationsSchema_RejectsMoreThanNineSourceIds
**References:** MergeApplicationsSchema (max: 9), FR-010 (max 10 applications = 1 master + 9 source)
**Layer:** Zod schema validation
**Arrange:** Payload with `sourceApplicationIds` containing 10 UUIDs.
**Act:** `MergeApplicationsSchema.safeParse(payload)`.
**Assert:** `result.success === false`; error path is `sourceApplicationIds`.
**Why this matters:** The FR caps merges at 10 applications total. The Zod schema enforces this at the API boundary before any service logic runs.
**Priority:** High
**Type:** Unit

---

### TC-022: zodSchema_SplitApplicationSchema_RejectsSplitReasonUnder10Characters
**References:** SplitApplicationSchema (`splitReason: z.string().min(10)`)
**Layer:** Zod schema validation
**Arrange:** Payload with `splitReason = 'short'` (5 chars).
**Act:** `SplitApplicationSchema.safeParse(payload)`.
**Assert:** `result.success === false`; error on `splitReason` field.
**Why this matters:** A meaningful split reason is required for audit accountability. Very short values (e.g., "ok", "done") provide no audit value.
**Priority:** Medium
**Type:** Unit

---

## 3. Unit Tests — Frontend React

**Framework:** Vitest + @testing-library/react
**Location:** `packages/portal/tests/unit/`
**Environment:** jsdom

---

### TC-023: ApplicationWizard_InitialRender_DisplaysStep1FacilitySelection
**References:** FR-003, FR-004
**Given:** ApplicationWizard rendered with `draftId` and no `initialData`.
**When:** Component mounts.
**Then:** Step 1 (Select Facilities) heading is visible. Step 2, 3, 4 components are not rendered. WizardProgress shows step 1 as active.
**Priority:** High
**Type:** Unit

---

### TC-024: ApplicationWizard_AdvanceToStep2_WithNoFacilitySelected_ValidationErrorVisible
**References:** FR-006, FR-003
**Given:** ApplicationWizard on step 1 with the facilities array empty.
**When:** User clicks Continue button.
**Then:** Yup validation fires; error message "At least one facility is required" appears. `currentStep` remains 1. Draft save API is not called.
**Priority:** Critical
**Type:** Unit

---

### TC-025: ApplicationWizard_AdvanceToStep2_WithValidFacility_CallsSaveDraftApi
**References:** FR-003
**Given:** ApplicationWizard on step 1; facilities array contains one valid facility object; MSW intercepts `PUT /api/v1/applications/:id` and returns 200.
**When:** User clicks Continue.
**Then:** MSW receives one PUT request with the current form data. `currentStep` advances to 2.
**Priority:** High
**Type:** Unit

---

### TC-026: StepRequestTypes_ConflictingTypesSelected_ShowsInlineConflictWarning
**References:** FR-006, ADR-007
**Given:** StepRequestTypes rendered for a single facility; user has selected both Renewal and Rescheduling checkboxes.
**When:** Component re-renders after selection.
**Then:** Conflict warning banner is visible with text naming both conflicting types. The "Continue" button remains disabled.
**Priority:** Critical
**Type:** Unit

---

### TC-027: StepRequestTypes_DuplicateRequestTypeAcrossTwoFacilitiesWithSameRef_ShowsDuplicateError
**References:** FR-006
**Given:** Two facility lines in the form, both with `existingRef = 'FAC-001'`, both with `Renewal` selected.
**When:** User attempts to advance to step 3.
**Then:** Validation error states duplicate request type detected for the facility reference.
**Priority:** Critical
**Type:** Unit

---

### TC-028: DocumentUploadZone_FileExceeds25MB_ShowsRejectionToast
**References:** FR-005, NFR-004
**Given:** DocumentUploadZone rendered; react-dropzone configured with `maxSize = 25 * 1024 * 1024`.
**When:** User drops a 26 MB file onto the upload zone.
**Then:** File is not added to `uploadedFiles`. An error toast or inline message is shown stating the file exceeds the 25 MB limit.
**Priority:** High
**Type:** Unit

---

### TC-029: DocumentUploadZone_ValidPdfFile_CallsUploadApiAndAddsToFileList
**References:** FR-005
**Given:** DocumentUploadZone with `applicationId`; MSW intercepts `POST /api/v1/applications/:id/documents` returning `{ data: { documentId: 'doc-uuid' } }`.
**When:** User drops a valid 2 MB PDF.
**Then:** MSW receives POST with FormData containing the file. The file appears in the `uploadedFiles` list with status `'uploaded'`.
**Priority:** High
**Type:** Unit

---

### TC-030: StatusTimeline_AllEventsRendered_CompletedStagesShowGreenCheck
**References:** FR-008
**Given:** StatusTimeline receives events array: submitted (completed), rm_review (completed), credit_review (current), approval (pending).
**When:** Component renders.
**Then:** First two events display the green CheckCircle icon. Third event displays the blue Clock icon. Fourth event displays the gray Circle icon.
**Priority:** High
**Type:** Unit

---

### TC-031: StatusTimeline_MergedApplication_ShowsMergedStatusBadge
**References:** FR-008 (status badge: Merged)
**Given:** Application status data with `status = 'merged'` and `isMerged = true`.
**When:** StatusTimeline / StatusBadge renders.
**Then:** StatusBadge displays "Merged" label with the appropriate merged color styling.
**Priority:** Medium
**Type:** Unit

---

### TC-032: ApplicationWizard_SaveDraftButton_DoesNotAdvanceStep
**References:** FR-003 (draft save and resume)
**Given:** ApplicationWizard on step 2 with valid data.
**When:** User clicks "Save Draft" button.
**Then:** API PUT call is made. `currentStep` remains 2. No validation errors are surfaced.
**Priority:** Medium
**Type:** Unit

---

### TC-033: ApplicationWizard_StepReviewSubmit_DisplaysAllFacilitiesAndRequestTypes
**References:** FR-007
**Given:** ApplicationWizard on step 4 (Review & Submit); form state contains 2 facilities with distinct request types and documents.
**When:** StepReviewSubmit renders.
**Then:** Both facility names are visible. All request types per facility are listed. Total facilities count and total requested amount are shown.
**Priority:** High
**Type:** Unit

---

### TC-034: ApplicationWizard_SubmitButton_OnSuccessfulSubmit_RedirectsToConfirmationPage
**References:** FR-007, AC-001
**Given:** Step 4 rendered; MSW intercepts `POST /api/v1/applications/:id/submit` returning 200 with `referenceNumber = 'APP-20260509-0001'`.
**When:** User clicks Submit Application.
**Then:** Next.js router.push is called with the confirmation page path. The confirmation screen displays the reference number `APP-20260509-0001`.
**Priority:** Critical
**Type:** Unit

---

### TC-035: NotificationBell_UnreadCount_RendersCorrectBadgeNumber
**References:** FR-014
**Given:** NotificationBell receives `unreadCount = 3` as prop.
**When:** Component renders.
**Then:** Badge shows "3". When `unreadCount = 0`, badge is not visible.
**Priority:** Medium
**Type:** Unit

---

### TC-036: WizardProgress_Step3Active_CorrectlyHighlightsDocumentsStep
**References:** FR-003 (4-step wizard)
**Given:** WizardProgress with `steps` array (4 steps) and `currentStep = 3`.
**When:** Component renders.
**Then:** Step 3 (Documents) is visually highlighted as active. Steps 1 and 2 show as completed. Step 4 shows as pending.
**Priority:** Medium
**Type:** Unit

---

### TC-037: FacilityCard_ExpiredExpiryDate_ShowsExpiredWarningIndicator
**References:** FR-006 (expired customer documents blocked)
**Given:** FacilityCard with `expiryDate` set to a date 30 days in the past.
**When:** Component renders.
**Then:** A visual expired indicator (badge or warning icon) is displayed on the card.
**Priority:** High
**Type:** Unit

---

## 4. Integration Tests — API + Database

**Framework:** Supertest + Vitest
**Location:** `packages/api/tests/integration/`
**Setup:** Docker Compose with PostgreSQL and Fastify API container. Prisma migrations run before each test suite. CRM calls mocked via MSW at the network layer.

---

### TC-038: POST_applicationsDraft_ValidPayload_Returns201WithDraftId
**References:** FR-003, ADR-006
**Given:** Running Fastify server; valid B2C JWT with `customerCif = 'CIF-TEST-001'`; PostgreSQL with clean schema.
**When:** `POST /api/v1/applications/draft` with `{ customerRemarks: 'Test application' }`.
**Then:** HTTP 201; body contains `{ success: true, data: { draftId: <uuid>, status: 'DRAFT' } }`. Prisma record exists in `DraftApplication` table with `status = 'DRAFT'` and `customerCif = 'CIF-TEST-001'`.
**Priority:** Critical
**Type:** Integration

---

### TC-039: PUT_applications_id_UpdateDraftFacilities_PersistsToPostgres
**References:** FR-003, FR-004
**Given:** Existing draft with ID; valid payload containing two facility lines with distinct request types.
**When:** `PUT /api/v1/applications/:id` with UpdateApplicationSchema payload.
**Then:** HTTP 200; Prisma record updated — `facilities` relation has 2 rows; `facilitiesCount = 2`; `totalAmount` reflects the sum of `requestedAmount` values.
**Priority:** Critical
**Type:** Integration

---

### TC-040: POST_applications_id_submit_ValidDraft_WritesToCrmAndUpdatesDraftStatus
**References:** FR-007, ADR-003
**Given:** Draft in PostgreSQL with 1 facility and 1 request type (non-conflicting); MSW intercepts CRM POST `/maq_loanapplications` returning `{ maq_loanapplicationid: 'crm-guid-001' }`.
**When:** `POST /api/v1/applications/:id/submit`.
**Then:** HTTP 200; `data.dataverseId = 'crm-guid-001'`; Prisma draft record updated to `status = 'SUBMITTED'` and `dataversId = 'crm-guid-001'`.
**Priority:** Critical
**Type:** Integration

---

### TC-041: POST_applications_id_submit_ConflictingRequestTypes_Returns422
**References:** FR-006, AC-007
**Given:** Draft with facility containing both Renewal and Rescheduling request types.
**When:** `POST /api/v1/applications/:id/submit`.
**Then:** HTTP 422; body `{ success: false, code: 'CONFLICTING_REQUEST_TYPES' }`; Prisma draft remains in `DRAFT` status; no CRM write attempted.
**Priority:** Critical
**Type:** Integration

---

### TC-042: POST_applications_id_submit_NoFacilities_Returns422
**References:** FR-006, FR-003
**Given:** Draft with `facilitiesCount = 0`.
**When:** `POST /api/v1/applications/:id/submit`.
**Then:** HTTP 422; `{ success: false, code: 'NO_FACILITIES' }`.
**Priority:** Critical
**Type:** Integration

---

### TC-043: GET_applications_id_status_AuthenticatedCustomer_ReturnsCrmStatus
**References:** FR-008
**Given:** Submitted application with CRM record; MSW returns mock CRM status response at the correct OData URL with `maq_status = 'credit_review'` and full timeline events.
**When:** `GET /api/v1/applications/:id/status` with valid customer JWT.
**Then:** HTTP 200; `data.currentStage = 'Credit Review'`; `data.timeline` array contains at minimum submitted, rm_review, credit_review entries.
**Priority:** High
**Type:** Integration

---

### TC-044: GET_applications_id_status_DifferentCustomerJwt_Returns403
**References:** FR-015, AC-010
**Given:** Application belongs to `customerCif = 'CIF-001'`; request JWT has `customerCif = 'CIF-002'`.
**When:** `GET /api/v1/applications/:id/status`.
**Then:** HTTP 403; `{ success: false, code: 'ACCESS_DENIED' }`.
**Priority:** Critical
**Type:** Integration

---

### TC-045: POST_applications_merge_ValidPayload_RmJwt_Returns200
**References:** FR-010, AC-003
**Given:** MSW mocks CRM responses for master and source applications (both in 'submitted' status, same customer); reassign and merge history endpoints return success.
**When:** `POST /api/v1/applications/merge` with valid RM JWT and merge payload.
**Then:** HTTP 200; `data.mergedCount = 2`; audit log write was called (MSW records the POST to `maq_auditlog`).
**Priority:** Critical
**Type:** Integration

---

### TC-046: POST_applications_merge_CustomerJwt_Returns403
**References:** FR-015, AC-010
**Given:** Valid customer JWT (not RM role).
**When:** `POST /api/v1/applications/merge`.
**Then:** HTTP 403; merge service never called.
**Priority:** Critical
**Type:** Integration

---

### TC-047: POST_applications_id_split_ValidPayload_Returns200WithChildRefNumber
**References:** FR-011, AC-004
**Given:** MSW mocks parent application (in 'rm_review'), privilege check returns true, CRM create application returns new child GUID, split history create returns success.
**When:** `POST /api/v1/applications/:id/split` with valid RM JWT.
**Then:** HTTP 200; `data.childReferenceNumber` matches pattern `<parentRef>-B1`; `data.facilitiesMovedCount >= 1`.
**Priority:** Critical
**Type:** Integration

---

### TC-048: CrmWriteFailure_OnSubmit_PrismaTransactionRolledBack
**References:** FR-007, ADR-006
**Given:** Valid draft; MSW simulates CRM POST returning HTTP 500.
**When:** `POST /api/v1/applications/:id/submit`.
**Then:** HTTP 502 or 503 returned to caller; Prisma draft remains `status = 'DRAFT'` (not `SUBMITTED`); no partial state left in PostgreSQL.
**Priority:** Critical
**Type:** Integration

---

## 5. CRM / Plugin Tests

**Scope:** Dynamics CRM on-premise custom entities, BMP stage transitions, JS web resources, security role enforcement, merge/split wizard behavior

**Approach:** Combination of:
1. JavaScript unit tests run in a Node.js harness (for web resource logic that is pure function)
2. Playwright automation against the CRM UCI (Unified Client Interface) in the staging CRM environment for form behavior and ribbon rules
3. Manual test execution for BMP workflow stage transitions (BMP module is configured, not coded — automation against BMP internal state requires manual verification with BMP admin tooling)

---

### TC-049: isMergeEligible_StatusSubmitted_ReturnsTrue
**References:** FR-010, maq_ribbonrules.js
**Layer:** JS web resource unit test (Node.js harness)
**Given:** Mock `primaryControl.getAttribute('maq_status').getValue()` returns `'submitted'`.
**When:** `isMergeEligible(primaryControl)` called.
**Then:** Returns `true`.
**Priority:** High
**Type:** Unit (JS web resource)

---

### TC-050: isMergeEligible_StatusCreditReview_ReturnsFalse
**References:** FR-010, maq_ribbonrules.js
**Layer:** JS web resource unit test
**Given:** `maq_status` returns `'credit_review'`.
**When:** `isMergeEligible(primaryControl)`.
**Then:** Returns `false`. Merge ribbon button must not appear for applications in credit review.
**Priority:** Critical
**Type:** Unit (JS web resource)

---

### TC-051: isSplitEligible_StatusApproved_ReturnsFalse
**References:** FR-011, maq_ribbonrules.js
**Layer:** JS web resource unit test
**Given:** `maq_status` returns `'approved'`.
**When:** `isSplitEligible(primaryControl)`.
**Then:** Returns `false`.
**Priority:** Critical
**Type:** Unit (JS web resource)

---

### TC-052: isSplitEligible_StatusRmReview_ReturnsTrue
**References:** FR-011, maq_ribbonrules.js
**Layer:** JS web resource unit test
**Given:** `maq_status` returns `'rm_review'`.
**When:** `isSplitEligible(primaryControl)`.
**Then:** Returns `true`.
**Priority:** High
**Type:** Unit (JS web resource)

---

### TC-053: onFormLoad_NewFacilityType_HidesRequestTypeMultiselect
**References:** maq_application.js, Architecture section C.3
**Layer:** JS web resource unit test
**Given:** Mock `formContext.getAttribute('maq_facilitytype').getValue()` returns `100000001` (New Facility option set value).
**When:** `setRequestTypeFieldVisibility(formContext)` called.
**Then:** `formContext.getControl('maq_requesttypes').setVisible(false)` called.
**Why this matters:** New Facility request type does not apply amendment types. Showing the multiselect for new facilities would confuse RMs and could allow invalid data entry.
**Priority:** High
**Type:** Unit (JS web resource)

---

### TC-054: lockAuditFields_AuditLogSubgridAlwaysDisabled
**References:** FR-013, maq_application.js, Article VI (append-only audit)
**Layer:** JS web resource unit test
**Given:** Mock `formContext.getControl('subgrid_auditlog')` returns a mock control object.
**When:** `lockAuditFields(formContext)` called.
**Then:** `auditGrid.setDisabled(true)` called. This is a defence-in-depth measure on top of server-side append-only enforcement.
**Priority:** High
**Type:** Unit (JS web resource)

---

### TC-055: BmpStageTransition_SubmittedToRmReview_RmTaskCreated
**References:** FR-012, AC-005, BMP configuration spec in phase-3-tech.md C.2
**Layer:** Manual BMP integration test in staging CRM
**Given:** Application record in CRM with `maq_status = 'submitted'`; BMP module configured per spec.
**When:** RM opens the record and claims it (status transitions to 'rm_review').
**Then:** BMP creates an RM activity task in CRM with the subject "Initial Review — [maq_referencenumber]". Portal notification record `maq_portalnotification` is created for the customer with type `StatusChange`.
**Priority:** Critical
**Type:** Integration (CRM / BMP)

---

### TC-056: BmpStageTransition_CreditReviewToApproval_DOARouteDirectors
**References:** FR-012, AC-005
**Layer:** Manual BMP integration test
**Given:** Application with `maq_totalamount` above the Directors+VP+CEO DOA threshold (as configured in BMP DOA table); application in Credit Review stage; Credit Analyst approves.
**When:** Credit Analyst marks credit recommendation.
**Then:** BMP routes to Credit Manager stage. Upon Credit Manager approval, BMP evaluates DOA rules and routes to Directors + VP + CEO path (not ICC). Approval tasks created for each required approver.
**Priority:** Critical
**Type:** Integration (CRM / BMP)

---

### TC-057: BmpStageTransition_SubmitToCredit_RmCannotBeTheApprover
**References:** FR-015 (segregation of duties), AC-010
**Layer:** Manual BMP integration test
**Given:** RM user submits application to credit. The same RM user is not a member of the Credit Analyst, Credit Manager, or Approver security roles.
**When:** BMP creates the Credit Analyst task.
**Then:** The task is assigned to the Credit team (not the RM). The RM security role does not have `Read/Create` on `maq_approvaldecision` at this stage.
**Priority:** Critical
**Type:** Integration (CRM / BMP)

---

### TC-058: MergeWizard_OpenedViaRibbonButton_LoadsCorrectApplicationData
**References:** FR-010, Architecture C.2 (maq_mergewizard.html)
**Layer:** Playwright — CRM UCI
**Given:** RM user logged into CRM staging; loan application form open in 'submitted' status.
**When:** RM clicks "Merge Applications" ribbon button.
**Then:** Merge wizard dialog opens (900x650 px); the current application's reference number appears in the master application header; the wizard displays a list of eligible applications for the same customer.
**Priority:** High
**Type:** E2E (CRM)

---

### TC-059: SplitWizard_SelectingAllFacilities_SubmitButtonDisabled
**References:** FR-011, AC-009
**Layer:** Playwright — CRM UCI
**Given:** Split wizard open for an application with 3 facilities.
**When:** User checks all 3 facility checkboxes.
**Then:** A validation warning appears: "At least one facility must remain in the original application." The Split button is disabled.
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-060: SecurityRole_CreditAnalyst_CannotSeeMergeSplitRibbonButton
**References:** FR-015, AC-010
**Layer:** Playwright — CRM UCI
**Given:** CRM user logged in with `maq_CreditAnalyst` security role only.
**When:** User opens a loan application form.
**Then:** The "Merge Applications" and "Split/Branch Application" ribbon buttons are not visible (hidden by the ribbon enable rule that checks for `maq_CanMergeSplit` privilege).
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-061: AuditLog_MergeOperation_AppendOnlyRecordCreated
**References:** FR-013, AC-006, Article VI (constitution)
**Layer:** CRM integration + Playwright verification
**Given:** Merge operation executed on two applications.
**When:** RM opens the master application's Audit Log subgrid.
**Then:** A new audit record exists with `maq_actiontype = 'MergeCompleted'`; actor name, timestamp, and correlation ID are populated. No existing audit records have been modified (verified by checking `modifiedon` timestamps on older records).
**Priority:** Critical
**Type:** Integration (CRM)

---

## 6. E2E Tests — Playwright

**Framework:** Playwright
**Browsers:** Chromium (required); Firefox (secondary)
**Location:** `tests/e2e/`
**Test accounts:** See Section 9 (Test Data Strategy)
**Base URL (portal):** `https://staging.portal.bank.internal`
**Base URL (CRM):** `https://staging-crm.bank.internal/OrgName/main.aspx`

---

### TC-062: Portal_CustomerLogin_ValidB2CCredentials_ShowsDashboard
**References:** FR-001, FR-002, AC-001
**Given:** Azure AD B2C test customer account provisioned; portal accessible.
**When:** Navigate to portal login; enter valid credentials; complete MFA.
**Then:** Dashboard page loads within 2 seconds (NFR-001); customer's facilities list is visible; "New Application" button is visible; unread notification count badge is shown.
**Priority:** Critical
**Type:** E2E

---

### TC-063: Portal_CustomerLogin_InvalidCredentials_ShowsB2CErrorMessage
**References:** FR-001
**Given:** Portal login page.
**When:** User enters incorrect password 3 times.
**Then:** B2C displays lockout/error message. Portal does not expose internal error details. Fastify API receives no authenticated requests during this flow.
**Priority:** High
**Type:** E2E (Security)

---

### TC-064: Portal_FullApplicationWizard_TwoFacilitiesOneNewOneExisting_SubmitSucceeds
**References:** FR-003, FR-004, FR-005, FR-007, AC-001
**Given:** Logged-in customer; one existing facility (loaded from CRM mock); one new facility form entry.
**When:** Step 1: select existing facility + enter new facility details. Step 2: select Renewal for existing, NewFacility for new. Step 3: upload required PDF for each. Step 4: review summary and click Submit.
**Then:** Confirmation screen displays reference number in format `APP-YYYYMMDD-NNNN`. API POST to `/submit` returned 200. CRM record created with `maq_status = 'submitted'` (verifiable via staging CRM).
**Priority:** Critical
**Type:** E2E

---

### TC-065: Portal_ApplicationWizard_ConflictingRequestTypes_BlocksProgressToStep3
**References:** FR-006, AC-007
**Given:** Step 2 with one facility; user selects Renewal AND Rescheduling on the same facility.
**When:** User clicks Continue.
**Then:** Inline conflict error displayed. Navigation to step 3 blocked. API is not called.
**Priority:** Critical
**Type:** E2E

---

### TC-066: Portal_DocumentUpload_ValidPdf_UploadSucceedsAndFileAppearsInList
**References:** FR-005
**Given:** Step 3 (Document Upload); MSW on staging API not mocked — real upload to staging blob.
**When:** User drags and drops a valid 3 MB PDF onto the upload zone.
**Then:** File appears in the uploaded files list with status "uploaded". Progress indicator shown during upload. No error displayed.
**Priority:** High
**Type:** E2E

---

### TC-067: Portal_DocumentUpload_26MBFile_ShowsRejectionWithSizeError
**References:** FR-005, NFR-004
**Given:** Step 3 document upload zone.
**When:** User drops a file exceeding 25 MB.
**Then:** File is not uploaded. Error message states the file exceeds the maximum allowed size. Upload zone returns to ready state.
**Priority:** High
**Type:** E2E

---

### TC-068: Portal_ApplicationTracking_SubmittedApplication_ShowsCurrentStage
**References:** FR-008
**Given:** Customer with a previously submitted application in 'RM Review' stage (staging CRM record updated directly).
**When:** Customer navigates to the application detail page.
**Then:** Status badge shows "RM Review". StatusTimeline shows: Submitted (completed, with date), RM Review (current, with date), Credit Review (pending). Timeline renders within 2 seconds of page load.
**Priority:** Critical
**Type:** E2E

---

### TC-069: Portal_Notifications_NewNotification_BadgeCountIncrements
**References:** FR-014
**Given:** Logged-in customer with 0 unread notifications.
**When:** A new notification record is created in CRM for this customer (simulated via API call to staging); customer refreshes the portal page.
**Then:** The notification bell badge shows "1". Notification list page shows the new notification with unread indicator.
**Priority:** High
**Type:** E2E

---

### TC-070: Portal_SessionTimeout_After30Minutes_RedirectsToLogin
**References:** FR-001 (session timeout: 30 minutes)
**Given:** Logged-in customer session.
**When:** Session is idle for 30 minutes (simulated by manipulating the token expiry in the test environment).
**Then:** Next API call returns 401; portal redirects to the B2C login page without showing internal errors.
**Priority:** High
**Type:** E2E

---

### TC-071: Portal_DraftResume_PartiallyCompletedApplication_RestoresFormState
**References:** FR-003 (draft save and resume)
**Given:** Customer previously completed step 1 and step 2, saved draft, then closed the browser.
**When:** Customer returns to the portal and opens the draft application.
**Then:** ApplicationWizard initializes with `initialData` populated; selected facilities and request types are restored in form state; customer lands on the furthest completed step or step 1.
**Priority:** High
**Type:** E2E

---

### TC-072: CRM_RM_MergeWizard_TwoEligibleApplications_MergeCompletesSuccessfully
**References:** FR-010, AC-003
**Given:** RM logged into staging CRM; two applications from the same customer, both in 'submitted' status, no overlapping facility-request combinations.
**When:** RM opens master application form; clicks Merge Applications ribbon button; selects the second application in the wizard; confirms merge.
**Then:** Wizard shows success confirmation. Master application's facility count increases. Source application status changes to "Merged". Merge History subgrid shows the new record. Audit Log subgrid shows `MergeCompleted` entry.
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-073: CRM_RM_MergeWizard_CrossCustomerApplication_MergeBlockedWithError
**References:** FR-010, AC-009
**Given:** RM opens application for Customer A; attempts to merge with an application belonging to Customer B.
**When:** RM selects the cross-customer application in the merge wizard and clicks Confirm.
**Then:** Error message displayed in wizard: cannot merge applications from different customers. No records modified. Audit log records the failed attempt.
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-074: CRM_RM_SplitWizard_ValidSplit_CreatesChildApplicationWithBSuffix
**References:** FR-011, AC-004
**Given:** Application with 3 facilities in 'rm_review' status; RM has `maq_CanMergeSplit` privilege.
**When:** RM opens Split wizard; selects 1 facility; enters split reason (minimum 10 characters); clicks Split.
**Then:** Success confirmation displayed. New child application appears in CRM with reference `<parent>-B1`. Parent application still has 2 facilities. SplitHistory record created. Both parent and child application audit logs updated.
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-075: CRM_CreditAnalyst_RejectApplication_StatusChangesToRejected
**References:** FR-012, workflow stage diagram in phase-2-arch.md
**Given:** Application in 'credit_review' stage; Credit Analyst user logged into CRM.
**When:** Credit Analyst creates an approval decision with `maq_decision = 'Rejected'` and rejection reason.
**Then:** Application status changes to 'rejected'. BMP fires portal notification to customer with rejection reason (anonymized per FR-008). Audit log records the `ApprovalDecision` event with actor and timestamp.
**Priority:** Critical
**Type:** E2E (CRM)

---

### TC-076: CRM_PortalServiceAccount_CannotDeleteAuditLog
**References:** FR-013, AC-006, security role table in phase-2-arch.md (portal service account: Create on audit log, no Delete)
**Given:** Portal integration service account credentials.
**When:** Attempt HTTP DELETE on `maq_auditlog` entity via OData API.
**Then:** HTTP 403 returned by CRM. Audit log record is not deleted.
**Priority:** Critical
**Type:** Security + Integration (CRM)

---

## 7. Performance Tests

**Tool:** k6
**Target environment:** Staging (production-like infrastructure, not shared with active E2E tests)
**Baseline data:** 10,000 DraftApplication records in PostgreSQL; 50,000 loan application records in CRM

---

### TC-077: PortalDashboard_500ConcurrentUsers_P95Under2Seconds
**References:** NFR-001 (page load < 2s P95), NFR-005 (500 concurrent users)
**Scenario:** 500 virtual users simultaneously load the authenticated dashboard page (`GET /api/v1/facilities` + `GET /api/v1/applications`).
**k6 Config:** 500 VUs ramping over 60 seconds, hold for 5 minutes.

| Metric | Target |
|--------|--------|
| p95 response time (facilities endpoint) | < 500 ms (NFR-002) |
| p95 response time (applications list) | < 500 ms (NFR-002) |
| Dashboard page render time (Playwright + k6 browser) | < 2000 ms (NFR-001) |
| Error rate | < 0.1% |
| Throughput | >= 500 req/s sustained |

**Priority:** Critical
**Type:** Performance

---

### TC-078: ApplicationSubmit_100ConcurrentSubmissions_P95Under500ms
**References:** NFR-002 (API response time < 500ms P95)
**Scenario:** 100 customers simultaneously submit applications (POST `/api/v1/applications/:id/submit`). Each has a pre-seeded draft with 2 facilities and non-conflicting request types. CRM write is mocked with 50ms artificial latency to simulate on-prem network round-trip.
**k6 Config:** 100 VUs, no ramp, 3-minute duration.

| Metric | Target |
|--------|--------|
| p95 response time | < 500 ms |
| p99 response time | < 1500 ms |
| Error rate | < 0.5% |
| CRM write failures under load | 0 (or retried and recovered) |

**Priority:** Critical
**Type:** Performance

---

### TC-079: DocumentUpload_50ConcurrentUploads_25MBEach_NoTimeout
**References:** NFR-004 (25 MB per file), NFR-005
**Scenario:** 50 virtual users upload 25 MB PDF files simultaneously to `POST /api/v1/applications/:id/documents`.
**k6 Config:** 50 VUs, 3-minute duration.

| Metric | Target |
|--------|--------|
| p95 upload completion time | < 15 seconds |
| Error rate (upload failures) | < 1% |
| Azure Blob Storage error rate | 0% |
| API process memory growth | < 100 MB above baseline |

**Priority:** High
**Type:** Performance

---

### TC-080: ApplicationStatusPolling_200ConcurrentReads_P95Under500ms
**References:** NFR-002, FR-008 (real-time status tracking)
**Scenario:** 200 customers polling `GET /api/v1/applications/:id/status` every 10 seconds over 5 minutes. CRM OData read is real against staging CRM (tests actual on-prem latency).

| Metric | Target |
|--------|--------|
| p95 response time | < 500 ms |
| p99 response time | < 1000 ms |
| CRM on-prem OData read p95 (measured at API layer) | < 300 ms |
| Error rate | < 0.1% |

**Priority:** High
**Type:** Performance

---

### TC-081: MergeOperation_10ConcurrentMerges_NoDeadlock
**References:** FR-010, NFR-002
**Scenario:** 10 RM users trigger merge operations simultaneously, each merging 2 distinct applications. Applications are pre-seeded with no overlapping data. Verifies that concurrent CRM PATCH calls do not produce OData concurrency conflicts or deadlocks.
**k6 Config:** 10 VUs, single iteration each.

| Metric | Target |
|--------|--------|
| All 10 merge operations succeed | 100% success rate |
| p95 merge operation time (end-to-end API) | < 3000 ms |
| No HTTP 412 (CRM ETag concurrency conflict) responses | 0 |
| Audit log records created | 10 (one per merge) |

**Priority:** High
**Type:** Performance

---

## 8. Security Tests

**Tools:** OWASP ZAP (automated DAST), k6 (rate limiting), manual penetration testing
**Environment:** Dedicated security test environment (staging, isolated from active QA runs)
**Reference standard:** OWASP Top 10 2021

---

### TC-082: Auth_UnauthenticatedRequest_AllProtectedRoutes_Returns401
**References:** FR-015, Article VII (constitution)
**Given:** No Authorization header present.
**When:** HTTP GET/POST to each of the 15 API routes defined in the route table (phase-2-arch.md section 6.2), excluding `/health`.
**Then:** Every protected route returns HTTP 401 with `{ success: false, code: 'UNAUTHORIZED' }`. No route leaks internal data or stack traces. `/health` returns 200 (health is explicitly unauthenticated).
**Confidence:** 98%
**Priority:** Critical
**Type:** Security

---

### TC-083: Auth_ExpiredJwtToken_Returns401
**References:** FR-001, Article VII
**Given:** A valid B2C JWT token that has expired (manipulate `exp` claim or wait for expiry in test).
**When:** `GET /api/v1/applications`.
**Then:** HTTP 401 returned. Token expiry is not renewed silently. Error response does not reveal the JWT parsing library or its version.
**Confidence:** 98%
**Priority:** Critical
**Type:** Security

---

### TC-084: IDOR_CustomerAccessesAnotherCustomersApplication_Returns403
**References:** FR-015, AC-010
**Given:** Customer A authenticated; knows Application ID belonging to Customer B (different CIF).
**When:** `GET /api/v1/applications/<customer-B-app-id>/status`.
**Then:** HTTP 403. Response body contains no data from Customer B's record. Server-side CIF filter is the guard (not purely client-side).
**Confidence:** 97%
**Priority:** Critical
**Type:** Security

---

### TC-085: IDOR_CustomerSubmitsAnotherCustomersDraft_Returns403
**References:** FR-015, FR-007
**Given:** Customer A authenticated; knows draft ID belonging to Customer B.
**When:** `POST /api/v1/applications/<customer-B-draft-id>/submit`.
**Then:** HTTP 403. Draft status not changed. No CRM write occurs.
**Confidence:** 97%
**Priority:** Critical
**Type:** Security

---

### TC-086: SqlInjection_PrismaParameterizedQueries_NoDataLeakage
**References:** Article VII (no string concatenation in SQL)
**Given:** Authenticated customer JWT.
**When:** `GET /api/v1/applications` with query parameter `customerId = "' OR '1'='1"`. Similar payloads on all query-accepting endpoints.
**Then:** Prisma's parameterized query engine safely handles the input; response returns only data belonging to the authenticated customer; no SQL error or unexpected result set returned; no 500 error exposing query details.
**Confidence:** 95%
**Priority:** Critical
**Type:** Security

---

### TC-087: ODataInjection_CrmFacilityFilter_NoUnauthorizedDataReturned
**References:** Article VII, FR-015
**Given:** Authenticated customer JWT with CIF = 'CIF-001'.
**When:** `GET /api/v1/facilities` with crafted filter parameter attempting OData injection, e.g. `?filter=true or 1 eq 1`.
**Then:** Backend API sanitizes or ignores the client-supplied filter; server-side CIF filter is always applied to the CRM OData query; only facilities belonging to CIF-001 are returned.
**Confidence:** 90%
**Priority:** High
**Type:** Security

---

### TC-088: RateLimiting_ExceedsThreshold_Returns429
**References:** Architecture section 10.4 (rate limiting: 100 req/min per customer token)
**Given:** Valid customer JWT.
**When:** 105 requests are sent within 60 seconds using k6 with 1 VU.
**Then:** Requests 101–105 receive HTTP 429 with `Retry-After` header. No request beyond the threshold is processed by the service layer.
**Confidence:** 95%
**Priority:** High
**Type:** Security

---

### TC-089: DocumentDownload_SasUrlExpiry_15MinutesAfterIssuance_Returns403
**References:** Architecture section 10.4 (SAS URLs expire after 15 minutes)
**Given:** Document SAS URL obtained from a valid API response.
**When:** The URL is accessed 16 minutes after issuance.
**Then:** Azure Blob Storage returns HTTP 403 (SAS token expired). The expired URL cannot be reused to download the document.
**Confidence:** 96%
**Priority:** High
**Type:** Security

---

### TC-090: XSS_ApplicationRemarksField_StoredXssBlocked
**References:** FR-003, OWASP A03
**Given:** Authenticated customer.
**When:** Draft is created with `customerRemarks = '<script>alert("xss")</script>'`; the value is stored and subsequently returned via `GET /api/v1/applications/:id/status`.
**Then:** The returned JSON contains the literal string (not executed); Content-Type header is `application/json` (not `text/html`); Next.js portal renders the value as escaped text, not executing the script tag.
**Confidence:** 92%
**Priority:** High
**Type:** Security

---

### TC-091: CsrfProtection_StateChangingRequests_RequireCorrectOrigin
**References:** OWASP A01, NFR-007
**Given:** Attacker hosts a malicious page that attempts to trigger `POST /api/v1/applications/:id/submit` against the portal using the victim's existing browser session.
**When:** Cross-origin POST is sent from attacker origin.
**Then:** CORS policy rejects the request (origin not in allowlist); or the same-site cookie attribute prevents the session cookie from being sent cross-origin. HTTP 403 or CORS error returned.
**Confidence:** 93%
**Priority:** High
**Type:** Security

---

## 9. Test Data Strategy

### 9.1 Azure AD B2C Test Accounts

Three test customer accounts are provisioned in the B2C staging tenant:

| Account | CIF | Purpose |
|---------|-----|---------|
| `testcustomer1@staging.bank.test` | CIF-TEST-001 | Happy path flows; has 3 existing facilities in staging CRM |
| `testcustomer2@staging.bank.test` | CIF-TEST-002 | Cross-customer IDOR tests; separate from CIF-001 |
| `testcustomer3@staging.bank.test` | CIF-TEST-003 | Expired facility tests; facility with past expiry date |

MFA is disabled for staging B2C tenant to enable Playwright automation (MFA is enabled in production).

### 9.2 CRM Staging Test Records

The following seed data is loaded into the staging Dynamics CRM on-premise environment before test runs:

| Entity | Volume | Description |
|--------|--------|-------------|
| Account (Customer) | 5 records | CIF-TEST-001 through CIF-TEST-005; each with associated RM |
| maq_loanapplication | 30 records | Covering all status values; CIF-TEST-001 has applications in submitted, rm_review, credit_review, completed, rejected, merged |
| maq_applicationfacility | 60 records | 2 facilities per application average |
| maq_applicationrequesttype | 120 records | Mix of all 7 request types; no conflicts within individual records |
| maq_applicationdocument | 90 records | 3 documents per application |
| maq_auditlog | 200 records (pre-existing) | To verify append-only tests do not modify existing records |

Seed data is loaded via a TypeScript seed script using the CRM OData API with the Portal Integration service account. The seed script is idempotent (checks for existence before creating).

**Seed script location:** `tests/fixtures/crm-seed.ts`

### 9.3 CRM Test User Accounts (On-Premise AD)

| User | CRM Security Role | Purpose |
|------|------------------|---------|
| `rm.test1@bank.internal` | maq_RelationshipManager | RM happy path, merge, split |
| `credit.test1@bank.internal` | maq_CreditAnalyst | Credit review, rejection tests |
| `creditmanager.test1@bank.internal` | maq_CreditManager | Credit manager approval tests |
| `admin.test1@bank.internal` | maq_LoanAdmin | Admin access tests |
| `portal.svc@bank.internal` | maq_PortalServiceAccount | Integration service account tests |

### 9.4 PostgreSQL Seed Data

Test-specific PostgreSQL seed data is managed via Prisma seeding:

```
tests/fixtures/postgres-seed.ts
```

This creates:
- 20 DraftApplication records in DRAFT status for CIF-TEST-001 through CIF-TEST-003
- 5 DraftApplication records in SUBMITTED status (for status checks)
- 2 DraftApplication records in FAILED status (for error recovery tests)
- Associated DraftFacility and DraftDocument records

The seed is run as part of the CI integration test stage setup via `npx prisma db seed`.

### 9.5 Document Test Fixtures

Test documents for upload tests:

| File | Size | MIME Type | Purpose |
|------|------|-----------|---------|
| `test-valid-small.pdf` | 1 MB | application/pdf | Happy path upload |
| `test-valid-large.pdf` | 24.9 MB | application/pdf | Near-limit upload |
| `test-oversized.pdf` | 26 MB | application/pdf | Size rejection test |
| `test-invalid.zip` | 1 MB | application/zip | MIME type rejection |
| `test-valid.docx` | 2 MB | application/vnd.openxmlformats... | DOCX format test |
| `test-valid.xlsx` | 2 MB | application/vnd.openxmlformats... | XLSX format test |
| `test-valid.jpg` | 3 MB | image/jpeg | JPEG format test |
| `test-valid.png` | 2 MB | image/png | PNG format test |

**Fixture location:** `tests/fixtures/documents/`

### 9.6 BMP Workflow Test Prerequisites

Before running BMP integration tests (TC-055 through TC-057), the BMP module must be configured in staging with:
- LoanApplicationWorkflow active and bound to maq_loanapplication entity
- DOA table loaded with staging-specific thresholds (low values to enable Director path without real amounts)
- Notification email relay pointed to a test inbox (not production email)
- SLA timers set to minutes (not days) for test speed

The BMP configuration is owned by the bank's internal BMP team. A configuration checklist must be signed off by the BMP team before the CRM/BMP integration test stage runs.

---

## 10. Coverage Targets and Definition of Done

### 10.1 Minimum Coverage Thresholds

| Component | Minimum Line Coverage | Minimum Branch Coverage | Enforcement |
|-----------|----------------------|------------------------|-------------|
| ValidationService | 98% | 98% | CI fails build below threshold |
| MergeService | 95% | 95% | CI fails build below threshold |
| SplitService | 95% | 95% | CI fails build below threshold |
| AuditService | 95% | 90% | CI fails build below threshold |
| ApplicationService | 90% | 85% | CI fails build below threshold |
| DocumentService | 90% | 85% | CI fails build below threshold |
| CrmRepository | 85% | 80% | CI fails build below threshold |
| Frontend components | 80% | 80% | CI fails build below threshold |
| CRM JS web resources | 85% | 80% | Enforced via Istanbul in Node harness |

### 10.2 Test Pass Rate Requirements

All test categories must reach the following pass rates before QA sign-off:

| Category | Required Pass Rate |
|----------|--------------------|
| Unit tests — Backend | 100% |
| Unit tests — Frontend | 100% |
| Integration tests — API + DB | 100% |
| CRM / JS web resource unit tests | 100% |
| E2E tests — Portal | 100% (Critical + High priority) |
| E2E tests — CRM | 100% (Critical + High priority) |
| BMP integration tests | 100% (all 3 BMP test cases) |
| Performance tests | All SLA targets met at P95 |
| Security tests | 0 Critical or High OWASP findings unresolved |

### 10.3 Definition of Done — QA Phase Sign-Off Checklist

The QA phase is complete and the feature is eligible for CEO final review when ALL of the following are true:

- [ ] All 91 test cases defined in this document have been executed
- [ ] Unit test coverage thresholds met for all components (see 10.1)
- [ ] Zero failing unit tests in CI
- [ ] Zero failing integration tests in CI
- [ ] All Critical-priority E2E tests pass in staging
- [ ] All High-priority E2E tests pass in staging
- [ ] All 3 BMP stage transition tests verified by BMP team sign-off document
- [ ] All 5 performance test SLA targets met (NFR-001, NFR-002, NFR-005 verified)
- [ ] Zero OWASP ZAP Critical findings unresolved
- [ ] Zero OWASP ZAP High findings unresolved (Medium must be documented with risk acceptance)
- [ ] Audit trail test (TC-061 and TC-020) confirmed append-only — no update or delete operations reach audit tables
- [ ] Cross-customer IDOR tests (TC-084, TC-085) confirmed blocked at server side
- [ ] CRM security role tests (TC-060, TC-076) confirmed enforced at CRM platform level
- [ ] Document SAS URL expiry test (TC-089) confirmed working in staging blob storage
- [ ] BMP configuration checklist signed off by bank's internal BMP team
- [ ] Merge and split audit history verified in staging CRM (TC-061)
- [ ] All high-severity defects (Severity 1 and 2) resolved and retested
- [ ] Regression test suite (subset of E2E: TC-062, TC-064, TC-072, TC-074, TC-075) passes in one continuous clean run without manual intervention
- [ ] QA Lead sign-off document produced and attached to the engagement record

### 10.4 Defect Severity Classification

| Severity | Definition | SLA to Resolve |
|----------|-----------|----------------|
| S1 — Critical | Data loss, security breach, audit trail corruption, cross-customer data exposure | Block all other work; fix before any other test proceeds |
| S2 — High | Business rule failure (wrong routing, wrong validation), application submission failure | Fix within 1 working day; retest same day |
| S3 — Medium | UI display error, non-blocking validation message wording, performance outside target by < 20% | Fix within 3 working days |
| S4 — Low | Cosmetic, accessibility improvement, documentation gap | Deferred to next sprint; tracked in backlog |

---

*Phase 5 — QA Strategy & Test Plan v1.0*
*Maqsad AI — QA Lead*
*Prepared: 2026-05-09*
*Next action: CEO final approval (Phase 7)*
