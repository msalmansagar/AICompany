# Phase 6 — Security & Governance Audit
**Engagement:** CWFD-001 + CWFD-002
**Auditor:** Maqsad AI Auditor Agent
**Date:** 2026-06-21
**Verdict:** CONDITIONAL PASS — 4 mandatory conditions before production deployment

---

## 1. Audit Scope

**In scope**
- React + TypeScript frontend bundle (CWFD-001 + CWFD-002)
- Vite build and dev-proxy configuration (`vite.config.ts`)
- All TypeScript service and hook files under `src/services/` and `src/hooks/`
- Zustand + zundo temporal store (`src/store/workflowStore.ts`, `src/store/sopStore.ts`)
- Deployment script (`scripts/deploy-cloud.js`)
- C# plugins: `CreateProcessFromSopPlugin.cs`, `RoleDeletionGuardPlugin.cs`
- `.gitignore` and secret-management posture
- Dataverse data-access patterns (OData filter construction, GUID validation)
- Export pipeline (`ExportService.ts`)
- Audit trail design (`AuditService.ts`, `usePublish.ts`, `useWorkflowSave.ts`)

**Out of scope**
- Power Pages portal layer
- Azure AD app registration security settings (tenant-level, not in repo)
- Network perimeter / firewall rules for the Dataverse org
- CRM solution ALM pipeline beyond the deploy script

---

## 2. Security Risk Register

### SEC-01 — Hardcoded Org URL, Tenant ID, and Client ID in Source
- **Description:** Three sensitive infrastructure values are hardcoded as TypeScript constants in `vite.config.ts` (lines 7–8) and mirrored in `CrmEnvironmentService.ts` (line 68) and `deploy-cloud.js` (lines 25–27). The values `d79e793c-f6de-4204-8508-7980a63df957` (tenant), `08e80e93-0bab-45ef-8372-2e554fa9af9b` (client ID), and `https://org5869857f.crm4.dynamics.com` (org URL) are committed to the repository. While these are not secrets, they constitute environment-specific configuration that locks the codebase to a single environment, prevents safe multi-environment deployment, and leaks environment topology to anyone with repository read access.
- **Likelihood:** High (already present)
- **Impact:** Medium (not immediately exploitable, but enables targeted reconnaissance)
- **Mitigation:** Move all three values to environment variables. Add `VITE_ORG_URL`, `VITE_TENANT_ID`, `VITE_CLIENT_ID` to `.env.example`. Remove hardcoded fallbacks from `vite.config.ts` and `deploy-cloud.js`. The `deploy-cloud.js` pattern of `?? 'hardcoded-value'` must be replaced with a hard fail when the env var is absent.
- **Residual risk after mitigation:** Low
- **Confidence:** 99%

### SEC-02 — `AZURE_CLIENT_SECRET` Handled Safely — Verified Clear
- **Description:** The `AZURE_CLIENT_SECRET` is read from `process.env` in `vite.config.ts` (line 72) and `deploy-cloud.js` (line 27). It is never written to source, never logged, and never included in the bundle. `.gitignore` excludes `.env.local` and `.env*.local` at lines 3–4. No match for `AZURE_CLIENT_SECRET` was found in any `src/` file.
- **Status:** No issue found.
- **Confidence:** 97%

### SEC-03 — OData Filter Injection via Unsanitised Search String
- **Description:** `DataverseAdapter.getUsers()` (line 399) and `DataverseAdapter.getRoles()` (line 595) interpolate the raw `search` parameter directly into OData `$filter` string templates: `` `contains(fullname,'${search}')` `` and `` `contains(qdb_name,'${search}')` ``. A value such as `') or 1 eq 1 or contains(qdb_name,'` would inject arbitrary OData conditions. Although Dataverse OData is not SQL and full code execution is not achievable, an adversary who can call these functions (e.g. another CRM customisation on the same form) could broaden the result set to enumerate all users or roles beyond their intended visibility.
- **Likelihood:** Low (requires malicious co-resident CRM customisation or XSS precondition)
- **Impact:** Medium (information disclosure — user enumeration)
- **Mitigation:** Validate `search` at the entry points with a whitelist regex (alphanumeric plus space, hyphen, apostrophe) before constructing the filter string. Reject values that contain single-quote sequences beyond the allowed set.
- **Residual risk after mitigation:** Low
- **Confidence:** 88%

### SEC-04 — GUID Parameters Not Validated Before OData Filter Interpolation in `WorkflowDataService`
- **Description:** `WorkflowDataService.getStepsByProcess()` (line 102) and `WorkflowDataService.getOutcomesByStepIds()` / `getRoutesByOutcomeIds()` (lines 116–119, 134–137) interpolate `processId` and individual IDs directly into OData `$filter` strings without calling `assertGuid()`. The `assertGuid` utility exists (`src/services/assertGuid.ts`) and is used in `DataverseAdapter`, but is absent from `WorkflowDataService`. An ID that bypasses the caller can inject arbitrary OData filter syntax.
- **Likelihood:** Low (IDs originate from CRM query results or the zundo store, both GUID-shaped in normal operation)
- **Impact:** Medium (OData filter manipulation, information disclosure)
- **Mitigation:** Call `assertGuid(processId, 'processId')` and `assertGuid(id, 'stepId/outcomeId')` at the top of each method in `WorkflowDataService` before any string interpolation, mirroring the pattern in `DataverseAdapter`.
- **Residual risk after mitigation:** Low
- **Confidence:** 90%

### SEC-05 — `console.error` in Production Bundle Leaks CRM Data Shapes
- **Description:** `WorkflowDataService.toError()` (line 264) and `DataverseAdapter.asError()` (line 1051) call `console.error` unconditionally. These calls include raw Xrm error objects which may contain OData error detail, entity logical names, field names, and HTTP status codes. The bundle is deployed as a CRM web resource accessible to all users who have access to the form. Browser DevTools will expose this detail to any end user.
- **Likelihood:** High (fires on any API error)
- **Impact:** Low (schema/metadata disclosure, not credential leakage; CRM users already have some schema access)
- **Mitigation:** Gate `console.error` behind `import.meta.env.DEV`. In production, route to a structured telemetry endpoint or suppress. Add `// eslint-disable-next-line no-console` is not acceptable — the calls must be removed or gated.
- **Residual risk after mitigation:** Low
- **Confidence:** 92%

### SEC-06 — No Ownership Check Before Write Operations
- **Description:** The save path in `useWorkflowSave.ts` calls `adapter.updateProcess()`, `adapter.updateStep()`, `adapter.updateOutcome()`, `adapter.deleteStep()` etc. (lines 78, 107, 130, 169) on any CRM ID present in the Zustand store, with no prior ownership or permission check in application code. Authorization is delegated entirely to Dataverse row-level security. This is architecturally correct for Dynamics 365, but it must be explicitly documented as a governance decision. If the underlying security roles are misconfigured, any user with form access can overwrite another user's processes.
- **Likelihood:** Low (depends on CRM security role misconfiguration)
- **Impact:** High (process data integrity)
- **Mitigation:** Document in deployment runbook that `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks` must grant Write privilege only to the Process Manager security role (or equivalent). Add a pre-deployment security-role verification step to the go-live checklist.
- **Residual risk after mitigation:** Low
- **Confidence:** 85%

### SEC-07 — `deploy-cloud.js` Bypasses Solution ALM (Direct Web Resource PATCH)
- **Description:** The deploy script (lines 90–98) PATCHes the web resource directly via Web API without going through a managed solution. This means the web resource is unmanaged in the target environment, cannot be rolled back via solution uninstall, and its deployment is not tracked in any solution layer audit trail. Direct deployment also means any subsequent managed solution import that includes the same web resource will fail with a layer conflict.
- **Likelihood:** Medium (used as primary deployment mechanism)
- **Impact:** Medium (governance and rollback risk)
- **Mitigation:** Implement solution-based deployment using PAC CLI (`pac solution import`) as the production path. Retain `deploy-cloud.js` for developer inner-loop only. Document this in the deployment runbook and block CI/CD from calling `deploy:cloud` against production.
- **Residual risk after mitigation:** Low
- **Confidence:** 93%

### SEC-08 — Audit Trail is Best-Effort Only — Silent Failure
- **Description:** `AuditService.log()` (line 16–22 of `AuditService.ts`) wraps all writes in a try-catch that swallows failures silently, dispatching only a `window.dispatchEvent(errorEvent)` with no guaranteed consumer. This means audit entries for `SAVE_DRAFT` and `PUBLISH` actions can fail without the user or any monitoring system being notified. The audit log cannot be relied upon for regulatory or governance examination.
- **Likelihood:** Medium (the `_auditLog` optional-chain at line 31 means it silently no-ops if the adapter does not expose the method)
- **Impact:** High (audit trail completeness)
- **Mitigation:** (1) Make `_auditLog` a required, non-optional method on `ICrmAdapter`. (2) Surface audit write failure as a non-blocking warning in the UI toast. (3) Consider whether `SAVE_DRAFT` and `PUBLISH` should be blocked until the audit entry is confirmed written, at least for the `PUBLISH` action.
- **Residual risk after mitigation:** Medium (best-effort audit is acceptable only if the Dataverse platform audit is enabled as the authoritative audit trail)
- **Confidence:** 95%

### SEC-09 — `CreateProcessFromSopPlugin` Writes Entity Field Values Without Length Validation
- **Description:** `CreateProcessFromSopPlugin.cs` lines 151–166 write `parameters.ProcessName`, `parameters.TaskEntity`, `parameters.RegardingField`, and `parameters.ParentEntity` directly to entity fields after only a null/whitespace check. No maximum-length guard is applied. Dataverse will reject strings that exceed the field's MaxLength, but the plugin throws the raw platform exception back to the caller, which may expose internal entity schema names in the error message. Additionally, `TaskEntity` and `RegardingField` accept arbitrary strings; there is no check that they represent valid Dataverse logical names.
- **Likelihood:** Low (inputs come from the SOP wizard, which applies Zod validation on the frontend)
- **Impact:** Low (DoS via long string causes user-visible error, not data corruption)
- **Mitigation:** Add `MaxLength` guards in `ExtractAndValidateParameters` for `ProcessName` (≤100 chars), `TaskEntity` (≤128 chars), `RegardingField` (≤128 chars), `ParentEntity` (≤128 chars). Validate that `TaskEntity` is a non-empty schema-compliant identifier (regex `^[a-z][a-z0-9_]{1,127}$`).
- **Residual risk after mitigation:** Low
- **Confidence:** 82%

### SEC-10 — Undo/Redo History Stores Full Process State Including User IDs and Step Assignments
- **Description:** The `zundo` temporal store is configured with `{ limit: 50 }` at `workflowStore.ts:732` and `sopStore.ts:376`. The history snapshots contain the full `WorkflowDesignerState`, which includes `assignedUserId`, `teamId`, `roundRobinTeamId`, and all step and outcome data. This data persists in JavaScript heap memory for the session lifetime. In a shared browser session, a second user could access prior state. The limit is correctly enforced at 50 snapshots.
- **Likelihood:** Low (requires shared authenticated browser session)
- **Impact:** Low (user ID exposure; no credentials or secrets in the state)
- **Mitigation:** No immediate code change required. Document that the tool must not be used on shared workstations. Consider configuring zundo to exclude simulation and auto-simulation arrays from the temporal diff to reduce snapshot size.
- **Residual risk after mitigation:** Low
- **Confidence:** 83%

---

## 3. OWASP Top 10 Assessment

| # | Category | Applicable? | How Mitigated | Gap |
|---|---|---|---|---|
| A01 | Broken Access Control | Yes | Delegated to Dataverse row-level security and CRM security roles. `assertGuid()` prevents ID injection in write paths. `RoleDeletionGuardPlugin` enforces referential integrity. | No application-layer ownership check (documented as SEC-06). Security role configuration is not verified at deployment. |
| A02 | Cryptographic Failures | Low | No credentials stored. No custom encryption. OAuth client credentials flow for dev only; production uses `credentials: 'include'` (session cookie). | None significant. |
| A03 | Injection | Yes | OData queries use `Xrm.WebApi` parameterised methods for most operations. C# plugin uses `QueryExpression` (typed, not string-concatenated). Search string injection risk exists (SEC-03, SEC-04). | Search parameter interpolation in `getUsers()` and `getRoles()` not sanitised. `WorkflowDataService` does not validate GUIDs before filter interpolation. |
| A04 | Insecure Design | Low | Dual-mode adapter pattern cleanly separates dev shim from production path. `CrmEnvironmentService` rejects dev-mode calls to write operations. | Audit trail is non-authoritative (SEC-08). |
| A05 | Security Misconfiguration | Yes | `.env.local` gitignored. No secrets in source. | Hardcoded environment config in source (SEC-01). Deploy script bypasses solution ALM (SEC-07). |
| A06 | Vulnerable and Outdated Components | Low | Dependencies declared in `package.json`. Playwright, vite, react at recent versions. | No automated dependency vulnerability scan (Dependabot, `npm audit`) configured in CI. |
| A07 | Identification and Authentication Failures | N/A | Authentication is fully delegated to Dynamics 365 session. The web resource runs inside an authenticated CRM iframe; no custom auth logic. | None. |
| A08 | Software and Data Integrity Failures | Yes | Single-file bundle deployed directly via Web API script (SEC-07). No integrity hash verified at runtime. | No Content Security Policy on the web resource HTML. Bundle not signed. Direct PATCH deployment means no manifest of what was deployed. |
| A09 | Security Logging and Monitoring Failures | Yes | `AuditService` attempts to log `SAVE_DRAFT` and `PUBLISH` actions. | Audit writes are optional-chained and silently swallowed (SEC-08). No monitoring alert on audit write failure. |
| A10 | Server-Side Request Forgery | Low | No server-side code in the React bundle. Vite proxy is dev-only and not deployed. C# plugins call Dataverse via the `IOrganizationService` factory — no user-controlled URL construction. | None. |

---

## 4. Compliance Assessment

### Dynamics 365 / Power Platform Web Resource Best Practices

| Requirement | Status | Gap / Remediation |
|---|---|---|
| Web resources must be part of a managed solution for production deployment | NOT MET | `deploy-cloud.js` deploys unmanaged. Must use PAC CLI solution import for production (SEC-07). |
| Web resources must not contain hard-coded environment identifiers | NOT MET | `vite.config.ts` lines 7–8 and `CrmEnvironmentService.ts` line 68 contain org URL, tenant ID, client ID (SEC-01). |
| No `console.log` / `console.error` in production web resources | NOT MET | Five `console.error` calls remain in production-compiled files (SEC-05). |
| Plugin must be registered in a solution and use the correct isolation mode (Sandbox) | ASSUMED | Cannot verify from source alone. Confirm plugin assembly is registered in Sandbox (not None/Full Trust) isolation in deployment environment. |
| Plugin must complete within 2-minute execution limit | MET | `CreateProcessFromSopPlugin` is synchronous and performs bounded sequential Dataverse calls (one per SOP step). For a typical SOP of ≤50 steps this is well within 2 minutes. |
| Custom API must declare required privileges | UNVERIFIABLE | Plugin registration (`register-plugins.mjs`) was not audited. Confirm `qdb_CreateProcessFromSop` Custom API registration requires at minimum Create on `qdb_work_item_record_type`. |
| All custom entities must have `created_by`, `created_on`, `modified_by`, `modified_on` | MET | Standard Dataverse audit columns are system-generated on all custom entities. No override observed. |
| Entity schema must use publisher prefix | MET | All entities use `qdb_` prefix. |

### GDPR / Data Privacy

| Requirement | Status | Gap |
|---|---|---|
| Personal data handling — `systemuser` fullname and domainname retrieved | LOW RISK | User data is used only for step assignment display. Not persisted to external systems. Covered by CRM platform GDPR compliance. |
| Data subject rights — deletion of user assignment data | MET | Dataverse handles this natively. `assignedUserId` is a lookup; nulling it on user deactivation is standard CRM behavior. |
| Data residency — Dataverse org is `crm4.dynamics.com` (Europe West) | MET | Data remains within EU datacentre. No cross-region transfer observed. |

---

## 5. Data Residency Review

- The Dataverse organisation `org5869857f.crm4.dynamics.com` is hosted in the **Europe West** geographic region (`crm4`), which maps to Azure West Europe (Netherlands).
- All Dataverse API calls use `credentials: 'include'` (session cookie) or Bearer token scoped to the same org URL.
- The dev proxy in `vite.config.ts` forwards to the same org URL. The OAuth token request goes to `login.microsoftonline.com` — this is the standard Microsoft identity endpoint, not a third-party service.
- The `html-to-image` export generates a PNG/SVG in the browser; the PDF is assembled client-side by `jspdf`. No workflow data is sent to any external service during export.
- The `FetchXmlMetadataResolver` session caches (`attrsByEntityCache`, `optionsByAttrCache`) are module-level Maps that exist only in the browser tab memory and are cleared on page reload.

**Residency verdict:** No cross-border transfer risk identified. All data remains within the EU Dataverse environment.

---

## 6. Audit Trail Validation

### What is logged

- `SAVE_DRAFT` logged by `useWorkflowSave.ts:177` via `AuditService`, carrying `{ stepCount }` and the process ID.
- `PUBLISH` logged by `usePublish.ts:87` via `AuditService`, carrying `{ version, isBreaking }` and the process ID.
- `VersioningService` records a JSON snapshot at publish time, stored in the `snapshot` field of `qdb_work_item_record_type`.

### Gaps

1. **Audit writes are non-authoritative.** `AuditService.writeAuditEntry()` calls `this.adapter._auditLog?.()` — an optional chain. If the adapter does not implement `_auditLog` (the `DataverseAdapter` does not expose this method in `ICrmAdapter`), every audit call silently no-ops. There is no record of any `SAVE_DRAFT` or `PUBLISH` event in the Dataverse environment.

2. **No audit on delete operations.** `useWorkflowSave.ts` lines 166–171 delete steps, outcomes, and routes with no corresponding audit log entry. A deleted step leaves no trace in the audit log.

3. **No step-level change detail in `SAVE_DRAFT` log.** The audit payload contains only `stepCount`. It does not record which step was added, renamed, or deleted, nor which outcome was changed. A regulatory reviewer cannot reconstruct what changed between saves.

4. **Version snapshot is structurally minimal.** `VersioningService.createSnapshot()` captures step names and counts but not assignment users, FetchXML filters, or outcome-to-step routing. A breaking-change scenario (step removed) increments `versionMajor` but the snapshot does not preserve the previous configuration for comparison.

5. **Dataverse platform audit** (native Dynamics 365 audit log on entity changes) is the only reliable audit trail currently in operation. Confirm that Dataverse audit is enabled for `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks` in the production environment.

**Verdict:** The custom audit trail is not sufficient for regulatory examination in its current state. The Dataverse platform audit must be enabled and treated as the authoritative record until `AuditService` is made mandatory and complete.

---

## 7. Service Account Review

| Account | Used In | Access Scope | Least-Privilege Assessment |
|---|---|---|---|
| Azure AD App Registration (`08e80e93-...`) | `vite.config.ts` (dev proxy), `deploy-cloud.js` (deployment) | Client credentials flow targeting `org5869857f.crm4.dynamics.com/.default` — grants all Dataverse permissions assigned to the service principal | OVER-PRIVILEGED. The deployment use case requires only `Create`/`Update` on `webresourceset` and `PublishXml`. The dev proxy use case requires Read on workflow entities only. These two use cases should have separate service principals with separate scopes. |
| CRM session user | Production runtime (`credentials: 'include'`) | Inherits the authenticated CRM user's security role | CORRECT. No service account used in production runtime. |
| Plugin execution context | `CreateProcessFromSopPlugin`, `RoleDeletionGuardPlugin` | `serviceFactory.CreateOrganizationService(context.UserId)` — runs as the calling user | CORRECT. Plugins impersonate the caller, not a privileged service account. |

**Remediation for service account:** Create two separate Azure AD app registrations: one for deployment (minimal permissions: web resource CRUD + PublishXml), one for dev proxy (read-only on workflow entities). Remove the shared credentials pattern.

---

## 8. Governance Gaps

Ranked by risk. All must be resolved before production go-live.

### GAP-01 (Critical) — Audit trail does not write
- **Gap:** `AuditService._auditLog` is optional-chained and never implemented on `DataverseAdapter`. Every `SAVE_DRAFT` and `PUBLISH` audit call silently no-ops.
- **Risk if unaddressed:** No audit trail exists. Cannot demonstrate compliance with change-management policy. Every governance and regulatory review will fail.
- **Remediation:** Add `auditLog(entry: AuditEntry): Promise<void>` as a required method on `ICrmAdapter`. Implement it in `DataverseAdapter` to write to `qdb_form_audit_log` (or a dedicated `qdb_workflow_audit_log` entity). Enable Dataverse platform audit as backup. Remove the optional chain.

### GAP-02 (Critical) — Production deployment is unmanaged
- **Gap:** `deploy-cloud.js` deploys the web resource outside any solution. Production Dataverse environments must only receive managed solution deployments.
- **Risk if unaddressed:** Rollback is impossible. Layer conflicts with future managed solutions. No deployment audit in ALM tooling.
- **Remediation:** Package the web resource in the managed solution (`scripts/packageSolution.js` exists). Use `pac solution import --managed` as the production deployment path. Restrict CI/CD `deploy:cloud` target to sandbox environments only.

### GAP-03 (High) — Environment configuration hardcoded in source
- **Gap:** Org URL, tenant ID, and client ID are committed to `vite.config.ts` and `CrmEnvironmentService.ts`.
- **Risk if unaddressed:** Cannot deploy to a second environment (UAT, staging) without code change. Environment topology exposed in repository history.
- **Remediation:** Externalise to `VITE_ORG_URL`, `VITE_TENANT_ID`, `VITE_CLIENT_ID` environment variables. Add to `.env.example`. Remove hardcoded fallbacks.

### GAP-04 (High) — Service principal is over-privileged and shared between use cases
- **Gap:** The single app registration is used for both developer proxy (read) and production deployment (write), with `/.default` scope granting all Dataverse permissions assigned.
- **Risk if unaddressed:** Compromise of the dev credential (e.g. `.env.local` shared insecurely) grants full production Dataverse write access.
- **Remediation:** Create separate registrations. Scope the deployment credential to web resource operations only.

### GAP-05 (High) — No security-role verification in deployment runbook
- **Gap:** Application-layer ownership checks are absent (by design — delegated to Dataverse). No documented verification that the `qdb_` entity security roles are correctly configured before go-live.
- **Risk if unaddressed:** If security roles grant broad Write access, any CRM user can overwrite any other user's process definitions.
- **Remediation:** Add to go-live checklist: verify that Write privilege on workflow entities is restricted to the designated Process Manager role and not granted to basic CRM User role.

### GAP-06 (Medium) — `console.error` calls in production bundle
- **Gap:** Five unconditional `console.error` calls exist in source files that compile into the production web resource bundle.
- **Risk if unaddressed:** CRM schema metadata and error detail visible to any end user via browser DevTools.
- **Remediation:** Gate all `console.error` calls behind `import.meta.env.DEV`. Replace with structured telemetry or no-op in production.

### GAP-07 (Medium) — Delete operations not audited
- **Gap:** Step, outcome, and route deletions in `useWorkflowSave.ts` lines 166–171 have no corresponding audit log entry.
- **Risk if unaddressed:** A malicious or erroneous deletion of a workflow step cannot be detected from the audit log. Change history is incomplete.
- **Remediation:** Log each deletion action via `AuditService.log()` with the entity type and deleted ID before calling the adapter delete method.

### GAP-08 (Medium) — OData search string injection
- **Gap:** `getUsers()` and `getRoles()` interpolate unsanitised search strings into OData `$filter` templates (SEC-03). `WorkflowDataService` does not call `assertGuid` before ID interpolation (SEC-04).
- **Risk if unaddressed:** OData filter manipulation enabling information disclosure (user enumeration).
- **Remediation:** Whitelist-validate search strings. Add `assertGuid` calls to `WorkflowDataService`.

### GAP-09 (Low) — No automated dependency vulnerability scanning
- **Gap:** `package.json` has no `npm audit` step in CI. Several dependencies (`jspdf` v2, `html-to-image`, `@xyflow/react`) are mature but not continuously monitored.
- **Risk if unaddressed:** Known vulnerabilities in dependencies introduced between releases go undetected.
- **Remediation:** Add `npm audit --audit-level=high` to the CI build step. Configure Dependabot alerts on the repository.

### GAP-10 (Low) — Plugin input length not validated (SEC-09)
- **Gap:** `CreateProcessFromSopPlugin` does not validate maximum length of string parameters.
- **Risk if unaddressed:** Long strings cause Dataverse platform exception with schema detail exposed in error response.
- **Remediation:** Add MaxLength guards in `ExtractAndValidateParameters` as described in SEC-09.

---

## 9. Code Audit — 7 Passes

### Pass 1 — Wiring

No orphaned handlers found. Every write action flows: UI component → hook (`useWorkflowSave`, `usePublish`, `useSopSave`) → adapter (`DataverseAdapter`) → `Xrm.WebApi`. The `AuditService` is wired into both `useWorkflowSave:177` and `usePublish:87`. However, the audit sink (`_auditLog`) is not implemented on `DataverseAdapter`, so the wiring is broken at the terminal node (GAP-01).

The export pipeline is fully wired: `ExportService.exportPng/exportSvg/exportPdf` → `html-to-image` → `jspdf` → browser download.

**Finding:** `AuditService.writeAuditEntry()` calls `this.adapter._auditLog?.()` which is optional and unimplemented. The entire audit trail is a no-op.
- File: `src/services/AuditService.ts:31`
- Severity: CRITICAL
- Confidence: 97%

### Pass 2 — Error Handling

Error handling is generally disciplined. All async paths wrap in try-catch. `withRetry` wraps Dataverse calls. `toError`/`asError` convert raw Xrm error objects to proper `Error` instances.

**Finding:** `DataverseAdapter.resolveNavProp()` (line 105) catches all errors and silently falls back to `attributeLogicalName`, returning a potentially wrong navigation property name with no log or signal. If the metadata lookup fails in production, `@odata.bind` binds may silently use wrong property names, causing silent data corruption.
- File: `src/services/DataverseAdapter.ts:105`
- Severity: WARNING
- Confidence: 85%

**Finding:** `DataverseAdapter.getAttributesMeta()` (line 357) catches all errors and returns `[]` silently. A failed metadata call will cause route filter labels to display raw field logical names instead of display names, which is a graceful degradation — acceptable.
- File: `src/services/DataverseAdapter.ts:357`
- Severity: INFO

### Pass 3 — Completeness

No TODO/FIXME/HACK comments found in security-relevant paths. All features are fully implemented.

**Finding:** `AuditService._auditLog` is described as "Attempts to write to `qdb_form_audit_log` if available" — this is a planned feature that is not yet implemented. The comment implies the entity may not be deployed. This constitutes a placeholder feature shipped as complete.
- File: `src/services/AuditService.ts:6–8`
- Severity: WARNING
- Confidence: 95%

### Pass 4 — Dead Code

**Finding:** `WorkflowDataService.ts` duplicates entity logical name constants and mapper functions that already exist in `DataverseAdapter.ts`. Specifically, `LOGICAL`, `PK`, `mapProcess`, `mapStep`, `mapOutcome`, `mapRoute` are defined in both files.
- Files: `src/services/WorkflowDataService.ts:5–17`, `src/services/DataverseAdapter.ts:41–54`
- Severity: PRUNE
- Confidence: 92%

### Pass 5 — Bloat

**Finding:** `DataverseAdapter.ts` is 1,060 lines. This exceeds the 800-line absolute maximum defined in `.claude/rules/common.md`. The file contains entity CRUD, metadata resolution, SOP lifecycle, cloning, and role management. It should be split by domain concern: `WorkflowCrudAdapter`, `SopCrudAdapter`, `MetadataAdapter`.
- File: `src/services/DataverseAdapter.ts` (1,060 lines)
- Severity: WARNING
- Confidence: 98%

**Finding:** `getUsers()` retrieves up to `$top=5000` users in a single unbounded request (line 404). `getTeams()` similarly retrieves `$top=5000` teams (line 421). These are loaded into memory and rendered in dropdowns. For large organisations this will cause memory pressure and slow dropdown rendering.
- File: `src/services/DataverseAdapter.ts:404,421`
- Severity: WARNING
- Confidence: 87%

### Pass 6 — Hardcoding

**Finding:** `vite.config.ts:7–8` hardcodes `ORG_URL`, `TENANT_ID`, `CLIENT_ID` as module-level constants. These are environment-specific values that must not be in source.
- File: `vite.config.ts:7–8`
- Severity: WARNING
- Confidence: 99%

**Finding:** `deploy-cloud.js:25–27` hardcodes `TENANT_ID`, `CLIENT_ID`, `ORG_URL` as fallback values in the `??` operator, providing false safety — the script will silently use wrong environment values if the env vars are absent.
- File: `scripts/deploy-cloud.js:25–27`
- Severity: WARNING
- Confidence: 99%

**Finding:** `CrmEnvironmentService.ts:68` hardcodes `https://org5869857f.crm4.dynamics.com` as the dev-mode URL. This is used by `DevXrmWebApiShim` to proxy API requests in dev mode. Acceptable only in dev mode; the hardcoded value must not resolve at runtime in production. The `isDevMode` guard (line 68 inside the `if (this.isDevMode)` block) provides adequate protection.
- File: `src/services/CrmEnvironmentService.ts:68`
- Severity: INFO (dev-mode only, guarded)
- Confidence: 90%

**Finding:** `CreateProcessFromSopPlugin.cs:20` hardcodes `SOP_STATUS_PUBLISHED = 100000001`. This is an option-set value. If the option set is reconfigured in Dataverse the constant becomes wrong silently.
- File: `plugins/Qdb.WorkflowDesigner.Plugins/CreateProcessFromSopPlugin.cs:20`
- Severity: INFO (acceptable for plugin constants, but document in deployment notes)
- Confidence: 80%

### Pass 7 — Security

**Finding:** `WorkflowDataService.ts:102,116–119,134–137` interpolates IDs directly into OData `$filter` without GUID validation.
- File: `src/services/WorkflowDataService.ts:102,116,134`
- Severity: WARNING
- Confidence: 90%

**Finding:** `DataverseAdapter.ts:399,595` interpolates unsanitised `search` string into OData `$filter`.
- File: `src/services/DataverseAdapter.ts:399,595`
- Severity: WARNING
- Confidence: 88%

**Finding:** `WorkflowDataService.ts:264` and `DataverseAdapter.ts:1051` call `console.error` unconditionally. These will appear in the production bundle.
- File: `src/services/WorkflowDataService.ts:264`, `src/services/DataverseAdapter.ts:1051`
- Severity: WARNING
- Confidence: 92%

**Finding:** No `dangerouslySetInnerHTML`, no `eval()`, no `innerHTML =` assignment found in any `.ts` or `.tsx` file. FetchXML content is parsed by `DOMParser` in `FetchXmlMetadataResolver.ts` and attribute values are read as text via `.getAttribute()`, not rendered as HTML. XSS risk is not present in the export or filter-label rendering paths.
- Severity: INFO (clear)
- Confidence: 96%

**Finding:** `AuditService.ts:31` — `_auditLog` is called via optional chain on the adapter cast as `unknown`. This is a type-safety bypass (`as unknown as { _auditLog?: ... }`). The pattern hides the missing implementation behind a silent no-op.
- File: `src/services/AuditService.ts:31`
- Severity: CRITICAL
- Confidence: 97%

---

## 10. Go-Live Conditions

The following conditions must all be satisfied before deploying to the production CRM environment. Each is mandatory. Partial satisfaction does not constitute clearance.

1. **[C-01] Implement and verify audit trail write.** Add `auditLog()` as a required method on `ICrmAdapter`. Implement it in `DataverseAdapter` to write to an audit entity. Confirm via integration test that at least one audit record is created for a `SAVE_DRAFT` and one for a `PUBLISH` action. Enable Dataverse native audit on all four workflow entities as the authoritative backup.

2. **[C-02] Switch production deployment to managed solution.** Remove `deploy:cloud` from the production deployment pipeline. Implement `pac solution import --managed` as the only production deployment path. Confirm the web resource appears in the managed solution layer in the target environment.

3. **[C-03] Externalise all environment configuration.** Remove hardcoded `ORG_URL`, `TENANT_ID`, `CLIENT_ID` from `vite.config.ts` and `deploy-cloud.js`. Move to environment variables with no hardcoded fallbacks. Add to `.env.example`.

4. **[C-04] Create separate service principals.** The shared `08e80e93-...` app registration must be replaced with two registrations: one for deployment (scoped to web resource write + PublishXml), one for dev proxy (scoped to read on workflow entities). Revoke the current shared credential from production scope.

5. **[C-05] Verify and document CRM security roles.** Before go-live, perform a security role audit on the production org. Confirm that Write, Append, AppendTo privilege on `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, and `qdb_outcomeworktasks` is granted only to the Process Manager security role. Document the verified role matrix in the deployment runbook.

6. **[C-06] Gate `console.error` behind `DEV` flag or remove.** All `console.error` calls in `WorkflowDataService.ts`, `DataverseAdapter.ts`, `AuditService.ts`, `useWorkflowSave.ts`, and `WorkflowCanvas.tsx` must be either removed from production builds or wrapped in `if (import.meta.env.DEV)`. Confirm the compiled bundle contains no `console.error` calls by scanning the output file.

7. **[C-07] Add GUID validation to `WorkflowDataService`.** Call `assertGuid` at the entry of `getStepsByProcess`, `getOutcomesByStepIds`, and `getRoutesByOutcomeIds` before any ID is interpolated into a filter string.

---

## 11. Overall Verdict

**CONDITIONAL PASS**

The architecture is sound. The dual-mode adapter pattern is well-designed. C# plugins follow CRM best practices (typed `QueryExpression`, caller impersonation, `Pre-Validation` registration for the guard plugin). The zundo history limit is correctly enforced. No XSS vectors were found. No secrets are committed to source.

However, four conditions prevent unconditional clearance:

- The audit trail is a complete no-op in the current implementation (GAP-01 / C-01). This alone constitutes a governance blocker.
- The production deployment mechanism bypasses solution ALM (GAP-02 / C-02).
- Environment configuration is hardcoded in source (GAP-03 / C-03).
- The service principal is over-privileged and shared (GAP-04 / C-04).

Conditions C-01 through C-07 must all be met and verified before production deployment is authorised.
