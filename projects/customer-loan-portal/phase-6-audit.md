# Phase 6 — Security & Compliance Audit
## Customer Loan Portal & RM Workspace
**Auditor:** Maqsad AI — Security & Governance Agent
**Date:** 2026-05-09
**Version:** 1.0 — Final
**Status:** NOT CLEARED FOR GO-LIVE (conditions attached)
**References:** BRD v1.1, Architecture v1.1, Technical Build v1.1, QA Plan v1.0, CEO BRD Approval 2026-05-06

---

## 1. Executive Summary

### Overall Risk Rating: HIGH

The Customer Loan Portal & RM Workspace engagement is architecturally sound and demonstrates correct security intent in most areas. The BRD, architecture, and technical documents are internally consistent after the v1.1 revision to on-premise CRM. However, seven go-live blocker findings and eleven high findings have been identified across the seven audit passes. The blocker findings concern: silent error swallowing in critical CRM write paths, an OData injection vector in the CrmRepository, absence of CSRF protection evidence, missing atomicity guarantee in the merge/split operation sequence, a residual Dataverse/Power Automate terminology leak in production code that exposes incorrect comments to future maintainers, missing document filename sanitization at the server boundary, and an unvalidated master application status during merge eligibility checks.

These blockers must be remediated and confirmed before any production deployment. None of the blockers require architectural rework — all are correctable at the implementation level within the existing design.

### Go-Live Recommendation: NOT CLEARED

Conditions for clearance are listed in Section 8.

### Finding Counts

| Severity | Count |
|----------|-------|
| Blockers (C-series) | 7 |
| High (H-series) | 11 |
| Medium/Low (M/L-series) | 9 |

---

## 2. Methodology

### 2.1 Documents Read

| Document | Path | Version |
|----------|------|---------|
| Business Requirements Document | `projects/customer-loan-portal/brd.md` | 1.1 |
| CEO BRD Approval | `projects/customer-loan-portal/brd-approval.md` | Final |
| Solution Architecture | `projects/customer-loan-portal/phase-2-arch.md` | 1.1 |
| Technical Build | `projects/customer-loan-portal/phase-3-tech.md` | 1.1 |
| QA Strategy & Test Plan | `projects/customer-loan-portal/phase-5-qa.md` | 1.0 |

### 2.2 Audit Passes Performed

All seven passes were completed in full sequence before any finding was recorded.

- Pass 1: Authentication and Authorization
- Pass 2: Input Validation and Injection
- Pass 3: Data Handling and Residency
- Pass 4: Error Handling and Information Leakage
- Pass 5: Secrets and Configuration
- Pass 6: Business Logic and Compliance
- Pass 7: Infrastructure and DevOps

Additionally, seven code audit sub-passes were applied to the implementation code in phase-3-tech.md:
- Code Pass 1: Wiring
- Code Pass 2: Error Handling
- Code Pass 3: Completeness
- Code Pass 4: Dead Code
- Code Pass 5: Bloat
- Code Pass 6: Hardcoding
- Code Pass 7: Security

### 2.3 Confidence Threshold

All findings reported at greater than 80% confidence. Confidence level stated per finding. Speculative findings were discarded.

---

## 3. Go-Live Blockers

### C-001: OData Filter String Interpolation — OData Injection Vector

**Finding ID:** C-001
**Severity:** CRITICAL
**Confidence:** 96%

**Description:**
Multiple methods in the CrmRepository construct OData `$filter` expressions by directly interpolating string values without encoding or parameterization. An attacker or corrupted upstream input that manipulates an application ID, facility ID, or customer ID value can inject arbitrary OData filter logic and potentially retrieve records belonging to other customers or bypass status filters.

**Evidence:**

`phase-3-tech.md`, Part D, `CrmRepository.ts`, line-equivalent in the `getFacilityRequestKeys` method:
```
const url = `${this.baseUrl}/maq_applicationrequesttypes?$filter=_maq_applicationid_value eq '${applicationId}'&$select=...`;
```

Also in `reassignFacilitiesToApplication`:
```
const facilitiesUrl = `${this.baseUrl}/maq_applicationfacilitys?$filter=_maq_applicationid_value eq '${fromAppId}'&$select=...`;
```

Also in `reassignRequestTypesToApplication` and `reassignDocumentsToApplication` — the same pattern is repeated in every query-building method throughout the CrmRepository class.

And in `reassignDocumentsForFacilitiesToApplication`:
```
const filter = facilityIds.map((id) => `_maq_applicationfacilityid_value eq '${id}'`).join(' or ');
const url = `${this.baseUrl}/maq_applicationdocuments?$filter=${encodeURIComponent(filter)}&$select=...`;
```
Note: `encodeURIComponent` is applied to the already-assembled filter string in the `reassignDocumentsForFacilitiesToApplication` path only — but the individual IDs within the filter are still interpolated without validation. The other methods do not even apply URL encoding.

**Risk:**
An OData filter injection via a malformed GUID-shaped string (OData v4 operators, quotes, parentheses) could allow an authenticated RM or portal user to retrieve records beyond their authorization scope. On Dynamics CRM on-premise OData v4, a filter such as `_maq_applicationid_value eq 'x' or 1 eq 1` would return all records. The CRM's own security roles provide a partial mitigation but do not substitute for parameterized queries at the integration layer.

**Remediation:**
1. Validate that all ID parameters are syntactically valid GUIDs (UUID v4 format) before interpolation. Reject any value that fails a UUID regex check with a `400 Bad Request` or `ValidationError`.
2. Use a dedicated OData query builder that escapes string literals, or assert that all filter values are GUIDs before string interpolation. A simple guard:
```typescript
function assertGuid(value: string, fieldName: string): void {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(`Invalid GUID for field ${fieldName}`, 'INVALID_GUID');
  }
}
```
3. Apply this guard in `CrmRepository` at the entry of every method that accepts an ID before constructing a URL.

**Residual Risk After Mitigation:** Low — GUID format validation eliminates the OData injection surface since OData keywords cannot be expressed as valid GUIDs.

---

### C-002: Silent Error Swallowing in Critical CRM Write Paths

**Finding ID:** C-002
**Severity:** CRITICAL
**Confidence:** 98%

**Description:**
Several CRM write operations in the CrmRepository do not inspect the HTTP response status code and silently discard failures. This means audit log writes, merge history writes, split history writes, and facility reassignments can fail silently, leaving the system in a partially-committed state with no error surfaced to the caller.

**Evidence:**

`phase-3-tech.md`, Part D, `CrmRepository.ts`, `recalculateApplicationTotals` method:
```typescript
async recalculateApplicationTotals(applicationId: string): Promise<void> {
  const url = `${this.baseUrl}/maq_loanapplications(${applicationId})/Microsoft.Dynamics.CRM.maq_RecalculateTotals`;
  await fetch(url, {
    method: 'POST',
    headers: this.headers,
    body: JSON.stringify({}),
  });
}
```
No `response.ok` check. No error thrown. If CRM returns 500, the caller continues as if totals were recalculated.

`createMergeHistory` method:
```typescript
async createMergeHistory(data: Record<string, unknown>): Promise<void> {
  const url = `${this.baseUrl}/maq_applicationmergehistories`;
  await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(data) });
}
```
No response check. A failed merge history write would be completely invisible. The merge operation in MergeService would log "merge.completed" while the audit trail record was never persisted.

`createSplitHistory` method — same pattern:
```typescript
async createSplitHistory(data: Record<string, unknown>): Promise<void> {
  const url = `${this.baseUrl}/maq_applicationsplithistories`;
  await fetch(url, { method: 'POST', headers: this.headers, body: JSON.stringify(data) });
}
```

Also: `updateFacility`, `updateRequestType`, `updateDocument` private methods — none check `response.ok`:
```typescript
private async updateFacility(facilityId: string, data: Record<string, unknown>): Promise<void> {
  const url = `${this.baseUrl}/maq_applicationfacilitys(${facilityId})`;
  await fetch(url, { method: 'PATCH', headers: this.headers, body: JSON.stringify(data) });
}
```
These are called from `reassignFacilitiesToApplication` which orchestrates the entire merge record-moving operation.

**Risk:**
A partial merge where some facility records move but the merge history audit record fails would produce an inconsistent state: the system considers a merge complete, the UI would show the master application with extra facilities, but the regulatory audit trail would have no record of the operation. This directly violates FR-013 (append-only audit trail), AC-006, and NFR-009 (7-year audit retention). Under FATF and QCB examination, an operation with no corresponding audit record is indistinguishable from a fraudulent post-hoc modification.

**Remediation:**
Every `fetch` call in the CrmRepository must check `response.ok` and throw a typed `CrmError` on failure. Extract a private helper:
```typescript
private async assertOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    logger.error({ operation, status: response.status, errorBody }, 'crm.operation.failed');
    throw new CrmError(`CRM operation failed: ${operation}`, response.status, errorBody);
  }
}
```
Apply `await this.assertOk(response, 'createMergeHistory')` after every fetch call in the repository. The AuditService write must be treated as the most critical — if it fails, the entire orchestrating service operation must throw and the caller must surface the error.

**Residual Risk After Mitigation:** Low — errors surface to the Fastify route handler which returns 502/503 to the caller. Dead-letter queue or retry mechanism for audit writes is recommended as a follow-on hardening step.

---

### C-003: Missing Master Application Status Validation in Merge Eligibility Check

**Finding ID:** C-003
**Severity:** CRITICAL
**Confidence:** 93%

**Description:**
The `validateMergeEligibility` method in `MergeService` checks the status of each source application against `ELIGIBLE_MERGE_STATUSES`, but does not apply the same check to the master application. An RM could select a master application that is already in `credit_review`, `approved`, or another ineligible status, and the merge would proceed — corrupting an active BMP workflow.

**Evidence:**

`phase-3-tech.md`, Part A, `MergeService.ts`, `validateMergeEligibility` method:
```typescript
private validateMergeEligibility(masterApp: CrmApplication, sourceApps: (CrmApplication | null)[]): void {
  const masterId = masterApp.maq_loanapplicationid;
  const masterCustomerId = masterApp._maq_customerid_value;

  for (const sourceApp of sourceApps) {
    // ... null check, self-merge check, cross-customer check ...
    if (!ELIGIBLE_MERGE_STATUSES.includes(sourceApp.maq_status)) {
      throw new ValidationError(...'INELIGIBLE_STATUS_FOR_MERGE'...);
    }
  }
}
```
The master application's own `maq_status` is never compared against `ELIGIBLE_MERGE_STATUSES`. Only source applications are checked.

**Risk:**
An RM could designate an application already in credit review as the merge master. The system would re-assign facilities and request types to it, write a merge history record, and reset the workflow stage — corrupting an in-progress credit assessment. This is an integrity and regulatory violation: a credit decision made on incomplete data due to a post-hoc facility addition.

**Remediation:**
Add a status check for the master application at the top of `validateMergeEligibility`, before the source application loop:
```typescript
if (!ELIGIBLE_MERGE_STATUSES.includes(masterApp.maq_status)) {
  throw new ValidationError(
    `Master application ${masterApp.maq_referencenumber} is in status "${masterApp.maq_status}" and cannot be used as a merge master`,
    'INELIGIBLE_MASTER_STATUS_FOR_MERGE',
    { applicationId: masterApp.maq_loanapplicationid, status: masterApp.maq_status },
  );
}
```

**Residual Risk After Mitigation:** Low — the same status list protects both master and source applications.

---

### C-004: No Atomicity Guarantee for Multi-Step Merge/Split Operations

**Finding ID:** C-004
**Severity:** CRITICAL
**Confidence:** 95%

**Description:**
The merge and split operations in MergeService and SplitService perform multiple sequential CRM write operations (reassign facilities, reassign request types, reassign documents, mark source as merged, create merge history, write audit log, recalculate totals, reset workflow stage) without any transaction boundary or compensating rollback logic. If any intermediate step fails, the system is left in a partially-committed state with no automatic recovery.

**Evidence:**

`phase-3-tech.md`, Part A, `MergeService.ts`, `mergeApplications` method:
```typescript
for (const sourceApp of sourceApps) {
  if (!sourceApp) continue;
  await this.moveRecordsToMaster(sourceApp.maq_loanapplicationid, masterApplicationId);   // step 1
  await this.markSourceAsMerged(sourceApp.maq_loanapplicationid, masterApplicationId);      // step 2
  await this.createMergeHistoryRecord(masterApplicationId, sourceApp.maq_loanapplicationid, request); // step 3
  await this.auditService.logEvent(...);                                                    // step 4
}
await this.crmRepo.recalculateApplicationTotals(masterApplicationId);                      // step 5
await this.crmRepo.resetApplicationWorkflowStage(masterApplicationId, 'rm_review');       // step 6
```

The Dynamics CRM on-premise OData API does not natively support distributed transactions. If step 2 succeeds (marking source as merged) but step 3 fails (merge history write — which is silently swallowed per C-002), the source application is marked merged but has no history record. If step 5 fails, the master application's displayed totals are incorrect.

The architecture document (phase-2-arch.md, Section 8, Merge Algorithm) specifies "BEGIN TRANSACTION ... COMMIT TRANSACTION" but the CRM OData API has no transaction support. The implementation does not acknowledge this gap or provide compensating logic.

**Risk:**
Partially merged applications would be in an unrecoverable state without manual DBA intervention. Records belonging to a source application would be partially moved to the master, the source might be marked merged, but no history record would exist. This is a data integrity violation, an audit trail gap, and an operational incident waiting to happen at scale.

**Remediation:**
1. Implement idempotency tokens and a merge/split job table in PostgreSQL (not CRM) to track multi-step operation state. Each step is recorded before execution so that a background recovery job can detect partial operations.
2. Alternatively, use a CRM batch request (OData `$batch`) to group atomic write operations. CRM on-premise OData v4 supports `$batch` for grouping multiple requests in a single HTTP call with change set semantics — change sets within a batch are atomic.
3. At minimum: wrap the per-source-app loop in a try/catch, and on failure, execute a compensating operation (reassign records back to source, revert source status) and log a `MergeRollback` audit event. Even a best-effort rollback is significantly safer than silent partial state.
4. Add a `maq_mergestatus` field on `maq_loanapplication` with values `MergeInProgress` / `MergeComplete` / `MergeFailed` to expose partial state to RM administrators.

**Residual Risk After Mitigation:** Medium (inherent to CRM OData's lack of true ACID transactions) — reduced to Low with OData $batch change sets for the most critical writes.

---

### C-005: No CSRF Protection Evidence on State-Changing API Routes

**Finding ID:** C-005
**Severity:** CRITICAL
**Confidence:** 88%

**Description:**
The Fastify backend API routes include JWT bearer token authentication, but no evidence of CSRF protection (SameSite cookies, CSRF token headers, or origin validation) appears in the technical build document. The QA test plan (TC-091) specifies a CSRF test but frames it as relying on "CORS policy" or "same-site cookie attribute" — however, the portal authenticates via Bearer tokens in the `Authorization` header, which are not subject to CSRF if stored in memory. If the token is stored in a cookie (common in Next.js with server-side rendering), CSRF protection must be explicitly implemented.

**Evidence:**

`phase-3-tech.md`, Part A, `routes/applications/submit.ts`:
```typescript
fastify.post<{ Params: { id: string } }>(
  '/api/v1/applications/:id/submit',
  {
    preHandler: [fastify.authenticate],
    schema: { ... },
  },
  async (request, reply) => { ... }
);
```

No `fastify-csrf` plugin is registered. The `app.ts` plugin registration list in the project structure does not include a CSRF plugin. The auth plugin (`plugins/auth.ts`) is referenced but its implementation is not shown — it is unknown whether tokens are validated from cookies or Authorization headers exclusively.

`phase-5-qa.md`, TC-091 cites CORS as the CSRF mitigation, but CORS is a browser-enforced policy and does not protect against all CSRF attack vectors — particularly attacks from pages that forge requests to the same origin.

**Risk:**
If B2C tokens are stored in cookies (as Next.js SSR/Server Components commonly do), a CSRF attack could cause an authenticated customer to submit an application, upload a document, or mark notifications as read without their explicit intent. The submit endpoint is the highest-value target.

**Remediation:**
1. Clarify and document in the auth plugin whether B2C tokens are stored in `httpOnly` + `SameSite=Strict` cookies or in memory/localStorage.
2. If cookie storage is used: implement `fastify-csrf-protection` plugin and require the double-submit cookie pattern or synchronizer token pattern on all state-changing routes (`POST`, `PUT`).
3. If Authorization header-only (Bearer) is used: document this explicitly as the CSRF mitigation, since browser scripts cannot set the `Authorization` header cross-origin. Ensure no state-changing routes accept session cookies as the sole auth mechanism.
4. Regardless: set `SameSite=Strict` (or `Lax` with justification) on all cookies set by the portal.

**Residual Risk After Mitigation:** Low — Bearer-only auth is inherently CSRF-resistant; cookie auth with SameSite=Strict achieves the same result.

---

### C-006: Missing Server-Side Document Filename Sanitization

**Finding ID:** C-006
**Severity:** CRITICAL
**Confidence:** 91%

**Description:**
The document upload flow accepts a filename from the client and stores it in `maq_documentname` in CRM and in `documentName` in PostgreSQL's `DraftDocument` table. No server-side filename sanitization is visible in the technical build document. The `DocumentService` is referenced in the project structure but its implementation is not shown. The Zod schema for documents is similarly absent from the provided `applicationSchemas.ts`.

**Evidence:**

`phase-3-tech.md`, Part A, project structure:
```
services/
  DocumentService.ts   — Upload to Azure Blob, write document record to CRM
```

`phase-3-tech.md`, Part A, `DocumentUploadZone.tsx` (B.2), the `onDrop` handler:
```typescript
const formData = new FormData();
formData.append('file', file);
if (facilityId) formData.append('facilityId', facilityId);
const response = await fetch(`/api/v1/applications/${applicationId}/documents`, {
  method: 'POST',
  body: formData,
});
```
The original `file.name` from the browser is sent to the server via FormData. No normalization occurs at the client level.

`phase-3-tech.md`, Part A, Prisma schema (`schema.prisma`), `DraftDocument` model:
```prisma
model DraftDocument {
  documentName    String
```
The `documentName` field accepts any string. No length constraint, no character set constraint, no path traversal prevention.

The `documentSchemas.ts` Zod schema file is listed in the project structure but not implemented in the provided code.

**Risk:**
A malicious filename containing path traversal sequences (`../../etc/passwd`), null bytes, or excessively long strings could:
1. Corrupt the Azure Blob Storage path if the filename is used in blob path construction.
2. Produce stored XSS if the filename is later rendered in the CRM document subgrid without escaping.
3. Trigger unexpected behavior in CRM document preview functions that attempt to process the filename.

**Remediation:**
In `DocumentService.ts`, before writing the document name to any store, apply:
```typescript
function sanitizeDocumentName(rawName: string): string {
  const basename = path.basename(rawName);                     // strip any path components
  const noNullBytes = basename.replace(/\0/g, '');            // strip null bytes
  const alphanumericOnly = noNullBytes.replace(/[^a-zA-Z0-9._\- ]/g, '_'); // allow safe chars only
  return alphanumericOnly.substring(0, 200);                  // enforce max length
}
```
Additionally add to the document Zod schema:
```typescript
documentName: z.string()
  .max(200)
  .regex(/^[a-zA-Z0-9._\- ]+$/, 'Filename contains invalid characters'),
```

**Residual Risk After Mitigation:** Low.

---

### C-007: Residual "Power Automate" and "Dataverse" References in Production Code

**Finding ID:** C-007
**Severity:** CRITICAL (Governance/Audit Trail)
**Confidence:** 97%

**Description:**
The technical build document contains multiple code comments and a stale method comment that reference Power Automate and Dataverse — the incorrect platform that was explicitly rejected in BRD v1.1 and CEO approval. These references exist in production code paths, not merely in documentation.

**Evidence:**

`phase-3-tech.md`, Part D, `CrmRepository.ts`, `resetApplicationWorkflowStage` method:
```typescript
async resetApplicationWorkflowStage(applicationId: string, targetStage: string): Promise<void> {
  await this.updateApplication(applicationId, { maq_workflowstage: targetStage });
  // Power Automate handles BPF stage transition via SetStage action
}
```
This comment references Power Automate and BPF — both explicitly prohibited by BRD v1.1, Constraint 2 and 3, and CEO approval note.

`phase-3-tech.md`, Part A, `plugins/dataverse.ts` plugin file is listed in the project structure. The plugin is named `dataverse.ts` when the system uses Dynamics CRM on-premise, not Dataverse cloud. The route handler in `submit.ts` references `fastify.dataverse`:
```typescript
const applicationService = new ApplicationService(fastify.prisma, fastify.dataverse, fastify.auditService);
```
The property is named `dataverse` — a Dataverse-specific term that is incorrect for on-premise CRM.

`phase-3-tech.md`, Part D, `CrmRepository.ts`, first comment block:
```typescript
// CRM on-prem exposes the same OData v4 endpoint as Dataverse but at:
//   https://<crm-server>/<org-name>/api/data/v9.1/
```
While the technical clarification is accurate (the on-premise OData endpoint is structurally similar to Dataverse), the naming throughout the plugin registration and route handler is `dataverse`, which will mislead future maintainers into treating this as a Dataverse integration and potentially introducing Dataverse-specific patterns.

**Risk:**
From a governance perspective, production code that references an explicitly rejected platform creates an ambiguous audit trail. A future developer or external auditor reading the code cannot determine whether the system is correctly implemented against the approved architecture without cross-referencing the BRD. In a regulated financial environment, this ambiguity is unacceptable. The comment suggesting Power Automate handles BPF transitions is factually incorrect — BMP handles all transitions — and creates a maintenance trap.

**Remediation:**
1. Rename `plugins/dataverse.ts` to `plugins/crmClient.ts` and rename the Fastify decorator from `fastify.dataverse` to `fastify.crmClient` throughout all route handlers.
2. Remove the comment `// Power Automate handles BPF stage transition via SetStage action` from `resetApplicationWorkflowStage` and replace with: `// BMP module handles workflow stage transitions via its configured triggers on maq_status field change.`
3. Ensure the `resetApplicationWorkflowStage` method does not imply a BPF call — the BMP module reacts to the `maq_workflowstage` field update via its plugin event listener, so the OData PATCH to set `maq_workflowstage` is the correct and only action needed from this layer.

**Residual Risk After Mitigation:** Negligible — naming alignment removes the maintenance trap.

---

## 4. High Findings

### H-001: MergeService Validates Source App Status but Not "No Active Non-Reversible Workflow Tasks"

**Finding ID:** H-001
**Severity:** HIGH
**Confidence:** 90%

**Description:**
FR-010 and the merge eligibility rules in BRD Section 5 (FR-010) explicitly require: "No active non-reversible workflow stage" before a merge is permitted. The `validateMergeEligibility` method checks status (`ELIGIBLE_MERGE_STATUSES`) but does not check for active BMP workflow tasks. An application can be in `rm_review` status but simultaneously have a non-reversible BMP task (e.g., an FFD review task already issued) that the status field does not reflect.

**Evidence:**
`phase-3-tech.md`, Part A, `MergeService.ts`:
```typescript
const ELIGIBLE_MERGE_STATUSES = ['submitted', 'rm_review'];
// ... only status is checked, no BMP task query
```

**Risk:** Merging an application with an active BMP task mid-flight could orphan the task in the BMP module, causing the BMP workflow to be in an unresolvable state for the merged record.

**Remediation:** Add a `crmRepo.hasActiveNonReversibleBmpTask(applicationId)` query against the BMP module's task entity (or the CRM activity records created by BMP) before allowing a merge. Coordinate with the BMP team to define which task types are considered non-reversible.

---

### H-002: SaveDraft API Call Has No Error Handling in ApplicationWizard

**Finding ID:** H-002
**Severity:** HIGH
**Confidence:** 97%

**Description:**
The `saveDraft` function in `ApplicationWizard.tsx` makes an API PUT call but does not handle the response — it does not check `response.ok` and does not display any error to the user if the save fails.

**Evidence:**
`phase-3-tech.md`, Part B, `ApplicationWizard.tsx`, `saveDraft` function:
```typescript
const saveDraft = async () => {
  setIsSaving(true);
  try {
    const data = methods.getValues();
    await fetch(`/api/v1/applications/${draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } finally {
    setIsSaving(false);
  }
};
```
No `response.ok` check. No error state. The `finally` block always clears `isSaving`, giving the user a false signal that the save succeeded.

**Risk:** A customer believes their draft was saved, closes the browser, and returns to find their work lost. In a 25-step commercial loan application this is a severe UX and trust failure. Additionally, `onSubmit` references a function not defined in the shown code — `onSubmit` at line 794 is a stub (`// handled by StepReviewSubmit`) which represents a completeness gap.

**Remediation:**
```typescript
const saveDraft = async () => {
  setIsSaving(true);
  try {
    const data = methods.getValues();
    const response = await fetch(`/api/v1/applications/${draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Draft save failed with status ${response.status}`);
    }
  } catch (error) {
    setSaveError('Your draft could not be saved. Please try again.');
    logger.error({ error, draftId }, 'saveDraft.failed');
  } finally {
    setIsSaving(false);
  }
};
```

---

### H-003: DocumentUploadZone Has No Error Handler for Upload Failure

**Finding ID:** H-003
**Severity:** HIGH
**Confidence:** 97%

**Description:**
The `onDrop` handler in `DocumentUploadZone.tsx` only handles the success path (`if (response.ok)`). When the upload API returns an error (network failure, file validation failure server-side, 413 too large), no error is surfaced to the user and no state is updated.

**Evidence:**
`phase-3-tech.md`, Part B, `DocumentUploadZone.tsx`, `onDrop` callback:
```typescript
if (response.ok) {
  const { data } = await response.json();
  onUploadComplete(...);
}
// No else branch. No catch block around the fetch.
```

**Risk:** Upload failures are invisible. A customer believes required documents have been attached, proceeds to submit, and the submission fails server-side because documents are missing. In the worst case, a file was partially processed server-side before the error.

**Remediation:** Add an `else` branch that calls `onUploadError(file.name, error)` and displays an error toast. Wrap the entire `for` loop in a try/catch for network errors.

---

### H-004: `isSplitEligible` Ribbon Rule Does Not Include `disbursement` Status

**Finding ID:** H-004
**Severity:** HIGH
**Confidence:** 92%

**Description:**
The `isSplitEligible` function in `maq_ribbonrules.js` defines an `ineligibleStatuses` list that is inconsistent with the `NON_SPLITTABLE_STATUSES` constant in `SplitService.ts`. The server-side list includes `'disbursement'` and `'branched'`; the client-side ribbon rule list does not include `'branched'`.

**Evidence:**
`phase-3-tech.md`, Part C, `maq_ribbonrules.js`:
```javascript
function isSplitEligible(primaryControl) {
  const status = primaryControl.getAttribute('maq_status').getValue();
  const ineligibleStatuses = ['approved', 'completed', 'rejected', 'cancelled', 'merged'];
  return !ineligibleStatuses.includes(status);
}
```

`phase-3-tech.md`, Part A, `SplitService.ts`:
```typescript
const NON_SPLITTABLE_STATUSES = ['approved', 'disbursement', 'completed', 'rejected', 'cancelled', 'merged'];
```

`branched` status is also not in the JS list. An already-branched application could display the Split button to an RM who is not expecting it.

**Risk:** An RM sees the Split button on an application in `disbursement` status and attempts a split. The server-side validation in SplitService will correctly reject it, but the confusing UI gives the RM incorrect affordance. If `branched` is later added to the server-side check without updating the ribbon rule, the button would also appear for branched applications.

**Remediation:** Synchronize the ribbon rule's `ineligibleStatuses` array with `NON_SPLITTABLE_STATUSES`. Maintain a single source of truth (ideally a shared configuration or a CRM global option set) and load the ineligible status list from configuration rather than maintaining it in two places.

---

### H-005: No Token Refresh or 401 Handling in Portal API Fetch Calls

**Finding ID:** H-005
**Severity:** HIGH
**Confidence:** 89%

**Description:**
The portal's client-side `fetch` calls in `ApplicationWizard.tsx` and `DocumentUploadZone.tsx` do not include the `Authorization: Bearer` header explicitly — they rely on cookies or the Next.js BFF layer. Neither component handles 401 responses (expired token). A customer mid-application who is silently logged out will see no feedback.

**Evidence:**
`phase-3-tech.md`, Part B, `ApplicationWizard.tsx`, `saveDraft`:
```typescript
await fetch(`/api/v1/applications/${draftId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
```
No `Authorization` header. No 401 check. No redirect to login on session expiry.

**Risk:** FR-001 requires session timeout after 30 minutes of inactivity. QA test TC-070 validates this behavior. The frontend code as shown does not implement the redirect behavior — it would leave the user with a silent save failure.

**Remediation:** Implement a central `apiFetch` wrapper that reads the B2C token from the NextAuth session, attaches the `Authorization` header, and handles 401 by redirecting to the B2C login flow. All API calls must use this wrapper, not bare `fetch`.

---

### H-006: AuditService — Actor Source Hardcoded as 'CRM' for Portal-Initiated Actions

**Finding ID:** H-006
**Severity:** HIGH
**Confidence:** 95%

**Description:**
The `maq_actorsource` field in the `maq_auditlog` entity has an option set with values: `Portal, CRM, PowerAutomate, System`. The AuditService calls in MergeService and SplitService hardcode `actorSource: 'CRM'` even when the merge/split is initiated by an RM from the CRM web resource calling the backend API. This is acceptable for CRM-initiated operations, but the `actorSource` option set still includes `'PowerAutomate'` — a value that must never be used given that Power Automate is prohibited. Additionally, no audit event is written when a Portal customer submits an application — the `actorSource` for submission events from the portal is not visible in the implementation.

**Evidence:**
`phase-3-tech.md`, Part A, `MergeService.ts`:
```typescript
await this.auditService.logEvent({
  ...
  actorSource: 'CRM',
  ...
});
```

`phase-2-arch.md`, Section 4.2.7:
```
Actor Source | maq_actorsource | Option Set | Portal, CRM, PowerAutomate, System
```
`PowerAutomate` option set value should be removed from the CRM schema since Power Automate is not used in this solution. Its presence creates a false affordance for future misconfiguration.

**Risk:** Future developers or BMP configuration team members might select `PowerAutomate` as the actor source for system-level events, creating audit records that reference a prohibited component. In a regulatory examination this creates confusion about system boundaries.

**Remediation:**
1. Remove the `PowerAutomate` option from the `maq_actorsource` option set values in CRM. Replace with `BMP` to accurately represent BMP module-initiated events.
2. Ensure that the submit route writes an audit event with `actorSource: 'Portal'` for application submission events.
3. Add an `actorSource` parameter to the `AuditEventPayload` type and validate it against the allowed enum at runtime.

---

### H-007: `maq_workflowinstance.maq_bpfinstanceid` References Dataverse BPF

**Finding ID:** H-007
**Severity:** HIGH
**Confidence:** 97%

**Description:**
The `maq_workflowinstance` entity design in `phase-2-arch.md` (Section 4.2.9) includes a field `maq_bpfinstanceid` described as "Dataverse BPF process ID". This entity and field design was included in the architecture document, and if deployed as specified, would represent a reference to a Dataverse Business Process Flow — a cloud-only feature that is explicitly prohibited by BRD v1.1 Constraint 3 and CEO approval.

**Evidence:**
`phase-2-arch.md`, Section 4.2.9, `maq_workflowinstance` entity:
```
| BPF Instance ID | maq_bpfinstanceid | Text | Dataverse BPF process ID |
```

**Risk:** If this field is deployed and populated by the BMP module or any integration code, it creates an expectation of a Dataverse BPF connection that does not exist in the on-premise architecture. The field is misleading and creates governance ambiguity. If it remains empty, it is dead schema.

**Remediation:**
1. Rename the field to `maq_bmpinstanceid` with the description "BMP module workflow instance identifier."
2. Coordinate with the BMP team on whether the BMP module exposes an instance ID that should be stored here for cross-system correlation.
3. If the BMP module does not expose an instance ID, remove the field from the entity schema.

---

### H-008: No Rate Limiting Evidence on Document Upload Endpoint

**Finding ID:** H-008
**Severity:** HIGH
**Confidence:** 88%

**Description:**
The architecture document (phase-2-arch.md, Section 10.4) specifies rate limiting at "100 requests/minute per customer token" applied globally. However, the document upload endpoint (`POST /api/v1/applications/:id/documents`) accepts files up to 25 MB. A customer token could upload 100 × 25 MB = 2.5 GB of data per minute against the Azure Blob Storage account. A separate, stricter rate limit specific to document uploads is not defined.

**Evidence:**
`phase-2-arch.md`, Section 10.4:
```
Rate limiting: 100 requests/minute per customer token.
Document SAS URLs expire after 15 minutes.
```
No separate rate limit is defined for the upload endpoint.

**Risk:** A malicious or malfunctioning client could exhaust Azure Blob Storage ingress bandwidth and API transaction limits, causing document upload failures for all other concurrent customers (denial of service against the upload surface).

**Remediation:** Apply a separate, stricter rate limit on the document upload route — recommended: 10 uploads per minute per customer token. Implement using `@fastify/rate-limit` with a per-route override:
```typescript
fastify.post('/api/v1/applications/:id/documents', {
  config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  ...
});
```

---

### H-009: Merge/Split Wizard Opens applicationId and customerId via URL Query String

**Finding ID:** H-009
**Severity:** HIGH
**Confidence:** 91%

**Description:**
The `openMergeWizard` and `openSplitWizard` functions in `maq_ribbonrules.js` pass `applicationId` and `customerId` as URL query parameters to the dialog web resource. Inside the merge wizard HTML, these parameters would be read via `window.location.search` or the CRM dialog parameter mechanism. If the wizard uses these values to construct OData queries to the backend API without re-verifying them against the authenticated user's context, a URL manipulation attack could load a different customer's application data in the wizard.

**Evidence:**
`phase-3-tech.md`, Part C, `maq_ribbonrules.js`:
```javascript
Xrm.Navigation.openWebResource('maq_/html/maq_mergewizard.html', {
  openInNewWindow: false,
  width: 900,
  height: 650,
}, `applicationId=${applicationId}&customerId=${customerId}`);
```

The `maq_mergewizard.html` implementation is not provided in phase-3-tech.md. Without seeing the wizard's internal logic, it cannot be confirmed that server-side authorization is re-validated when the wizard calls the backend API.

**Risk:** If the wizard passes the `customerId` parameter directly to the backend API merge endpoint without the server re-verifying customer ownership from the authenticated CRM session, a CRM user could manipulate the URL to merge applications from a different customer.

**Remediation:**
1. The backend API merge endpoint must re-derive the executing user's identity from the JWT (not from request body `customerId`) and verify that all applications belong to the same customer — which MergeService does via `_maq_customerid_value` comparison. Confirm this covers the scenario.
2. In the merge wizard, do not use the passed `customerId` as a trusted authorization parameter. Use it only as a display hint. All data operations must be server-side authorized.
3. Document the authorization flow of the merge wizard explicitly.

---

### H-010: Missing Idempotency Key Enforcement on Submit and Merge Routes

**Finding ID:** H-010
**Severity:** HIGH
**Confidence:** 87%

**Description:**
The architecture document (phase-2-arch.md, Section 6.1) states: "Idempotency headers required on POST/PUT." However, the submit route implementation (`submit.ts`) and the merge route do not show any idempotency key validation. A network timeout could cause a customer to resubmit or an RM to re-trigger a merge, resulting in duplicate CRM records.

**Evidence:**
`phase-2-arch.md`, Section 6.1:
```
Idempotency headers required on POST/PUT.
```

`phase-3-tech.md`, Part A, `routes/applications/submit.ts`:
```typescript
fastify.post<{ Params: { id: string } }>(
  '/api/v1/applications/:id/submit',
  {
    preHandler: [fastify.authenticate],
    schema: { ... },
  },
  async (request, reply) => {
    // No idempotency key check
  }
);
```
No `Idempotency-Key` header processing. No deduplication logic.

**Risk:** A customer double-clicks Submit or a network retry causes two submit calls. The first writes to CRM successfully. The second creates a duplicate CRM record with a different GUID but the same draft content. The customer now has two applications in CRM for one submission.

**Remediation:** Implement idempotency key processing as a Fastify preHandler. Store processed idempotency keys in Redis or PostgreSQL with a 24-hour TTL. On the submit route, check the key before processing and return the cached response if the key was already seen.

---

### H-011: CrmRepository.userHasPrivilege Returns False on CRM Error

**Finding ID:** H-011
**Severity:** HIGH
**Confidence:** 94%

**Description:**
The `userHasPrivilege` method returns `false` if the CRM call fails, rather than throwing an error. This means a transient CRM outage during a privilege check would silently deny legitimate RM users the ability to perform split operations — and more critically, it could be exploited: if an attacker can cause the privilege check CRM call to fail (e.g., through a targeted CRM service disruption or by manipulating request timing), the system would treat the failure as a `false` privilege result and block the operation. However, the inverse risk is more likely operationally: a legitimate RM cannot split during a CRM hiccup and receives a confusing "insufficient privilege" error.

**Evidence:**
`phase-3-tech.md`, Part D, `CrmRepository.ts`:
```typescript
async userHasPrivilege(userId: string, privilegeName: string): Promise<boolean> {
  const url = `${this.baseUrl}/systemusers(${userId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges`;
  const resp = await fetch(url, { headers: this.headers });
  if (!resp.ok) return false;   // <-- silently converts error to "no privilege"
  const { RolePrivileges } = await resp.json();
  return RolePrivileges.some((p: { PrivilegeName: string }) => p.PrivilegeName === privilegeName);
}
```

**Risk:** Masking a CRM error as a privilege denial creates an incorrect audit trail (SplitService would throw `INSUFFICIENT_PRIVILEGE` when the actual cause was `CRM_UNAVAILABLE`) and makes incident diagnosis harder.

**Remediation:**
```typescript
if (!resp.ok) {
  logger.error({ userId, privilegeName, status: resp.status }, 'crm.userHasPrivilege.failed');
  throw new CrmError('PRIVILEGE_CHECK_FAILED', 'Unable to verify user privilege due to CRM error');
}
```
Let the caller handle the CRM error distinctly from an authorization denial.

---

## 5. Medium and Low Findings

| ID | Severity | Pass | Description | File Reference | Remediation |
|----|----------|------|-------------|----------------|-------------|
| M-001 | Medium | Code P3 | `onSubmit` function in `ApplicationWizard.tsx` is a stub (`// handled by StepReviewSubmit`). The submit button calls `handleSubmit(onSubmit)` but `onSubmit` does nothing. Full submission logic must be wired in `StepReviewSubmit` or the wizard. | `phase-3-tech.md` Part B, `ApplicationWizard.tsx` line ~794 | Implement `onSubmit` to call the submit API and redirect to confirmation, or document clearly that StepReviewSubmit overrides this with its own submit handler. |
| M-002 | Medium | Code P6 | `maq_facilitytype` option set value for "New Facility" is hardcoded as integer `100000001` in `maq_application.js`. If CRM option set values are re-indexed, this breaks silently. | `phase-3-tech.md` Part C, `maq_application.js` | Load option set values from a CRM-side constant or compare against the option set label text, not raw integer values. |
| M-003 | Medium | Pass 4 | Error response from `CrmRepository.getApplication` logs the full CRM error body, which may include internal CRM field names and metadata, to the pino logger. Ensure pino log transport does not route CRM error bodies to external log aggregators without scrubbing. | `phase-3-tech.md` Part D, `CrmRepository.ts`, `getApplication` | Set log level for CRM error bodies to `debug` in production; ensure Application Insights log filter excludes CRM error details from public-facing dashboards. |
| M-004 | Medium | Pass 3 | `DraftDocument.blobPath` in PostgreSQL stores the permanent Azure Blob Storage path as plain text. If the path contains predictable patterns (container + customer CIF + filename), an insider with PostgreSQL read access could construct valid blob paths. | `phase-3-tech.md` Part A, `schema.prisma`, `DraftDocument` | Use opaque blob paths (UUID-based) rather than CIF-derived paths for blob object names. |
| M-005 | Medium | Pass 6 | `maq_loanapplication.maq_draftdata` stores the full draft JSON payload in a CRM Multiline Text field. Once submitted, this field is described as "cleared on submit" but no enforcement mechanism is shown. If clearing fails, PII in draft form persists in CRM indefinitely. | `phase-2-arch.md` Section 4.2.1 | Add an explicit `applicationService.clearDraftData(crmApplicationId)` call after successful CRM submission and log a warning if it fails. |
| M-006 | Medium | Pass 7 | Docker image and GitHub Actions CI configuration are not provided in phase-3-tech.md. The architecture specifies Azure Container Apps for the Fastify API but no `Dockerfile` or workflow YAML is shown. It cannot be confirmed that the image runs as non-root. | `phase-2-arch.md` Section 11.2 | Provide and review Dockerfile. Ensure `USER node` instruction is present. Use multi-stage build. Run `trivy image` in CI pipeline. |
| M-007 | Medium | Pass 1 | `GET /api/v1/applications` (list all customer applications) is listed in the route table but no authorization check beyond "Customer JWT" is shown. It must server-side filter by `customerCif` from the JWT, not accept a `customerId` query parameter from the client. | `phase-2-arch.md` Section 6.2; `phase-3-tech.md` Part A route structure | Confirm the list route filters by `customerCif` extracted from JWT, not from query params. Add explicit test case (similar to TC-044). |
| L-001 | Low | Code P4 | `maq_workflowinstance` entity is designed (phase-2-arch.md Section 4.2.9) but no code creates or reads it. The BMP module manages workflow state internally. This entity may be dead schema. | `phase-2-arch.md` Section 4.2.9 | Confirm with BMP team whether this entity is needed. Remove from solution if BMP manages all workflow state internally. |
| L-002 | Low | Code P5 | `CrmRepository.ts` is 217+ lines long and handles entity types for facilities, request types, documents, merge history, split history, approval decisions, and privilege checks — seven concerns in one class. It exceeds the 400-line soft limit as the system grows. | `phase-3-tech.md` Part D | Split into `ApplicationCrmRepository`, `FacilityCrmRepository`, `DocumentCrmRepository`, `AuditCrmRepository` when the file approaches 400 lines in implementation. |

---

## 6. Compliance Status Table

| Framework / Requirement | Requirement Source | Implementation Evidence | Status | Gap / Remediation |
|------------------------|-------------------|------------------------|--------|-------------------|
| **QCB — Customer Data Protection** | QCB banking regulations; BRD Section 8 Constraint 4 | Azure AD B2C for portal auth; on-premise AD for CRM; server-side CIF filter on all API queries; field-level security in CRM | PARTIAL | C-001 (OData injection), H-005 (missing token refresh), M-007 (list route filter confirmation needed) must be resolved |
| **QCB — Audit Trail Retention (7 years)** | BRD NFR-009; FR-013 | `maq_auditlog` append-only entity defined in CRM; AuditService writes structured log on every state transition | PARTIAL | C-002 (silent swallow on merge/split history writes), C-004 (no atomicity — history write can fail without blocker) must be resolved. 7-year physical retention policy on CRM storage must be documented separately. |
| **QCB — Segregation of Duties** | FR-015; BRD Section 5 | RM cannot approve own applications (enforced by BMP DOA config); `maq_CanMergeSplit` privilege gates merge/split; credit approver roles separate from RM role | PASS | No gap. TC-057 validates SoD in staging. H-001 (BMP task check before merge) is advisory. |
| **QCB — DOA (Delegation of Authority)** | FR-012; BRD Section 5, FR-012 | DOA routing configured in BMP module (not hardcoded); BRD Constraint 5 mandates no hardcoded thresholds | PASS | DOA thresholds are externalized to BMP configuration. Code audit found no hardcoded DOA values in the implementation. |
| **FATF — AML/CFT Transaction Records** | International FATF standards; applicable to QDB as a development bank | Audit log captures actor, timestamp, old/new values, correlation ID; merge/split history entities capture actor and timestamp | PARTIAL | C-002 must be resolved (silent failure on history writes). The audit log must be demonstrably tamper-proof for FATF compliance. CRM security role restricts Delete on audit log (TC-076 validates). |
| **FATF — Customer Identification** | FATF Recommendation 10 | Azure AD B2C with MFA for customer authentication; CIF-based server-side filtering ensures each customer sees only their own records | PASS | B2C MFA enforced in production (QA note: MFA disabled in staging — this is a test configuration, not production). |
| **PDPPL (Qatar Personal Data Protection Law)** | PDPPL enacted; BRD Section 6 NFR-006 | Customer PII (name, CIF, financial data) stored in CRM on-premise and PostgreSQL; Azure Blob Storage for documents | PARTIAL | Data residency must be confirmed as Qatar North Azure region (see Section 7). `maq_draftdata` JSON blob in CRM contains full PII; clearing mechanism on submission must be enforced (M-005). |
| **PDPPL — Right to Erasure / Data Minimization** | PDPPL Article provisions | No data retention policy or erasure procedure is defined in any engagement document | FAIL | No retention/erasure procedure for draft data (PostgreSQL), submitted application data (CRM), or documents (Blob Storage) has been designed. This is a gap that must be addressed before go-live. See Governance Gaps. |
| **PDPPL — Cross-Border Transfer** | PDPPL Article 22 | Azure Blob Storage region unspecified; Azure App Service and Container Apps region unspecified | PARTIAL | See Data Residency Review (Section 7). |
| **Data Residency (NFR-006)** | BRD NFR-006: "Within country / Azure region" | Architecture specifies Azure resources in cloud; on-premise CRM in bank data center | PARTIAL | Azure region must be explicitly constrained to Qatar North or UAE North in infrastructure-as-code and Azure Policy. No IaC is provided for review. |
| **WCAG 2.1 AA (Accessibility)** | BRD NFR-008 | Tailwind + shadcn/ui components used; some ARIA labels implied by shadcn | PARTIAL | No accessibility audit evidence in QA plan. StatusTimeline uses `aria-hidden="true"` on connector line (acceptable). Full WCAG audit not performed in this engagement phase. |
| **TLS 1.2+ / HTTPS (NFR-007)** | BRD NFR-007 | Architecture mandates HTTPS throughout; HTTPS between portal and API; VPN/private link for CRM integration | PASS (Design) | TLS configuration at Azure App Service / Container Apps level must be enforced via Azure Policy (minimum TLS version). Not verifiable without infrastructure review. |

---

## 7. Data Residency Review

### 7.1 Data Classification

| Data Type | Classification | Where Stored | Residency Confirmed |
|-----------|---------------|--------------|---------------------|
| Customer PII (name, CIF, contact) | Confidential | Dynamics CRM on-premise (bank DC) | Yes — on-premise in bank's Qatar data center |
| Application financial data (amounts, facility terms) | Confidential | Dynamics CRM on-premise | Yes |
| Draft application state (JSON) | Confidential | PostgreSQL on Azure Database for PostgreSQL Flexible Server | UNCONFIRMED — Azure region not specified |
| Uploaded documents (PDFs, financial statements) | Highly Confidential | Azure Blob Storage | UNCONFIRMED — Azure region not specified |
| Portal session/auth state | Confidential | Azure AD B2C | UNCONFIRMED — B2C tenant region not specified |
| Audit logs (structured events) | Confidential | Dynamics CRM on-premise (maq_auditlog) | Yes — on-premise |
| Structured application logs (pino) | Internal | Azure Application Insights | UNCONFIRMED — App Insights region not specified |

### 7.2 Cross-Border Transfer Risk

**High Risk — Azure Blob Storage Region Unspecified**

Customer-uploaded documents including financial statements, KYC documents, board resolutions, and property documents are stored in Azure Blob Storage. The architecture document lists Azure Blob Storage as a service but does not specify the Azure region. If provisioned in a non-Qatar region (e.g., West Europe, East US), this constitutes a cross-border transfer of highly confidential financial documents in potential violation of PDPPL Article 22 and QCB data localization guidance.

Confidence: 98%

**Remediation:**
1. All Azure resources (Blob Storage, PostgreSQL, Container Apps, App Service, Application Insights) must be deployed to the Qatar North or UAE North Azure region.
2. Enforce this with Azure Policy at the subscription level: `"allowed locations": ["qatarnorth", "uaenorth"]`.
3. Provide the bank's IT team with a data flow diagram showing that no data crosses the specified regional boundary.
4. For Azure AD B2C: confirm the B2C tenant is provisioned in a compliant region. B2C tenant regions are fixed at creation and cannot be moved.

### 7.3 On-Premise Data Residency

Dynamics CRM on-premise is hosted in the bank's Qatar data center. This is fully compliant with data residency requirements for all submitted application data, CRM audit logs, and workflow records. No cross-border risk for CRM-resident data.

### 7.4 API Logs

Pino structured logs are sent to Azure Application Insights. If Application Insights workspace is outside Qatar, application logs containing correlation IDs, operation names, and potentially PII fragments (customer CIF in log context fields) would be stored outside the country boundary.

**Remediation:** Configure the Log Analytics workspace backing Application Insights in the Qatar North region. Review pino log fields to ensure customer CIF is not logged as a top-level field — use a hashed or masked identifier in logs.

---

## 8. Audit Trail Validation

### 8.1 Audit Trail Design Assessment

The `maq_auditlog` entity design is sound. It captures: entity name, record ID, action type, actor user ID, actor name, actor source, timestamp (UTC), old value (JSON), new value (JSON), correlation ID, and description. This provides the minimum fields required for a regulatory examination.

The append-only principle is addressed at:
- Architecture level: `maq_auditlog` Security role table shows no Delete privilege for any non-Admin role; portal service account has Create only.
- CRM level: `maq_application.js` calls `lockAuditFields(formContext)` to disable the audit subgrid in the CRM form (defence in depth).
- Test level: TC-020 (AuditService unit test) and TC-061 (Merge audit verification) and TC-076 (service account delete block) validate append-only behavior.

### 8.2 Gaps in Audit Trail Coverage

**Gap 1: No Audit Event on Draft Creation**
When a customer creates a draft application (POST /api/v1/applications/draft), no audit event is written. Draft records exist only in PostgreSQL. If a draft is later abandoned, there is no CRM record of its existence. This is acceptable per ADR-006 (draft state in PostgreSQL only) but means the audit trail only begins at submission — the pre-submission customer journey is not auditable.

**Recommendation:** If QCB requires visibility into customer intent (draft created, draft updated, draft abandoned), write a PostgreSQL-side audit log for draft lifecycle events. This does not need to go to CRM.

**Gap 2: No Audit Event for Failed Operations**
Failed merge attempts (e.g., cross-customer merge blocked), failed split attempts (privilege check failed), and failed document uploads are not audited. The system logs to pino but does not write to `maq_auditlog`. Under regulatory examination, auditors may ask "was this merge attempted and blocked?" — the answer would only be findable in application logs, not the CRM audit entity.

**Recommendation:** Write a `ValidationFailed` or `OperationBlocked` audit event for all business rule rejections on critical operations (merge, split, submit).

**Gap 3: Audit Log Retention Enforcement**
NFR-009 requires 7-year minimum retention. No mechanism is shown for enforcing this retention at the CRM storage level. CRM on-premise storage is managed by the bank's IT team, but no contractual or policy requirement has been stated in the engagement documents.

**Recommendation:** Document and obtain written sign-off from the bank's IT team confirming CRM database backup retention is configured to a minimum of 7 years. Include this as a go-live prerequisite.

### 8.3 State Reconstruction Capability

The audit log design supports full state reconstruction for a single application record. The combination of `maq_oldvalue` (JSON) and `maq_newvalue` (JSON) per event allows a reviewer to replay all field changes. Merge and split history entities provide a cross-record trail.

**Limitation:** Cross-system correlation between the PostgreSQL draft events and CRM submitted-application events relies on the `dataversId` field in `DraftApplication` and the `correlationId` in audit events. This linkage must be verified in TC-040 (integration test for submission).

### 8.4 Tamper-Proof Assessment

The audit log is tamper-resistant (not fully tamper-proof) through:
- Role-based access control: no Delete privilege for non-Admin roles.
- Form-level UI lock (defence in depth).
- TC-076 validates service account cannot DELETE audit records.

It is not cryptographically tamper-proof (no hash chaining, no WORM storage). For a regulated financial institution, this is an accepted limitation of Dynamics CRM on-premise as the audit store. If QCB requires stronger tamper evidence, the audit log should be mirrored to an immutable Azure Blob Storage tier (Immutable Blob Storage with WORM policy).

**Recommendation (Advisory):** Implement Azure Blob Storage WORM policy for audit log exports as a supplementary control, particularly for records approaching the 7-year mark.

---

## 9. Service Account Review

### 9.1 Portal Integration Service Account (`maq_PortalServiceAccount`)

| Permission | Entity | Scope | Assessment |
|------------|--------|-------|------------|
| Create | maq_loanapplication | Unrestricted (all customer records) | WARNING — See below |
| Read | maq_loanapplication | Must be filtered by customer CIF server-side | CONDITIONAL PASS |
| Create | maq_applicationfacility | — | PASS (scoped by application) |
| Read | maq_applicationfacility | — | PASS |
| Create | maq_applicationrequesttype | — | PASS |
| Read | maq_applicationrequesttype | — | PASS |
| Create | maq_applicationdocument | — | PASS |
| Read | maq_applicationdocument | — | PASS |
| Create | maq_auditlog | Unrestricted | CONDITIONAL PASS |
| None | maq_applicationmergehistory | — | PASS (correct — portal cannot merge) |
| None | maq_applicationsplithistory | — | PASS |
| None | maq_approvaldecision | — | PASS |
| None | Delete (any entity) | — | PASS |

**WARNING — Create on maq_loanapplication:**
The architecture states the portal service account has `Create/Read (restricted to own customer's records via server-side filtering)` on `maq_loanapplication`. The Create privilege cannot be scoped by CIF at the CRM platform level for on-premise — CRM security roles scope by ownership (user/team/business unit/organization), not by field value. The server-side CIF restriction is enforced in the CrmRepository (backend API) code, not in CRM itself. If the service account credentials were compromised, an attacker could call the CRM OData API directly with the service account token and create application records for any customer.

**Recommendation:** 
1. Restrict network access to the CRM OData endpoint to the backend API's egress IP range only (firewall rule on the bank's CRM server). This is the correct compensating control for CRM's inability to scope Create by field value.
2. Rotate the service account credentials on a 90-day cycle and store them exclusively in Azure Key Vault.
3. Enable CRM audit on the service account's login events and CRM record creation events.

### 9.2 All Other Service Accounts

No other service accounts are defined in the engagement documents. The BMP module uses its own internal CRM connection (assumed to use a separate BMP service account managed by the bank's internal team). Verify with the bank's IT team that the BMP service account follows least-privilege principles and is not using an Admin-scoped account.

---

## 10. OWASP Top 10 Assessment (2021)

| OWASP Category | Applicable | Mitigation in Design | Gap |
|---------------|-----------|---------------------|-----|
| A01 — Broken Access Control | Yes | Azure AD B2C JWT on all portal routes; CRM security roles; server-side CIF filter; IDOR tests TC-084/TC-085 | C-003 (master app status not validated in merge), M-007 (list route filter confirmation needed). CSRF evidence gap (C-005). |
| A02 — Cryptographic Failures | Yes | TLS 1.2+ mandated; Azure Blob SAS URLs with 15-minute expiry; documents encrypted at rest (Azure Blob default encryption) | Azure Blob Storage region unspecified (Section 7). On-premise CRM encryption at rest is bank-managed — not reviewed. |
| A03 — Injection | Yes | Zod schemas on all API inputs; Prisma parameterized queries for PostgreSQL; OData filter construction for CRM | C-001 (OData string interpolation — BLOCKER). C-006 (filename sanitization — BLOCKER). |
| A04 — Insecure Design | Partial | ADR-driven architecture; threat modeling implicit in security design section | No explicit threat model document. No abuse case coverage in QA plan for BMP manipulation. |
| A05 — Security Misconfiguration | Yes | Key Vault for secrets; structured logging; HTTPS mandated | Docker configuration not provided (M-006). Azure Policy for region enforcement not confirmed. CORS configuration not shown in implementation. |
| A06 — Vulnerable and Outdated Components | Partial | Fastify v5, Prisma v5, Next.js 15 — current at time of design | No SBOM generated. No `npm audit` or `trivy` output provided. Dependency vulnerability scanning must be in CI pipeline. |
| A07 — Identification and Authentication Failures | Yes | Azure AD B2C with MFA; JWT expiry validation; 30-minute session timeout; B2C lockout on failed attempts | C-005 (CSRF gap). H-005 (no 401 handling / token refresh in wizard). |
| A08 — Software and Data Integrity Failures | Partial | Zod input validation; typed Prisma schema | No artifact signing in CI pipeline (M-006). No integrity check on documents downloaded from Blob. |
| A09 — Security Logging and Monitoring Failures | Yes | Pino structured logging; Application Insights APM; `maq_auditlog` CRM entity | C-002 (silent swallow on CRM writes means failures not logged). Audit gap for failed operations (Section 8.2). |
| A10 — Server-Side Request Forgery (SSRF) | Low | Backend API communicates to CRM on fixed internal URL; Blob Storage uses Azure SDK (not user-supplied URLs) | SAS URL generation: confirm the Blob Storage path is constructed server-side from validated inputs only, not from client-supplied paths. |

---

## 11. Phase 1 CEO Conditions — Status Check

Review of `brd-approval.md` (CEO approval, 2026-05-06):

The CEO approved BRD v1.1 with the following explicit conditions stated in the approval note:

| CEO Condition | Status | Evidence |
|--------------|--------|----------|
| Platform confirmed as Dynamics CRM on-premise (not Dynamics 365 cloud) | PARTIALLY MET | Architecture and tech build are correctly on-premise. However, C-007 identifies residual "Power Automate" and "Dataverse" references in production code comments and plugin naming, which undermine the platform confirmation. These must be cleaned up. |
| Workflow automation confirmed via bank's internal BMP module (not Power Automate) | PARTIALLY MET | BMP integration is correctly designed (Part C.2 of tech build). The stale comment in `resetApplicationWorkflowStage` (`// Power Automate handles BPF stage transition`) directly contradicts this condition. C-007 covers this. |
| Current QDB portal capabilities and actual RM pain points reflected | MET | BRD v1.1 accurately documents existing pain points and QDB portal limitations. No deviation found. |
| Correct approval chain with DOA-based routing | MET | BMP module handles DOA routing; no hardcoded thresholds found in implementation code. |
| Correct workflow stages (7 stages, not 11) | MET | Architecture and tech build correctly implement the 7-stage workflow. |
| Downstream phases (Architecture, Technical Build) to be revised before QA and Audit proceed | PARTIALLY MET | Architecture v1.1 and Technical Build v1.1 exist and are revised. The CEO note required these revisions to be complete before audit. The audit has now proceeded. However, the naming artifact in the plugin (`plugins/dataverse.ts`, `fastify.dataverse`) indicates the revision was incomplete — a direct violation of this condition. |

**Overall CEO Condition Assessment:** Four of six conditions are substantively met. Two conditions (Power Automate/Dataverse terminology eradication) are only partially met. C-007 must be resolved to fully satisfy the CEO's pre-QA/Audit revision requirement.

---

## 12. Governance Gaps

Ranked by risk to go-live:

### GG-001: No Data Retention and Erasure Procedure (PDPPL Compliance Failure)

**Risk if Unaddressed:** PDPPL compliance failure. Without a data retention policy, the bank cannot respond to a customer's right-to-erasure request. Regulatory investigation could result in fines and reputational damage.

**Remediation:** Define and document retention periods for: DraftApplication records in PostgreSQL (e.g., 90 days after abandonment), submitted application data in CRM (7 years), uploaded documents in Blob Storage (7 years), audit log records (7 years). Implement a data purge job for PostgreSQL drafts. For CRM and Blob, establish archival and deletion procedures consistent with the bank's existing data governance policy.

**Priority:** Must be resolved before go-live.

---

### GG-002: No Incident Response Procedure for Merge/Split Partial State

**Risk if Unaddressed:** A partial merge (C-004) that occurs before remediation, or that occurs due to a transient CRM failure after remediation, has no documented recovery procedure. RM administrators would not know what to do with a partially merged application.

**Remediation:** Document a "Merge/Split Recovery Runbook" that describes: how to identify partial state (query `maq_applicationmergehistory` for records where source is still in `rm_review`), how to manually complete or revert a partial merge via CRM OData API calls, and who is authorized to execute the recovery. Include this in the operational handover documentation.

**Priority:** Must be resolved before go-live.

---

### GG-003: BMP Module Documentation and Sign-Off Gap

**Risk if Unaddressed:** BRD Risk R-004 identifies BMP module integration complexity as High. The engagement documents specify BMP configuration behavior but note that "BMP documentation review in Phase 1 is required." No BMP API documentation, BMP-to-CRM event mapping, or BMP configuration sign-off is referenced in any engagement document reviewed.

**Remediation:** Obtain and review BMP module technical documentation. Obtain written sign-off from the bank's internal BMP team confirming the LoanApplicationWorkflow is configured per the specification in phase-3-tech.md C.2. This sign-off should be attached to the engagement record before go-live.

**Priority:** Must be resolved before go-live.

---

### GG-004: No Formal Data Classification Document

**Risk if Unaddressed:** BRD Section 8 Constraint 4 states "Portal must comply with the bank's data classification and security policy." No data classification has been formally defined in the engagement documents — only inferred from the security role table and field-level security profile. A regulator examining the system would expect a formal data classification document.

**Remediation:** Produce a data classification matrix mapping every CRM entity and field to the bank's classification tiers (e.g., Public, Internal, Confidential, Highly Confidential). Align field-level security profiles in CRM with the classification. This document should be part of the operational handover package.

**Priority:** Must be resolved before go-live.

---

### GG-005: Rule Change Chain of Custody

**Risk if Unaddressed:** BRD Constraint 5 states DOA thresholds and approval routing must be managed through BMP module configuration, not hard-coded. However, no change management procedure is defined for BMP configuration changes. An unauthorized DOA threshold change would bypass credit governance controls.

**Remediation:** Define and document a change management procedure for BMP configuration changes: who can propose, who must approve (at minimum: Credit Director + Compliance Officer), how changes are recorded (change log in BMP or external document), and how changes are tested before production deployment.

**Priority:** Must be resolved before go-live.

---

### GG-006: Controls Testing After Platform Upgrade

**Risk if Unaddressed:** The CLAUDE.md governance standard mandates: "All controls must be tested after every platform upgrade cycle." No regression test trigger for platform upgrades (Next.js version bumps, Fastify version bumps, CRM cumulative updates, BMP module updates) is defined in the CI/CD pipeline.

**Remediation:** Add a "Platform Upgrade" test stage to the CI pipeline that runs the full E2E and security test suite whenever a dependency version bump is merged to the main branch. Configure Dependabot or Renovate to create PRs for dependency updates, and require the full test suite to pass before the PR is mergeable.

**Priority:** Should be resolved before go-live; can be a condition of first post-go-live sprint.

---

## 13. Audit Sign-Off

### Auditor Statement

This audit was conducted by the Maqsad AI Security and Governance Agent on 2026-05-09, against BRD v1.1, Architecture v1.1, Technical Build v1.1, QA Plan v1.0, and CEO Approval 2026-05-06.

Seven go-live blockers (C-001 through C-007) have been identified. These findings are:
- Specific, code-evidenced findings, not generic recommendations.
- Confirmed at greater than 88% confidence individually.
- Non-speculative — each has a direct causal path to either a security breach, data integrity failure, regulatory violation, or breach of the CEO's stated conditions.

Eleven high findings (H-001 through H-011) have been identified. These do not block go-live individually but collectively represent significant operational and security risk if not addressed within the first post-go-live sprint.

Six governance gaps (GG-001 through GG-006) represent process and documentation deficiencies. GG-001 through GG-005 must be resolved before go-live. GG-006 is a post-go-live sprint item.

### Go-Live Clearance Decision

**Status: NOT CLEARED**

**Conditions for Clearance:**

The following conditions must be met and re-submitted for auditor sign-off before production deployment:

1. **C-001 resolved and verified:** GUID validation guard applied to all CrmRepository ID parameters. Evidence: code review of CrmRepository.ts showing `assertGuid` applied before every URL construction.

2. **C-002 resolved and verified:** All fetch calls in CrmRepository check `response.ok` and throw typed errors. Evidence: code review + updated TC-020 test confirming audit write failure propagates.

3. **C-003 resolved and verified:** Master application status validated in `validateMergeEligibility`. Evidence: unit test added for master-app-ineligible-status scenario passing CI.

4. **C-004 addressed with documented risk acceptance or OData $batch implementation:** Either implement OData change set batching for merge/split critical writes, or document formal risk acceptance by the bank's CISO and Credit Director for the partial-state risk with the recovery runbook from GG-002.

5. **C-005 resolved and verified:** CSRF protection strategy documented and implemented. Evidence: `plugins/auth.ts` reviewed showing token storage mechanism and corresponding CSRF control.

6. **C-006 resolved and verified:** Server-side filename sanitization implemented in DocumentService. Evidence: code review + unit test for malicious filename rejection.

7. **C-007 resolved and verified:** All Power Automate/Dataverse/BPF references removed from production code and plugin naming. Evidence: grep search returning zero matches for "PowerAutomate", "dataverse" (in plugin names), "BPF" in production TypeScript and JavaScript source files.

8. **GG-001 data retention policy documented:** Written data retention and erasure procedure signed off by the bank's DPO or legal team.

9. **GG-002 incident response runbook produced** and approved by the bank's IT operations team.

10. **GG-003 BMP sign-off obtained** from the bank's internal BMP configuration team.

11. **Azure region confirmed** as Qatar North or UAE North for all cloud resources, enforced by Azure Policy.

12. **QA re-run on affected components:** After C-001 through C-007 are remediated, TC-020, TC-044, TC-045, TC-046, TC-076, TC-082, TC-084, TC-085, TC-086, TC-087 must be re-executed and pass in staging.

Upon receipt of evidence for all twelve conditions above, this audit may be re-opened for final clearance sign-off.

---

*Audit Report v1.0 — Prepared by Maqsad AI Security & Governance Agent*
*Audit Date: 2026-05-09*
*Next Action: Remediation by Backend + CRM agents, followed by re-audit of blocker items, followed by CEO Phase 7 final decision.*
