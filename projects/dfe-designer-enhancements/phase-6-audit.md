# DFE-ENH-001 — Phase 6: Security, Compliance, and Governance Audit
**Engagement ID:** DFE-ENH-001 — Dynamic Form Engine Designer Enhancement Backlog (Phase 1)
**Prepared by:** Maqsad AI — Auditor
**Date:** 2026-07-11
**Client:** QDB (Qatar Development Bank) — public-sector, regulated
**Scope:** Phase 1 implementation across 8 workstreams; integration branch `feat/dfe-enh-save-integration` @ `0c2fddf`; per-workstream branch heads A (`cc3a26f`), E (`1a25703c`), D (`ed5e7b9`).
**Input artifacts:** `phase-1-ceo.md`, `phase-2-ba.md`, `phase-3-arch.md`, `phase-3-ceo-checkpoint.md`, `conditions-log.md`, `dependencies.md`, `phase-5-qa.md`; code read via `git show` on integration branch and per-workstream branches.
**Audit verdict:** APPROVE WITH CONDITIONS (6 hard blockers, 4 production conditions)

---

## Correction Notice — Branch Evidence

Three findings in this audit's initial draft were drawn from the per-workstream branches (A, E, D) where wiring tasks were legitimately out of scope. The integration branch `feat/dfe-enh-save-integration` @ `0c2fddf` contains the merged, wired state. This final document reflects the integration branch as the ground truth.

Evidence confirmed via `git show 0c2fddf:...DesignerScreen.tsx` and `git show feat/dfe-enh-dnd:...IndexBasedKeyboardSensor.ts`:

| Initial Finding | Corrected Status | Evidence |
|---|---|---|
| SEC-01 / GG-03 — WriteQueue not wired (OI-005) | CLEARED | `import { WriteQueue }` (line 26); `useRef<WriteQueue>(new WriteQueue())` (line 117); `writeQueueRef.current.schedule(...)` (line 219); `writeQueueRef.current.flush()` before publish (line 439); `setConflictState({...})` in onError (line 232). |
| GG-02 — E4 audit wiring not built | CLEARED | `writeAuditEntriesNonBlocking(...)` called at line 179 after a successful save; `AuditBatchWriter.writeEntries` uses `Promise.allSettled` (confirmed line 37 of `AuditBatchWriter.ts`). |
| GG-10 — Alt+Shift+Up/Down not implemented | CLEARED | `if (event.shiftKey)` guard at line 56; `moveFieldToAdjacentSection(context, direction)` called at line 59; method defined at line 106 of `IndexBasedKeyboardSensor.ts`. |

The valid findings from the original audit — SEC-02 through SEC-07, GG-05 through GG-09, and all Phase 2 residual risks — are retained unchanged.

---

## Executive Risk Summary

Phase 1 of DFE-ENH-001 delivers well-integrated controls for concurrent-edit safety (FR-001/FR-002), design-time linting (FR-003), validation rule extensions (FR-006/FR-007), keyboard accessibility (FR-009), a field-level append-only audit log (ENT-005), and a WCAG toolchain (ENT-008). On the integration branch, the marquee wiring tasks are complete: the WriteQueue routes all saves through etag/If-Match conditional PATCHes; audit entries are written non-blocking after each successful flush; and Alt+Shift+Up/Down cross-section keyboard moves are implemented. The technology choices (immer patches, Pre-Validation plugin, `@tanstack/react-virtual`, microdiff, axe-core MPL-2.0 dev-only) are all architecturally defensible.

The three most significant compliance-grade findings — all real and confirmed in code — are:

**1. Audit writes are non-blocking with silent failure swallowing.** `AuditBatchWriter.writeSingleEntry()` catches all Dataverse write errors, issues a `console.error`, and returns normally. There is no retry, no dead-letter queue, and no server-side alert. The method's own JSDoc describes this as intentional fire-and-forget. For an append-only compliance log required under PDPPL audit policy, this creates undetectable silent gaps in the evidence chain.

**2. Audit capture is exclusively client-side.** The immer patch capture fires only at the DFE designer's save boundary. Changes made by Dataverse administrators, Power Automate flows, or any other API client produce no entries in `qdb_dfe_audit_log`. A compliance examiner cannot distinguish "no changes made" from "changes made outside the designer."

**3. Data residency is unresolved.** The org is `org5869857f.crm4.dynamics.com` (Azure Europe). For a Qatar public-sector bank subject to PDPPL, storing user-identifying audit records in a European Azure region may not satisfy Qatar data sovereignty requirements. QDB Legal has not formally assessed this. Phase 1 adds `changedBy`/`changedOn` to audit records, heightening the PDPPL relevance of a gap that predates this engagement.

The six remaining hard blockers are: verifying `If-Match` in the UCI iframe context, obtaining QDB IT Director's written immutability acknowledgment, executing the Layer 1 WCAG scan, documenting the STYLE-001 coordination path, completing the data residency assessment, and executing all 16 live-org provisioning gates. These are validation, governance, and legal items — not build items.

Residual Phase 2 risks (ENT-002 per-form RBAC, ENT-001 maker-checker, ENT-003 PII classification) are tracked and accepted as deferred. They represent the current platform posture and are not regressions introduced by Phase 1.

---

## Security Risk Register

### SEC-01 — WriteQueue Wiring (OI-005)
**Status: CLEARED on integration branch `0c2fddf`.**
`DesignerScreen.tsx` imports `WriteQueue` (line 26), instantiates one per form session (line 117), routes all saves through `.schedule()` (line 219), flushes before publish (line 439), and dispatches `setConflictState` on 412 errors (line 232). The etag/If-Match concurrency protection is wired end-to-end on the integration branch.

---

### SEC-02 — `Xrm.WebApi.online.execute()` + `If-Match` Unverified in UCI Context (OI-001)
**Description:** The `CrmWebApiAdapter.updateRecordConditional` sends the etag via `Xrm.WebApi.online.execute()` with the etag in the entity body. This pattern is not documented in the Dynamics 365 v9.2 SDK reference. It has been tested against `RestWebApiAdapter` (the dev-server adapter) but not against a live UCI iframe session using the `CrmWebApiAdapter` path. If Dataverse's UCI implementation of `Xrm.WebApi.online` silently ignores the etag header, the 412 conflict path is never triggered, the `ConflictResolutionDialog` never appears, and data-loss-prevention silently fails in production CRM deployment.
**Likelihood:** Medium
**Impact:** High (FR-001 silently non-functional in production CRM; last-write-wins data loss occurs without user awareness)
**Mitigation:** Execute LO-012 (live-org gate): from a UCI iframe context on org5869857f, force a stale etag on a `qdb_form_definition` record and confirm a 412 response. If `Xrm.WebApi.online` does not honor the etag, implement the pre-check fallback (GET `modifiedon`, compare before PATCH, throw `ConcurrencyConflictError` if stale).
**Residual risk after mitigation:** Low — etag/If-Match is already confirmed at the Dataverse platform level (C-002 cleared); the open question is the `Xrm.WebApi.online` call path specifically.
**Confidence: 90%**

---

### SEC-03 — Audit Writes Non-Blocking with Silent Failure Swallowing
**Description:** `AuditBatchWriter.writeSingleEntry()` (confirmed in `designer/src/services/audit/AuditBatchWriter.ts`) wraps every `this.webApi.createRecord(...)` call in a try/catch that swallows the error with `console.error`. `writeEntries()` uses `Promise.allSettled` so a batch of 10 entries may silently succeed on 3 and silently fail on 7. The method's JSDoc explicitly states: "fire-and-forget async operation from the save pipeline's perspective." There is no retry, no dead-letter queue, no server-side counter of missed entries, and no user-visible notification when entries are not written. A failed audit write is observable only in browser developer tools.

For an append-only compliance log mandated under PDPPL and QDB's internal audit policy, silent gaps in the evidence chain are not an acceptable reliability posture. A compliance examiner has no mechanism to detect that a period of "no audit records" corresponds to missed writes rather than no changes.
**Likelihood:** Low-Medium under normal operations; elevates during org throttling events, network interruptions, or deployment windows
**Impact:** High (undetectable compliance audit trail gaps; regulatory examination may be inconclusive)
**Mitigation:** Replace the silent swallow with a structured session-level fallback: (a) on write failure, append the failed entry to a `sessionAuditFailures` array in the Zustand store; (b) on the next successful save flush, retry failed entries before new ones; (c) on form close, if `sessionAuditFailures` is non-empty, surface a non-blocking banner: "Some audit entries could not be written during this session. Contact your Dataverse administrator."; (d) include a count of session audit failures in the compliance report query range if the entity is ever extended to track them server-side. A full DLQ is not feasible in a client-side-only architecture; surfacing the failure is the minimum acceptable bar.
**Residual risk after mitigation:** Medium. The root cause (client-side write with no server-side guarantee) remains. See SEC-04 for the complementary native Dataverse auditing recommendation.
**Confidence: 98%**

---

### SEC-04 — Audit Capture is Client-Side Only; Direct Dataverse Writes Unaudited
**Description:** The ENT-005 audit capture mechanism is immer `produceWithPatches()` called at the DFE designer's save boundary in `DesignerScreen.tsx`. Changes made by: (a) Dataverse system administrators via the Power Platform admin portal; (b) Power Automate flows writing to `qdb_*` entities; (c) other custom C# plugins or API clients; or (d) bulk migration / ALM import operations — produce no entries in `qdb_dfe_audit_log`. The immutability plugin correctly blocks deletion of existing records, but it does not capture the change source. A compliance examiner cannot distinguish "form was unchanged" from "form was changed by a Dataverse admin and not recorded in ENT-005."
**Likelihood:** Low in normal operations (most changes flow through the designer); elevated during deployments, migrations, and admin remediation activities
**Impact:** High (the audit trail's evidential completeness cannot be asserted; the gap is structurally undetectable without a parallel audit stream)
**Mitigation — short-term (required before Phase 1 production deployment):** Formally document the audit scope limitation in the ENT-005 acceptance criteria and QDB compliance acknowledgment: "The DFE field-level audit log (qdb_dfe_audit_log) captures changes made via the DFE designer web resource only. Changes made directly in Dataverse, via Power Automate, or via any other client are not captured in this log." QDB Compliance Officer must acknowledge this scope in writing.
**Mitigation — recommended (medium-term):** Enable Dataverse native field-level auditing (`IsAuditEnabled = true`) on `qdb_form_definition` and related DFE entities as a parallel audit stream. The combined (ENT-005 designer audit + native Dataverse audit) provides complete coverage including admin-bypass scenarios. Native auditing requires QDB IT to enable it at the org level and on each entity; it incurs storage cost but does not require code changes.
**Residual risk after mitigation:** Medium — scope limitation acknowledged; native auditing closes the technical gap but introduces its own administrative overhead.
**Confidence: 95%**

---

### SEC-05 — SESSION_ID Not Populated in Audit Records (Confirmed TODO in Code)
**Description:** `AuditBatchWriter.ts` contains a confirmed TODO comment: `// TODO(DFE-ENH-001): populate qdb_session_id once the EditLock session identifier is surfaced from the concurrency layer.` The `qdb_session_id` column is provisioned in the entity schema and the `qdb_dfe_edit_lock` entity maintains a `qdb_session_id` (UUID generated client-side) per editor session. The two are not connected in `writeAuditEntriesNonBlocking`. All audit records have a null session identifier. A compliance investigation cannot correlate which save operations belong to the same editing session, making it impossible to reconstruct the sequence of changes within a user's work session.
**Likelihood:** High (the gap exists in all current audit records)
**Impact:** Medium (degrades audit fidelity and forensic usability; does not prevent individual change records from existing)
**Mitigation:** Surface the EditLock session UUID from the `concurrencyStore` (where the lock record's `qdb_session_id` is already held) into the `AuditMetadata` struct passed to `writeAuditEntriesNonBlocking`. This is a 1-day wiring task. The TODO already identifies the correct source.
**Residual risk after mitigation:** Low
**Confidence: 99%**

---

### SEC-06 — DATAVERSE_URL Hardcoded in Provisioning Script
**Description:** `provision-dfe-audit-log.mjs` hardcodes `const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com'` as a module-level constant. If an operator updates `scripts/.env` with test or production credentials but does not also edit the source file, the script provisions the audit entity against the development org. The `provision-edit-lock.js` script on the A branch should be inspected for the same pattern. This violates the "no hardcoded environment URLs" requirement in the Maqsad AI clean code constitution.
**Likelihood:** Low (script must be consciously executed by a CRM Admin with .env credentials)
**Impact:** Medium (accidental provisioning against wrong org; entity schema changes applied to the wrong environment; potential data-geo mismatch)
**Mitigation:** Extract `DATAVERSE_URL` to a `DV_BASE_URL` environment variable using the same `requireEnv()` helper already present in the script. Update `scripts/.env.example` to document `DV_BASE_URL`. Audit `provision-edit-lock.js` for the same pattern.
**Residual risk after mitigation:** Low
**Confidence: 90%**

---

### SEC-07 — Absence of Per-Form RBAC (ENT-002 Deferred to Phase 2)
**Description:** Any Dataverse user holding the "DFE Designer" security role can edit any form and publish it directly to the live render cache. There is no per-form ownership, no field-level edit restriction, and no second-party approval gate (ENT-001 is also Phase 2). This is the pre-Phase-1 production posture — not a Phase 1 regression.
**Likelihood:** High (condition exists today in production)
**Impact:** High (any designer can publish any form, bypassing QDB's change management process; the PDPPL control chain has a gap until Phase 2 ships)
**Mitigation:** Phase 2 ENT-001 (maker-checker) and ENT-002 (per-form RBAC) close this gap. The risk is accepted and residual until Phase 2 go-live.
**Residual risk after mitigation:** Low (after Phase 2 delivery)
**Confidence: 92%**

---

## OWASP Top 10 Assessment

| # | Category | Applicable? | How Addressed | Gap |
|---|---|---|---|---|
| A01 — Broken Access Control | Yes | Dataverse org-level security roles control designer access. Audit entity has CREATE+READ only for custom roles; Update/Delete blocked by Pre-Validation plugin for all roles including System Administrator. | Per-form granularity absent (ENT-002 Phase 2). Any DFE Designer user can edit and publish any form. |
| A02 — Cryptographic Failures | Partial | All Dataverse communication over TLS. Service-principal credentials in `.env` file (not in source). No custom crypto in new code. | None significant. |
| A03 — Injection | Yes | `ExpressionEngine` is a pure recursive-descent evaluator with no `eval()`, confirmed in architecture. Provisioning scripts use Dataverse Web API with structured JSON bodies. All `FormSaveService` writes use typed API calls. | No injection risk identified. |
| A04 — Insecure Design | Yes | Client-side audit capture is a design choice. Fire-and-forget audit writes are an explicit design decision per `AuditBatchWriter` JSDoc. | SEC-03 and SEC-04 — best-effort audit delivery and client-scope limitation are real compliance-grade design gaps. |
| A05 — Security Misconfiguration | Yes | `DATAVERSE_URL` hardcoded in provisioning script (SEC-06). axe-core `rollupOptions.external` exclusion recommended in ADR-004 but implementation not confirmed in Vite config. | SEC-06 must be fixed. axe-core bundle exclusion should be verified before any production build. |
| A06 — Vulnerable and Outdated Components | Low | All actively maintained libraries: `@tanstack/react-virtual` July 2026, `immer` July 2026. `microdiff` last commit December 2024 — feature-complete at <1 KB with zero dependencies; low risk. | Pin `microdiff` to v1.5.x with a re-evaluation note if a security advisory is issued. |
| A07 — Identification and Authentication Failures | Low | Auth delegated entirely to Dataverse / Azure AD. Service-principal credentials via env vars. Edit-lock session IDs are UUID-generated client-side — appropriate for soft-lock presence signaling. | None. |
| A08 — Software and Data Integrity Failures | Yes | `AuditImmutabilityPlugin` (Pre-Validation, all roles including SysAdmin) is the primary integrity control. The etag/If-Match pattern enforces write integrity at the form-definition level. | Audit write failures are not detected server-side (SEC-03). |
| A09 — Security Logging and Monitoring Failures | Yes | Audit write failures are caught and written to `console.error` (browser dev tools only). No server-side audit of write failures. No alerting, no retry, no DLQ. | SEC-03. Silent audit trail gaps are the most significant operational security concern in this delivery. |
| A10 — Server-Side Request Forgery | Not applicable | The designer is a React 18 SPA making API calls directly from the browser to Dataverse. No server-side proxy. | None. |

---

## Compliance Assessment

### Qatar PDPPL (Personal Data Protection and Privacy Law)

| Requirement | How Design Meets It | Gap | Remediation |
|---|---|---|---|
| Audit and accountability | ENT-005 append-only audit log with Pre-Validation immutability plugin. Field-level before/after JSON values. User ID (`changedBy`) and timestamp (`changedOn`) on every record. | Audit writes are best-effort (SEC-03); scope is designer-only (SEC-04). | See SEC-03 and SEC-04 mitigations. Formal scope acknowledgment required. |
| Data residency | Unresolved. See Data Residency Review section. | Data stored in Azure Europe (crm4). Qatar PDPPL cross-border transfer analysis not completed. | QDB Legal formal assessment required before production deployment. |
| PII classification | Not addressed in Phase 1 (ENT-003 is Phase 2). | No formal record of which form fields collect personal data. | ENT-003 (Phase 2) provides field-level PII metadata. PDPPL compliance is a Phase 2 gate. |
| Retention | Not addressed in Phase 1. | No retention policy applied to audit records. | ENT-003 (Phase 2) + ENT-006 DR strategy (Phase 3). |

### Qatar E-Government Accessibility Standards (WCAG 2.1 AA)

| Requirement | Status | Gap | Remediation |
|---|---|---|---|
| Zero WCAG 2.1 AA violations on axe-core scan | Layer 2 (jsdom, structural/ARIA only): 0 violations. Layer 1 (real Chromium + CSS): NOT RUN. | CSS-dependent rules (contrast WCAG 1.4.3, non-text contrast WCAG 1.4.11, focus-visible WCAG 2.4.7) are silently skipped in jsdom. Known Fluent UI v9 edge cases: placeholder text, helper text, disabled state foreground colors. | Execute Layer 1 scan per CC-002. |
| Manual keyboard walkthrough | NOT done. Checklist created and documented. | All authoring actions must be verified as reachable by keyboard only. | Execute manual walkthrough per `a11y-manual-checklist.md`. |
| Screen reader (NVDA + VoiceOver) | NOT done. | Required for Qatar E-Government Standards sign-off. | Execute NVDA (Windows) + VoiceOver (macOS) walkthrough; RTL Arabic form coverage required. |
| QDB Accessibility Officer sign-off | NOT obtained. Named officer designated (C-001 cleared). | Formal compliance report not produced. Sign-off requires Layer 1 + manual walkthrough results. | Produce compliance report after Layer 1 scan; obtain officer co-signature. |

WCAG compliance status is PENDING — the structural design is correct (alertdialog, focus traps, aria-live regions for drag announcements and conflict detection, RTL support) but the Layer 1 CSS-aware verification has not run. The regulatory obligation is not yet demonstrably met.

### Dataverse Audit Log Immutability (ENT-005 / Internal Audit Policy)

| Requirement | How Design Meets It | Gap | Remediation |
|---|---|---|---|
| Append-only — no UPDATE | Pre-Validation C# plugin unconditionally throws `InvalidPluginExecutionException` on Update for all roles including System Administrator. Defense-in-depth: custom roles have no Update privilege at the security-role layer. | Plugin not yet registered in any org (LO-004 not executed). | Execute LO-004 and LO-005/LO-007 (verify Update blocked for all roles including SysAdmin). |
| Append-only — no DELETE | Same plugin blocks Delete unconditionally. | Same — not registered. | Same. |
| Audit write reliability | Best-effort only — `Promise.allSettled` + `console.error` on failure. | Silent gaps possible (SEC-03). | Add session-level failure buffer and user notification per SEC-03 mitigation. |
| Complete change history | Covers designer save operations only. | Admin-bypass writes not captured (SEC-04). | Formal scope acknowledgment + native Dataverse auditing recommendation. |
| QDB IT Director immutability acknowledgment (CC-005) | Required before any shared-environment deployment. | ACK-E-001 through ACK-E-005 not recorded. No written acknowledgment on file. | QDB IT Director and all Dataverse admins sign off in writing before Phase 1 leaves the development org. |

### License Compliance

| Package | License | Assessment | Status |
|---|---|---|---|
| axe-core / @axe-core/playwright | MPL-2.0 | Dev/test-only. Never bundled. ADR-004 accepted. MPL-2.0 copyleft obligations do not attach when the package is not shipped and its source is not modified. | Compliant contingent on `devDependencies` placement and `rollupOptions.external` exclusion in Vite config — confirm implementation. |
| vitest-axe | MIT | Permissive. Dev/test-only. | Compliant. |
| microdiff | MIT | Permissive. Ships in designer bundle. | Compliant. |
| @tanstack/react-virtual | MIT | Permissive. Ships in designer bundle. | Compliant. |
| immer (incumbent) | MIT | Permissive. Ships in designer bundle. | Compliant. |
| dnd-kit (incumbent) | MIT | Permissive. Ships in designer bundle. | Compliant. |

No GPL libraries present. No copyleft obligation on any shipped artifact. The sole license flag (axe-core MPL-2.0) is correctly managed per ADR-004. One open action: verify that `axe-core` and `@axe-core/playwright` appear in `rollupOptions.external` in the Vite build config — ADR-004 recommends this as defense-in-depth, but implementation was not confirmed during this audit.

---

## Data Residency Review

**Physical location of data:** `org5869857f.crm4.dynamics.com` — CRM4 maps to the Azure Europe geography (West Europe: Netherlands; North Europe: Ireland). All DFE form definitions, field records, validation rules, business rules, submission mappings, audit log records (including `changedBy` user IDs and `changedOn` timestamps), and edit-lock presence records are stored in this geography.

**Qatar regulatory context:** QDB is a Qatar Development Bank operating under Qatar's legislative framework including the PDPPL. Qatar's PDPPL imposes requirements on cross-border transfer of personal data and may require that certain categories of data pertaining to Qatari residents or operations be processed within Qatar or in jurisdictions with adequate data-protection equivalence. The PDPPL does not automatically prohibit European storage, but the transfer must be covered by either an adequacy finding, a contractual arrangement, or explicit consent at the appropriate governance level.

**Phase 1 audit log relevance:** The `qdb_dfe_audit_log` entity introduced in Phase 1 stores `changedBy` (Dataverse user GUID — which maps to a natural person, a QDB employee) and `changedOn` (UTC timestamp). This is user-identifying operational data. Its presence in an Azure Europe data centre strengthens the PDPPL cross-border transfer relevance.

**Assessment:** This is an open, unresolved risk. It predates DFE-ENH-001 (the base Dataverse org was already on crm4 before this engagement). Phase 1 does not worsen the underlying geo assignment but does add a compliance-relevant data class to the environment.

**Required actions before Phase 1 production deployment:**
1. QDB Legal and QDB IT Director must formally assess whether crm4 (Azure Europe) satisfies QDB's data residency requirements and PDPPL obligations for form administration data — specifically the user-identifying audit log records.
2. If the assessment identifies a gap: options include (a) migrating the org to Azure UAE North (crm8), which is Microsoft's designated region for the Gulf Cooperation Council; (b) relying on Microsoft's DPA and standard contractual clauses as the legal transfer mechanism (Microsoft provides these for Azure/Dataverse under its Enterprise Agreement); or (c) formally accepting the residency risk at the appropriate QDB board-level governance decision.
3. This assessment and its documented conclusion must be filed with engagement artifacts before Phase 1 is deployed to any production or production-adjacent Dataverse environment.

**Confidence: 85%** (crm4 = Azure Europe is based on Microsoft's published geography mapping; sub-region assignment should be confirmed in the Dataverse admin portal under Settings > Data Management > Data Location).

---

## Audit Trail Validation

### Sufficiency for regulatory examination

Partial pass. The design is correct for a compliance audit log:
- Append-only entity with Pre-Validation plugin blocking Update and Delete for all roles including System Administrator.
- Field-level granularity: one audit row per changed property path, with JSON Pointer path.
- Before/after JSON values for every change (null for CREATE / DELETE respectively).
- `changedBy` (Dataverse user GUID), `changedOn` (UTC ISO-8601), `formId`, `eventType`, `action`.
- Compound indexes for compliance report queries (form + date range; user + date range).
- Compliance report export: filtered table + CSV download, max 1000 entries per 10-second export.

Material open items:
1. `qdb_session_id` is null on all current records — session-level correlation is absent (SEC-05).
2. Audit writes are best-effort — a write failure produces a silent gap (SEC-03).
3. Scope is designer-only — admin-bypass changes are not captured (SEC-04).
4. Immutability plugin is not yet registered in any org (LO-004 outstanding).

### Can every state transition be reconstructed?

Yes, within the designer's scope. Once the plugin is registered and the live-org gates are executed, every designer save operation that succeeds will produce one or more audit entries covering every changed property path. The `FormDiffService` / `microdiff` layer provides human-readable diff summaries for the compliance report UI. The `before` and `after` values are full JSON for complex properties (validation rules, mapping config), satisfying the BRD's field-level change history requirement.

State transitions made outside the designer are not reconstructable from ENT-005 alone (SEC-04).

### Is the log tamper-proof and append-only?

Yes, by design, once the plugin is registered. The Pre-Validation stage fires before Dataverse evaluates security roles, before database locks are acquired, and before any Pre-Operation plugins. This means the block applies unconditionally to the calling context, including System Administrator. The combination of plugin enforcement (execution layer) and security role configuration (no Update/Delete privilege on any custom role) provides defense-in-depth that was reviewed and commended at the CEO Architecture Checkpoint.

---

## Service Account Review

| Identity | Access Scope | Least-Privilege Assessment | Finding |
|---|---|---|---|
| SP profile `numbar-sp` | Used for `pac` CLI operations and provisioning scripts against org5869857f. | Exact scope not specified in audit inputs. Should be limited to the `DynamicFormEngine` solution. | FLAG: Confirm `numbar-sp` does not hold System Administrator or global customizer rights. Scope should be the minimum required for solution deployment (System Customizer or a scoped solution-management role). |
| DFE Designer security role (end-users) | CREATE/READ/WRITE on form entities; CREATE/READ only on `qdb_dfe_audit_log`; CREATE/READ/WRITE/DELETE on `qdb_dfe_edit_lock`. No Update/Delete on audit entity. | Correctly scoped per architecture. | PASS |
| System Administrator (Dataverse) | Full table-level privileges — blocked at plugin execution level for audit log Update/Delete. SysAdmin cannot tamper with individual audit records but retains entity schema management rights. | Intentional and correct per CEO-approved design. | PASS — by design. |
| Power Automate cleanup flow identity | Should hold scoped rights to query and delete `qdb_dfe_edit_lock` records older than 24 hours. | Cleanup flow not yet deployed (CC-006 open). | GATE: When CC-006 is executed, verify the flow identity has rights scoped to `qdb_dfe_edit_lock` only, not to broader DFE entities or System Administrator. |

---

## Governance Gaps

Ranked by risk if unaddressed. Items marked [BLOCKS SHARED-ENV DEPLOYMENT] must be resolved before Phase 1 moves to any non-development environment.

### GG-01 — CC-005: Immutability Acknowledgment Not Obtained [BLOCKS SHARED-ENV DEPLOYMENT]
**Gap:** The CEO Architecture Checkpoint (CC-005) requires written acknowledgment from QDB IT Director and Dataverse administrators that `qdb_dfe_audit_log` is permanently immutable — no admin bypass, no emergency deletion mechanism. ACK-E-001 through ACK-E-005 have not been recorded in `conditions-log.md` or any engagement artifact.
**Risk if unaddressed:** Phase 1 may be deployed to shared environments without decision-makers understanding that the immutability is absolute. Discovering the constraint post-production deployment forces a full entity redesign to recover.
**Remediation:** QDB IT Director and all Dataverse admins sign the acknowledgment (email or formal sign-off document) before Phase 1 is deployed outside the development org. Filed in engagement artifacts.

### GG-02 — E4 Audit Wiring
**Status: CLEARED on integration branch `0c2fddf`.** `writeAuditEntriesNonBlocking()` is called at `DesignerScreen.tsx` line 179 after each successful save flush. `AuditBatchWriter.writeEntries()` confirmed implemented with `Promise.allSettled`. The functional gap noted in the QA report (from per-workstream branch A) is resolved on the integration branch.

### GG-03 — WriteQueue Wiring (OI-005)
**Status: CLEARED on integration branch `0c2fddf`.** See correction notice at document header. Wiring confirmed at lines 26, 117, 219, 232, and 439 of `DesignerScreen.tsx`.

### GG-04 — OI-001: `If-Match` Pattern Unverified in UCI Iframe [BLOCKS SHARED-ENV DEPLOYMENT]
**Gap:** The WriteQueue correctly sends `If-Match: <etag>` via `CrmWebApiAdapter`, but this adapter's use of `Xrm.WebApi.online.execute()` for conditional PATCH is unverified against a live UCI session. The fallback `RestWebApiAdapter` (dev server) is confirmed; the production path is not.
**Risk if unaddressed:** FR-001 (optimistic concurrency) silently non-functional in production CRM deployment.
**Remediation:** Execute LO-012 before shared-environment deployment.

### GG-05 — CC-002: Layer 1 WCAG Scan Not Run [BLOCKS WCAG CERTIFICATION]
**Gap:** The mandatory Layer 1 (`@axe-core/playwright` in real Chromium) WCAG scan has not been executed. The Layer 2 jsdom scan (0 violations) does not evaluate CSS-dependent rules and does not satisfy CC-002.
**Risk if unaddressed:** Unknown violation count. Qatar E-Government Accessibility Standards obligation is unmet. F5 spend gate cannot be evaluated. QDB Accessibility Officer cannot sign off.
**Remediation:** Execute Layer 1 scan. If 20 violations or fewer: F5 remediation proceeds within contingency. If more than 20: suspend F5 and notify CEO per CC-002 ruling.

### GG-06 — CC-001: STYLE-001 Coordination Path Not Documented
**Gap:** The CEO required documentation of Path A (joint merge date with STYLE-001 team) or Path B (follow-on PR with 15-day deadline) for Workstream D. Engagement lead has not recorded this in `conditions-log.md`.
**Risk if unaddressed:** Workstream D cannot merge to `main` until STYLE-001 merges. Without a documented path, there is no enforceable deadline for FR-009's integration into the primary delivery.
**Remediation:** Engagement lead documents Path A or Path B in `conditions-log.md`.

### GG-07 — Data Residency: Azure Europe vs. Qatar PDPPL Requirements [BLOCKS PRODUCTION DEPLOYMENT]
**Gap:** QDB Legal and IT Director have not formally assessed whether crm4 (Azure Europe) satisfies QDB's data residency requirements and PDPPL obligations for form administration data, specifically the user-identifying audit records introduced in Phase 1.
**Risk if unaddressed:** Regulatory exposure under PDPPL if audit records containing Qatari employee user IDs and timestamps are stored in a jurisdiction without adequate data-protection equivalence or an explicit transfer mechanism.
**Remediation:** QDB Legal formal assessment before production deployment. Documentation of conclusion filed with engagement artifacts. If a gap is identified: migrate org to crm8 (Azure UAE North), rely on Microsoft standard contractual clauses under the Enterprise Agreement, or accept risk at the appropriate QDB governance level.

### GG-08 — SESSION_ID Not Populated in Audit Records
**Gap:** `AuditBatchWriter.ts` contains a confirmed TODO. Session-level correlation of audit records is absent.
**Risk if unaddressed:** Compliance investigators cannot reconstruct a user's sequence of changes within a single editing session. Audit fidelity is reduced.
**Remediation:** Wire EditLock session UUID from `concurrencyStore` into `AuditMetadata` before Phase 1 audit log is relied upon for compliance reporting.

### GG-09 — Live-Org Validation Gates LO-001 to LO-016 Not Executed
**Gap:** No live-org validations have been run against org5869857f. New entities not provisioned, plugin not registered, security roles not updated, cleanup flow not deployed, picklist values not added.
**Risk if unaddressed:** Phase 1 features cannot function in any environment until provisioning is complete. The immutability plugin (LO-004 through LO-007) is the most critical gate.
**Remediation:** Execute all 16 LO gates per QA phase-5 Section 7, in sequence, by a CRM Admin with appropriate Dataverse credentials. LO-004/LO-005/LO-006/LO-007 (plugin registration + verify block) must be treated as the highest-priority gate.

### GG-10 — Alt+Shift+Up/Down Keyboard Navigation (FR-009)
**Status: CLEARED on `feat/dfe-enh-dnd` branch (`ed5e7b9`).** `if (event.shiftKey)` guard at line 56; `moveFieldToAdjacentSection()` called at line 59 and defined at line 106 of `IndexBasedKeyboardSensor.ts`. The Must Have BRD acceptance criterion is implemented.

---

## Residual Risks Carried into Phase 2

| Risk | Impact if Phase 2 Delayed | Phase 2 Requirement |
|---|---|---|
| No per-form RBAC (ENT-002) | Any DFE Designer can edit any form and publish directly to live cache. Cross-team form modification is unrestricted. | ENT-002 — Designer-Side RBAC (Must Have) |
| No maker-checker approval gate (ENT-001) | Direct publish to live cache without second-party review. No enforcement mechanism for QDB's change-management process. | ENT-001 — Maker-Checker Approval Workflow (Must Have) |
| No PII classification metadata (ENT-003) | PDPPL field-level compliance metadata (PII category, sensitivity level, retention period, consent flag) does not exist. Downstream data masking, access control, and audit filtering cannot reference PII metadata. | ENT-003 — Field-Level PII Classification (Should Have) |
| Maker-checker deadlock risk (C-006 / OQ-003) | If QDB does not name at least two Form Approvers per form group before Phase 2 go-live, ENT-001 self-approval prohibition cannot function. | C-006: QDB Compliance Officer provides named Form Approvers and escalation rule in writing before Phase 2 go-live. |
| L013 lint rule dormant | Pre-wired PII/sensitivity mismatch linting rule (L013) has no effect until ENT-003 adds PII metadata fields to form definitions. | Activates automatically when ENT-003 ships. No action needed until Phase 2. |
| Phase 2 BRD conditions not yet cleared | C-004 (QDB Legal retention defaults), C-005 (XLIFF 2.0 vendor acceptance) remain open. | Must clear before Phase 2 build authorization per CEO conditions. |

No Phase 2 residual risks are regressions from Phase 1. Phase 1 does not worsen the current production security posture. Deploying Phase 1 before Phase 2 ships means the platform gains Phase 1 controls while retaining the current posture (no per-form RBAC, no approval gate). This accepted risk must be confirmed by the CEO at the final gate.

---

## Go-Live Clearance

**Verdict: NOT CLEARED — 6 hard blockers and 4 production conditions remain**

The design is sound and the implementation on the integration branch is code-complete for Phase 1 scope. The hard blockers are validation, governance, and legal items — not build items. The audit recommendation is APPROVE WITH CONDITIONS, not REJECT.

### Hard Blockers — Must Clear Before Any Shared-Environment Deployment

| # | Condition | Owner | Tracking Ref |
|---|---|---|---|
| HC-1 | Verify `Xrm.WebApi.online.execute()` + `If-Match` in UCI iframe; confirm 412 response or implement fallback | QA + Dev | LO-012 / OI-001 |
| HC-2 | QDB IT Director + Dataverse admins sign immutability acknowledgment in writing (ACK-E-001..ACK-E-005) | QDB IT Director | CC-005 |
| HC-3 | Execute Layer 1 WCAG scan; apply CC-002 spend gate ruling (20 or fewer violations: proceed; more than 20: notify CEO) | QA | CC-002 |
| HC-4 | Document STYLE-001 coordination path (Path A: joint date, or Path B: 15-day follow-on) | Engagement lead | CC-001 |
| HC-5 | QDB Legal + IT Director formal data residency assessment (crm4 Azure Europe vs. Qatar PDPPL); document conclusion | QDB Legal + IT Director | GG-07 |
| HC-6 | Execute all LO-001 through LO-016 live-org provisioning and validation gates against org5869857f | CRM Admin + QA | QA Phase 5 Section 7 |

### Production Conditions — Must Clear Before Production Deployment (in addition to hard blockers)

| # | Condition | Owner | Tracking Ref |
|---|---|---|---|
| PC-1 | Populate `qdb_session_id` in `AuditBatchWriter` from EditLock session UUID before audit log is relied upon for compliance reporting | Frontend developer | SEC-05 / GG-08 |
| PC-2 | Extract `DATAVERSE_URL` to `DV_BASE_URL` env variable in both provisioning scripts | Frontend developer | SEC-06 |
| PC-3 | Add session-level audit failure buffer and user notification to `AuditBatchWriter` (silent swallow is not acceptable for a compliance-grade log) | Frontend developer | SEC-03 |
| PC-4 | Verify `axe-core` and `@axe-core/playwright` are excluded from Vite production bundle via `rollupOptions.external`, per ADR-004 | Build engineer | ADR-004 |

### Phase 2 Gate Conditions (tracked, not blocking Phase 1 clearance)

C-004 (QDB Legal retention period defaults), C-005 (XLIFF 2.0 vendor acceptance), C-006 (named Form Approvers and escalation rule) remain open per the CEO phase plan. These gate Phase 2 build and go-live and do not affect Phase 1 clearance.

---

## Audit Recommendation to CEO

**APPROVE WITH CONDITIONS**

The Phase 1 design is architecturally sound, internally consistent, and addresses the right compliance controls for a QDB public-sector engagement. The integration branch (`0c2fddf`) confirms that all three marquee wiring tasks are complete: the `WriteQueue` routes saves through `If-Match` conditional PATCHes with conflict detection; `writeAuditEntriesNonBlocking` writes field-level audit entries after each successful flush; and `moveFieldToAdjacentSection` implements keyboard cross-section reordering. The immutability design — Pre-Validation plugin blocking System Administrator at the execution level, defense-in-depth with role-level no-Update/Delete — is the correct compliance-grade posture and was explicitly commended at the CEO Architecture Checkpoint.

The remaining findings fall into three categories:

**Reliability design findings** (SEC-03, SEC-05): The audit write path is non-blocking by deliberate design choice. For a compliance-grade log, this requires augmentation — a session-level failure buffer and user notification — before the log is held out as reliable evidence. SESSION_ID correlation is a 1-day wiring task.

**Scope and residency acknowledgment findings** (SEC-04, GG-07): The client-side audit scope limitation and the Azure Europe data residency question both require formal written acknowledgment from QDB stakeholders. These are not code changes; they are governance decisions that QDB must make and document before production deployment.

**Validation and governance gates** (HC-1 through HC-6): OI-001 verification, immutability acknowledgment, Layer 1 WCAG scan, STYLE-001 coordination documentation, data residency assessment, and all 16 live-org provisioning gates must be executed. These are well-defined tasks with clear owners.

None of the conditions require re-architecture. All are within the Phase 1 delivery scope or are QDB stakeholder obligations already established in the CEO conditions. The audit clears the design; it conditions the go-live on completing the verification and governance record.

---

## Approval Record

| Role | Name | Decision | Date |
|---|---|---|---|
| Auditor (Maqsad AI) | Maqsad AI Auditor | APPROVE WITH CONDITIONS (6 hard blockers, 4 production conditions) | 2026-07-11 |
| CEO (Final Decision) | Pending | PENDING | — |
| QDB IT Director | Pending | PENDING | — |
