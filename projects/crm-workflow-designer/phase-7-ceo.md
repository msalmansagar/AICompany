# CEO Final Decision — Phase 7
## CRM Visual Workflow Designer
**Project Code:** CWFD-001 + CWFD-002
**Reviewed By:** Maqsad AI — CEO Agent
**Date:** 2026-06-21
**Phase 5 (QA) Version Under Review:** 1.0
**Phase 6 (Audit) Version Under Review:** 1.0

---

## 1. Executive Summary

The CRM Visual Workflow Designer (CWFD-001) and its companion SOP Designer (CWFD-002) have completed the full seven-phase engagement cycle. The product delivers a genuinely capable visual design surface for QDB's BPM platform: a three-mode canvas (view, edit, simulation), FetchXML-resolved route labels, LR/TB layout switching, version snapshots, and two C# plugins registering new Dataverse entities. The core workflow creation, editing, and validation features are functionally complete and meet the primary business objectives approved at Phase 1.

However, the engagement reached Phase 7 carrying four critical security and governance defects that were identified by the auditor and subsequently fixed before this review. Because all four blockers are now resolved — the audit trail is wired, the deployment script is hardened, credentials are externalised, and service principals are separated — the product clears the minimum bar for controlled production deployment. Four additional non-blocking findings (OData injection sanitisation, `console.error` in the production bundle, delete-operation audit gaps, and a 1,060-line file violating the constitution's size limit) are real and must not be deferred indefinitely. They are surfaced here as time-bound go-live conditions.

The product is approved to proceed to production deployment subject to the conditions set out in Section 5. No condition may be waived. The security role verification (C-PH7-04) is the highest-risk remaining item before any end-user access is granted.

---

## 2. Phase Outcomes Review

### Phase 5 — QA

The QA phase produced 76 test cases spanning unit, component, integration, E2E (Playwright), performance, and security layers. Coverage targets were set at 100% branch coverage on `ValidationService.ts` and `workflowStore.ts` actions — appropriately aggressive for a data-integrity-critical service running inside a government bank's CRM.

Six defects were identified during test planning:

| ID | Severity | Finding | Status at Phase 7 |
|----|----------|---------|-------------------|
| D-001 | Medium | `TOO_MANY_OUTCOMES` threshold hardcoded at 5 in method body (Constitution Art. V) | FIXED — extracted to named constant |
| D-002 | Medium | `checkEndNodes` built reachability set from routes only, not outcomes — false MISSING_END warnings | FIXED — merged outcome.nextStepId into reachability set |
| D-003 | Medium | `checkOrphanSteps` same root cause as D-002 — false ORPHAN_STEP warnings | FIXED — same shared helper resolves both |
| D-004 | Low | `addStep` did not initialise `outcomeOrder` bucket for the new step — latent NPE risk | FIXED — defensive initialisation added |
| D-005 | HIGH | `RouteEdge` delete called `deleteElements` (React Flow only), bypassing store cascade — dangling CRM records not deleted on save | FIXED — store cascade now triggered correctly |
| D-006 | Low | Stale closure in auto-layout effect; hidden `eslint-disable` comment masking dependency gap | FIXED — ref-based guard added, comment replaced with explicit reasoning |

D-005 was the only release-blocking defect from the QA phase and it was correctly classified as HIGH. A route deleted via the UI would have remained in Dynamics 365 indefinitely, creating phantom routing records. The fix is confirmed.

One structural concern from QA carries forward: the manual FPS test (TC-070) requires a human operator running Chrome DevTools before every release candidate. This is documented as a required pre-release step and must be recorded in the release note. No automated substitute exists.

### Phase 6 — Audit

The audit returned a Conditional Pass. Four blockers were identified and resolved before Phase 7:

| Code | Severity | Finding | Status at Phase 7 |
|------|----------|---------|-------------------|
| C-01 | CRITICAL | `AuditService.writeAuditEntry()` was a complete no-op — `_auditLog` called via optional chain on an unimplemented method on `DataverseAdapter`. Every `SAVE_DRAFT` and `PUBLISH` event since deployment has produced zero audit records | FIXED — `logAuditEntry` added as required method on `ICrmAdapter`, implemented in `DataverseAdapter` |
| C-02 | HIGH | `deploy-cloud.js` deployed the web resource directly via Web API PATCH, bypassing solution ALM. No rollback path. Layer conflicts with future managed solutions | FIXED — script now blocks on `ENVIRONMENT=production`, enforces PAC CLI managed solution import for production |
| C-03 | HIGH | `ORG_URL`, `TENANT_ID`, `CLIENT_ID` hardcoded as constants in `vite.config.ts` and `deploy-cloud.js` | FIXED — externalised to `VITE_ORG_URL`, `VITE_TENANT_ID`, `VITE_CLIENT_ID`; startup fails fast if absent |
| C-04 | HIGH | Single shared service principal used for both dev proxy (read) and production deployment (write/publish) — compromise of dev credential granted full production Dataverse write access | FIXED — `AZURE_DEPLOY_*` vars now separate from `AZURE_CLIENT_*` dev proxy vars |

C-01 deserves special emphasis. An audit trail that silently no-ops is worse than no audit trail, because it creates a false confidence that change events are being recorded. For a government bank operating under change-management policy, this was an unconditional blocker. The fix is confirmed; however, the authoritative verification must be the integration test cited in go-live condition C-PH7-01 below.

The following non-blocking findings were accepted as post-release items with a 30-day target. They are not blocking because none enables immediate exploitation and all require either a co-resident malicious customisation or shared browser session as a precondition:

- SEC-03: OData filter injection via unsanitised `search` parameter in `getUsers()` and `getRoles()`
- SEC-04: Missing `assertGuid` validation before OData filter interpolation in `WorkflowDataService`
- SEC-05: Five unconditional `console.error` calls in production bundle (CRM schema metadata disclosure)
- GAP-07: Delete operations (step, outcome, route) not logged to `AuditService`

The BLOAT finding — `DataverseAdapter.ts` at 1,060 lines against an 800-line constitutional maximum — is a code quality debt item that must be addressed in the next maintenance cycle.

---

## 3. Business Value Assessment

Against the seven business objectives approved at Phase 1:

**BO-01 — Reduce workflow configuration time (70% target).** The three-mode canvas, drag-to-connect, inline step wizard, and navigator panel collectively reduce the manual steps a Process Manager must take to define a workflow from hours of CRM form navigation to a single-screen operation. The 70% reduction target is credible but remains unmeasured. The Phase 1 CEO constraint (SC-01) required a baseline measurement before launch — this remains an open action item for the client team.

**BO-02 — Eliminate configuration errors via validation.** The `ValidationService` enforces 17 named violation codes covering dead loops, orphaned steps, invalid assignments, missing FetchXML, missing fallback routes, duplicate sequences, and more. The publish gate is non-bypassable per CEO constraint C-CEO-01. D-002 and D-003 (fixed) would have produced false warnings undermining trust in the validator. With those fixes applied, the engine is sound.

**BO-03 — Enable non-technical users.** FetchXML route conditions are resolved to human-readable display names and option-set labels. The simulation mode allows Process Managers to walk through branching paths without reading XML. The LR canvas layout with word-wrapped labels is appropriate for a non-technical audience.

**BO-04 — Version control and audit trail.** `VersioningService` records a JSON snapshot at publish time. The `AuditService` now writes `SAVE_DRAFT` and `PUBLISH` events to Dataverse. However, the snapshot does not preserve assignment users, FetchXML filter content, or outcome-to-step routing — only step names and counts. A regulatory reviewer cannot reconstruct the full prior configuration from the snapshot alone. This is a known gap, accepted for v1, and must be addressed in v1.1.

**BO-05 — Single artifact for Online and On-Prem.** The dual-mode adapter pattern (`ICrmAdapter` / `DataverseAdapter` / `MockCrmAdapter`) is correctly designed. The web resource bundle deploys identically to both environments.

**BO-06 — Workflow reuse via cloning.** Deep-clone is implemented.

**BO-07 — Impact analysis.** The path enumerator and validation engine surface which steps are reachable and which create dead loops. Full impact analysis (which active cases are affected by a workflow change) was correctly scoped out of v1.

Overall business value assessment: the product delivers on five of seven objectives fully, partially delivers on BO-04 (audit trail is functional but snapshot is incomplete), and leaves BO-01 baseline measurement as a client responsibility. This is an acceptable v1 outcome.

---

## 4. Remaining Risks

The following risks exist at go-live and must be understood by QDB's CRM platform team before user access is granted. They are ranked by potential business impact.

**RISK-1 — Security role misconfiguration (HIGH impact, LOW likelihood)**
Application-layer ownership checks are deliberately absent — authorization is delegated to Dataverse row-level security. If the `qdb_` entity security roles are misconfigured and Write privilege is granted to the base CRM User role, any authenticated CRM user can overwrite any other user's process definitions. This is an operational risk, not a code defect, but the consequences for a government bank's loan workflow definitions are severe. Go-live condition C-PH7-04 addresses this directly.

**RISK-2 — OData filter injection via search parameter (MEDIUM impact, LOW likelihood)**
`getUsers()` and `getRoles()` interpolate raw search strings into OData `$filter` without sanitisation. Exploitation requires a co-resident malicious CRM customisation or XSS precondition. The impact is user enumeration (information disclosure), not data corruption or credential leakage. The 30-day remediation timeline is acceptable, provided the user-search path is not accessible from a public-facing form. Confirm this with the CRM platform team before go-live.

**RISK-3 — Incomplete audit snapshot (MEDIUM impact, MEDIUM likelihood)**
The version snapshot records step names and counts only. A breaking change (step removed, assignment changed, FetchXML filter modified) increments the version number but the snapshot does not preserve the prior state in enough detail for a regulatory change-management review. This is v1 accepted scope, but it must be elevated to the v1.1 backlog immediately. Do not allow this to drift past one release cycle.

**RISK-4 — Delete operations not audited (MEDIUM impact, LOW likelihood)**
Step, outcome, and route deletions are not logged via `AuditService`. If Dataverse native audit is enabled on the relevant entities (mandatory per go-live condition C-PH7-01), this gap is covered by the platform audit trail. However, the application-layer audit log will not show deletions, making forensic investigation slower.

**RISK-5 — `console.error` in production bundle (LOW impact, HIGH likelihood of firing)**
Five unconditional `console.error` calls will fire in the production bundle whenever an API error occurs. A CRM user with browser DevTools open will see OData error detail including entity logical names and HTTP status codes. This is a schema metadata disclosure, not a credential leak. The 30-day remediation is acceptable.

**RISK-6 — `DataverseAdapter.ts` at 1,060 lines (LOW impact, HIGH likelihood of causing maintenance pain)**
The file exceeds the 800-line constitutional maximum by 32%. It mixes entity CRUD, metadata resolution, SOP lifecycle, cloning, and role management. Every future change to any of these concerns requires navigating a 1,060-line file. This will slow maintenance work and increase the risk of regressions. Address in the next scheduled maintenance window.

---

## 5. Go-Live Conditions

The following conditions are mandatory before any end-user access is granted to the production CRM environment. They are binding on the delivery team and the client CRM platform team. Partial satisfaction does not constitute clearance. Each condition must be verified and signed off in the deployment runbook before go-live proceeds.

**C-PH7-01 — Confirm audit trail writes to Dataverse.**
Run the integration test confirming that a `SAVE_DRAFT` action produces at least one audit record in the Dataverse audit entity and that a `PUBLISH` action produces a second. Attach the test output to the deployment runbook. Additionally, confirm that Dataverse native audit is enabled for `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks`. The native Dataverse audit is the authoritative fallback if the application audit ever fails.

**C-PH7-02 — Confirm managed solution deployment in the target environment.**
Verify that the web resource appears in the managed solution layer in the production Dataverse environment and not in the unmanaged layer. Run `pac solution list` and confirm the solution is managed. Do not proceed if the web resource is unmanaged — rollback is impossible without this.

**C-PH7-03 — Confirm environment variables are set and no hardcoded fallbacks remain active.**
In the deployed production environment, confirm that `VITE_ORG_URL`, `VITE_TENANT_ID`, `VITE_CLIENT_ID`, `AZURE_DEPLOY_CLIENT_ID`, and `AZURE_DEPLOY_CLIENT_SECRET` are set from the CI/CD secrets store — not from any committed file or hardcoded constant. Run the build with env vars absent and confirm the startup fails fast with a clear error. This is the regression test for C-03.

**C-PH7-04 — Security role audit on the production org.**
Before granting any end-user access, a member of the QDB CRM platform team must review the security roles assigned to `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks`. Confirm that Write, Append, and AppendTo privileges on these entities are granted only to the designated Process Manager security role and are not present on the base CRM User role. Document the verified role matrix in the deployment runbook. This condition exists because the entire application authorization model depends on it.

**C-PH7-05 — TC-070 manual FPS test passed and recorded.**
The QA engineer must run the Chrome DevTools Performance panel test (TC-070) against the production-built bundle with 50 nodes on canvas and record that the slowest 200 ms window during a drag operation sustains at or above 30 FPS. The result (pass/fail and the measured FPS reading) must be recorded in the release note before go-live is signed off.

**C-PH7-06 — 30-day post-release remediation plan accepted by QDB.**
Before go-live, QDB's technical lead must acknowledge in writing the following four post-release items and accept the 30-day remediation target:
1. OData search string sanitisation in `getUsers()` and `getRoles()` (SEC-03)
2. `assertGuid` validation in `WorkflowDataService` (SEC-04)
3. Gate `console.error` calls behind `import.meta.env.DEV` (SEC-05 / GAP-06)
4. Delete-operation audit logging in `useWorkflowSave.ts` (GAP-07)

These are not blocking for go-live but they are binding commitments. If QDB does not accept the remediation plan, they must be promoted to go-live blockers.

---

## 6. Verdict

**Decision: APPROVED WITH CONDITIONS**

**Justification:**

CWFD-001 and CWFD-002 deliver the primary capability QDB requested: a visual, validation-gated workflow designer embedded in their Dynamics 365 CRM environment. The Phase 1 success criteria are met as follows:

- SC-01 (70% time reduction): Functionally plausible; baseline measurement remains a client action item.
- SC-02 (zero invalid published configurations): Met. The validation engine enforces 17 violation codes; the publish gate is non-bypassable.
- SC-03 (load time): NFR targets defined and testable via TC-068, TC-069, TC-071 in the automated suite.
- SC-04 (no data loss on save): D-005 (RouteEdge cascade bypass) was the highest-risk data-loss defect and is confirmed fixed.
- SC-05 (identical on Online and On-Prem): Met via the dual-mode adapter pattern.

The four critical audit blockers (C-01 through C-04) were identified and resolved before this review. The product does not ship with a broken audit trail, an unmanaged deployment path, hardcoded credentials, or an over-privileged shared service principal. These were serious defects and the fact that they were caught and fixed within the engagement is a credit to the audit process.

What prevents an unconditional approval is the residual risk profile: one of the six go-live conditions (C-PH7-04 — security role verification) depends on the client CRM platform team performing an action that is outside the delivery team's control. Until that verification is completed and documented, there is a non-trivial risk that Write access on workflow entities is broader than intended. For a government bank's loan workflow definitions, that risk is not acceptable to carry silently.

Approval is therefore conditional on all six conditions in Section 5 being satisfied and signed off in the deployment runbook before any end-user access is granted to the production environment.

---

## 7. Next Engagement Recommendations

The following engagements are the logical sequels to CWFD-001/002 and should be formally briefed to the BA in priority order:

**CWFD-003 — Audit Trail Completeness (Priority: High, start within 30 days)**
Extend `AuditService` to capture delete operations, include the full step state (assignment, FetchXML, outcome routing) in the `SAVE_DRAFT` payload, and upgrade the `VersioningService` snapshot to preserve the complete prior configuration at publish time. This directly addresses BO-04 (version control and audit trail) which was partially delivered in v1. Required for any regulatory change-management review.

**CWFD-004 — Impact Analysis Engine (Priority: Medium)**
The v1 product can identify dead loops and orphaned steps but cannot answer "which active loan cases are currently executing through this workflow step?" Before a Process Manager can safely modify a live workflow, they need to know how many in-flight cases will be affected. This was correctly scoped out of v1 but is the most frequently requested capability in enterprise BPM tools.

**CWFD-005 — Workflow Execution Runtime Integration (Priority: Medium)**
The designer currently models workflows visually but does not connect to a runtime execution engine. A formal integration layer between the designer and the QDB execution engine (or a Power Automate flow trigger) would close the loop between definition and runtime behaviour.

**CWFD-006 — `DataverseAdapter.ts` Refactor (Priority: Low, next maintenance window)**
Split the 1,060-line file into `WorkflowCrudAdapter`, `SopCrudAdapter`, and `MetadataAdapter`. This is a code quality obligation under the Maqsad AI constitution and should not be deferred beyond the next scheduled maintenance window.

**CWFD-007 — PCF Control Wrapper (Priority: Low, if QDB requests embedded deployment)**
If QDB requires the designer to be embedded directly in a model-driven app form rather than launched as a standalone web resource, a PCF control wrapper will be required. This was correctly scoped out of v1 and should only be initiated if QDB formally requests it.

---

*CEO Review Complete — CWFD-001 / CWFD-002 | 2026-06-21*
*Decision: APPROVED WITH CONDITIONS*
*Six go-live conditions must be satisfied before production deployment is authorised.*
