# Phase 3 Architecture — DFE-PORT-001/SCHEMA
# Dataverse Schema Provisioning Script

**Engagement ID:** DFE-PORT-001/SCHEMA
**Parent Engagement:** DFE-PORT-001 — Configurable Portal Shell
**Phase:** Phase 3 — Architecture
**Status:** FINAL
**Author:** Architect Agent — Maqsad AI
**Date:** 2026-06-16
**Constitution Version:** v2.0

---

## 1. System Overview

This document governs a one-time, idempotent TypeScript Node.js provisioning script that creates the QdbPortalShell Dataverse solution, registers all 9 global option sets, creates all 15 custom entities with their fields and relationships, assigns a security role, seeds 4 data records, and exports a managed solution via PAC CLI. The script is not a runtime service — it is a deployment tool executed once per target environment by a developer with service principal credentials. All 8 CEO binding conditions (C-SCHEMA-001 through C-SCHEMA-008) are enforced as hard stops within the execution flow; any condition violation aborts the script with a non-zero exit code and a structured error log entry before any schema object is created or mutated.

**Architecture pattern:** Sequential, single-process provisioning pipeline with explicit pre-flight guard phase, ordered entity creation phase, relationship wiring phase, security configuration phase, seed data phase, post-provisioning validation phase, and solution export instruction.

---

## 2. Script Folder Layout

```
projects/portal-shell/scripts/provision-schema/
├── .env.example                         # All required env vars documented, no values
├── package.json                         # Dependencies: @azure/msal-node, bcrypt, zod, dotenv
├── tsconfig.json                        # Strict mode, target ESNext, module NodeNext
├── src/
│   ├── index.ts                         # Entrypoint: orchestrates all phases in order
│   ├── config/
│   │   └── env.ts                       # Zod-validated env schema; fails fast on missing vars
│   ├── auth/
│   │   └── TokenProvider.ts             # MSAL ConfidentialClientApplication; acquireToken()
│   ├── http/
│   │   └── DataverseHttpClient.ts       # Typed fetch wrapper; auth injection; retry; error parsing
│   ├── preflight/
│   │   ├── PublisherCheck.ts            # C-SCHEMA-001: verify or create qdb publisher
│   │   ├── PicklistConflictCheck.ts     # C-SCHEMA-002: enumerate GlobalOptionSets; abort on conflict
│   │   ├── ExistingSolutionCheck.ts     # C-SCHEMA-006: confirm QdbDynamicFormEngine component count
│   │   └── ServicePrincipalRoleCheck.ts # C-SCHEMA-004: confirm SP does not have System Admin role
│   ├── solution/
│   │   └── SolutionProvisioner.ts       # Create QdbPortalShell solution if absent
│   ├── optionsets/
│   │   └── GlobalOptionSetProvisioner.ts  # Create all 9 global option sets (idempotent)
│   ├── entities/
│   │   ├── EntityProvisioner.ts           # Core create-or-skip logic for a single entity
│   │   ├── definitions/
│   │   │   ├── portalUsers.ts
│   │   │   ├── portalResetTokens.ts
│   │   │   ├── portalRevokedTokens.ts
│   │   │   ├── portalConfigs.ts
│   │   │   ├── portalNavItems.ts
│   │   │   ├── portalWidgetConfigs.ts
│   │   │   ├── portalServices.ts
│   │   │   ├── portalServiceTabs.ts
│   │   │   ├── portalRequests.ts
│   │   │   ├── portalRequestTimelines.ts
│   │   │   ├── portalRequestDocuments.ts
│   │   │   ├── portalNotifications.ts
│   │   │   ├── cmsContents.ts
│   │   │   ├── cmsRevisions.ts
│   │   │   └── portalUserEntities.ts
│   │   └── EntityCreationOrchestrator.ts  # Creates entities in dependency order
│   ├── relationships/
│   │   └── RelationshipProvisioner.ts     # Creates all lookup relationships + self-referential
│   ├── security/
│   │   ├── SecurityRoleProvisioner.ts     # Create Portal Shell API Role; define privilege matrix
│   │   └── ServicePrincipalRoleAssignment.ts  # Assign role to SP; confirm no System Admin
│   ├── seed/
│   │   ├── SeedOrchestrator.ts            # Runs all 4 seed tasks in order
│   │   ├── PortalConfigSeed.ts            # SD-001: portal config record
│   │   ├── NavItemSeed.ts                 # SD-002: 3 nav items
│   │   ├── TestUserSeed.ts                # SD-003: test user with bcrypt hash (C-SCHEMA-005)
│   │   └── WidgetConfigSeed.ts            # SD-004: widget config record
│   ├── validation/
│   │   └── PostProvisioningValidator.ts   # Verify all 15 entities + role exist; C-SCHEMA-006 recheck
│   └── types/
│       ├── DataverseMetadata.ts           # TypeScript types for EntityDefinition, AttributeMetadata, etc.
│       └── ProvisioningResult.ts          # Typed result shape for each phase step
```

**File responsibility boundaries:**

| File | Single Responsibility |
|------|-----------------------|
| `index.ts` | Phase orchestration only — no HTTP calls, no business logic |
| `env.ts` | Env validation only — all other files import from here, never from `process.env` directly |
| `TokenProvider.ts` | Token acquisition only — no OData calls |
| `DataverseHttpClient.ts` | HTTP transport only — no schema knowledge |
| Each `preflight/*.ts` | One guard check only — returns `CheckResult` typed result |
| Each `definitions/*.ts` | One entity definition only — exports a typed `EntityDefinitionPayload` object |
| `EntityProvisioner.ts` | Single entity create-or-skip only — no loops, no orchestration |
| `EntityCreationOrchestrator.ts` | Dependency-ordered entity creation loop only |
| `RelationshipProvisioner.ts` | Relationship creation only — called after all entities exist |
| `SecurityRoleProvisioner.ts` | Role and privilege definition only |
| `PostProvisioningValidator.ts` | Read-only verification only — no mutations |

---

## 3. Execution Flow

The script runs phases sequentially. A failure in any phase aborts all subsequent phases. No phase is retried automatically.

```
[index.ts — Phase Orchestrator]
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 0: ENVIRONMENT VALIDATION                        │
│  env.ts — Zod parse all required vars                   │
│  Fail fast on missing CLIENT_SECRET, ORG_URL, etc.      │
└──────────────────────────┬──────────────────────────────┘
                           │ pass
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 1: TOKEN ACQUISITION                             │
│  TokenProvider.acquireToken()                           │
│  MSAL client_credentials → Dataverse scope              │
│  Cached for session; refreshed on expiry                │
└──────────────────────────┬──────────────────────────────┘
                           │ token
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 2: PRE-FLIGHT GUARDS (all must pass)             │
│                                                         │
│  2a. PublisherCheck          (C-SCHEMA-001)             │
│      GET GlobalOptionSetDefinitions — publisher exists? │
│      If absent: POST publisher — abort on 4xx           │
│                                                         │
│  2b. PicklistConflictCheck   (C-SCHEMA-002)             │
│      GET GlobalOptionSetDefinitions — all names         │
│      For each planned option set code range:            │
│        860000xxx → scan existing values                 │
│        100000xxx → scan existing values                 │
│      Abort if ANY conflict found                        │
│                                                         │
│  2c. ExistingSolutionCheck   (C-SCHEMA-006)             │
│      GET solution QdbDynamicFormEngine                  │
│      Record: componentCount + version string            │
│      These values are stored; rechecked in Phase 9      │
│                                                         │
│  2d. ServicePrincipalRoleCheck (C-SCHEMA-004)           │
│      GET systemuserroles for the SP user                │
│      Abort if System Administrator role is assigned     │
└──────────────────────────┬──────────────────────────────┘
                           │ all guards passed
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 3: SOLUTION CREATION                             │
│  GET solutions?$filter=uniquename eq 'QdbPortalShell'   │
│  If absent: POST solution with publisher, version       │
│  If present: log "already exists — skipping"            │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 4: GLOBAL OPTION SET CREATION                    │
│  For each of the 9 option sets (idempotent):            │
│    GET GlobalOptionSetDefinitions(Name='qdb_xxx')       │
│    If 404: POST new GlobalOptionSetDefinition           │
│    If 200: log "already exists — skipping"              │
│  Option sets created in alphabetical order (no deps)    │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 5: ENTITY CREATION (dependency order)            │
│  Batch A — no lookups (all fields inline):              │
│    qdb_portal_configs                                   │
│    qdb_portal_users                                     │
│    qdb_portal_reset_tokens                              │
│    qdb_portal_revoked_tokens                            │
│    qdb_portal_notifications                             │
│    qdb_cms_contents                                     │
│                                                         │
│  Batch B — lookup to Batch A entities:                  │
│    qdb_portal_nav_items (lookup → qdb_portal_configs)   │
│    qdb_portal_widget_configs (lookup → qdb_portal_configs) │
│    qdb_portal_services                                  │
│    qdb_portal_requests                                  │
│    qdb_portal_user_entities (lookup → account OOB)     │
│    qdb_cms_revisions (lookup → qdb_cms_contents)        │
│                                                         │
│  Batch C — lookup to Batch B entities:                  │
│    qdb_portal_service_tabs (lookup → qdb_portal_services) │
│    qdb_portal_request_timelines (lookup → qdb_portal_requests) │
│    qdb_portal_request_documents (lookup → qdb_portal_requests) │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 6: RELATIONSHIP WIRING                           │
│  Self-referential: qdb_portal_nav_items → parent        │
│  (created separately after entity exists)               │
│  All other lookups are inline in entity definition      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 7: SECURITY ROLE + ASSIGNMENT                    │
│  Create "Portal Shell API Role" if absent               │
│  Set privilege matrix (see Section 9)                   │
│  Assign role to SP user                                 │
│  Verify SP still has no System Admin role (C-SCHEMA-004)│
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 8: SEED DATA                                     │
│  SD-001: qdb_portal_configs — 1 record                  │
│  SD-002: qdb_portal_nav_items — 3 records (ordered)     │
│  SD-003: qdb_portal_users — 1 test user (bcrypt hash)   │
│  SD-004: qdb_portal_widget_configs — 1 record           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 9: POST-PROVISIONING VALIDATION                  │
│  Read-only verification:                                │
│  - All 15 entities present (GET EntityDefinitions)      │
│  - All 9 option sets present                            │
│  - Security role exists with correct privileges         │
│  - C-SCHEMA-006: QdbDynamicFormEngine component count   │
│    and version UNCHANGED from Phase 2c snapshot         │
│  - C-SCHEMA-004: SP still has no System Admin role      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 10: DEACTIVATION WARNING (C-SCHEMA-005)          │
│  Emit to stdout:                                        │
│  "WARNING: SD-003 test user qdb_test@portal.local       │
│   was seeded with a bcrypt hash. Deactivate or delete   │
│   this record before promoting to production."          │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  PHASE 11: SOLUTION EXPORT INSTRUCTION (C-SCHEMA-008)   │
│  Print PAC CLI command to stdout (not executed by       │
│  script — developer runs manually after review):        │
│  pac solution export --name QdbPortalShell              │
│    --path ./QdbPortalShell_1_0_0_0_managed.zip          │
│    --managed --overwrite                                │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Authentication Design

### Library

`@azure/msal-node` (2200+ stars, MIT) — `ConfidentialClientApplication` with client_credentials flow.

### TokenProvider.ts Contract

```typescript
interface TokenProvider {
  acquireToken(): Promise<string>;  // Returns Bearer token string
}
```

**Implementation decisions:**

- `ConfidentialClientApplication` is instantiated once at startup in `index.ts` and passed by dependency injection to all modules that need it. No module calls `new ConfidentialClientApplication()`.
- `acquireTokenSilent` is called first on every `acquireToken()` call. MSAL's in-memory token cache handles the cached token. If the cache is empty or the token is within 5 minutes of expiry, MSAL calls `acquireTokenByClientCredential` automatically.
- The token is NOT stored in a file or database. It lives only in MSAL's in-memory cache for the duration of the script process.
- Scope: `${DATAVERSE_ORG_URL}/.default`
- Authority: `https://login.microsoftonline.com/${TENANT_ID}`

### Token Refresh Strategy

MSAL handles token refresh transparently. The provisioning script calls `TokenProvider.acquireToken()` at the start of each HTTP request. If the token has expired during a long-running entity creation loop, MSAL re-acquires it. No explicit refresh timer is needed.

### MSAL Configuration Object

```
authority:   https://login.microsoftonline.com/d79e793c-f6de-4204-8508-7980a63df957
clientId:    08e80e93-0bab-45ef-8372-2e554fa9af9b
clientSecret: read from DATAVERSE_CLIENT_SECRET env var — never hardcoded
```

---

## 5. HTTP Client Design

### DataverseHttpClient.ts Contract

```typescript
interface DataverseHttpClient {
  get<T>(path: string, options?: QueryOptions): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch(path: string, body: unknown): Promise<void>;
  delete(path: string): Promise<void>;
}
```

### Base URL

```
https://org5869857f.crm4.dynamics.com/api/data/v9.2/
```

### Headers injected on every request

```
Authorization:                Bearer <token from TokenProvider.acquireToken()>
OData-MaxVersion:             4.0
OData-Version:                4.0
Accept:                       application/json
Content-Type:                 application/json; charset=utf-8
MSCRM.SolutionUniqueName:     QdbPortalShell       [on all POST/PATCH/DELETE]
```

The `MSCRM.SolutionUniqueName` header is omitted for GET requests (read-only queries) and for the Phase 2c check against `QdbDynamicFormEngine` (which must not register any component under that solution).

### Error Parsing

Dataverse OData error responses use this shape:

```json
{
  "error": {
    "code": "0x80040217",
    "message": "...",
    "innererror": { "message": "...", "type": "...", "stacktrace": "..." }
  }
}
```

`DataverseHttpClient` parses this and throws a typed `DataverseApiError`:

```typescript
class DataverseApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly dataverseMessage: string,
    public readonly operation: string
  ) { super(`Dataverse ${statusCode} on ${operation}: ${dataverseMessage}`); }
}
```

### Retry Policy

| Condition | Behaviour |
|-----------|-----------|
| HTTP 429 (Too Many Requests) | Honour `Retry-After` header; wait stated seconds; retry up to 3 times |
| HTTP 503 (Service Unavailable) | Exponential backoff: 2s, 4s, 8s; retry up to 3 times |
| HTTP 401 (Unauthorized) | Discard MSAL cached token; re-acquire once; retry once; abort on second 401 |
| HTTP 404 on GET | Return `null` — caller interprets as "does not exist" (idempotency signal) |
| HTTP 4xx other than above | Throw `DataverseApiError` immediately — no retry |
| HTTP 5xx other than 503 | Throw `DataverseApiError` immediately — no retry |

No circuit breaker is needed for a provisioning script — the script is a one-off process, not a long-running service.

### Metadata API Path Distinction

Dataverse exposes two API surfaces:

| Surface | Base Path | Used For |
|---------|-----------|----------|
| Data API | `/api/data/v9.2/` | Reading/writing records (seed data, publisher check by query) |
| Metadata API | `/api/data/v9.2/` (same base, different resources) | EntityDefinitions, AttributeDefinitions, GlobalOptionSetDefinitions, RelationshipDefinitions |

All metadata resources use the same `/api/data/v9.2/` base path. The client distinguishes by resource name only (e.g., `EntityDefinitions`, `GlobalOptionSetDefinitions`).

---

## 6. Idempotency Design

The script is designed to be re-runnable safely. On a second run against an environment where the first run partially completed, the script must skip already-created objects without failing.

### Idempotency Rules by Resource Type

| Resource | Check Method | On Exists | On Absent |
|----------|-------------|-----------|-----------|
| Publisher (`qdb_`) | GET `publishers?$filter=customizationprefix eq 'qdb'` | Log "publisher exists — skipping" | POST publisher; fail on error |
| Solution (`QdbPortalShell`) | GET `solutions?$filter=uniquename eq 'QdbPortalShell'` | Log "solution exists — skipping"; store solutionId | POST solution |
| Global option set | GET `GlobalOptionSetDefinitions(Name='qdb_xxx')` | Log "option set exists — skipping" | POST option set |
| Entity | GET `EntityDefinitions(LogicalName='qdb_xxx')` | Log "entity exists — skipping" | POST entity with full attribute list |
| Attribute on existing entity | GET `EntityDefinitions(LogicalName='qdb_xxx')/Attributes(LogicalName='qdb_yyy')` | Log "attribute exists — skipping" | POST attribute to entity |
| Relationship | GET `RelationshipDefinitions?$filter=SchemaName eq 'qdb_xxx_qdb_yyy'` | Log "relationship exists — skipping" | POST relationship |
| Security role | GET `roles?$filter=name eq 'Portal Shell API Role'` | Log "role exists — skipping"; store roleId | POST role |
| Role privilege | GET role privileges via `roleprivileges_association` | Compare required vs actual | POST missing privileges only |
| SP role assignment | GET `systemuserroles_association` for SP user | Skip if already assigned | POST assignment |
| Seed record | GET with unique filter (e.g., `qdb_portal_configs?$filter=qdb_portal_id eq 'qdb-default'`) | Log "seed record exists — skipping" | POST record |

### Fail-Fast Exceptions (no idempotent skip)

The following conditions always abort regardless of idempotency posture:

- C-SCHEMA-002: Any option set value in range 860000xxx or 100000xxx already exists in a **different** option set — abort (clash risk).
- C-SCHEMA-004: SP has System Administrator role — abort before any mutation.
- C-SCHEMA-006: QdbDynamicFormEngine component count or version differs from Phase 2c snapshot at Phase 9 recheck — abort and report.
- Phase 0: Any required env var missing — abort before any network call.

---

## 7. Publisher and Picklist Pre-Check Design

### C-SCHEMA-001 — Publisher Verification (PublisherCheck.ts)

**Step 1 — Query existing publishers:**
```
GET /api/data/v9.2/publishers?$select=publisherid,friendlyname,customizationprefix&$filter=customizationprefix eq 'qdb'
```

**Step 2a — Publisher found:**
Log publisher ID and friendly name. Continue.

**Step 2b — Publisher absent:**
```
POST /api/data/v9.2/publishers
{
  "friendlyname": "QDB Portal",
  "uniquename": "QdbPortal",
  "customizationprefix": "qdb",
  "customizationoptionvalueprefix": 86000,
  "description": "Publisher for Maqsad AI portal shell components"
}
```
Extract `publisherid` from `OData-EntityId` response header. Store for solution creation. Abort on any 4xx/5xx.

### C-SCHEMA-002 — Picklist Conflict Pre-Check (PicklistConflictCheck.ts)

**Step 1 — Enumerate all global option sets:**
```
GET /api/data/v9.2/GlobalOptionSetDefinitions?$select=Name,Options
```

This returns every global option set with its full options array. The response may be large (paginated via `@odata.nextLink` — follow all pages).

**Step 2 — Build conflict index:**
For each returned option set, collect all option `Value` integers into a flat set. Separate into two ranges:
- Range A: values 860000000–860999999
- Range B: values 100000000–100999999

**Step 3 — Check planned values:**
The planned values are:

| Range A (860000xxx) | Range B (100000xxx) |
|--------------------|---------------------|
| 860000001, 860000002 (qdb_nav_layout) | 100000001, 100000002 (qdb_preferred_language) |
| 860000001, 860000002 (qdb_sidebar_default_state) | 100000001, 100000002 (qdb_cms_content_type) |
| 860000001, 860000002, 860000003 (qdb_auth_provider) | 100000001, 100000002, 100000003 (qdb_cms_status) |
| 860000001, 860000002, 860000003 (qdb_badge_source) | |
| 860000001–860000005 (qdb_request_status) | |
| 860000001–860000004 (qdb_notification_type) | |

**Step 4 — Abort on conflict:**
If any planned value integer already exists in the conflict index (regardless of which option set owns it), log the conflicting value, the owning option set name, and the planned option set name, then throw `PicklistConflictError` and abort. No mutations have been made at this point — safe to abort cleanly.

**Step 5 — Pass:**
Log "No picklist conflicts found. Proceeding."

---

## 8. Entity Creation Strategy

### Attribute Inline vs Separate POST

Dataverse supports two approaches for adding attributes to a new entity:

| Approach | When to Use |
|----------|-------------|
| Inline in `EntityDefinition` POST body | Simple scalar attributes (Text, Integer, Boolean, DateTime, Memo, Lookup to known entity). Use for all non-complex attributes. |
| Separate POST to `EntityDefinitions(LogicalName)/Attributes` | Only when the attribute has a dependency that does not exist at entity creation time (e.g., a self-referential lookup where the entity must exist first). |

**Decision:** All attributes for all 15 entities are defined inline in the `EntityDefinition` POST body, with one exception: the self-referential `qdb_parent_nav_item` lookup on `qdb_portal_nav_items` is created as a separate relationship POST after the entity exists.

This minimises round trips and keeps each entity's definition self-contained in its definition file.

### EntityDefinition POST Body Structure

Every entity POST body follows this structure:

```json
{
  "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
  "SchemaName": "qdb_PortalUsers",
  "DisplayName": { "LocalizedLabels": [{ "Label": "Portal User", "LanguageCode": 1033 }] },
  "DisplayCollectionName": { "LocalizedLabels": [{ "Label": "Portal Users", "LanguageCode": 1033 }] },
  "Description": { "LocalizedLabels": [{ "Label": "...", "LanguageCode": 1033 }] },
  "OwnershipType": "UserOwned",
  "HasActivities": false,
  "HasNotes": false,
  "IsActivity": false,
  "Attributes": [
    {
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
      "SchemaName": "qdb_Name",
      "LogicalName": "qdb_name",
      "RequiredLevel": { "Value": "ApplicationRequired" },
      "MaxLength": 200,
      "DisplayName": { "LocalizedLabels": [{ "Label": "Email Address", "LanguageCode": 1033 }] }
    }
    // ... additional attribute definitions
  ]
}
```

The `MSCRM.SolutionUniqueName: QdbPortalShell` header on this POST automatically registers the entity in the solution.

### Attribute OData Types Reference

| Dataverse Type | `@odata.type` |
|---------------|---------------|
| Single Line of Text | `Microsoft.Dynamics.CRM.StringAttributeMetadata` |
| Multiple Lines of Text | `Microsoft.Dynamics.CRM.MemoAttributeMetadata` |
| Whole Number | `Microsoft.Dynamics.CRM.IntegerAttributeMetadata` |
| Two Options (boolean) | `Microsoft.Dynamics.CRM.BooleanAttributeMetadata` |
| Date and Time | `Microsoft.Dynamics.CRM.DateTimeAttributeMetadata` |
| Option Set (local) | `Microsoft.Dynamics.CRM.PicklistAttributeMetadata` |
| Option Set (global) | `Microsoft.Dynamics.CRM.PicklistAttributeMetadata` with `GlobalOptionSet` reference |
| Lookup | `Microsoft.Dynamics.CRM.LookupAttributeMetadata` |

### Ownership Type per Entity

| Entity | Ownership | Reason |
|--------|-----------|--------|
| qdb_portal_users | UserOwned | Represents a person; owned by their system user account |
| qdb_portal_reset_tokens | UserOwned | Tied to the requesting user |
| qdb_portal_revoked_tokens | OrganizationOwned | Append-only audit token store; no user ownership needed |
| qdb_portal_configs | OrganizationOwned | Portal-wide config; no per-user ownership |
| qdb_portal_nav_items | OrganizationOwned | Menu config; admin-managed |
| qdb_portal_widget_configs | OrganizationOwned | Dashboard config; admin-managed |
| qdb_portal_services | OrganizationOwned | Service catalogue; admin-managed |
| qdb_portal_service_tabs | OrganizationOwned | Tab config per service; admin-managed |
| qdb_portal_requests | UserOwned | Submitted by and owned by the applicant user |
| qdb_portal_request_timelines | OrganizationOwned | Append-only audit trail; no per-user ownership |
| qdb_portal_request_documents | UserOwned | Documents uploaded by the user |
| qdb_portal_notifications | UserOwned | Delivered to and owned by a specific user |
| qdb_cms_contents | OrganizationOwned | Editorial content; owned by org |
| qdb_cms_revisions | OrganizationOwned | Revision snapshots; org-owned |
| qdb_portal_user_entities | UserOwned | Per-user linked company associations |

---

## 9. Entity Field Specifications

This section provides the complete field list for each entity. The developer implements one TypeScript definition file per entity in `src/entities/definitions/`.

### qdb_portal_users

Primary field (system name): `qdb_name` — Email Address (used as the `PrimaryNameAttribute`)

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required; Primary field |
| `qdb_display_name` | `qdb_DisplayName` | String | Max 200 |
| `qdb_password_hash` | `qdb_PasswordHash` | Memo | Max 4000; never logged |
| `qdb_is_active` | `qdb_IsActive` | Boolean | Default true |
| `qdb_is_email_verified` | `qdb_IsEmailVerified` | Boolean | Default false |
| `qdb_preferred_language` | `qdb_PreferredLanguage` | Picklist (global: qdb_preferred_language) | |
| `qdb_push_token` | `qdb_PushToken` | String | Max 500 |
| `qdb_last_login_on` | `qdb_LastLoginOn` | DateTime | |
| `qdb_contact` | `qdb_Contact` | Lookup (contact) | |

---

### qdb_portal_reset_tokens

Primary field: `qdb_name` — Token Reference

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 100; Required |
| `qdb_user` | `qdb_User` | Lookup (qdb_portal_users) | Required |
| `qdb_token_hash` | `qdb_TokenHash` | String | Max 500; Required |
| `qdb_expires_on` | `qdb_ExpiresOn` | DateTime | Required |
| `qdb_is_used` | `qdb_IsUsed` | Boolean | Default false |
| `qdb_used_on` | `qdb_UsedOn` | DateTime | |

---

### qdb_portal_revoked_tokens

**Append-only. C-SCHEMA-003 enforced at security role level (no Update, no Delete privilege on this entity).**

Primary field: `qdb_name` — Token JTI

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required; stores the JWT JTI (jti claim) |
| `qdb_user` | `qdb_User` | Lookup (qdb_portal_users) | Required |
| `qdb_revoked_on` | `qdb_RevokedOn` | DateTime | Required |
| `qdb_expires_on` | `qdb_ExpiresOn` | DateTime | Required |
| `qdb_revocation_reason` | `qdb_RevocationReason` | String | Max 200; e.g. "logout", "password_change" |

---

### qdb_portal_request_timelines

**Append-only. C-SCHEMA-003 enforced at security role level (no Update, no Delete privilege on this entity).**

Primary field: `qdb_name` — Timeline Entry

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required; e.g. "Status changed to Approved" |
| `qdb_request` | `qdb_Request` | Lookup (qdb_portal_requests) | Required |
| `qdb_status` | `qdb_Status` | Picklist (global: qdb_request_status) | Required |
| `qdb_notes` | `qdb_Notes` | Memo | Max 2000 |
| `qdb_actor` | `qdb_Actor` | String | Max 200; display name of who made the change |

---

### qdb_cms_revisions

**Append-only for the current revision window (FIFO deletion of oldest when count > 10). C-SCHEMA-003 does NOT apply here — revision deletion is permitted per Phase 3 main arch doc Section 11.**

Primary field: `qdb_name` — Revision Label

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 100; Required; e.g. "Revision 3 — 2026-06-16" |
| `qdb_content` | `qdb_Content` | Lookup (qdb_cms_contents) | Required |
| `qdb_revision_number` | `qdb_RevisionNumber` | Integer | Required |
| `qdb_title_snapshot` | `qdb_TitleSnapshot` | String | Max 300 |
| `qdb_title_ar_snapshot` | `qdb_TitleArSnapshot` | String | Max 300 |
| `qdb_body_html_snapshot` | `qdb_BodyHtmlSnapshot` | Memo | |
| `qdb_body_html_ar_snapshot` | `qdb_BodyHtmlArSnapshot` | Memo | |
| `qdb_saved_by` | `qdb_SavedBy` | Lookup (systemuser) | Required |

---

### qdb_portal_configs

Primary field: `qdb_name` — Portal Name

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 100; Required |
| `qdb_portal_id` | `qdb_PortalId` | String | Max 50; Required |
| `qdb_logo_url` | `qdb_LogoUrl` | String | Max 500 |
| `qdb_favicon_url` | `qdb_FaviconUrl` | String | Max 500 |
| `qdb_primary_color` | `qdb_PrimaryColor` | String | Max 7 |
| `qdb_accent_color` | `qdb_AccentColor` | String | Max 7 |
| `qdb_background_color` | `qdb_BackgroundColor` | String | Max 7 |
| `qdb_font_family` | `qdb_FontFamily` | String | Max 100 |
| `qdb_nav_layout` | `qdb_NavLayout` | Picklist (global: qdb_nav_layout) | |
| `qdb_sidebar_default_state` | `qdb_SidebarDefaultState` | Picklist (global: qdb_sidebar_default_state) | |
| `qdb_sidebar_width_px` | `qdb_SidebarWidthPx` | Integer | Min 200, Max 400 |
| `qdb_header_entity_switcher` | `qdb_HeaderEntitySwitcher` | Boolean | Default true |
| `qdb_header_support_link` | `qdb_HeaderSupportLink` | Boolean | Default true |
| `qdb_header_notifications` | `qdb_HeaderNotifications` | Boolean | Default true |
| `qdb_header_user_avatar` | `qdb_HeaderUserAvatar` | Boolean | Default true |
| `qdb_footer_left_logo_url` | `qdb_FooterLeftLogoUrl` | String | Max 500 |
| `qdb_footer_right_logo_url` | `qdb_FooterRightLogoUrl` | String | Max 500 |
| `qdb_footer_powered_by_text` | `qdb_FooterPoweredByText` | String | Max 200 |
| `qdb_footer_link_json` | `qdb_FooterLinkJson` | Memo | JSON array |
| `qdb_auth_provider` | `qdb_AuthProvider` | Picklist (global: qdb_auth_provider) | |
| `qdb_sso_microsoft` | `qdb_SsoMicrosoft` | Boolean | Default false |
| `qdb_sso_google` | `qdb_SsoGoogle` | Boolean | Default false |
| `qdb_allow_self_registration` | `qdb_AllowSelfRegistration` | Boolean | Default true |
| `qdb_default_locale` | `qdb_DefaultLocale` | String | Max 10 |
| `qdb_rtl_enabled` | `qdb_RtlEnabled` | Boolean | Default false |
| `qdb_idle_timeout_minutes` | `qdb_IdleTimeoutMinutes` | Integer | |
| `qdb_notification_poll_interval_seconds` | `qdb_NotificationPollIntervalSeconds` | Integer | |
| `qdb_auth_config_json` | `qdb_AuthConfigJson` | Memo | Column Security Profile applied post-creation |
| `qdb_is_active` | `qdb_IsActive` | Boolean | Default true |

---

### qdb_portal_nav_items

Primary field: `qdb_name` — Display Name (EN)

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 100; Required |
| `qdb_name_ar` | `qdb_NameAr` | String | Max 100 |
| `qdb_page_code` | `qdb_PageCode` | String | Max 50 |
| `qdb_icon_name` | `qdb_IconName` | String | Max 100 |
| `qdb_display_order` | `qdb_DisplayOrder` | Integer | |
| `qdb_is_visible` | `qdb_IsVisible` | Boolean | Default true |
| `qdb_required_role` | `qdb_RequiredRole` | String | Max 50 |
| `qdb_badge_source` | `qdb_BadgeSource` | Picklist (global: qdb_badge_source) | |
| `qdb_badge_static_count` | `qdb_BadgeStaticCount` | Integer | |
| `qdb_badge_odata_query` | `qdb_BadgeOdataQuery` | String | Max 500 |
| `qdb_portal_config` | `qdb_PortalConfig` | Lookup (qdb_portal_configs) | |
| Self-referential parent | Created in Phase 6 as separate relationship | — | See Section 10 |

---

### qdb_portal_widget_configs

Primary field: `qdb_name` — Widget Instance Name

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required |
| `qdb_widget_type` | `qdb_WidgetType` | String | Max 100; Required |
| `qdb_title_override` | `qdb_TitleOverride` | String | Max 200 |
| `qdb_title_override_ar` | `qdb_TitleOverrideAr` | String | Max 200 |
| `qdb_column_span` | `qdb_ColumnSpan` | Integer | |
| `qdb_row_span` | `qdb_RowSpan` | Integer | |
| `qdb_display_order` | `qdb_DisplayOrder` | Integer | |
| `qdb_is_visible` | `qdb_IsVisible` | Boolean | Default true |
| `qdb_config_json` | `qdb_ConfigJson` | Memo | |
| `qdb_grid_layout_json` | `qdb_GridLayoutJson` | Memo | |
| `qdb_portal_config` | `qdb_PortalConfig` | Lookup (qdb_portal_configs) | Required |

---

### qdb_portal_services

Primary field: `qdb_name` — Service Name (EN)

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 300; Required |
| `qdb_name_ar` | `qdb_NameAr` | String | Max 300 |
| `qdb_code` | `qdb_Code` | String | Max 50; unique identifier for URL routing |
| `qdb_short_description` | `qdb_ShortDescription` | Memo | Max 500 |
| `qdb_short_description_ar` | `qdb_ShortDescriptionAr` | Memo | Max 500 |
| `qdb_thumbnail_url` | `qdb_ThumbnailUrl` | String | Max 500 |
| `qdb_hero_image_url` | `qdb_HeroImageUrl` | String | Max 500 |
| `qdb_category` | `qdb_Category` | String | Max 100 |
| `qdb_form_code` | `qdb_FormCode` | String | Max 100; links to DFE form |
| `qdb_is_active` | `qdb_IsActive` | Boolean | Default true |
| `qdb_has_eligibility_gate` | `qdb_HasEligibilityGate` | Boolean | Default false |
| `qdb_allows_post_submission_documents` | `qdb_AllowsPostSubmissionDocuments` | Boolean | Default false |
| `qdb_display_order` | `qdb_DisplayOrder` | Integer | |

---

### qdb_portal_service_tabs

Primary field: `qdb_name` — Tab Name (EN)

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required |
| `qdb_name_ar` | `qdb_NameAr` | String | Max 200 |
| `qdb_service` | `qdb_Service` | Lookup (qdb_portal_services) | Required |
| `qdb_content_html` | `qdb_ContentHtml` | Memo | Rich text content (EN) |
| `qdb_content_html_ar` | `qdb_ContentHtmlAr` | Memo | Rich text content (AR) |
| `qdb_display_order` | `qdb_DisplayOrder` | Integer | |
| `qdb_is_visible` | `qdb_IsVisible` | Boolean | Default true |

---

### qdb_portal_requests

Primary field: `qdb_name` — Request Reference Number

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 100; Required; auto-generated reference number |
| `qdb_user` | `qdb_User` | Lookup (qdb_portal_users) | Required |
| `qdb_service` | `qdb_Service` | Lookup (qdb_portal_services) | Required |
| `qdb_status` | `qdb_Status` | Picklist (global: qdb_request_status) | Required |
| `qdb_submission_data_json` | `qdb_SubmissionDataJson` | Memo | Serialised form submission |
| `qdb_submitted_on` | `qdb_SubmittedOn` | DateTime | |
| `qdb_decision_on` | `qdb_DecisionOn` | DateTime | |
| `qdb_decision_notes` | `qdb_DecisionNotes` | Memo | Max 2000 |

---

### qdb_portal_request_documents

Primary field: `qdb_name` — Document Name

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 300; Required |
| `qdb_request` | `qdb_Request` | Lookup (qdb_portal_requests) | Required |
| `qdb_blob_url` | `qdb_BlobUrl` | String | Max 1000; Azure Blob SAS URL |
| `qdb_file_size_bytes` | `qdb_FileSizeBytes` | Integer | |
| `qdb_mime_type` | `qdb_MimeType` | String | Max 100 |
| `qdb_uploaded_on` | `qdb_UploadedOn` | DateTime | |

---

### qdb_portal_notifications

Primary field: `qdb_name` — Notification Title

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required |
| `qdb_user` | `qdb_User` | Lookup (qdb_portal_users) | Required |
| `qdb_body` | `qdb_Body` | Memo | Max 2000 |
| `qdb_notification_type` | `qdb_NotificationType` | Picklist (global: qdb_notification_type) | |
| `qdb_link_url` | `qdb_LinkUrl` | String | Max 500 |
| `qdb_is_read` | `qdb_IsRead` | Boolean | Default false |
| `qdb_read_on` | `qdb_ReadOn` | DateTime | |
| `qdb_source_entity` | `qdb_SourceEntity` | String | Max 100 |
| `qdb_source_record_id` | `qdb_SourceRecordId` | String | Max 50 |

---

### qdb_cms_contents

Primary field: `qdb_name` — Content Title (EN)

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 300; Required |
| `qdb_title_ar` | `qdb_TitleAr` | String | Max 300 |
| `qdb_slug` | `qdb_Slug` | String | Max 200 |
| `qdb_cms_content_type` | `qdb_CmsContentType` | Picklist (global: qdb_cms_content_type) | |
| `qdb_body_html` | `qdb_BodyHtml` | Memo | |
| `qdb_body_html_ar` | `qdb_BodyHtmlAr` | Memo | |
| `qdb_hero_image_url` | `qdb_HeroImageUrl` | String | Max 500 |
| `qdb_category` | `qdb_Category` | String | Max 100 |
| `qdb_tags_json` | `qdb_TagsJson` | String | Max 500 |
| `qdb_cms_status` | `qdb_CmsStatus` | Picklist (global: qdb_cms_status) | |
| `qdb_published_at` | `qdb_PublishedAt` | DateTime | |
| `qdb_scheduled_publish_at` | `qdb_ScheduledPublishAt` | DateTime | |
| `qdb_scheduled_unpublish_at` | `qdb_ScheduledUnpublishAt` | DateTime | |
| `qdb_author` | `qdb_Author` | Lookup (systemuser) | |
| `qdb_seo_description` | `qdb_SeoDescription` | Memo | Max 300 |
| `qdb_og_image_url` | `qdb_OgImageUrl` | String | Max 500 |
| `qdb_revision_count` | `qdb_RevisionCount` | Integer | |
| `qdb_portal_config` | `qdb_PortalConfig` | Lookup (qdb_portal_configs) | |

---

### qdb_portal_user_entities

Primary field: `qdb_name` — Association Label

| Logical Name | Schema Name | Type | Constraints |
|-------------|------------|------|-------------|
| `qdb_name` | `qdb_Name` | String | Max 200; Required |
| `qdb_user` | `qdb_User` | Lookup (qdb_portal_users) | Required |
| `qdb_account` | `qdb_Account` | Lookup (account) | Required; OOB account entity |
| `qdb_is_primary` | `qdb_IsPrimary` | Boolean | Default false; marks primary company for user |
| `qdb_role_in_entity` | `qdb_RoleInEntity` | String | Max 100 |

---

## 10. Relationship Creation

### Lookup Relationships (created inline in EntityDefinition POST)

All lookup attributes in the entity definitions above are created as `LookupAttributeMetadata` inside the entity's `Attributes` array. Dataverse automatically creates the underlying N:1 relationship when a lookup attribute is added to an entity definition.

The relationship schema name convention: `qdb_{childentity}_qdb_{parentfield}` — Dataverse auto-generates this. No separate relationship POST is required for standard lookups.

### Self-Referential Relationship — qdb_portal_nav_items (Phase 6)

The `qdb_portal_nav_items` entity has a parent nav item lookup back to itself. This cannot be created inline in the entity POST because the target entity (`qdb_portal_nav_items` itself) does not exist yet when the entity body is being constructed.

**Step 1 — Confirm entity exists:**
After `qdb_portal_nav_items` is created in Phase 5 Batch B, verify `EntityDefinitions(LogicalName='qdb_portal_nav_items')` returns 200.

**Step 2 — Create self-referential relationship:**

```
POST /api/data/v9.2/RelationshipDefinitions
Content-Type: application/json
MSCRM.SolutionUniqueName: QdbPortalShell

{
  "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
  "SchemaName": "qdb_portalnavitems_parentnavitem",
  "ReferencedEntity": "qdb_portal_nav_items",
  "ReferencingEntity": "qdb_portal_nav_items",
  "ReferencedAttribute": "qdb_portal_nav_itemsid",
  "ReferencingAttribute": "qdb_parent_nav_item",
  "Lookup": {
    "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
    "SchemaName": "qdb_ParentNavItem",
    "LogicalName": "qdb_parent_nav_item",
    "DisplayName": {
      "LocalizedLabels": [{ "Label": "Parent Nav Item", "LanguageCode": 1033 }]
    },
    "RequiredLevel": { "Value": "None" }
  },
  "AssociatedMenuConfiguration": {
    "Behavior": "DoNotDisplay",
    "Group": "Details",
    "Order": null,
    "IsCustomizable": { "Value": true }
  },
  "CascadeConfiguration": {
    "Assign": "NoCascade",
    "Delete": "RemoveLink",
    "Merge": "NoCascade",
    "Reparent": "NoCascade",
    "Share": "NoCascade",
    "Unshare": "NoCascade"
  }
}
```

**Idempotency:** Before POST, check `RelationshipDefinitions?$filter=SchemaName eq 'qdb_portalnavitems_parentnavitem'`. Skip if exists.

### OOB Account Lookup in qdb_portal_user_entities

The lookup to the OOB `account` entity uses `LookupAttributeMetadata` with `Targets: ["account"]`. No relationship POST is required — Dataverse creates the N:1 to the account entity automatically.

---

## 11. Security Role Design

### Role Name

`Portal Shell API Role`

### Privilege Matrix

The role grants the minimum privileges required for the Fastify API service principal to read and write portal records. C-SCHEMA-003 is enforced here by granting no Update and no Delete on the three append-only entities.

| Entity | Create | Read | Write (Update) | Delete | Append | AppendTo |
|--------|--------|------|----------------|--------|--------|----------|
| qdb_portal_users | Yes | Yes | Yes | No | Yes | Yes |
| qdb_portal_reset_tokens | Yes | Yes | Yes | Yes | Yes | Yes |
| **qdb_portal_revoked_tokens** | **Yes** | **Yes** | **No** | **No** | **Yes** | **Yes** |
| qdb_portal_configs | No | Yes | No | No | No | No |
| qdb_portal_nav_items | No | Yes | No | No | No | No |
| qdb_portal_widget_configs | No | Yes | No | No | No | No |
| qdb_portal_services | No | Yes | No | No | No | No |
| qdb_portal_service_tabs | No | Yes | No | No | No | No |
| qdb_portal_requests | Yes | Yes | Yes | No | Yes | Yes |
| **qdb_portal_request_timelines** | **Yes** | **Yes** | **No** | **No** | **Yes** | **Yes** |
| qdb_portal_request_documents | Yes | Yes | No | No | Yes | Yes |
| qdb_portal_notifications | Yes | Yes | Yes | No | Yes | Yes |
| qdb_cms_contents | No | Yes | No | No | No | No |
| **qdb_cms_revisions** | **No** | **Yes** | **No** | **No** | **No** | **No** |
| qdb_portal_user_entities | No | Yes | No | No | No | No |
| account (OOB) | No | Yes | No | No | No | No |
| contact (OOB) | No | Yes | No | No | No | No |

**Bold rows** = C-SCHEMA-003 append-only enforcement — Update and Delete are explicitly withheld.

### Privilege Access Level

All privileges for custom entities are granted at `Organization` level. This is appropriate because the Fastify service principal acts on behalf of users, and user-owned records in `qdb_portal_requests` and `qdb_portal_notifications` must be readable regardless of the record owner.

### Privilege POST API

Privileges are set by:

1. POST the role:
```
POST /api/data/v9.2/roles
{ "name": "Portal Shell API Role", "businessunitid@odata.bind": "/businessunits(<default-bu-id>)" }
```

2. Assign privileges via the `AddPrivilegesRole` action:
```
POST /api/data/v9.2/roles(<roleId>)/Microsoft.Dynamics.CRM.AddPrivilegesRole
{
  "Privileges": [
    {
      "PrivilegeId": "<guid of prvCreateqdb_portal_users>",
      "Depth": "Global"
    }
    // ... all privileges in the matrix
  ]
}
```

The privilege GUIDs for custom entities must be retrieved after entity creation:
```
GET /api/data/v9.2/privileges?$filter=name eq 'prvCreateqdb_portal_users'
```

The `SecurityRoleProvisioner.ts` builds the privilege list dynamically by querying `privileges` for each entity-action combination.

### C-SCHEMA-004 Enforcement

After role assignment in Phase 7, `ServicePrincipalRoleCheck.ts` is called a second time (also runs in Phase 2d as pre-flight). It queries:

```
GET /api/data/v9.2/systemusers(<spUserId>)/systemuserroles_association?$select=name
```

If `System Administrator` appears in the results, the script logs a critical error and throws `UnauthorizedConfigurationError`. The script does not remove the System Administrator role — it only detects and aborts. The developer must manually investigate.

---

## 12. Seed Data Insertion

### Approach

All seed data is inserted via standard Dataverse OData POST to the entity collection endpoints. Idempotency is achieved by querying a unique field before inserting.

### SD-001 — Portal Config Record (PortalConfigSeed.ts)

**Idempotency check:**
```
GET /api/data/v9.2/qdb_portal_configses?$filter=qdb_portal_id eq 'qdb-default'&$select=qdb_portal_configsid
```

**POST body (if absent):**
```json
{
  "qdb_name": "QDB Portal (Default)",
  "qdb_portal_id": "qdb-default",
  "qdb_primary_color": "#0057A8",
  "qdb_accent_color": "#00A3E0",
  "qdb_background_color": "#F5F7FA",
  "qdb_font_family": "Inter, sans-serif",
  "qdb_nav_layout": 860000001,
  "qdb_sidebar_default_state": 860000001,
  "qdb_sidebar_width_px": 240,
  "qdb_header_entity_switcher": true,
  "qdb_header_support_link": true,
  "qdb_header_notifications": true,
  "qdb_header_user_avatar": true,
  "qdb_auth_provider": 860000003,
  "qdb_allow_self_registration": true,
  "qdb_default_locale": "en",
  "qdb_rtl_enabled": false,
  "qdb_idle_timeout_minutes": 30,
  "qdb_notification_poll_interval_seconds": 30,
  "qdb_is_active": true
}
```

Option set values map directly to the integer codes defined in the global option sets (e.g., `qdb_nav_layout` value `860000001` = sidebar).

---

### SD-002 — Navigation Items (NavItemSeed.ts)

Three records seeded in order (display_order 1, 2, 3). The portal config lookup is set by binding to the SD-001 record's ID.

**Idempotency check per nav item:**
```
GET /api/data/v9.2/qdb_portal_nav_itemses?$filter=qdb_page_code eq '<code>' and qdb_portal_config/qdb_portal_id eq 'qdb-default'
```

| qdb_name | qdb_name_ar | qdb_page_code | qdb_icon_name | qdb_display_order |
|----------|------------|---------------|---------------|-------------------|
| Dashboard | لوحة التحكم | dashboard | Home24Regular | 1 |
| Services | الخدمات | services | Apps24Regular | 2 |
| My Requests | طلباتي | my-requests | DocumentBulletList24Regular | 3 |

---

### SD-003 — Test User (TestUserSeed.ts) — C-SCHEMA-005

**Bcrypt hash generation (never hardcoded):**

The `bcrypt` npm package generates the hash at runtime using cost factor 12:

```typescript
import bcrypt from 'bcrypt';

const BCRYPT_COST_FACTOR = 12;
const plainPassword = process.env.SEED_TEST_USER_PASSWORD;
// plainPassword must be in .env — not in source code
const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_COST_FACTOR);
```

The `SEED_TEST_USER_PASSWORD` env var is read from `.env`, never committed to source control.

**Idempotency check:**
```
GET /api/data/v9.2/qdb_portal_userses?$filter=qdb_name eq 'portal-test@qdb.qa'&$select=qdb_portal_usersid
```

**POST body (if absent):**
```json
{
  "qdb_name": "portal-test@qdb.qa",
  "qdb_display_name": "Portal Test User",
  "qdb_password_hash": "<bcrypt hash from runtime>",
  "qdb_is_active": true,
  "qdb_is_email_verified": true,
  "qdb_preferred_language": 100000001
}
```

**Deactivation warning (C-SCHEMA-005):**
At the end of Phase 10, regardless of whether SD-003 was inserted or skipped, the script emits:
```
WARNING [C-SCHEMA-005]: Test user portal-test@qdb.qa was seeded.
This record must be deactivated or deleted before promoting to production.
Set qdb_is_active = false or delete the record via Power Apps before UAT.
```

---

### SD-004 — Widget Config Record (WidgetConfigSeed.ts)

**Idempotency check:**
```
GET /api/data/v9.2/qdb_portal_widget_configses?$filter=qdb_widget_type eq 'my-requests-summary' and qdb_portal_config/qdb_portal_id eq 'qdb-default'
```

**POST body (if absent):**
```json
{
  "qdb_name": "My Requests Summary (Default)",
  "qdb_widget_type": "my-requests-summary",
  "qdb_column_span": 4,
  "qdb_row_span": 2,
  "qdb_display_order": 1,
  "qdb_is_visible": true,
  "qdb_config_json": "{\"showChart\":true}",
  "qdb_portal_config@odata.bind": "/qdb_portal_configses(<portalConfigId>)"
}
```

---

## 13. Post-Provisioning Validation

`PostProvisioningValidator.ts` executes only read operations. It reports pass/fail per check and exits with code 1 if any check fails.

### Validation Checks

| Check | Method | Pass Condition |
|-------|--------|----------------|
| All 15 entities exist | GET `EntityDefinitions` with `$filter=LogicalName in ('qdb_portal_users',...)` | All 15 returned |
| All 9 option sets exist | GET each `GlobalOptionSetDefinitions(Name='qdb_xxx')` | All 9 return 200 |
| QdbPortalShell solution exists | GET `solutions?$filter=uniquename eq 'QdbPortalShell'` | 200 with record |
| Portal Shell API Role exists | GET `roles?$filter=name eq 'Portal Shell API Role'` | 200 with record |
| C-SCHEMA-004: SP has no System Admin | GET `systemuserroles_association` for SP | "System Administrator" absent |
| C-SCHEMA-006: QdbDynamicFormEngine unchanged | GET solution; compare componentCount and version to Phase 2c snapshot | Values identical |
| Self-referential relationship exists | GET `RelationshipDefinitions?$filter=SchemaName eq 'qdb_portalnavitems_parentnavitem'` | 200 with record |
| SD-001 seed record exists | GET portal config by qdb_portal_id | 200 with record |
| SD-003 seed record exists | GET portal user by qdb_name | 200 with record |

### Validation Output Format

```
[PASS] Entity qdb_portal_users                       exists
[PASS] Entity qdb_portal_revoked_tokens              exists
... (15 entity lines)
[PASS] GlobalOptionSet qdb_preferred_language        exists
... (9 option set lines)
[PASS] Solution QdbPortalShell                       exists
[PASS] Security Role "Portal Shell API Role"         exists
[PASS] SP has no System Administrator role           confirmed
[PASS] QdbDynamicFormEngine component count          unchanged (47 components)
[PASS] QdbDynamicFormEngine version                  unchanged (1.0.0.7)
[PASS] Self-referential nav item relationship        exists
[PASS] Seed SD-001 portal config record              exists
[PASS] Seed SD-003 test user record                  exists

Validation complete. 24/24 checks passed.
```

---

## 14. Solution Export Instruction (C-SCHEMA-008)

The script does NOT execute the PAC CLI export. It prints the command to stdout at the end of Phase 11 for the developer to run manually after reviewing the validation output.

```
==========================================================
C-SCHEMA-008: Solution export required before delivery.
Run the following PAC CLI command:

pac solution export \
  --name QdbPortalShell \
  --path ./QdbPortalShell_1_0_0_0_managed.zip \
  --managed \
  --overwrite

Prerequisite: pac auth create --url https://org5869857f.crm4.dynamics.com
              (or existing auth profile for this org)

The managed solution file must be delivered to the client
as the deployable artefact. Do not deliver the unmanaged version.
==========================================================
```

**Why the script does not run PAC CLI itself:** PAC CLI requires a separate auth profile and environment selection that may differ from the service principal used by the provisioning script. Embedding PAC CLI execution in the Node script would create a dependency on `pac` being in PATH with a valid auth profile, which is an environment concern outside the script's control. Manual execution after validation is the safer and more auditable approach.

---

## 15. Environment Variable Contract

All variables are declared in `.env` (not committed) and `.env.example` (committed). The `env.ts` module uses Zod to validate on startup.

```
# .env.example — all required unless marked [optional]

# Dataverse target
DATAVERSE_ORG_URL=https://org5869857f.crm4.dynamics.com

# Service principal credentials
DATAVERSE_CLIENT_ID=08e80e93-0bab-45ef-8372-2e554fa9af9b
DATAVERSE_CLIENT_SECRET=<secret from Azure App Registration>
DATAVERSE_TENANT_ID=d79e793c-f6de-4204-8508-7980a63df957

# Seed data
SEED_TEST_USER_PASSWORD=<plaintext password for SD-003 test user>
# This password is hashed at runtime (bcrypt cost 12). The plaintext is never stored.
# Set a strong temporary password. Deactivate the user before production.

# Script behaviour [optional — defaults shown]
LOG_LEVEL=info
# Values: debug | info | warn | error
# Use debug to see every HTTP request and response body

DRY_RUN=false
# Values: true | false
# When true: pre-flight checks run; all POST/PATCH/DELETE operations are skipped and logged only
```

### Zod Env Schema (env.ts)

```typescript
const envSchema = z.object({
  DATAVERSE_ORG_URL: z.string().url(),
  DATAVERSE_CLIENT_ID: z.string().uuid(),
  DATAVERSE_CLIENT_SECRET: z.string().min(1),
  DATAVERSE_TENANT_ID: z.string().uuid(),
  SEED_TEST_USER_PASSWORD: z.string().min(12),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = envSchema.parse(process.env);
```

`SEED_TEST_USER_PASSWORD` minimum length of 12 is enforced at startup. A short test password is a security smell even for a test user.

---

## 16. Architecture Decision Records

### ADR-PORT-006: Raw fetch Over Dataverse SDK Library

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

**Context**

The provisioning script calls the Dataverse OData v4 metadata API and data API to create entities, option sets, relationships, security roles, and seed records. Three library options were evaluated:

1. Raw `fetch` calls with typed request/response bodies
2. `@microsoft/powerplatform-dataverse-service-client` (Microsoft-published SDK)
3. `xrm-webapi` (community wrapper)

The script is a one-time provisioning tool, not a runtime service. The SDK would abstract OData payloads but introduces a heavy dependency tree and an API that is optimised for CRUD on known entities, not for metadata provisioning operations (`EntityDefinitions`, `RelationshipDefinitions`, `GlobalOptionSetDefinitions`). The Dataverse metadata API is well-documented OData and maps directly to typed TypeScript interfaces.

**Decision**

Use raw `fetch` calls against the Dataverse OData v4 API. Define TypeScript types in `src/types/DataverseMetadata.ts` that match the Dataverse metadata payload shapes exactly. Use `@azure/msal-node` for token acquisition only.

**Rationale**

- The metadata API shape is stable and well-documented by Microsoft. Typed interfaces give full IntelliSense without a library.
- No library adds meaningful value for one-time provisioning — the operational cost of understanding a wrapper API exceeds the benefit.
- Raw fetch is transparent: every request and response is visible in the structured log without library abstraction hiding retry or header logic.
- The retry policy, error parsing, and header injection requirements are specific enough to warrant a custom `DataverseHttpClient` regardless of library choice.
- `xrm-webapi` has limited metadata API coverage and no maintained TypeScript types for `EntityDefinitions` payloads.

**Consequences**

- Positive: Zero dependency on any Dataverse SDK. The script compiles and runs with only `@azure/msal-node`, `bcrypt`, `zod`, and `dotenv` in production dependencies.
- Positive: Every HTTP payload is readable in the source code without library indirection.
- Negative: TypeScript metadata types must be maintained manually. When Microsoft extends the metadata API, the types file may need updating. Risk is low for a one-time provisioning script.
- Negative: No built-in OData query builder. All filter strings are written as template literals in the calling code. Mitigation: the `DataverseHttpClient.get()` method accepts a `QueryOptions` object that builds the `$filter`, `$select`, and `$top` segments — filter string concatenation is confined to one place.

**Rejected Alternatives**

| Alternative | Rejection Reason |
|-------------|-----------------|
| `@microsoft/powerplatform-dataverse-service-client` | Adds 15+ transitive dependencies; metadata API support is secondary to data API; no advantage for a one-time provisioning script |
| `xrm-webapi` | Community library; no maintained TypeScript types for metadata payloads; last major update 2023 |
| `@refinedev/dataverse` (already in portal) | Runtime data library; not designed for metadata operations; wrong tool for provisioning |

---

### ADR-PORT-007: Dependency-Ordered Sequential Entity Creation

**Status:** Accepted
**Date:** 2026-06-16
**Decided by:** Architect

**Context**

15 entities must be created with referential integrity: some entities have lookup fields pointing to other entities in the same provisioning run. Dataverse validates lookup targets at relationship creation time — a lookup attribute that references a non-existent entity will return a 400 error. Three execution ordering strategies were evaluated:

1. Sequential with explicit dependency batches (Batch A → Batch B → Batch C)
2. Parallel fan-out with dependency graph resolution (topological sort)
3. Two-pass: create all entities first (no lookups), then add all attributes in a second pass

**Decision**

Use explicit sequential dependency batches as defined in Section 3 Phase 5:
- Batch A: entities with no lookups to other provisioned entities
- Batch B: entities with lookups to Batch A entities
- Batch C: entities with lookups to Batch B entities

Within each batch, entities are created sequentially (one at a time), not in parallel.

**Rationale**

- Dataverse Metadata API enforces rate limits. Parallel fan-out increases the probability of 429 responses. Sequential creation within batches is safer and still completes in under 10 minutes for 15 entities.
- Three dependency tiers is the correct model for this entity graph. A topological sort adds implementation complexity for no practical benefit — the dependency graph is shallow and known at design time.
- The two-pass approach (entities without attributes first) would double the request count and require a second merge step that is harder to make idempotent.
- Sequential execution produces a predictable, readable log: the developer sees exactly which entity was created and in what order, without interleaved async output.
- Explicit batches means the developer can read `EntityCreationOrchestrator.ts` and immediately understand why each entity appears in its batch position. No algorithm inference required.

**Consequences**

- Positive: Log output is sequential and easy to follow. Each entity result appears in the log in dependency order.
- Positive: If an entity creation fails, the script aborts before attempting dependent entities. There is no risk of creating a child entity before its parent.
- Positive: The implementation is a simple sequential loop over three arrays — minimal code, minimal risk.
- Negative: Batch A entities are not created in parallel, which means total provisioning time is slightly longer than a parallel approach. At 15 entities with ~2–5 second Dataverse response times, total entity creation time is approximately 1–2 minutes. This is acceptable for a one-time script.
- Negative: Adding a new entity in the future requires the developer to explicitly assign it to the correct batch. If they place it in the wrong batch, the Dataverse 400 error will be the signal. The error message from Dataverse for a missing lookup target is clear enough to diagnose.

**Rejected Alternatives**

| Alternative | Rejection Reason |
|-------------|-----------------|
| Parallel fan-out with topological sort | Adds algorithmic complexity; increases 429 risk; over-engineering for 15 entities |
| Two-pass (entities then attributes) | Doubles request count; harder to make idempotent; no advantage over inline attributes |
| Dependency injection via async queue | Queue infrastructure is not available in a Node.js CLI script; eliminates the simplicity advantage of a self-contained tool |

---

## 17. ADR Index Update

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-PORT-001 | Refine Headless + Fluent UI v9 Shell Pattern | Accepted | 2026-06-16 | Architect |
| ADR-PORT-002 | Auth.js v5 + MSAL Dual-Library Strategy | Accepted | 2026-06-16 | Architect |
| ADR-PORT-003 | next-intl + Tailwind v4 Logical Properties RTL Strategy | Accepted | 2026-06-16 | Architect |
| ADR-PORT-004 | Widget Plug-in Registry | Accepted | 2026-06-16 | Architect |
| ADR-PORT-005 | Auth Adapter Interface | Accepted | 2026-06-16 | Architect |
| ADR-PORT-006 | Raw fetch Over Dataverse SDK Library | Accepted | 2026-06-16 | Architect |
| ADR-PORT-007 | Dependency-Ordered Sequential Entity Creation | Accepted | 2026-06-16 | Architect |

---

## 18. CEO Binding Condition Traceability

| Condition | Where Enforced | Hard Stop? |
|-----------|---------------|------------|
| C-SCHEMA-001: Publisher verification first | Phase 2a (PublisherCheck.ts) | Yes — abort on publisher create failure |
| C-SCHEMA-002: Picklist code pre-check | Phase 2b (PicklistConflictCheck.ts) | Yes — abort on any conflict |
| C-SCHEMA-003: Append-only tables at role level | Phase 7 privilege matrix (no Update/Delete on 3 entities) | Yes — role POST fails if privileges cannot be set |
| C-SCHEMA-004: No System Admin on SP | Phase 2d pre-flight + Phase 7 post-assignment check | Yes — abort if detected |
| C-SCHEMA-005: Bcrypt hash at runtime; deactivation warning | Phase 8 SD-003; Phase 10 deactivation warning | Warning only (not abort) |
| C-SCHEMA-006: QdbDynamicFormEngine untouched | Phase 2c snapshot + Phase 9 re-check | Yes — abort if changed |
| C-SCHEMA-007: qdb_portal_pages not in scope | Section 3 entity list — 15 entities confirmed; no qdb_portal_pages | Scope confirmed in BRD |
| C-SCHEMA-008: Managed solution exported via PAC CLI | Phase 11 PAC CLI instruction printed to stdout | Instruction only — developer executes |

---

## Skeptic Review

> CHALLENGE 1 — Pre-flight order: The PicklistConflictCheck in Phase 2b enumerates all GlobalOptionSetDefinitions and follows `@odata.nextLink` pages. In a mature org with hundreds of option sets, this could return thousands of records across many pages. If the org has a 1-minute API response time cap on large queries, the pagination could time out. What is the page size strategy, and does the HTTP client handle multi-page enumeration with the same retry logic as single requests?

> CHALLENGE 2 — Entity creation in Batch A with inline lookups: `qdb_portal_notifications` has a lookup to `qdb_portal_users`, and `qdb_portal_users` is also in Batch A. If both are in Batch A, the lookup creation will fail because `qdb_portal_users` may not exist yet when `qdb_portal_notifications` is created. The ordering within Batch A must be explicit — `qdb_portal_users` must always come before `qdb_portal_notifications`. The architecture states "no lookups to other provisioned entities" for Batch A, but qdb_portal_notifications.qdb_user IS a lookup to qdb_portal_users. These two entities belong in different batches.

> CHALLENGE 3 — Security role privilege GUIDs: The `SecurityRoleProvisioner.ts` queries `privileges` by name (e.g., `prvCreateqdb_portal_users`) after entity creation. Privilege names for custom entities in Dataverse follow the pattern `prv<Action><SchemaName>`. The schema name for the entity may not match the logical name exactly in all cases. If the privilege name query returns zero results (because Dataverse has not finished processing the entity async), the role assignment fails silently or throws. Is there a polling strategy after entity creation before the privilege query, or is the creation synchronous enough to proceed immediately?

> CHALLENGE 4 — `MSCRM.SolutionUniqueName` header on attribute POSTs: When an attribute is added to an existing entity via a separate POST (Phase 6 self-referential relationship), the `MSCRM.SolutionUniqueName` header must be present to register the relationship in the QdbPortalShell solution. If the header is absent, the relationship is created in the Default Solution (Active layer) and cannot be exported as part of the managed solution. The architecture states the header is always present on POST/PATCH/DELETE — the implementation must verify this is explicitly set on the relationship POST in Phase 6.

> CHALLENGE 5 — Bcrypt at cost 12 in a Node.js single-process script: bcrypt at cost 12 takes approximately 250–400ms on modern hardware. For a provisioning script that runs once, this is fine. However, the `SEED_TEST_USER_PASSWORD` env var must be present and non-empty for the Zod schema to pass. If the developer runs the script in a CI/CD context without setting this variable (e.g., a pipeline re-run that only needs to validate idempotency), the script aborts in Phase 0. Consider making `SEED_TEST_USER_PASSWORD` optional when `DRY_RUN=true`.

> CHALLENGE 6 — Column Security Profile for `qdb_auth_config_json`: The architecture notes that `qdb_auth_config_json` is "protected by a Column Security Profile applied post-creation." This post-creation step is not in the script — it is a manual step. If this step is not in the provisioning checklist and the developer forgets it, the auth provider credentials (clientId, clientSecret) are readable by any user with standard read access to the portal config entity. This is a security gap. Either the script should automate the column security profile assignment via the Dataverse metadata API, or the post-provisioning validation should check for its presence and warn explicitly.

> CHALLENGE 7 — DRY_RUN mode completeness: The `.env.example` documents `DRY_RUN=false`. The architecture says "all POST/PATCH/DELETE operations are skipped and logged only" in dry run. But Phase 2a (PublisherCheck) creates the publisher if absent — is a publisher creation considered a POST that gets skipped in dry run? If the publisher does not exist and dry run is active, Phase 3 (solution creation) cannot proceed because it needs the publisherId. The dry run flow must either abort after Phase 2a if the publisher is absent, or mock the publisherId for subsequent dry-run phases.

> CHALLENGE 8 — PAC CLI solution export as manual step: C-SCHEMA-008 requires the managed solution to be exported via PAC CLI. The script prints the command but does not execute it. This means the architecture document delivers the schema provisioning but not the final artefact. If a developer runs the provisioning script and then fails to run the PAC CLI command, the managed solution is never created. This breaks the delivery checklist. A post-provisioning checklist file should be emitted by the script at the end, listing the manual steps (PAC CLI export + column security profile) that must be completed for the delivery to be considered done.

> CHALLENGE 9 — qdb_cms_revisions in the entity batch: The architecture places `qdb_cms_revisions` in Batch B with a lookup to `qdb_cms_contents`. But `qdb_cms_contents` is listed in Batch A. If qdb_cms_contents is in Batch A (no lookups to provisioned entities), and qdb_cms_revisions is in Batch B, the ordering is correct. However, `qdb_cms_contents` has a lookup to `qdb_portal_configs` (`qdb_portal_config` field). `qdb_portal_configs` is also in Batch A. If both are in Batch A, the ordering within Batch A matters — `qdb_portal_configs` must be created before `qdb_cms_contents`. The intra-batch ordering is not explicitly defined in Section 3, only the batch groupings.

> CHALLENGE 10 — Simplicity check: The provisioning script is reasonably scoped for its purpose. The main over-engineering risk is the `DataverseHttpClient` abstraction — for a provisioning script with a fixed set of operations, a simpler module-level fetch helper would achieve the same result with less interface boilerplate. However, the typed error handling and retry logic are genuine requirements, so the abstraction is justified. The only area where simplification is clearly warranted is the `PostProvisioningValidator.ts` — 24 checks is ambitious for a first-pass validator; a simpler version that checks entity count and solution version would provide 90% of the confidence at 30% of the complexity.

These challenges must be addressed before Phase 4 begins.
