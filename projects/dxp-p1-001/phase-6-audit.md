# DXP-P1-001 — Phase 6: Security & Governance Audit

```
═══════════════════════════════════════════════════
SECURITY & GOVERNANCE AUDIT
═══════════════════════════════════════════════════
Project:        DXP-P1-001 — DXP Platform Phase 1 (Component Registry)
Prepared by:    Maqsad AI — Auditor & Governance Specialist
Date:           2026-06-18
Version:        1.0
Status:         COMPLETE — Verdict: NOT CLEARED FOR GO-LIVE
═══════════════════════════════════════════════════
```

---

## Audit Scope and Methodology

This audit covers the full DXP-P1-001 deliverable set:

- Fastify backend API: `apps/api/src/services/ComponentRegistryService.ts`, `apps/api/src/routes/admin/components.ts`, `apps/api/src/app.ts`
- Provisioning script: `projects/dxp-p1-001/scripts/provision-schema/src/`
- Dataverse schema (QdbDxpPlatform solution, org5869857f)
- BRD requirements (v1.1, approved 2026-06-17)
- Phase 4 (Technical Build) and Phase 5 (QA) documents

Evaluation dimensions: Security controls, Data governance, OWASP Top 10 coverage, multi-tenant isolation, code quality governance, operational governance.

All 7 code audit passes were executed against the source files read during this session.

---

## Security Risk Register

---

### AUD-001

**Category:** Security
**Severity:** HIGH
**Risk ID:** AUD-001
**Title:** set-latest atomicity failure — is_latest invariant can be violated under concurrent admin operations

**Description:**
`ComponentRegistryService.setLatestVersion()` performs two sequential Dataverse PATCH calls: (1) clear `qdb_islatest` on the previous latest, (2) set `qdb_islatest` on the target. BRD FR-053 explicitly requires OData `$batch` for atomic execution. If two Admin users invoke set-latest simultaneously on different versions of the same component, both can pass the "find current latest" read concurrently, and both writes can complete, resulting in two version records holding `qdb_islatest = true`. Downstream consumers (DXP-P1-002, P1-003, P1-004) that call `GET .../versions/latest` expecting a single canonical record will receive an ambiguous or incorrect response. Additionally, a process crash between the two PATCH calls leaves the definition with zero latest versions.

**Evidence:**
- `ComponentRegistryService.ts:423–451` — sequential PATCH calls with no batching
- `phase-4-tech.md` Section 1.2: "set-latest — sequential PATCH: Two sequential PATCH operations instead of OData `$batch`. Not fully atomic"
- `phase-5-qa.md` D-001: confirmed release blocker, confidence 99%
- BRD FR-053: "The set-latest operation shall use a Dataverse batch request (OData $batch) to perform both the unset of the previous latest and the set of the new latest in a single atomic HTTP round-trip"
- BRD NFR-005: "At no point in time may two qdb_component_versions records for the same qdb_component_definition_id have qdb_is_latest = true"

**Likelihood:** Medium (requires concurrent admin sessions; admin population is small)
**Impact:** High (corrupts the platform-wide canonical version pointer relied on by three downstream engagements)

**Mitigation:**
Implement `$batch` support in `DataverseClient` and replace the two-step PATCH sequence with a single OData `$batch` request containing both change-set operations. Alternatively, implement a Dataverse server-side plugin on the `qdb_component_versions` `Update` message that enforces the single-latest invariant at the Dataverse layer, making API-layer atomicity a correctness reinforcement rather than a sole control.

**Residual risk after mitigation:** Low — OData `$batch` provides atomic execution within a single HTTP round-trip; Dataverse honours rollback if either operation fails.

**Confidence: 99%**

---

### AUD-002

**Category:** Security
**Severity:** HIGH
**Risk ID:** AUD-002
**Title:** Admin role enforcement never live-tested with a real non-Admin JWT

**Description:**
All 11 routes use `app.requireRole('Admin')` as a pre-handler. The code path is correct by inspection. However, per phase-5-qa.md TC-052, the 403 rejection path has never been exercised against a running API with a Viewer-role token. If the `requireRole` plugin has a defect (wrong claim key, case sensitivity issue, missing claim handling), every Component Registry route is accessible to any authenticated user regardless of role. Because the Component Registry manages the identity foundation for all DXP Phase 1 engagements, an unprivileged user could create, overwrite, or deactivate component definitions, corrupting data downstream of DXP-P1-002, P1-003, and P1-004.

**Evidence:**
- `routes/admin/components.ts:12,73` — `const ADMIN_ROLE = 'Admin'`; `const authGuard: AuthHandler[] = [app.authenticate, app.requireRole(ADMIN_ROLE)]`
- `phase-5-qa.md` TC-052: "Status: GAP — This token scenario has not been executed against a live Viewer account"
- `phase-5-qa.md` Section 7, first row: "Critical — The live 403 path requires a non-Admin JWT to exercise"

**Likelihood:** Low (defect in requireRole is unlikely given it is shared infrastructure)
**Impact:** High (unauthorized writes to the component registry corrupt all downstream DXP engagements)

**Mitigation:**
Provision a Viewer-role test account, obtain a live JWT, and execute TC-052 against the running API before staging deployment. Add TC-052 to the automated CI security test suite so it runs on every deployment.

**Residual risk after mitigation:** Low

**Confidence: 95%**

---

### AUD-003

**Category:** Security
**Severity:** HIGH
**Risk ID:** AUD-003
**Title:** qdb_propsschema field provisioned at 4000 chars; BRD requires 1,048,576 chars — large JSON Schemas will be silently truncated by Dataverse

**Description:**
BRD FR-021 and the data model table specify `qdb_props_schema` as a Memo field with a maximum of 1,048,576 characters. The provisioning script created the field as `Memo(4000)`. Any JSON Schema longer than 4000 characters submitted to `POST /versions` will be accepted and validated by Ajv (which reads the in-memory string), then truncated by Dataverse at write time. The API will return HTTP 201 with a truncated `propsSchema` value. The caller has no indication that truncation occurred. Downstream consumers (DXP-P1-004 snapshots, DXP-P1-002 theme mapping) that rely on `propsSchema` completeness will read a broken JSON Schema without error.

This is a silent data corruption risk, not merely a functional gap.

**Evidence:**
- `phase-4-tech.md` entity table: `qdb_PropsSchema | qdb_propsschema | Memo(4000)`
- `phase-5-qa.md` D-003: confirmed release blocker, confidence 95%
- BRD FR-021: "max 1,048,576 characters"

**Likelihood:** Medium (complex form component schemas routinely exceed 4000 characters)
**Impact:** High (silent data corruption; API returns 201 with a broken schema stored in Dataverse)

**Mitigation:**
Re-provision `qdb_propsschema` with `MaxLength: 1048576`. Until re-provisioning is complete, add a pre-write length check in `createVersion()` that returns HTTP 413 (or 400 with code `props_schema_too_large`) when the string exceeds 4000 characters, preventing silent truncation. Re-provisioning resolves the root cause; the length check is an interim guard.

**Residual risk after mitigation:** Low

**Confidence: 95%**

---

### AUD-004

**Category:** Security
**Severity:** MEDIUM
**Risk ID:** AUD-004
**Title:** OData filter values include GUID parameters without single-quote wrapping in string filter expressions

**Description:**
Several OData filter strings in `ComponentRegistryService.ts` construct filter expressions for Lookup fields by inserting a GUID value directly as an integer-style comparand:

```
filter: `_qdb_definitionid_value eq ${definitionId} and statecode eq 0`
```

The `definitionId` value is a string (UUID format validated upstream by Zod), but Dataverse OData filter syntax for `edm.Guid` fields requires the value to be either unquoted (for some operators) or wrapped correctly. More critically, these filters do not apply `escapeODataString()` to the GUID parameter. Because `definitionId` is UUID-validated at the route layer by `z.string().uuid()`, the risk of OData filter injection here is low — a UUID cannot contain OData metacharacters. However, the absence of explicit sanitization creates an inconsistency in the defensive posture: `versionNumber` in the same service is correctly escaped, but `definitionId` is not. If the UUID validation were ever removed or bypassed upstream, this would become an injection vector.

**Evidence:**
- `ComponentRegistryService.ts:224–228` — `_qdb_definitionid_value eq ${id}` (deactivateDefinition)
- `ComponentRegistryService.ts:264–268` — `_qdb_definitionid_value eq ${definitionId}` (listVersions)
- `ComponentRegistryService.ts:323` — `_qdb_definitionid_value eq ${definitionId}` (createVersion)
- `ComponentRegistryService.ts:427` — `_qdb_definitionid_value eq ${definitionId}` (setLatestVersion)
- Compare with correct escaping at `ComponentRegistryService.ts:323,361`: `escapeODataString(body.versionNumber)`

**Likelihood:** Low (UUID Zod validation at route layer is a strong upstream guard)
**Impact:** Medium (OData filter injection if UUID guard is bypassed)

**Mitigation:**
Apply a UUID format validator inside the service layer as a defence-in-depth measure, so that even if the Zod route schema is removed, the service rejects non-UUID values before constructing filter strings. Alternatively, apply OData filter construction via a typed query builder rather than string interpolation.

**Residual risk after mitigation:** Low

**Confidence: 85%**

---

### AUD-005

**Category:** Security
**Severity:** MEDIUM
**Risk ID:** AUD-005
**Title:** Service principal is provisioned with System Administrator role and no post-provisioning privilege reduction is confirmed

**Description:**
BRD Assumption A-002 states: "The service principal used by the provisioning script has System Administrator role at provisioning time. This role is reduced to a custom role after provisioning completes." BRD Assumption A-003 states: "The portal shell backend API service principal has sufficient Dataverse privileges (Read, Write, Create, Delete) on the new QdbDxpPlatform entities. These privileges must be granted after provisioning." There is no evidence in the Phase 4 technical build or Phase 5 QA documents that either privilege reduction was performed. If the runtime service principal retains System Administrator access to Dataverse, it can read, write, and delete any record in the org — including QdbPortalShell, QdbDynamicFormEngine, and system entities — from a compromised API process.

**Evidence:**
- BRD Section 10, A-002 and A-003 (precondition assumptions, not confirmed as completed)
- Phase 4 and Phase 5 documents contain no entry confirming service principal privilege reduction
- `DataverseHttpClient.ts` operates with whatever privileges the token carries — there is no application-layer privilege check

**Likelihood:** Medium (common DevOps gap; broad permissions left in place post-provisioning)
**Impact:** High (System Admin SP can exfiltrate or corrupt the entire Dataverse org)

**Mitigation:**
Create a dedicated Dataverse security role granting only Read, Write, Create, Delete on `qdb_component_definitions` and `qdb_component_versions` and assign it to the runtime service principal. Revoke System Administrator for the provisioning SP after provisioning completes; create a separate provisioning-only SP for future schema changes. Document the assigned security role in the deployment runbook.

**Residual risk after mitigation:** Low

**Confidence: 90%**

---

### AUD-006

**Category:** Security / Operations
**Severity:** MEDIUM
**Risk ID:** AUD-006
**Title:** `console.log` calls in provisioning script violate the no-console-log standard

**Description:**
The Maqsad AI coding standard (`.claude/rules/common.md`) states: "No `console.log` in committed code. Use structured logger (pino/winston)." The provisioning script uses `console.log` extensively throughout `DataverseHttpClient.ts`, `ComponentDefinitionSeed.ts`, and all phase files. While the provisioning script is a CLI tool that legitimately writes to stdout, the specific concern is that `DataverseHttpClient.ts:93` logs a human-readable retry warning: `console.log('[WARN] 401 on ${operation} — re-acquiring token and retrying')`. If the `LOG_LEVEL` check at line 92 is misconfigured, a high-frequency retry loop could produce repetitive log output. More significantly, the `DataverseHttpClient.ts:161` debug log `console.log('[DEBUG] POST ${path}')` confirms the full OData path being called — which exposes entity names in plaintext logs, a minor but auditable information-disclosure risk in a CI/CD pipeline context.

**Evidence:**
- `DataverseHttpClient.ts:93` — `console.log('[WARN] 401 ...`
- `DataverseHttpClient.ts:103,108` — `console.log('[WARN] 429 ...')`, `console.log('[WARN] 503 ...')`
- `DataverseHttpClient.ts:122,161` — `console.log('[DEBUG] ...')`
- `ComponentDefinitionSeed.ts:60,68–110` — extensive `console.log` calls

**Likelihood:** Low (provisioning script is not customer-facing; runs in controlled DevOps context)
**Impact:** Low (information disclosure in CI logs; standards violation)

**Mitigation:**
Replace `console.log` with a structured logger (pino) in the provisioning script. Pass the logger as a dependency to `DataverseHttpClient` and phase modules. This is a code quality standard compliance fix, not a blocking security issue.

**Residual risk after mitigation:** Negligible

**Confidence: 99%**

---

### AUD-007

**Category:** Security
**Severity:** MEDIUM
**Risk ID:** AUD-007
**Title:** `PatchVersionSchema` silently strips immutable fields rather than explicitly rejecting them

**Description:**
BRD C-006 requires that a PATCH to `/versions/:id` must explicitly reject an `isLatest` field in the request body. BRD C-005 requires rejection of `propsSchema` and `versionNumber` in a PATCH body. The current `PatchVersionSchema` (Zod `z.object({ changeLog: ... })`) uses Zod's default strip mode, which silently discards unknown fields including `isLatest`, `propsSchema`, and `versionNumber`. A caller sending `{ changeLog: "x", isLatest: true }` receives HTTP 204 with the isLatest change silently dropped, not HTTP 400 as the BRD constraint requires. This does not result in incorrect data being written (the immutable fields are truly ignored), but it violates the explicit-rejection contract and makes the API misleading to callers who believe their isLatest value was accepted.

**Evidence:**
- `routes/admin/components.ts:47–49` — `PatchVersionSchema` exposes only `changeLog`; no `.strict()` or explicit field rejection
- BRD C-006: "The PATCH /versions/:id endpoint must explicitly reject an is_latest field in the request body"
- BRD C-005: "qdb_version_number + qdb_props_schema are immutable after creation. The API must enforce this via HTTP 400 on PATCH attempts targeting these fields"
- `phase-5-qa.md` Section 7: "acceptable, but should be documented or actively rejected"

**Likelihood:** High (any well-written client sending isLatest=true via PATCH will receive 204, believing the write succeeded)
**Impact:** Medium (incorrect API contract; no actual data corruption since Zod strips the field)

**Mitigation:**
Apply `.strict()` to `PatchVersionSchema` to convert unknown fields into a Zod parse error, returning HTTP 400 (or HTTP 422 via the global error handler) when `isLatest`, `propsSchema`, or `versionNumber` is present in the body. Same pattern should be applied to `PatchDefinitionSchema` to reject `name` and `category` explicitly per BRD FR-042.

**Residual risk after mitigation:** Low

**Confidence: 95%**

---

### AUD-008

**Category:** Security
**Severity:** MEDIUM
**Risk ID:** AUD-008
**Title:** `category` field is patchable via PATCH /definitions/:id — BRD marks it as immutable

**Description:**
BRD FR-042 states: "The qdb_name and qdb_category fields are immutable after creation and must be rejected with HTTP 400 if included in a PATCH body." The `PatchDefinitionSchema` (`routes/admin/components.ts:32–39`) exposes `category: z.number().int().optional()`, which means a caller can update the category of an existing component definition. Changing the category of a definition that has been referenced by GUID in DXP-P1-002 theme token assignments or DXP-P1-003 RBAC grants would corrupt cross-engagement data integrity, since those downstream records assumed a stable category at the time of reference.

**Evidence:**
- `routes/admin/components.ts:37` — `category: z.number().int().optional()` in `PatchDefinitionSchema`
- `ComponentRegistryService.ts:214` — `if (body.category !== undefined) patch['qdb_category'] = body.category`
- BRD FR-042: "The qdb_name and qdb_category fields are immutable after creation and must be rejected with HTTP 400 if included in a PATCH body"

**Likelihood:** High (the field is exposed and accepted; any caller can change it)
**Impact:** High (corrupts downstream engagement data contracts that assume stable category)

**Mitigation:**
Remove `category` from `PatchDefinitionSchema`. Apply `.strict()` to ensure any future addition of category is caught at the schema level. Update `PatchDefinitionBody` interface in `ComponentRegistryService.ts` to remove `category` from the body type. Add a corresponding test case that verifies PATCH with `{ category: N }` returns HTTP 400.

**Residual risk after mitigation:** Low

**Confidence: 99%**

---

### AUD-009

**Category:** Security
**Severity:** LOW
**Risk ID:** AUD-009
**Title:** Zod validation failures for route parameters return HTTP 400 (thrown directly) rather than going through the global error handler for Zod

**Description:**
Route handlers call `IdParamSchema.parse(request.params)` and `ListQuerySchema.parse(request.query)` directly. When Zod throws a `ZodError`, it propagates to Fastify's global error handler in `app.ts:128–157`, which catches `ZodError` by name and returns HTTP 422 with structured error details. However, HTTP 422 (Unprocessable Entity) is semantically different from HTTP 400 (Bad Request) for parameter validation failures. More importantly, the global handler's production mode strips details (`isProduction ? 'An unexpected error occurred' : error.message`), while the C-011 contract for error shape consistency is not formally defined in an OpenAPI spec. Callers in different environments receive different error shapes.

**Evidence:**
- `app.ts:142–148` — ZodError caught, returns HTTP 422
- `routes/admin/components.ts:80,107,130,153,229,254,278,303,327` — direct `.parse()` calls that throw on invalid input
- BRD C-011: "All API routes under /api/admin/components/** must return error responses following the existing portal-shell error schema"
- `phase-5-qa.md` Definition of Done: "OpenAPI spec documents all 11 routes including error shapes (C-011)" — noted as not yet complete

**Likelihood:** Low
**Impact:** Low (inconsistent error shapes degrade API ergonomics for downstream consumers)

**Mitigation:**
Define and publish an OpenAPI spec documenting all 11 routes with their error response shapes. Align on whether parameter validation errors should return 400 or 422 and apply consistently.

**Residual risk after mitigation:** Negligible

**Confidence: 85%**

---

### AUD-010

**Category:** Security
**Severity:** LOW
**Risk ID:** AUD-010
**Title:** Seed data in provisioning script uses hardcoded option-set integer values

**Description:**
`ComponentDefinitionSeed.ts` hardcodes `category: 860004001`, `860004004`, `860004005` directly. These values are the Dataverse-assigned integer keys for the `qdb_component_category` global option set. BRD C-004 states: "The provisioning script and API must not hard-code any Dataverse record GUIDs." While this constraint is specifically about GUIDs, the spirit of C-004 applies equally to option set values, which differ between publisher prefixes and orgs. Additionally, the `announcements` seed record is assigned `860004004` (which corresponds to the `nav-component` or an unspecified label depending on org assignment), and `statistics` is also assigned `860004004`, while `quick-actions` uses `860004005`. None of these match the BRD-specified `widget` category value of `100000003`. There is an apparent category assignment error in the seed data that was not caught by QA (since TC-001 validated record count, not category values).

**Evidence:**
- `ComponentDefinitionSeed.ts:33–43` — `announcements` uses category `860004004`, `quick-actions` uses `860004005`, `statistics` uses `860004004`
- BRD `GlobalOptionSet qdb_component_category` table: `100000003 = widget`
- The `my-requests-summary` and `recent-activity` seeds use `860004001`, which is presumably the correct widget value for this org, but is org-specific
- `phase-4-tech.md` TC-011: Filter by `860004001` to return widgets — confirming that org uses `860004001` for Widget, not `100000003` as BRD states

**Likelihood:** Medium (org-specific values are in place and functionally work, but cross-org portability is broken; category assignments for announcements and quick-actions appear wrong)
**Impact:** Medium (seed data incorrect categories compromise registry integrity; cross-org deployment will fail)

**Mitigation:**
Replace all hardcoded category integers with a pre-flight lookup that reads the `qdb_component_category` option set values by label at runtime. Verify the correct category label for each widget seed definition against the BRD specification.

**Residual risk after mitigation:** Low

**Confidence: 88%**

---

## OWASP Top 10 Assessment (2021)

---

**A01 — Broken Access Control**

Applicable: Yes.

Mitigated by: JWT Bearer authentication on all 11 routes (`app.authenticate`). Admin role claim checked via `app.requireRole('Admin')`. UUID validation on all ID parameters (prevents enumeration). Soft-delete pattern prevents record deletion. Cross-ownership check on version access (`getVersionById` validates `_qdb_definitionid_value === definitionId`).

Gaps:
- AUD-002: Admin role rejection path never live-tested with a non-Admin token. Until TC-052 is confirmed, access control correctness is unverified for role enforcement.
- AUD-008: `category` field is incorrectly patchable despite BRD marking it immutable.
- AUD-007: PATCH body silently accepts and strips `isLatest` rather than explicitly rejecting it — incorrect API contract.

Overall: Partially mitigated. AUD-002 and AUD-008 must be resolved.

---

**A02 — Cryptographic Failures**

Applicable: Partially.

Mitigated by: All credentials (`CLIENT_SECRET`, `DATAVERSE_CLIENT_SECRET`) loaded from environment variables. `.env` not committed. `.env.example` contains only placeholders. Bearer tokens never logged (only operation name at DEBUG level). MSAL client credentials flow used for Dataverse token acquisition (industry-standard OAuth 2.0). Fastify JWT is used for API authentication.

Gaps:
- No documentation of the JWT signing algorithm and key rotation policy. If `JWT_SECRET` is a weak shared secret rather than an asymmetric key pair, token forgery risk exists.
- The audit does not confirm TLS termination configuration for the Fastify API in production. Data in transit protection is assumed but not verified from the artefacts reviewed.

Overall: Substantially mitigated. JWT key strength and TLS configuration should be confirmed in the deployment runbook.

**Confidence: 85%**

---

**A03 — Injection**

Applicable: Yes.

Mitigated by: All OData string filter values escaped via `escapeODataString()` (single-quote doubling). No SQL — data access exclusively via Dataverse OData v4 REST. Zod validation at every API boundary prevents malformed input reaching the service layer. UUID parameters validated before use in filter strings.

Gaps:
- AUD-004: GUID filter values (`definitionId`) are interpolated into OData filter strings without sanitization, relying entirely on upstream Zod UUID validation. This is defence-in-depth gap only; not an active injection risk given current code.

Overall: Substantially mitigated. The escaping function covers string values. AUD-004 is a defence-in-depth improvement.

---

**A04 — Insecure Design**

Applicable: Yes.

Mitigated by: Soft-delete pattern enforced (no hard DELETE on records). FK integrity enforced at both API and Dataverse layers. Duplicate name and duplicate version checks prevent data corruption. Alternate key on `qdb_name` enforces uniqueness at Dataverse platform layer.

Gaps:
- AUD-001: The set-latest operation is not atomic. This is a design-level security gap — a platform invariant (single-latest per definition) can be violated by concurrent requests. The design calls for `$batch`; the implementation did not deliver it.
- The `GET .../versions/latest` endpoint is unimplemented (D-007), meaning downstream consumers have no API contract for resolving the canonical version. This forces them to implement client-side filtering of the version list, which is error-prone.

Overall: Partially mitigated. AUD-001 is a confirmed design gap that must be resolved.

---

**A05 — Security Misconfiguration**

Applicable: Yes.

Mitigated by: CORS registered as a dedicated plugin (`registerCors`). Rate limiting applied globally (`registerRateLimit`). Production mode strips error details from responses. Plugin registration order is documented and enforced.

Gaps:
- AUD-005: Service principal privilege scope not confirmed. If the runtime SP retains System Administrator access, this is a significant misconfiguration.
- No evidence of HTTP security headers (HSTS, CSP, X-Frame-Options) in the Fastify configuration visible in the artefacts reviewed. These should be confirmed in the deployment configuration.

Overall: Partially mitigated. AUD-005 must be resolved.

---

**A06 — Vulnerable and Outdated Components**

Applicable: Yes.

Mitigated by: Ajv v6 used for JSON Schema validation. This is an older major version; Ajv v8 is the current stable release. The API uses `@azure/msal-node` for token acquisition.

Gaps:
- Ajv v6 is end-of-life. Ajv v8 introduced breaking changes in schema compilation. A dependency audit should confirm whether Ajv v6 is the pinned version intentionally or by oversight. If any component depends on Ajv v6 APIs that changed in v8, upgrade requires a migration.
- No evidence of a dependency scanning tool (Dependabot, Snyk) configured in the CI pipeline for this project.

**Confidence: 85%**

Overall: Partially mitigated. Ajv upgrade plan should be documented.

---

**A07 — Identification and Authentication Failures**

Applicable: Yes.

Mitigated by: JWT required on all routes (HTTP 401 on absence, confirmed by TC-050). Expired JWT rejection expected (TC-053, pending live execution). Malformed Authorization header rejection expected (TC-054, pending live execution).

Gaps:
- AUD-002: Admin role enforcement live test pending. TC-052 gap remains open.
- TC-053 and TC-054 are pending execution — expired JWT and malformed token rejection paths are unconfirmed against the running API.

Overall: Partially mitigated. TC-052, TC-053, and TC-054 must be executed before go-live.

---

**A08 — Software and Data Integrity Failures**

Applicable: Yes.

Mitigated by: `propsSchema` validated as valid JSON Schema using Ajv before write. Zod validates all request body shapes at the API boundary. Dataverse alternate key enforces name uniqueness. Idempotent provisioning script prevents schema drift on re-runs.

Gaps:
- AUD-001: is_latest invariant can be violated by concurrent writes — this is a data integrity failure mode.
- AUD-003: Silent truncation of `propsSchema` at 4000 characters is a data integrity failure — the stored value diverges from what was submitted.
- AUD-007/AUD-008: Incorrect fields accepted in PATCH bodies represent partial integrity failures.

Overall: Partially mitigated. AUD-001 and AUD-003 must be resolved.

---

**A09 — Security Logging and Monitoring Failures**

Applicable: Yes.

Mitigated by: All 11 routes emit structured pino log entries with `operation`, `correlationId`, and `userId`. No `console.log` in committed API code (provisioning script uses console.log — see AUD-006). Bearer tokens never logged. Global error handler logs full error context including `correlationId`. Credentials never appear in logs.

Gaps:
- AUD-001: If the first PATCH in set-latest succeeds but the second fails, the incident is logged as an error but the data state (no latest version) is not surfaced with an alerting mechanism.
- No evidence of an alerting or monitoring integration (e.g. Application Insights, Datadog) configured for the Fastify API. Log generation is correct; log consumption and alerting are unconfirmed.
- TC-080 (structured log entry with correlationId on every route call) is PENDING formal execution.

Overall: Substantially mitigated. Alerting integration should be confirmed in the deployment configuration.

---

**A10 — Server-Side Request Forgery (SSRF)**

Applicable: Low — the API does not fetch URLs supplied by callers at runtime.

The `qdb_bundle_url` field stores a URL string only; the BRD explicitly states "bundle serving is out of scope" and the API does not attempt to fetch this URL. The `renderTargets` field stores a JSON array of string labels, not URLs.

Gaps: None identified.

Overall: Not applicable to this engagement's scope. Future engagements that serve bundle content from `bundle_url` must assess SSRF at that time.

---

## Compliance Assessment

---

### Framework: Maqsad AI Clean Code Standards (CLAUDE.md / .claude/rules/common.md)

**Requirement: No `any` types; strict TypeScript mode**
Status: Met — `strict: true` is implied by the tsconfig setup; no `any` types are visible in `ComponentRegistryService.ts` or `components.ts`. The `as unknown as T` cast in `DataverseHttpClient.ts:181` is acceptable for the OData entity ID extraction pattern.
Gap: None.

**Requirement: Functions maximum 20 lines; single responsibility**
Status: Partially met.
- `ComponentRegistryService.createDefinition()` is 30 lines (lines 172–201). Exceeds the 20-line maximum.
- `ComponentRegistryService.createVersion()` is 42 lines (lines 310–371). Significantly exceeds the 20-line maximum. The duplicate-check, validation, create, and re-fetch logic should be extracted into separate methods.
- `ComponentRegistryService.setLatestVersion()` is 39 lines (lines 414–452). Exceeds limit.
Gap: Three methods violate the 20-line function rule. Each should be decomposed.
Confidence: 99%

**Requirement: Maximum 3 parameters**
Status: Met — all methods use 2–3 parameters.

**Requirement: No boolean flag parameters**
Status: Met.

**Requirement: Command-Query Separation**
Status: Partially met.
- `createDefinition()` and `createVersion()` both perform writes and then return the created record (command + query). The Dataverse POST/re-fetch pattern makes this difficult to avoid architecturally, but it violates CQS.
Gap: Acceptable given Dataverse's 204 POST response pattern. Should be documented as a known CQS exception.
Confidence: 90%

**Requirement: Error handling — never swallow exceptions**
Status: Met — `validatePropsSchema` catches and re-throws as `RegistryError`. `parseRenderTargets` catches and returns `[]` (silent fallback — see below).
Gap: `parseRenderTargets()` at `ComponentRegistryService.ts:534–540` catches a JSON parse error and returns an empty array silently. If `qdb_rendertargets` contains malformed JSON (e.g. written directly to Dataverse outside the API), callers receive an empty array with no indication of corruption. This should log the parse error and optionally return null or throw.
Confidence: 90%

**Requirement: No hardcoded GUIDs, thresholds, or business values**
Status: Partially met.
- `DEFINITIONS_ENTITY = 'qdb_component_definitionses'` and `VERSIONS_ENTITY = 'qdb_component_versionses'` are module-level constants — acceptable.
- `SOLUTION_UNIQUE_NAME = 'QdbDxpPlatform'` in `DataverseHttpClient.ts:25` is a hardcoded solution name — acceptable for a provisioning tool.
- AUD-010: Seed data hardcodes category option set integers — standards violation.

**Requirement: Structured logging; no console.log**
Status: API layer — Met (pino only). Provisioning script — Not met (AUD-006).

**Requirement: XML doc comments on all public methods and classes**
Status: Not met.
- `ComponentRegistryService.ts` has no JSDoc on any public method.
- `routes/admin/components.ts` has a JSDoc block on `adminComponentRoutes` only.
Gap: All 11 public service methods lack JSDoc documentation. For an SDK-style service that will be consumed by downstream DXP engagements, this is a governance gap.
Confidence: 99%

**Requirement: Tests — 80% coverage minimum**
Status: Not yet confirmed.
- Phase 5 Definition of Done includes the 80% coverage requirement but the automated test suite has not been written.
Gap: No automated test suite exists at the time of this audit. 24 test cases were manually executed; none are in the automated Vitest suite. This is a blocker per the Maqsad AI standards.
Confidence: 99%

---

### Framework: BRD Requirements Compliance

**FR-053 — OData $batch for set-latest**
Status: NOT MET. Two sequential PATCH calls used instead of $batch. (AUD-001)

**FR-021 — qdb_props_schema Memo max 1,048,576 chars**
Status: NOT MET. Provisioned at Memo(4000). (AUD-003)

**FR-022 — qdb_default_props field**
Status: NOT MET. Field not provisioned, not exposed in API. (D-004)

**FR-023 — qdb_bundle_url field**
Status: NOT MET. Field not provisioned, not exposed in API. (D-005)

**FR-027 — qdb_deprecated_on field**
Status: NOT MET. Field not provisioned, not exposed in API. (D-006)

**FR-046 — GET .../versions/latest endpoint**
Status: NOT MET. Endpoint not implemented. (D-007)

**FR-042 — category immutable after creation (PATCH must reject)**
Status: NOT MET. category is accepted by PatchDefinitionSchema. (AUD-008)

**C-006 — PATCH versions must explicitly reject isLatest**
Status: NOT MET. isLatest is silently stripped, not explicitly rejected. (AUD-007)

**NFR-007 — Non-Admin returns 403**
Status: UNCONFIRMED. Code exists; live test not executed. (AUD-002)

**NFR-010 — Dataverse auditing enabled on both entities**
Status: CONFIRMED by provisioning script phase configuration — Dataverse standard audit fields are present per phase-4-tech.md.

**NFR-011 — Provisioning script idempotent**
Status: CONFIRMED — 3 consecutive runs passed per TC-001/TC-002.

**NFR-012 — $top and $skip pagination on list endpoints**
Status: PARTIALLY MET. $top is implemented. $skip is accepted but does not advance the result window (Dataverse does not support OData $skip; $skiptoken cursor pagination is deferred). This is a documented deviation in phase-4-tech.md.

---

## Data Residency Review

**Data location:** Microsoft Dataverse, organisation `org5869857f.crm4.dynamics.com`.

The `.crm4` region suffix maps to the EMEA Dataverse region. For QDB (Qatar Development Bank), the applicable regulatory context is the Qatar Financial Centre (QFC) and Qatar Central Bank (QCB) data residency requirements, which mandate that data relating to Qatari citizens and financial transactions reside within Qatar or approved jurisdictions.

**Assessment:**

The `.crm4` region is EMEA (Europe, Middle East, Africa). Microsoft does not publicly guarantee sub-regional placement within `.crm4` — data may reside in European datacentres. For a Qatari government-adjacent institution, this may not satisfy QCB or QFC data localisation requirements if those requirements mandate Qatar-resident storage.

The Component Registry stores component metadata only (display names, JSON Schemas, version numbers, category classifications). It does not store citizen PII, financial transaction data, or personally identifiable information. The `qdb_propsschema` field stores JSON Schema documents (structural metadata), not citizen data. The `renderTargets` field stores component surface labels. No citizen-identifying data flows through this registry.

**Determination:**

For the Component Registry specifically, data residency risk is low because the stored data is structural platform metadata, not citizen data. However:

1. If QDB has a blanket data residency policy requiring all data — including metadata — to remain within Qatar, the EMEA region placement requires a formal waiver or migration to a Qatar-resident infrastructure.
2. The Dataverse service used here is the same org that hosts `QdbPortalShell` and `QdbDynamicFormEngine`, which may contain citizen data. The organisation-level data residency question should be resolved at the platform level, not per-solution.

**Recommendation:** Obtain a written confirmation from QDB IT that org5869857f's data residency is compliant with applicable QDB/QCB/QFC requirements. If not already confirmed, this should be a pre-go-live gate for all DXP engagements, not DXP-P1-001 alone.

**Cross-border transfer risk:** The Fastify API is hosted in a separate infrastructure (location not specified in reviewed documents). API calls between the Next.js admin UI and the Fastify API, and between the Fastify API and Dataverse, constitute cross-border transfers if hosted in different jurisdictions. TLS in transit is assumed but not confirmed.

**Confidence: 85%**

---

## Audit Trail Validation

**Can every state transition be reconstructed from logs alone?**

Partially. The Fastify pino logs capture every Admin operation with `operation`, `correlationId`, and `userId`. Dataverse natively records `createdon`, `createdby`, `modifiedon`, `modifiedby` on both entities — these are confirmed enabled per BRD NFR-010 and phase-4-tech.md. Dataverse audit history (if enabled at the org and entity level in the Dataverse audit configuration — not just the solution metadata) provides a full change log of field-level modifications.

However:

1. **is_latest transitions are not logged at field level in the API.** The `setLatestVersion` method logs `operation: 'admin.components.versions.setLatest'` but does not log the previous latest version ID, the new latest version ID, or the before/after `qdb_islatest` values. A regulatory examiner auditing "when was version 2.0.0 promoted, and what was the previous latest?" cannot reconstruct this from the API log alone — they would have to rely on Dataverse audit history.

2. **Deactivation is not logged with the reason.** The `deactivateDefinition` and `deactivateVersion` methods log the operation but not the pre-deactivation state. For a platform where version records are intended to be permanent audit trail records (BRD glossary: "Component Version — created once; schema fields are immutable after creation"), knowing who deactivated a version and why is governance-critical.

3. **The provisioning script uses console.log rather than a structured logger**, meaning provisioning-time operations are not capturable in a structured audit trail.

4. **No append-only audit log table** exists for the registry operations. Dataverse's built-in audit history serves this role, but it must be explicitly confirmed as enabled at the entity level in the Power Platform admin centre, not merely declared in solution metadata.

**Is the audit log tamper-proof and append-only?**

Dataverse audit history is managed by Microsoft at the platform layer and cannot be altered by the service principal or by solution operations. It satisfies the append-only requirement at the platform level. The Fastify pino logs are only tamper-proof if log shipping to an immutable log store (e.g. Azure Monitor, Azure Log Analytics) is configured. There is no evidence of log shipping configuration in the reviewed artefacts.

**Recommendation:** Add structured log entries in `setLatestVersion` that record `{ previousLatestVersionId, newLatestVersionId }`. Add logging on deactivation operations that records the `isActive` before-state. Confirm Dataverse entity-level auditing is enabled in the Power Platform admin centre for both entities. Confirm pino logs are shipped to an immutable log store.

**Confidence: 90%**

---

## Service Account Review

| Account | Type | Used By | Declared Privileges | Confirmed Privileges | Least-Privilege Assessment |
|---------|------|---------|---------------------|----------------------|---------------------------|
| Provisioning SP (DATAVERSE_CLIENT_ID in provision-schema script env) | Azure AD Service Principal | `scripts/provision-schema/` — schema creation, entity provisioning, seed data writes | System Administrator (BRD A-002) at provisioning time; reduced to custom role post-provisioning | Not confirmed reduced — no evidence in Phase 4/5 documents | FAIL — System Administrator should have been revoked after provisioning. Required action: verify and reduce. |
| Runtime SP (CLIENT_ID / CLIENT_SECRET in Fastify API env) | Azure AD Service Principal | `apps/api/` — all 11 component registry routes, all existing portal shell routes | Read, Write, Create, Delete on QdbDxpPlatform entities (BRD A-003) | Not confirmed granted — no evidence in Phase 4/5 documents | UNCONFIRMED — if not yet granted, runtime API returns 403 from Dataverse on all component registry routes; if over-privileged, blast radius extends to entire org |

**Critical finding:** Neither service account's post-provisioning privilege state is documented as confirmed. This is a significant governance gap. The provisioning SP may still hold System Administrator. The runtime SP may not yet have been granted access to the new entities (meaning the API silently fails at Dataverse) or may have been granted broad access. Both scenarios require verification and documentation.

**Confidence: 90%**

---

## Code Audit — 7 Pass Results

### Pass 1 — Wiring

**Finding W-001** — INFO
`routes/admin/components.ts` registers all 11 routes and wires them to `ComponentRegistryService` methods. All inputs have handlers. All handlers return responses. No orphaned handlers detected.
The `adminComponentRoutes` plugin is registered in `app.ts:119–120`. The `ComponentRegistryService` is instantiated and injected correctly.
No wiring issues found.

**Finding W-002** — WARNING
`GET /api/admin/components/:id/versions/latest` (FR-046, D-007) has no route handler. It is defined in the BRD and referenced as a dependency by downstream engagements (DXP-P1-004). There is no registered route for this path. A request to `.../versions/latest` will match `.../versions/:versionId` with `versionId = "latest"`, triggering a Zod UUID validation failure (HTTP 400) rather than a 404. This is an accidental route collision.
File: `routes/admin/components.ts` — no `/latest` route registered.
Confidence: 99%

**Finding W-003** — INFO
The `handleRegistryError` function at `components.ts:347–355` re-throws unrecognised errors. This is correct — unhandled errors propagate to Fastify's global error handler.

---

### Pass 2 — Error Handling

**Finding E-001** — WARNING
`parseRenderTargets()` at `ComponentRegistryService.ts:534–540` silently returns `[]` on JSON parse failure. If a record has a corrupted `qdb_rendertargets` value, the API returns an empty array without logging the corruption. A caller has no indication that render targets were lost.
File: `ComponentRegistryService.ts:534–540`
Remediation: Log the parse error with the record ID before returning the fallback, or throw a `RegistryError` with code `corrupted_render_targets`.
Confidence: 90%

**Finding E-002** — INFO
`validatePropsSchema()` at `ComponentRegistryService.ts:475–488` has two nested try/catch blocks — one for JSON parse, one for Ajv compile. Both throw specific `RegistryError` instances. Error handling is correct and visible.

**Finding E-003** — INFO
The Ajv instance at `ComponentRegistryService.ts:14` is module-level (singleton). Ajv compile() caches schemas. If a malformed schema causes an Ajv internal error, the error is caught and re-thrown as `RegistryError`. No silent failures.

**Finding E-004** — WARNING
`DataverseHttpClient.ts:92–95` has a `console.log` inside a conditional for 401 retry. The condition checks `LOG_LEVEL`, but `LOG_LEVEL` is read from `env` which is module-level. If the env module fails to load (e.g. missing variable), the retry log would not fire, but the retry itself still occurs. Low risk; see AUD-006.

---

### Pass 3 — Completeness

**Finding C-001** — WARNING (RELEASE BLOCKER)
`GET /api/admin/components/:id/versions/latest` — not implemented. BRD FR-046 requires this endpoint. D-007 in phase-5-qa.md confirms this as a known gap.
File: `routes/admin/components.ts` — missing route.
Confidence: 99%

**Finding C-002** — WARNING (RELEASE BLOCKER)
`qdb_default_props`, `qdb_bundle_url`, `qdb_deprecated_on` fields — not provisioned in Dataverse schema and not exposed in API. BRD FR-022, FR-023, FR-027 specify these as required fields. D-004, D-005, D-006 in phase-5-qa.md confirm.
Files: `scripts/provision-schema/src/entities/definitions/componentVersions.ts` (field definitions absent); `ComponentRegistryService.ts` (DataverseVersion interface missing these fields).
Confidence: 99%

**Finding C-003** — WARNING
No automated test files exist under `apps/api/src/__tests__/admin/components/`. The phase-5 definition of done requires Vitest automated coverage at 80% minimum. The test suite is described in phase-5 but not written.
Confidence: 99%

**Finding C-004** — INFO
`DRY_RUN` mode in provisioning script is implemented and guarded at `ComponentDefinitionSeed.ts:79–82`. TC-003 requires a clean org to verify — this is a known gap. Implementation appears complete; execution gap only.

---

### Pass 4 — Dead Code

**Finding D-001** — PRUNE
`PatchDefinitionBody.category` at `ComponentRegistryService.ts:68` is dead code for the intended contract: BRD marks category as immutable after creation. The field is defined in the body type, accepted by the Zod schema (AUD-008), and written to Dataverse via the patch map at line 214. It should be removed entirely.
File: `ComponentRegistryService.ts:68`, `routes/admin/components.ts:37`
Confidence: 99%

**Finding D-002** — INFO
`type AuthHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>` at `routes/admin/components.ts:51` is defined locally but only used once at line 73. This is acceptable as documentation of the type; not a meaningful bloat concern.

---

### Pass 5 — Bloat

**Finding B-001** — WARNING
`ComponentRegistryService.createVersion()` is 62 lines (lines 310–371). This violates the 20-line function maximum and the single-responsibility principle. The method performs: parent definition existence check, duplicate version number check, props schema validation, Dataverse create call, and re-fetch by version number. Each step should be a private method.
File: `ComponentRegistryService.ts:310–371`
Confidence: 99%

**Finding B-002** — WARNING
`ComponentRegistryService.createDefinition()` is 30 lines (lines 172–201). Exceeds the 20-line maximum. The duplicate check, create, and re-fetch steps should be extracted.
File: `ComponentRegistryService.ts:172–201`
Confidence: 99%

**Finding B-003** — WARNING
`ComponentRegistryService.setLatestVersion()` is 39 lines (lines 414–452). Exceeds the 20-line maximum.
File: `ComponentRegistryService.ts:414–452`
Confidence: 99%

**Finding B-004** — INFO
`DataverseHttpClient.ts` is 294 lines. Within the 400-line standard. No action required.

**Finding B-005** — INFO
`ComponentRegistryService.ts` is 545 lines. Exceeds the 400-line typical threshold. The mapper functions (lines 494–544) could be extracted to a `ComponentRegistryMapper.ts` module to bring the service file within standard.
File: `ComponentRegistryService.ts` (545 lines)
Confidence: 90%

---

### Pass 6 — Hardcoding

**Finding H-001** — WARNING
`ComponentDefinitionSeed.ts:26,31,38,43,50` — hardcoded option set integer values `860004001`, `860004004`, `860004005`. These are org-specific values that will differ across development, staging, and production orgs. (See AUD-010.)
File: `ComponentDefinitionSeed.ts:26,31,38,43,50`
Confidence: 88%

**Finding H-002** — INFO
`DEFINITIONS_ENTITY = 'qdb_component_definitionses'` and `VERSIONS_ENTITY = 'qdb_component_versionses'` are module-level constants in `ComponentRegistryService.ts:11–12`. These are correct — entity collection names are configuration, and placing them as named constants is the right pattern.

**Finding H-003** — INFO
`SOLUTION_UNIQUE_NAME = 'QdbDxpPlatform'` in `DataverseHttpClient.ts:25`. Acceptable for a provisioning tool. Should be moved to the env schema if multi-solution support is ever required.

**Finding H-004** — INFO
`ADMIN_ROLE = 'Admin'` at `routes/admin/components.ts:12`. Acceptable constant naming. The role name is a configuration concern that is correctly extracted rather than inlined.

---

### Pass 7 — Security

**Finding S-001** — CRITICAL
AUD-008 confirmed here: `PatchDefinitionSchema` at `routes/admin/components.ts:37` exposes `category: z.number().int().optional()`. A caller can mutate the category of a deployed component definition, breaking downstream engagement data contracts.
File: `routes/admin/components.ts:37`, `ComponentRegistryService.ts:214`
Confidence: 99%

**Finding S-002** — CRITICAL
AUD-001 confirmed here: `setLatestVersion()` at `ComponentRegistryService.ts:414–452` uses two sequential PATCH calls. No atomic guarantee.
File: `ComponentRegistryService.ts:436–451`
Confidence: 99%

**Finding S-003** — WARNING
AUD-004 confirmed here: `_qdb_definitionid_value eq ${id}` at `ComponentRegistryService.ts:224,264,323,427`. GUID values interpolated into OData filter strings without escaping.
File: `ComponentRegistryService.ts:224,264,323,427`
Confidence: 85%

**Finding S-004** — WARNING
AUD-007 confirmed here: `PatchVersionSchema` at `routes/admin/components.ts:47–49` does not use `.strict()`, allowing silent strip of `isLatest`, `propsSchema`, `versionNumber`.
File: `routes/admin/components.ts:47–49`
Confidence: 95%

**Finding S-005** — INFO
`validatePropsSchema` correctly validates JSON Schema structure using Ajv before any Dataverse write. No security issue.

**Finding S-006** — INFO
`escapeODataString` correctly handles single-quote injection in string filter values. The pattern `value.replace(/'/g, "''")` is the correct OData escaping approach.

**Finding S-007** — WARNING
AUD-006 confirmed here: `DataverseHttpClient.ts:93,103,108,122,161` — `console.log` calls in production code. Provisioning-context only, but violates the coding standard.
File: `DataverseHttpClient.ts:93,103,108,122,161`
Confidence: 99%

---

## Governance Gaps

Ranked by severity (highest first). All must be addressed before go-live.

---

**GGAP-001 — CRITICAL — FR-053 $batch atomicity not implemented**
Description: The set-latest operation uses two sequential PATCH calls instead of an OData $batch request. The platform-wide is_latest invariant (NFR-005) can be transiently violated by concurrent admin operations. All three downstream DXP engagements depend on this invariant.
Risk if unaddressed: Downstream consumers (DXP-P1-002, P1-003, P1-004) consume incorrect "latest" version data. Platform identity contract is unreliable.
Remediation: Implement `$batch` support in `DataverseClient` and replace the two PATCH calls. Alternatively, implement a Dataverse server-side plugin enforcing the invariant. Document the decision as an ADR.
References: AUD-001, phase-5-qa.md D-001.

---

**GGAP-002 — CRITICAL — category field patchable in violation of BRD FR-042**
Description: `PatchDefinitionSchema` accepts `category` as an optional field. The BRD mandates that category is immutable after creation. A caller can change the category of a registered component definition, invalidating downstream RBAC and theme-token assignments.
Risk if unaddressed: Data corruption in DXP-P1-002 and P1-003 which reference component definitions by category for feature-scoped operations.
Remediation: Remove `category` from `PatchDefinitionSchema` and `PatchDefinitionBody`. Apply `.strict()` to ensure the constraint is enforced explicitly.
References: AUD-008.

---

**GGAP-003 — CRITICAL — qdb_propsschema field capped at 4000 chars; BRD requires 1,048,576**
Description: Silent Dataverse truncation will corrupt large JSON Schemas with no API-layer error.
Risk if unaddressed: Complex component props schemas are stored in a truncated, broken state. `createVersion` returns HTTP 201 with silently corrupted data.
Remediation: Re-provision `qdb_propsschema` with MaxLength 1048576. Add an interim pre-write length guard returning HTTP 413 until re-provisioning is complete.
References: AUD-003, phase-5-qa.md D-003.

---

**GGAP-004 — HIGH — Admin role rejection never live-tested**
Description: TC-052 has not been executed. The `app.requireRole('Admin')` pre-handler has never been exercised with a non-Admin token against a running API.
Risk if unaddressed: If the role guard has a defect, all 11 routes are accessible to any authenticated user — a complete access control bypass on the component registry.
Remediation: Provision a Viewer-role test account, execute TC-052, and add it to the automated security test suite.
References: AUD-002.

---

**GGAP-005 — HIGH — Service principal privilege reduction not confirmed**
Description: No evidence that the provisioning SP was downgraded from System Administrator after provisioning, and no evidence that the runtime SP was granted minimum-required privileges to the new entities.
Risk if unaddressed: Runtime API or provisioning SP with System Administrator access can read, write, or delete any record in the Dataverse org, including citizen-sensitive data in QdbPortalShell and QdbDynamicFormEngine.
Remediation: Create a dedicated Dataverse security role for the runtime SP. Confirm provisioning SP privilege reduction. Document in the deployment runbook.
References: AUD-005.

---

**GGAP-006 — HIGH — No automated test suite; 80% coverage requirement unmet**
Description: 24 test cases were executed manually. No Vitest automated test files exist under `apps/api/src/__tests__/admin/components/`. The Maqsad AI coding standard mandates 80% line coverage on all new production code.
Risk if unaddressed: Regressions in `ComponentRegistryService.ts` and `components.ts` are not caught in CI. Downstream engagements that rely on stable registry behaviour have no automated regression guard.
Remediation: Write the automated Vitest test suite per the automation plan in phase-5-qa.md Section 9. Execute against live Dataverse in CI nightly runs. Confirm coverage report shows >= 80%.
References: phase-5-qa.md Section 9 and Definition of Done.

---

**GGAP-007 — HIGH — GET .../versions/latest endpoint not implemented**
Description: FR-046 requires this endpoint. Without it, downstream consumers must implement client-side filtering of the version list, which is error-prone and makes `GET /versions` a full-list call (potentially expensive for components with many versions).
Risk if unaddressed: DXP-P1-004 (Versioning & Snapshots) cannot resolve the canonical version by a simple API call. The accidental route collision (W-002) means a `GET .../versions/latest` returns HTTP 400 rather than 404, making the gap invisible to callers.
Remediation: Implement `GET /api/admin/components/:id/versions/latest` before registering the `:versionId` route to prevent the path collision.
References: phase-5-qa.md D-007, W-002.

---

**GGAP-008 — MEDIUM — PATCH body silently strips isLatest instead of explicitly rejecting**
Description: BRD C-006 requires HTTP 400 when isLatest is included in a PATCH /versions/:id body. Current implementation silently strips it (Zod strip mode).
Risk if unaddressed: Callers believe isLatest was accepted. Incorrect API contract for downstream integration teams.
Remediation: Apply `.strict()` to `PatchVersionSchema` and `PatchDefinitionSchema`.
References: AUD-007.

---

**GGAP-009 — MEDIUM — Missing BRD fields: qdb_default_props, qdb_bundle_url, qdb_deprecated_on**
Description: Three fields specified in BRD FR-022, FR-023, FR-027 are not provisioned in Dataverse and not exposed in the API.
Risk if unaddressed: DXP-P1-004 references `qdb_deprecated_on` for snapshot lifecycle management. Widget-registry adapter requires `qdb_bundle_url` for future bundle hosting. API callers expecting these fields receive null/undefined with no explanation.
Remediation: Provision the three fields and expose them in `DataverseVersion`, mappers, and API response types. Define Zod schemas for `qdb_default_props` (valid JSON validation) and `qdb_deprecated_on` (ISO datetime).
References: phase-5-qa.md D-004, D-005, D-006.

---

**GGAP-010 — MEDIUM — Service principal runtime privilege grant not confirmed**
Description: Overlaps with GGAP-005. Specifically, if the runtime SP has not been granted Write/Create privileges on the new QdbDxpPlatform entities, all POST and PATCH component registry routes silently fail with a Dataverse 403. The API's global error handler will return HTTP 500 (since DataverseApiError is not a RegistryError and is re-thrown). Callers see an opaque 500 with no actionable message.
Risk if unaddressed: All write operations fail in production with no obvious error.
Remediation: Test all 11 routes against a production-equivalent environment with the confirmed runtime SP credentials. Confirm HTTP 201/204 responses (not 500) before staging deployment.
References: AUD-005.

---

**GGAP-011 — MEDIUM — Hardcoded option set integer values in seed data; potential category assignment errors**
Description: Seed data uses org-specific option set integers. Two seed definitions (announcements, statistics) may have incorrect category assignments (860004004 instead of the widget category value).
Risk if unaddressed: Cross-org deployment fails. Seed data registers some widgets under incorrect categories, corrupting the registry for downstream consumers that filter by category.
Remediation: Replace hardcoded integers with a runtime lookup of the `qdb_component_category` option set by label. Verify all five widget seed records use the correct widget category value.
References: AUD-010.

---

**GGAP-012 — LOW — Public service methods lack JSDoc documentation**
Description: All 11 public methods on `ComponentRegistryService` lack XML/JSDoc documentation.
Risk if unaddressed: Developers building DXP-P1-002, P1-003, P1-004 against this service have no inline documentation for method contracts, parameter meanings, or error codes.
Remediation: Add JSDoc to all public methods in `ComponentRegistryService.ts`.
References: Maqsad AI coding standard (XML doc on all public methods).

---

**GGAP-013 — LOW — console.log in provisioning script violates standards**
Description: Structured logger not used in provisioning script.
Risk if unaddressed: Provisioning logs cannot be consumed by log aggregation tools. Log output is not machine-parseable. Security-relevant events (401 retries, 503 backoffs) are not capturable in audit trail.
Remediation: Replace `console.log` with pino in `DataverseHttpClient.ts` and phase modules.
References: AUD-006.

---

**GGAP-014 — LOW — Data residency for org5869857f not formally documented**
Description: The Dataverse org's EMEA region placement may not satisfy QDB/QCB/QFC data localisation requirements.
Risk if unaddressed: Regulatory non-compliance for a Qatar government-adjacent institution.
Remediation: Obtain written confirmation from QDB IT that org5869857f's data residency is compliant. If not compliant, plan migration to a Qatar-resident Dataverse region.
References: Data Residency Review section.

---

## Go-Live Clearance

**Verdict: NOT CLEARED FOR GO-LIVE**

The Component Registry API has a solid security foundation: JWT authentication is wired, pino structured logging is in place, no credentials appear in source, Zod validates all boundaries, and Dataverse OData injection is mitigated for string values. The provisioning script is idempotent and post-validated.

However, the following conditions must be met before this feature may be deployed to a staging or production environment:

### Blocking Conditions (must ALL be resolved)

1. **GGAP-001 / AUD-001 (Critical):** Implement OData `$batch` for set-latest, or formally accept the deviation via a documented ADR with explicit risk acceptance from QDB. The ADR must identify who accepts the race condition risk and what monitoring will detect violations.

2. **GGAP-002 / AUD-008 (Critical):** Remove `category` from `PatchDefinitionSchema`. The field is live and accepting writes right now — this is an active data integrity gap, not a future risk.

3. **GGAP-003 / AUD-003 (Critical):** Re-provision `qdb_propsschema` as Memo(1048576), or add a pre-write length guard that prevents silent truncation. Both steps are required for full compliance; the length guard is mandatory as an interim measure.

4. **GGAP-004 / AUD-002 (High):** Provision a Viewer-role test account and execute TC-052 with a confirmed PASS result. Provide evidence (test output) to the Auditor.

5. **GGAP-005 / AUD-005 (High):** Confirm and document service principal privilege reduction for the provisioning SP, and minimum-required privilege grant for the runtime SP. Provide the Dataverse security role assignment as evidence.

6. **GGAP-006 (High):** Write and execute the automated Vitest test suite for `ComponentRegistryService.ts` and `routes/admin/components.ts`. Provide a coverage report showing >= 80% line coverage.

### Conditional Acceptance Items (must be resolved within one sprint post-go-live)

7. **GGAP-007 (High):** Implement `GET .../versions/latest` endpoint before downstream DXP-P1-004 begins implementation. The accidental route collision (W-002) must be resolved before this gap can be left open.

8. **GGAP-008 (Medium):** Apply `.strict()` to `PatchVersionSchema` and `PatchDefinitionSchema`.

9. **GGAP-009 (Medium):** Provision and expose the three missing BRD fields (`qdb_default_props`, `qdb_bundle_url`, `qdb_deprecated_on`), or obtain formal written approval from QDB to defer these fields with a documented timeline.

10. **GGAP-011 (Medium):** Resolve seed data category assignments and replace hardcoded option set integers with a runtime lookup.

### Recommendations for Downstream Engagement Pre-conditions

Before DXP-P1-002, P1-003, or P1-004 can begin architecture, the following must be true:

- GGAP-001 is resolved (atomicity confirmed) — both P1-003 (RBAC) and P1-004 (Snapshots) depend on a reliable `isLatest` pointer.
- GGAP-007 is resolved (latest endpoint implemented) — P1-004 depends on `GET .../versions/latest` for snapshot resolution.
- GGAP-009 is resolved or formally deferred — P1-004 depends on `qdb_deprecated_on` for version lifecycle management.
- BRD C-010 constraint is explicitly carried forward into BRD documents for P1-002, P1-003, P1-004: downstream consumers must resolve component definitions by `qdb_name` slug, not by GUID, across environments.

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
DXP-P1-001 Component Registry — Phase 6 Security & Governance Audit v1.0
Maqsad AI — Auditor & Governance Specialist
2026-06-18
Engagement status: NOT CLEARED FOR GO-LIVE
Blocking conditions: 6
Conditional items: 4
═══════════════════════════════════════════════════
```
