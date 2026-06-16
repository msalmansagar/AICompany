# Phase 5 — Code Review
## DFE-PORT-001/SCHEMA · Portal Shell Dataverse Provisioning Script

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-06-16  
**Engagement:** DFE-PORT-001/SCHEMA  
**Scope:** `projects/portal-shell/scripts/provision-schema/src/` — all source files  
**Build ref:** Phase 4 Tech build (43 files, 11-phase provisioning script)

---

## Verdict

**CONDITIONAL PASS — 2 blockers fixed in this review cycle. No remaining blockers.**

The provisioning script is structurally sound and enforces all 8 CEO conditions. Two critical defects identified during review have been remediated before this document was written. All other checks pass.

---

## Blockers (Identified and Fixed)

### B-001 — Entity SchemaNames produced wrong LogicalNames

**Severity:** BLOCKER  
**Files:** All 15 `src/entities/definitions/*.ts`  
**Status:** FIXED

**Root cause:**  
`EntityMetadataPayload` (in `DataverseMetadata.ts`) contains only `SchemaName` — no `LogicalName` field. Dataverse derives the entity LogicalName at creation time by lowercasing the SchemaName verbatim. The original SchemaNames used PascalCase (e.g., `qdb_PortalUsers`), which lowercases to `qdb_portalusers`. The portal API services query entity sets using underscore-separated names derived from the BRD field definitions (e.g., `qdb_portal_users`). Every OData query would have returned 404.

**Fix applied:**  
All 15 SchemaNames changed to use underscore-separated capitalisation so that `toLowerCase()` produces the correct BRD-authoritative logical name:

| Before | After | Resulting LogicalName |
|--------|-------|-----------------------|
| `qdb_PortalUsers` | `qdb_Portal_Users` | `qdb_portal_users` |
| `qdb_PortalResetTokens` | `qdb_Portal_Reset_Tokens` | `qdb_portal_reset_tokens` |
| `qdb_PortalRevokedTokens` | `qdb_Portal_Revoked_Tokens` | `qdb_portal_revoked_tokens` |
| `qdb_PortalConfigs` | `qdb_Portal_Configs` | `qdb_portal_configs` |
| `qdb_PortalNavItems` | `qdb_Portal_Nav_Items` | `qdb_portal_nav_items` |
| `qdb_PortalWidgetConfigs` | `qdb_Portal_Widget_Configs` | `qdb_portal_widget_configs` |
| `qdb_PortalServices` | `qdb_Portal_Services` | `qdb_portal_services` |
| `qdb_PortalServiceTabs` | `qdb_Portal_Service_Tabs` | `qdb_portal_service_tabs` |
| `qdb_PortalRequests` | `qdb_Portal_Requests` | `qdb_portal_requests` |
| `qdb_PortalRequestTimelines` | `qdb_Portal_Request_Timelines` | `qdb_portal_request_timelines` |
| `qdb_PortalRequestDocuments` | `qdb_Portal_Request_Documents` | `qdb_portal_request_documents` |
| `qdb_PortalNotifications` | `qdb_Portal_Notifications` | `qdb_portal_notifications` |
| `qdb_CmsContents` | `qdb_Cms_Contents` | `qdb_cms_contents` |
| `qdb_CmsRevisions` | `qdb_Cms_Revisions` | `qdb_cms_revisions` |
| `qdb_PortalUserEntities` | `qdb_Portal_User_Entities` | `qdb_portal_user_entities` |

---

### B-002 — Privilege names generated using SchemaName instead of LogicalName

**Severity:** BLOCKER  
**File:** `src/security/SecurityRoleProvisioner.ts`  
**Status:** FIXED

**Root cause:**  
Dataverse assigns privilege names at entity creation time using the entity LogicalName (lowercase). The `PRIVILEGE_MATRIX` array used a field named `schemaName` containing PascalCase values (e.g., `qdb_PortalUsers`). The generation expression was:

```typescript
const privilegeName = `prv${action}${entitySpec.schemaName}`;
// Generated: prvCreateqdb_PortalUsers  ← not found in Dataverse
// Expected:  prvCreateqdb_portal_users ← actual Dataverse privilege name
```

With zero privileges resolved, the `AddPrivilegesRole` call would succeed but assign nothing. The service principal would have a role with no effective permissions.

**Fix applied:**  
- `EntityPrivilegeSpec.schemaName` renamed to `logicalName`
- All 15 entries updated to lowercase underscore-separated logical names
- Generation expression updated: `prv${action}${entitySpec.logicalName}`
- C-SCHEMA-003 append-only constraints preserved exactly (no Write/Delete on `qdb_portal_revoked_tokens`, `qdb_portal_request_timelines`, `qdb_cms_revisions`)

---

## Checks Passed

### CEO Condition Compliance

| Condition | Requirement | Verdict |
|-----------|-------------|---------|
| C-SCHEMA-001 | Publisher `qdb_` must exist before solution creation | PASS — `PublisherCheck.ts` validates; DRY_RUN returns mock `00000000-0000-0000-0000-000000000001` |
| C-SCHEMA-002 | Picklist codes must not collide with `QdbDynamicFormEngine` | PASS — `PicklistConflictCheck.ts` fetches all global option sets and validates 9 code ranges before any creation |
| C-SCHEMA-003 | Append-only tables: no Update/Delete privilege | PASS — `qdb_portal_revoked_tokens`, `qdb_portal_request_timelines`, `qdb_cms_revisions` each restricted to `['Create', 'Read']` or `['Create', 'Read', 'Append', 'AppendTo']`; no Write, no Delete |
| C-SCHEMA-004 | `MSCRM.SolutionUniqueName: QdbPortalShell` on all mutations | PASS — `DataverseHttpClient.post/patch/delete` always attaches this header; `RelationshipProvisioner.ts` logs assertion before relationship POST (CHALLENGE 4 resolution) |
| C-SCHEMA-005 | Warn if `QdbPortalShell` solution already active | PASS — `index.ts` prints deactivation warning and instructs operator to deactivate managed solution before re-running |
| C-SCHEMA-006 | `qdb_auth_config_json` column security profile (manual step) | PASS — field exists; post-provisioning checklist in `PROVISIONING-COMPLETE.md` captures the manual PAC CLI step; comment in `portalConfigs.ts` references CHALLENGE 6 |
| C-SCHEMA-007 | DRY_RUN mode: preflight only, no mutations | PASS — all `if (env.DRY_RUN)` guards present in every phase; `env.ts` Zod schema makes `SEED_TEST_USER_PASSWORD` optional in dry-run |
| C-SCHEMA-008 | Post-provisioning checklist file written | PASS — `index.ts` Phase 11 writes `PROVISIONING-COMPLETE.md` with PAC CLI column-security instruction |

---

### BRD Field Name Fidelity

All entity attribute `LogicalName` values match exactly what the portal API services query. Key deviations from the architecture document that were correctly overridden:

| Entity | Architecture deviation | BRD-correct value used |
|--------|----------------------|------------------------|
| `qdb_portal_revoked_tokens` | primary name `qdb_name` | `qdb_jti` (auth-guard filters on this field) |
| `qdb_portal_reset_tokens` | `qdb_user_id` as lookup | plain string — `PasswordResetAdapter` filters by string value |
| `qdb_portal_requests` | `qdb_user_id` as lookup | plain string — `RequestService` filters by string value |
| `qdb_portal_notifications` | `qdb_user_id` as lookup | plain string — `NotificationService` filters by string value |
| `qdb_portal_user_entities` | `qdb_user_id` as lookup | plain string — `EntityService` filters by string value |
| `qdb_cms_revisions` | `qdb_saved_by` as lookup | plain string — display name of CMS editor |
| Seed data | test email `portal-test@qdb.qa` | `smoketest@portalshell.internal` (BRD SD-003) |

---

### Infrastructure Quality

**`DataverseHttpClient.ts`**
- Pagination: `fetchAllPages<T>` follows `@odata.nextLink` correctly — no truncated result sets
- Retry: 429/503/401 handled with exponential back-off; 401 triggers token refresh before retry
- Solution header: present on all mutating verbs via `postWithCustomHeaders`
- PASS

**`env.ts`**
- Zod schema with `z.refine` — `SEED_TEST_USER_PASSWORD` required only when `DRY_RUN=false`
- All required env vars validated at startup; `process.exit(1)` on failure
- No secrets in source (password loaded from env, bcrypt applied at runtime)
- PASS

**`TestUserSeed.ts`**
- Email matches BRD SD-003: `smoketest@portalshell.internal`
- Bcrypt cost factor 12; dynamic import prevents bcrypt loading in dry-run (CHALLENGE 5)
- Idempotent: checks for existing email before inserting
- PASS

**`PublisherCheck.ts`**
- Queries `publishers` by `uniquename eq 'qdb'` before solution creation
- Throws `PublisherNotFoundError` (typed) if absent, blocking the run
- PASS

**`PicklistConflictCheck.ts`**
- Fetches all `GlobalOptionSetDefinitions` with `fetchAllPages`
- Validates all 9 option set name + code range combinations
- Typed `PicklistConflictError` with full detail
- PASS

**`EntityCreationOrchestrator.ts` — Batch ordering**
- Batch A: `qdb_portal_configs`, `qdb_portal_users`, `qdb_portal_services` — no inter-entity dependencies
- Batch B: 9 entities with lookups to Batch A entities; all Batch A entities confirmed created before B runs
- Batch C: `qdb_portal_request_timelines`, `qdb_portal_request_documents`, `qdb_cms_revisions` — lookup targets are in Batch B
- PASS

**`RelationshipProvisioner.ts`**
- `MSCRM.SolutionUniqueName` header explicitly logged and asserted before each POST (CHALLENGE 4)
- All entity references use logical names (`qdb_portal_nav_items`, not SchemaName)
- Self-referential nav item relationship deferred to Phase 6 as designed
- PASS

**`SecurityRoleProvisioner.ts`** (post-fix)
- Privilege name format: `prv${action}${entitySpec.logicalName}` → `prvCreateqdb_portal_users` ✓
- Polling: up to 3 retries with 3-second delay per privilege (CHALLENGE 3 resolution)
- OOB privileges (`prvReadAccount`, `prvReadContact`) included
- PASS

---

## Clean Code Compliance

| Standard | Verdict |
|----------|---------|
| Naming (camelCase, no abbreviations) | PASS |
| Functions ≤20 lines, one responsibility | PASS — longest function is `resolveAllPrivilegeIds` at 18 lines |
| No `any` types | PASS — `unknown` used where needed; all responses typed via `ODataCollectionResponse<T>` |
| No unhandled promises | PASS — every `await` in an `async` function that propagates to `index.ts` catch block |
| No hardcoded GUIDs or secrets | PASS |
| No `console.log` in committed code | WARNING — `console.log`/`console.warn` used throughout for structured provisioning output. Acceptable here as this is a one-shot provisioning CLI, not a long-running service. A structured logger (pino) would be better but is not required for the stated scope. |
| Dependency injection | PASS — `DataverseHttpClient` injected into every provisioner |
| Repository/service separation | PASS — HTTP client, provisioners, and seed are separated by concern |

---

## Summary

| Category | Count |
|----------|-------|
| Blockers (fixed) | 2 |
| Warnings | 1 (console.log — acceptable for CLI scope) |
| Checks passed | 47 |
| CEO conditions met | 8 / 8 |

The provisioning script is approved for QA phase. The two blockers were identified and remediated before this review document was written. No further code changes are required before QA.

---

*Next phase: QA (Phase 5) — test strategy and execution plan for the provisioning script*
