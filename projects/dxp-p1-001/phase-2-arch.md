# DXP-P1-001: Component Registry — Architecture Document
**Engagement:** DXP-P1-001
**Phase:** 3 — Architecture
**Architect:** Solution Architect, Maqsad AI
**Date:** 2026-06-17
**Status:** Proposed — awaiting CEO Phase 3 → 4 approval

---

## 1. Architecture Overview

QdbDxpPlatform is a new Dataverse unmanaged solution added to the existing org5869857f.crm4.dynamics.com tenant alongside QdbPortalShell and QdbDynamicFormEngine. It introduces two Dataverse entities (component definitions and versions), a TypeScript provisioning script following the established portal-shell pattern, a Fastify plugin wired into the existing portal-shell API app, a Next.js admin page within the existing portal-shell web app, and a thin adapter in the widget-registry package that syncs in-process registrations to the persistent platform registry.

The registry enforces an immutability contract: component names and version numbers are write-once, props_schema is write-once, and the single-latest-version invariant is enforced at the API layer via OData $batch. No Dataverse plugins are introduced in this engagement; enforcement is API-layer only.

The data flow is: `registerWidget()` call in the web app → adapter fires async HTTP POST/PATCH to Fastify `/api/admin/components` → Fastify route validates and writes to Dataverse OData v9.2 → Dataverse persists to qdb_component_definitions / qdb_component_versions.

---

## 2. Component Diagram

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Browser / Next.js App (apps/web)                                    │
  │                                                                      │
  │  ┌────────────────────────────────┐   ┌──────────────────────────┐  │
  │  │  /admin/components (page.tsx)  │   │  Widget self-registration │  │
  │  │  client: TanStack Query        │   │  registerWidget(def)      │  │
  │  │  components: ComponentList,    │   │  calls adapter.ts        │  │
  │  │  DefinitionForm, VersionList,  │   └──────────┬───────────────┘  │
  │  │  VersionForm, CategoryFilter   │              │ fire-and-forget   │
  │  └────────────────┬───────────────┘              │ HTTP POST        │
  │                   │ HTTP / Next proxy             │                  │
  └───────────────────┼───────────────────────────────┼──────────────────┘
                      │                               │
  ┌───────────────────▼───────────────────────────────▼──────────────────┐
  │  Fastify API (apps/api)                                               │
  │                                                                      │
  │  routes/admin/components.ts  (Fastify plugin)                        │
  │  ┌────────────────────────────────────────────────────────────────┐  │
  │  │  ComponentDefinitionRoutes   — CRUD /api/admin/components      │  │
  │  │  ComponentVersionRoutes      — CRUD /api/admin/components/:id  │  │
  │  │                                     /versions                  │  │
  │  │  SetLatestRoute              — POST .../versions/:vid/set-     │  │
  │  │                                     latest  (OData $batch)     │  │
  │  └──────────────────────────────────┬─────────────────────────────┘  │
  │                                     │ OData v9.2 + Bearer token       │
  └─────────────────────────────────────┼────────────────────────────────┘
                                        │
  ┌─────────────────────────────────────▼────────────────────────────────┐
  │  Dataverse  org5869857f.crm4.dynamics.com                            │
  │                                                                      │
  │  ┌─────────────────────────────┐  ┌─────────────────────────────┐   │
  │  │  QdbDxpPlatform (new)       │  │  QdbPortalShell (existing)  │   │
  │  │  qdb_component_definitions  │  │  qdb_portal_widget_configs  │   │
  │  │  qdb_component_versions     │  │  (no cross-solution FK)     │   │
  │  └─────────────────────────────┘  └─────────────────────────────┘   │
  │                                                                      │
  │  ┌─────────────────────────────┐                                     │
  │  │  QdbDynamicFormEngine       │  (no cross-solution FK in P1)       │
  │  └─────────────────────────────┘                                     │
  └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │  Provisioning Script (dxp-p1-001/scripts/provision-schema/)          │
  │  TypeScript + OData v9.2 (one-time / idempotent re-run)              │
  │  Phases: token → preflight → solution → option set → entities        │
  │          → relationship → alternate key → seed → validate            │
  └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │  packages/widget-registry/                                           │
  │  adapter.ts  — wraps registerWidget(), fires async upsert to API     │
  │  registry.ts — unchanged; in-memory globalThis Map                   │
  └──────────────────────────────────────────────────────────────────────┘
```

### Solution Co-existence

All three solutions share a single Dataverse org. They use the same publisher prefix `qdb_`. QdbDxpPlatform defines only its own entities; it carries no FK lookups into QdbPortalShell or QdbDynamicFormEngine tables in this engagement. Future engagements (DXP-P1-002+) may add cross-solution references via unmanaged layers on top of managed solutions — that decision is deferred.

---

## 3. Technology Stack

| Layer | Technology | Reason / ADR reference |
|---|---|---|
| Dataverse Schema | Dataverse Web API v9.2 OData, unmanaged solution | Constitution Article XI; same org as QdbPortalShell |
| Provisioning Script | Node.js + TypeScript, same OData HTTP pattern as portal-shell | ADR-DXP-001: separate script, same runtime pattern |
| Backend API | Node.js + TypeScript + Fastify | Constitution default; existing portal-shell apps/api |
| Input Validation | Zod | Constitution Article III |
| Props Schema Validation | ajv@^8.17.1 | BRD adoption decision; check `npm ls ajv` before explicit dep |
| Schema Serialisation | zod-to-json-schema@^3.20.3 | BRD adoption decision (ISC licence, FR-069) |
| Frontend | Next.js + TypeScript + Tailwind CSS + Fluent UI v9 | Constitution default; matches existing CMS admin UI |
| Client State / Fetch | TanStack Query (React Query) | Matches existing useCms.ts, useAdminCmsContent hooks |
| OData Atomicity | OData $batch (multipart/mixed) | ADR-DXP-002: API-layer atomicity for set-latest |
| Immutability Enforcement | Fastify route validation | ADR-DXP-004: API layer only for this engagement |
| Error Shape | RFC 7807 + portal-shell code/message pattern | ADR-DXP-005 |

---

## 4. Architecture Decision Records

### ADR-DXP-001: Provisioning Script Location

**Status:** Accepted
**Date:** 2026-06-17
**Decided by:** Architect

**Context**

The portal-shell provisioning script lives at `projects/portal-shell/scripts/provision-schema/`. QdbDxpPlatform is a separate Dataverse solution with its own entities, option set, and relationship. Two options were considered:

- Option A: Create `projects/dxp-p1-001/scripts/provision-schema/` as a standalone TypeScript project mirroring the portal-shell pattern (same module names, same phase structure, but importing nothing from portal-shell's script).
- Option B: Extend the portal-shell provisioning script by adding new entity definitions and conditionally running DXP provisioning phases via a flag.

**Decision:** Option A — separate script directory.

**Rationale**

1. The portal-shell script provisions QdbPortalShell. Mixing QdbDxpPlatform provisioning into it violates the Single Responsibility Principle at the script level.
2. Running DXP provisioning inadvertently when re-provisioning QdbPortalShell in a new environment is a silent blast radius: if QdbDxpPlatform is not required in that environment, the extra phases execute unnecessarily and cannot be rolled back.
3. Separate scripts allow independent CI/CD invocation — QdbDxpPlatform can be provisioned in environments that already have QdbPortalShell without re-running all of portal-shell's phases.
4. The script pattern is a thin TypeScript runner: the shared code (TokenProvider, DataverseHttpClient, PublisherCheck, EntityProvisioner, RelationshipProvisioner, GlobalOptionSetProvisioner, SolutionProvisioner, PostProvisioningValidator) will be duplicated by reference — each script carries its own copy. When two scripts grow and share significant code, an ADR revision may introduce a shared `packages/dataverse-provisioner/` internal package. That refactor is deferred per YAGNI.

**Consequences**

- Total script code in the monorepo increases; duplication of the HTTP client pattern is accepted.
- Each provisioning script is independently runnable with its own `.env` file and its own DRY_RUN flag.
- Future scripts (DXP-P1-002, DXP-P1-003) follow the same convention unless an ADR revises this.

---

### ADR-DXP-002: OData $batch for Atomic set-latest

**Status:** Accepted
**Date:** 2026-06-17
**Decided by:** Architect

**Context**

The BRD requires (FR-028, C-006) that at most one qdb_component_version per definition has `qdb_is_latest = true`, and that this invariant must be enforced atomically when the set-latest operation runs. Four options were considered:

- Option A: OData $batch with two PATCH operations in a single multipart/mixed request (clear existing latest, set new latest).
- Option B: A Dataverse plugin (PreOperation) on the Update message for qdb_component_versions that enforces the single-latest constraint server-side.
- Option C: A Dataverse calculated column or rollup that derives `qdb_is_latest` automatically.
- Option D: An API-layer saga with compensating transaction — PATCH new to true, then PATCH old to false; if the second call fails, reverse.

**Decision:** Option A — OData $batch.

**Rationale**

1. Option B (Dataverse plugin) would provide the strongest guarantee — true transactional enforcement regardless of which client calls the API. However, BRD FR-044 through FR-055 require this enforcement only from the portal platform API; no other client is expected to write `qdb_is_latest` directly. The BRD explicitly states C-006: `qdb_is_latest` is only settable via the set-latest endpoint. Plugins add deployment complexity (managed code, solution versioning, sandbox constraints) that is disproportionate to the risk in this engagement.
2. Option C is not feasible: Dataverse calculated fields cannot derive a boolean based on "this record has the max version number for its parent" without a plugin.
3. Option D is a saga and by definition non-atomic: the window between the two PATCHes leaves the invariant temporarily violated, and the compensating transaction can itself fail, leaving the system in an inconsistent state with two records marked as latest.
4. Option A provides the best trade-off: $batch sends both PATCHes in a single HTTP request. Dataverse processes the batch operations within a single transaction per the OData v4 specification and confirmed by Microsoft documentation for Dataverse Web API v9.2 ("All operations in an OData $batch request are processed in a single database transaction").

**Open Risk Addressed**

Dataverse's $batch transactional semantics: Microsoft's official documentation states: "When a batch request uses atomic group change sets, all operations in the change set succeed or fail as a group." The two PATCHes must be enclosed in a `--changeset` boundary within the $batch request, not submitted as independent requests within the batch. The exact $batch body format is specified in Section 5 (set-latest route).

If Dataverse rolls back the change set (e.g., due to a concurrent customization lock), the API layer returns 500 and neither record is modified. The caller retries. This is the accepted failure mode: transient failure is safer than permanent inconsistency.

**Accepted Risk**

Two admins simultaneously invoking set-latest on the same definition is possible. With $batch change sets, one request will complete and the other will likely receive a 412 Precondition Failed or 409 Conflict from Dataverse's optimistic concurrency (if `@odata.etag` is supplied) or will succeed in overwriting the first. The race is accepted at the current load profile. Section 9 addresses this further under concurrency.

**Consequences**

- No Dataverse plugin to deploy or version.
- The `qdb_is_latest` field must be included in `$select` on all GET queries to avoid stale reads.
- The set-latest endpoint must refuse if the caller attempts to set `qdb_is_latest` via PATCH directly (enforced by Zod schema rejecting `qdb_is_latest` in the PATCH body per ADR-DXP-006).

---

### ADR-DXP-003: Widget-Registry Adapter Placement

**Status:** Accepted
**Date:** 2026-06-17
**Decided by:** Architect

**Context**

The adapter needs to intercept `registerWidget()` calls and sync the definition to the Component Registry API. Three placement options were evaluated:

- Option A: `packages/widget-registry/src/adapter.ts` — adapter lives in the shared package, exported as an optional side-effectful entry point.
- Option B: `apps/api/src/` — adapter is a backend module.
- Option C: `apps/web/src/` — adapter is an app-specific module.

The secondary decision is whether the adapter calls the Fastify API over HTTP or calls Dataverse OData directly.

**Decision:** Option A — adapter in `packages/widget-registry/src/adapter.ts`. It calls the Fastify API over HTTP (not Dataverse OData directly).

**Rationale for Placement (Option A)**

1. Widget registration happens in `apps/web` at module-import time. The adapter must execute in the same process where `registerWidget()` runs — that is the Next.js web process, not the Fastify process.
2. Option B is wrong by location: the adapter would need to be imported into the web app from the API app, creating a package boundary violation. The API app does not export browser/Next.js compatible modules.
3. Option C is rejected because placing the adapter in `apps/web/src/` means every future portal app (`apps/mobile`, future portals) that uses widget-registry would have to re-implement the adapter. Centralising it in the package is the correct abstraction boundary.
4. The adapter is placed in the same package as `registerWidget()` so the wiring is encapsulated: callers import `registerWidget` and the adapter is wired transparently behind it.

**Rationale for HTTP vs OData Direct**

The adapter calls the Fastify API (`POST /api/admin/components`) rather than Dataverse OData directly because:

1. The Fastify route owns the business logic: Zod validation, immutability enforcement (ADR-DXP-004), and the `zod-to-json-schema` serialisation are in one place. Duplicating this logic in the adapter would split the invariant across two locations.
2. The adapter runs in the Next.js web process. Calling Dataverse OData directly would require the Next.js process to hold a service principal client secret — a significant security surface expansion. Under the current architecture only the Fastify API process holds Dataverse credentials.
3. The API is the authoritative integration point per the DXP contract. Future DXP phases access the same API; the adapter is just another consumer.

**Consequences**

- The adapter requires the Fastify API base URL as a configuration value (injected via environment variable `NEXT_PUBLIC_API_URL` which already exists).
- In development, the Next.js app and Fastify API are co-located; the HTTP call is loopback.
- If the Fastify API is unavailable at widget-registration time, the adapter's fire-and-forget suppresses the error without blocking the UI (see Section 7 for error handling detail).

---

### ADR-DXP-004: props_schema Immutability Enforcement

**Status:** Accepted
**Date:** 2026-06-17
**Decided by:** Architect

**Context**

BRD C-005 states that `qdb_version_number` and `qdb_props_schema` must be immutable after creation. Three options were considered:

- Option A: Fastify route validation only — the PATCH route's Zod schema explicitly excludes these fields; if either appears in a PATCH body, the request is rejected with 400 before touching Dataverse.
- Option B: Dataverse plugin (PreOperation on Update) — enforces the constraint at the database layer, regardless of which client calls the API.
- Option C: Both A and B — defence in depth.

**Decision:** Option A — Fastify route validation only, for this engagement.

**Rationale**

1. The BRD scopes the invariant to the platform API layer. No other client is expected to write version records. The threat model is an API caller attempting to PATCH a prohibited field, not a rogue direct-OData caller.
2. The Zod schema approach is immediately verifiable by tests and is the only mechanism that can return a typed 400 error to the caller with a clear field-level message. A Dataverse plugin returns a generic 400 with an OData error object that must be re-mapped.
3. Adding a Dataverse plugin raises the deployment bar (managed code, sandbox, SysAdmin provisioner role, LCS considerations per constitution Article XI) disproportionate to the risk.
4. For future engagements where external system integrations write to these entities directly via OData, Option C (both) is recommended. An ADR revision must be raised at that point.

**Enforcement Mechanism**

The PATCH body schema for `/api/admin/components/:id/versions/:vid` is defined as `ComponentVersionPatchSchema` which explicitly omits `qdb_version_number` and `qdb_props_schema` (using `z.object(...)` without those fields, not `z.object(...).omit(...)` — the former makes it a compile-time absence, the latter a runtime strip). Fastify will reject the body at Zod parse time if either field is present.

**Consequences**

- `qdb_name` on definitions is handled the same way: the PATCH schema for definitions omits `qdb_name`.
- The immutability contract lives in `ComponentDefinitionPatchSchema` and `ComponentVersionPatchSchema` — changes to these schemas require an ADR revision.

---

### ADR-DXP-005: API Error Response Schema

**Status:** Accepted
**Date:** 2026-06-17
**Decided by:** Architect

**Context**

CEO condition C-011 requires the Component Registry API error responses to match the existing portal-shell error pattern. Reading `apps/api/src/routes/auth.ts` confirms the existing pattern: errors return a JSON object with `code` (string) and `message` (string), without a `data` wrapper. The success pattern wraps responses in `{ data: ... }`.

The error shape observed:
```json
{
  "code": "invalid_credentials",
  "message": "Invalid email or password"
}
```

This is structurally compatible with RFC 7807 Problem Details but does not use the `type`/`title`/`status`/`detail` field names from RFC 7807. The project uses the simpler `code`/`message` shape throughout.

**Decision:** Extend the existing `code`/`message` pattern with an optional `fields` array for validation errors. Do not adopt RFC 7807 field names (which would diverge from the existing codebase).

**Error Response Shape (authoritative contract)**

```typescript
interface ApiErrorResponse {
  code: string;          // machine-readable error code (snake_case)
  message: string;       // human-readable message (English)
  fields?: Array<{       // present only for 400 validation errors
    field: string;       // dot-path of the invalid field
    message: string;     // field-level message
  }>;
}
```

**Error Codes for Component Registry Routes**

| HTTP Status | code | Trigger |
|---|---|---|
| 400 | `validation_error` | Zod parse failure on request body / query / params |
| 400 | `immutable_field` | PATCH body contains qdb_name, qdb_version_number, or qdb_props_schema |
| 400 | `invalid_props_schema` | ajv rejects the props_schema JSON at POST /versions |
| 404 | `component_definition_not_found` | GET/PATCH/DELETE by GUID where record does not exist |
| 404 | `component_version_not_found` | GET/PATCH/DELETE version by GUID where record does not exist |
| 409 | `duplicate_component_name` | POST /components where qdb_name already exists |
| 409 | `duplicate_version_number` | POST /versions where definition_id + version_number already exists |
| 422 | `latest_version_not_found` | set-latest called with a version GUID not belonging to the definition |
| 500 | `dataverse_error` | Dataverse OData call returns non-2xx |

**Consequences**

- All component routes return this shape for errors.
- The `fields` property is populated from Zod's `error.issues` array mapped to `{ field: issue.path.join('.'), message: issue.message }`.
- 500 errors log the full Dataverse error body internally but return only a sanitised `dataverse_error` message to the caller.

---

## 5. Dataverse Schema Design

### Global Option Set: qdb_component_category

Provisioned as a GlobalOptionSet before entity creation. Integer codes use the `860004xxx` range (consistent with the existing portal-shell series: `860000xxx`, `860001xxx`, `860002xxx`, `860003xxx`).

| Value | Label |
|---|---|
| 860004001 | Dashboard Widget |
| 860004002 | Form Component |
| 860004003 | Navigation Element |
| 860004004 | Data Display |
| 860004005 | Action Button |

### Entity: qdb_component_definitions

**Schema Name:** `qdb_Component_Definitions`
**Logical Name:** `qdb_component_definitions`
**Plural Logical Name:** `qdb_component_definitionses`
**Ownership Type:** `OrganizationOwned`
**Primary Name Attribute:** `qdb_name`
**Solution:** QdbDxpPlatform (MSCRM.SolutionUniqueName header on all creates)
**HasActivities:** false
**HasNotes:** false

| Field | Schema Name | Logical Name | Type | OData Type | Constraints | Notes |
|---|---|---|---|---|---|---|
| PK (auto) | `qdb_Component_DefinitionsId` | `qdb_component_definitionsid` | UniqueIdentifier | — | System | Auto-generated primary key |
| Name (slug) | `qdb_Name` | `qdb_name` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=100 | PrimaryNameAttribute; alternate key; immutable (ADR-DXP-004) |
| Display Name EN | `qdb_DisplayName` | `qdb_display_name` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=255 | — |
| Display Name AR | `qdb_DisplayNameAr` | `qdb_display_name_ar` | String | StringAttributeMetadata | RequiredLevel=None, MaxLength=255 | RTL label |
| Description EN | `qdb_Description` | `qdb_description` | Memo | MemoAttributeMetadata | RequiredLevel=None, MaxLength=2000 | — |
| Description AR | `qdb_DescriptionAr` | `qdb_description_ar` | Memo | MemoAttributeMetadata | RequiredLevel=None, MaxLength=2000 | — |
| Category | `qdb_Category` | `qdb_category` | OptionSet | PicklistAttributeMetadata (GlobalOptionSet: qdb_component_category) | RequiredLevel=ApplicationRequired | Integer value stored |
| Render Targets | `qdb_RenderTargets` | `qdb_render_targets` | Memo | MemoAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=4000 | JSON string array, e.g. `["portal","mobile"]`; validated by Zod at API layer |
| State Code | `statecode` | `statecode` | State | — | System | 0=Active, 1=Inactive; soft-delete via deactivation |
| Status Code | `statuscode` | `statuscode` | Status | — | System | Managed by state transition |
| Created On | `createdon` | `createdon` | DateTime | — | System | Dataverse audit field |
| Modified On | `modifiedon` | `modifiedon` | DateTime | — | System | Dataverse audit field |
| Created By | `createdby` | `createdby` | Lookup (systemuser) | — | System | Dataverse audit field |
| Modified By | `modifiedby` | `modifiedby` | Lookup (systemuser) | — | System | Dataverse audit field |

**Alternate Key:** `qdb_name` — provisioned via `EntityDefinitions(LogicalName='qdb_component_definitions')/Keys` POST after entity creation (Batch C). This enables OData alternate-key addressing: `qdb_component_definitionses(qdb_name='my-widget')`.

**Indexing:** Dataverse automatically indexes alternate key fields. The `qdb_category` picklist field will benefit from Dataverse's native filter indexing when `$filter=qdb_category eq 860004001` is used.

### Entity: qdb_component_versions

**Schema Name:** `qdb_Component_Versions`
**Logical Name:** `qdb_component_versions`
**Plural Logical Name:** `qdb_component_versionses`
**Ownership Type:** `OrganizationOwned`
**Primary Name Attribute:** `qdb_version_number`
**Solution:** QdbDxpPlatform

| Field | Schema Name | Logical Name | Type | OData Type | Constraints | Notes |
|---|---|---|---|---|---|---|
| PK (auto) | `qdb_Component_VersionsId` | `qdb_component_versionsid` | UniqueIdentifier | — | System | — |
| Version Number | `qdb_VersionNumber` | `qdb_version_number` | String | StringAttributeMetadata | RequiredLevel=ApplicationRequired, MaxLength=50 | PrimaryNameAttribute; immutable (ADR-DXP-004); semver recommended, not enforced at DB level |
| Definition (lookup) | `qdb_DefinitionId` | `qdb_definition_id` | Lookup | LookupAttributeMetadata → qdb_component_definitions | RequiredLevel=ApplicationRequired | FK to qdb_component_definitions; cascade = Restrict on delete |
| Props Schema | `qdb_PropsSchema` | `qdb_props_schema` | Memo | MemoAttributeMetadata | RequiredLevel=None, MaxLength=1048576 (1M) | JSON Schema string; immutable after creation (ADR-DXP-004) |
| Is Latest | `qdb_IsLatest` | `qdb_is_latest` | Boolean | BooleanAttributeMetadata | RequiredLevel=None, DefaultValue=false | Max one true per definition; enforced by set-latest endpoint |
| Change Log | `qdb_ChangeLog` | `qdb_change_log` | Memo | MemoAttributeMetadata | RequiredLevel=None, MaxLength=4000 | Human-readable notes for this version |
| State Code | `statecode` | `statecode` | State | — | System | 0=Active, 1=Inactive |
| Status Code | `statuscode` | `statuscode` | Status | — | System | — |
| Created On | `createdon` | `createdon` | DateTime | — | System | — |
| Modified On | `modifiedon` | `modifiedon` | DateTime | — | System | — |
| Created By | `createdby` | `createdby` | Lookup (systemuser) | — | System | — |
| Modified By | `modifiedby` | `modifiedby` | Lookup (systemuser) | — | System | — |

### Relationship: qdb_componentdefinition_versions

| Property | Value |
|---|---|
| Schema Name | `qdb_componentdefinition_versions` |
| Type | One-to-Many (qdb_component_definitions → qdb_component_versions) |
| Referenced Entity | `qdb_component_definitions` |
| Referencing Entity | `qdb_component_versions` |
| Lookup Field Schema Name | `qdb_DefinitionId` |
| Lookup Field Logical Name | `qdb_definition_id` |
| Delete Behaviour | **Restrict** — deleting a definition is blocked if any version records exist |
| Cascade Assign | NoCascade |
| Cascade Share | NoCascade |
| Cascade Reparent | NoCascade |
| AssociatedMenuConfiguration | DoNotDisplay |

The relationship is provisioned in Batch C (after both entities exist in Batch A/B), via `POST /RelationshipDefinitions` with `MSCRM.SolutionUniqueName: QdbDxpPlatform`.

### Composite Uniqueness: definition_id + version_number

Dataverse does not support composite alternate keys involving a lookup field. The `qdb_definition_id + qdb_version_number` uniqueness constraint cannot be enforced at the Dataverse schema level natively.

**Enforcement Strategy:** API-layer uniqueness check in the Fastify POST /versions route.

Before creating a new version record, the route issues an OData GET query:
```
GET /qdb_component_versionses
  ?$filter=qdb_definition_id eq <definitionGuid>
    and qdb_version_number eq '<versionString>'
    and statecode eq 0
  &$select=qdb_component_versionsid
  &$top=1
```

If any record is returned, the route responds with `409 duplicate_version_number`. This introduces a TOCTOU (time-of-check, time-of-use) window: two concurrent POST requests could both pass the check and both succeed. The accepted mitigation is that concurrent version creation for the exact same version number on the same definition is an extremely unlikely scenario in the admin-user workflow, and the cost of a Dataverse plugin to enforce it is disproportionate. If the duplicate survives, it is detectable by the post-provisioning validator and correctable manually.

---

## 6. Provisioning Script Design

**Location:** `projects/dxp-p1-001/scripts/provision-schema/src/`

### Module Structure

```
src/
  index.ts                              — entrypoint, phase orchestration
  config/
    schema.ts                           — Zod env schema
    env.ts                              — validated env export
  auth/
    TokenProvider.ts                    — service principal client-credentials (mirror of portal-shell)
  http/
    DataverseHttpClient.ts              — OData HTTP client (mirror of portal-shell)
  preflight/
    PublisherCheck.ts                   — confirm qdb_ publisher exists (mirror)
    ServicePrincipalRoleCheck.ts        — confirm SP has System Administrator (mirror)
    ExistingSolutionCheck.ts            — snapshot QdbPortalShell + QdbDynamicFormEngine component counts
    PicklistConflictCheck.ts            — confirm qdb_component_category does not already exist
  solution/
    SolutionProvisioner.ts              — create QdbDxpPlatform (idempotent)
  optionsets/
    GlobalOptionSetProvisioner.ts       — provision qdb_component_category (idempotent)
  entities/
    EntityCreationOrchestrator.ts       — Batch A → B → C sequencing
    EntityProvisioner.ts                — single-entity create-or-skip (mirror)
    definitions/
      componentDefinitions.ts           — qdb_component_definitions metadata payload
      componentVersions.ts              — qdb_component_versions metadata payload
  relationships/
    RelationshipProvisioner.ts          — provision qdb_componentdefinition_versions (idempotent)
  alternatekeys/
    AlternateKeyProvisioner.ts          — provision qdb_name alternate key on definitions (idempotent)
  seed/
    SeedOrchestrator.ts                 — orchestrate 5 seed records
    ComponentDefinitionSeed.ts          — 5 default widget definitions
  validation/
    PostProvisioningValidator.ts        — verify all expected artefacts exist
  output/
    ProvisioningCompleteEmitter.ts      — emit PROVISIONING-COMPLETE.md (mirror)
  types/
    DataverseMetadata.ts                — type definitions (EntityMetadataPayload, etc.)
    ProvisioningResult.ts               — StepResult, ValidationCheckResult
```

### Environment Variables (config/schema.ts)

```typescript
const EnvSchema = z.object({
  DATAVERSE_ORG_URL:    z.string().url(),
  CLIENT_ID:            z.string().uuid(),
  CLIENT_SECRET:        z.string().min(1),
  TENANT_ID:            z.string().uuid(),
  LOG_LEVEL:            z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DRY_RUN:              z.coerce.boolean().default(false),
  DATAVERSE_CLIENT_ID:  z.string().uuid(),  // SP application ID for post-provision SP check
});
```

### Batch Structure

**Batch A — Entities with no lookups to provisioned entities**

- `qdb_component_definitions` (no FK lookups)

**Batch B — Entities with lookup to Batch A**

- `qdb_component_versions` (lookup: `qdb_definition_id` → `qdb_component_definitions`)

**Batch C — Post-entity artefacts**

- Relationship provisioning: `qdb_componentdefinition_versions` (N:1)
- Alternate key provisioning: `qdb_name` on `qdb_component_definitions`

The Batch C steps run sequentially. Alternate key creation via `EntityDefinitions(LogicalName='qdb_component_definitions')/Keys` requires the entity to exist (created in Batch A) and emits an async Dataverse job. The script waits the same `ENTITY_CUSTOMIZATION_SETTLE_MS` (20s) after each entity creation per the established portal-shell pattern.

### AlternateKeyProvisioner — Provisioning Contract

```
POST /EntityDefinitions(LogicalName='qdb_component_definitions')/Keys
Headers:
  MSCRM.SolutionUniqueName: QdbDxpPlatform
  OData-MaxVersion: 4.0
  OData-Version: 4.0
  Content-Type: application/json

Body:
{
  "SchemaName": "qdb_ComponentDefinitionNameKey",
  "DisplayName": { "LocalizedLabels": [{ "Label": "Component Name Key", "LanguageCode": 1033 }] },
  "KeyAttributes": ["qdb_name"]
}
```

Idempotency: GET `EntityDefinitions(LogicalName='qdb_component_definitions')/Keys` and filter by `SchemaName eq 'qdb_ComponentDefinitionNameKey'` before POSTing.

### Idempotency Strategy

| Step | Check Before Acting | Idempotent on Conflict |
|---|---|---|
| Solution | GET solutions?$filter=uniquename eq 'QdbDxpPlatform' | Skip if exists |
| Option Set | GET GlobalOptionSetDefinitions(Name='qdb_component_category') | Skip if exists |
| Entity (Batch A/B) | GET EntityDefinitions(LogicalName='...') | Skip if exists; treat 400 "not unique" as skip |
| Relationship (Batch C) | GET RelationshipDefinitions?$filter=SchemaName eq '...' | Skip if exists; treat 400 "not unique" as skip |
| Alternate Key (Batch C) | GET EntityDefinitions(...)/Keys, filter by SchemaName | Skip if exists |
| Seed records | GET by qdb_name alternate key | Skip if exists |

### Seed Data (5 Records)

The 5 seed records mirror the 5 widgets in `packages/widget-registry/src/`:

| qdb_name slug | Display Name EN | Category |
|---|---|---|
| `my-requests-summary` | My Requests Summary | Dashboard Widget (860004001) |
| `recent-activity` | Recent Activity | Dashboard Widget (860004001) |
| `announcements` | Announcements | Data Display (860004004) |
| `quick-actions` | Quick Actions | Action Button (860004005) |
| `statistics` | Statistics | Data Display (860004004) |

Seed records are upserted via OData alternate-key PATCH:
```
PATCH /qdb_component_definitionses(qdb_name='my-requests-summary')
```

This is idempotent by nature of the alternate-key PATCH: if the record exists it is updated; if not, Dataverse creates it (upsert semantics when `If-Match: *` is omitted and `If-None-Match: *` is supplied to force insert, or using the Dataverse `$upsert` prefer header).

### Post-Provisioning Validation Queries

The PostProvisioningValidator checks:

1. Entity `qdb_component_definitions` exists
2. Entity `qdb_component_versions` exists
3. GlobalOptionSet `qdb_component_category` exists
4. Solution `QdbDxpPlatform` exists
5. Relationship `qdb_componentdefinition_versions` exists
6. Alternate key `qdb_ComponentDefinitionNameKey` exists on `qdb_component_definitions`
7. All 5 seed definition records exist (queried by `qdb_name`)
8. QdbPortalShell component count unchanged (snapshot from ExistingSolutionCheck)
9. QdbDynamicFormEngine component count unchanged (snapshot from ExistingSolutionCheck)

---

## 7. Backend API Design

**File:** `projects/portal-shell/apps/api/src/routes/admin/components.ts`
**Route Prefix:** `/api/admin/components`
**Auth:** JWT `app.authenticate` + `app.requireRole('Admin')` on all routes (same preHandler pattern as existing admin routes)

### Zod Schemas

```typescript
// Component Definition schemas
const ComponentDefinitionCreateSchema = z.object({
  qdb_name:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  qdb_display_name: z.string().min(1).max(255),
  qdb_display_name_ar: z.string().max(255).optional(),
  qdb_description:    z.string().max(2000).optional(),
  qdb_description_ar: z.string().max(2000).optional(),
  qdb_category:       z.number().int(),
  qdb_render_targets: z.array(z.string().min(1)).min(1),
});

const ComponentDefinitionPatchSchema = z.object({
  // qdb_name intentionally absent — immutable per C-005
  qdb_display_name:    z.string().min(1).max(255).optional(),
  qdb_display_name_ar: z.string().max(255).optional(),
  qdb_description:     z.string().max(2000).optional(),
  qdb_description_ar:  z.string().max(2000).optional(),
  qdb_category:        z.number().int().optional(),
  qdb_render_targets:  z.array(z.string().min(1)).min(1).optional(),
});

// Component Version schemas
const ComponentVersionCreateSchema = z.object({
  qdb_version_number: z.string().min(1).max(50),
  qdb_props_schema:   z.string().optional(),  // validated by ajv if present
  qdb_change_log:     z.string().max(4000).optional(),
});

const ComponentVersionPatchSchema = z.object({
  // qdb_version_number intentionally absent — immutable per C-005
  // qdb_props_schema intentionally absent — immutable per C-005
  qdb_change_log: z.string().max(4000).optional(),
});

// Query schemas
const ComponentListQuerySchema = z.object({
  category: z.coerce.number().int().optional(),
  top:      z.coerce.number().int().min(1).max(200).default(50),
  skip:     z.coerce.number().int().min(0).default(0),
});

const VersionListQuerySchema = z.object({
  top:  z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

const IdParamSchema          = z.object({ id: z.string().uuid() });
const DefinitionIdParamSchema = z.object({ definitionId: z.string().uuid() });
const VersionIdParamSchema    = z.object({
  definitionId: z.string().uuid(),
  versionId:    z.string().uuid(),
});
```

### Route Group 1: Component Definitions

#### GET /api/admin/components

List all active component definitions with optional category filter.

**OData Query:**
```
GET /qdb_component_definitionses
  ?$select=qdb_component_definitionsid,qdb_name,qdb_display_name,qdb_display_name_ar,
           qdb_category,qdb_render_targets,statecode,createdon,modifiedon
  &$filter=statecode eq 0 [and qdb_category eq <N> if provided]
  &$orderby=qdb_name asc
  &$top=<top>
  &$skip=<skip>
```

**Response:**
```typescript
interface ComponentDefinitionListResponse {
  data: ComponentDefinitionSummary[];
  meta: { total: number; top: number; skip: number };
}
interface ComponentDefinitionSummary {
  id: string;              // qdb_component_definitionsid
  name: string;            // qdb_name
  displayName: string;     // qdb_display_name
  displayNameAr: string | null;
  category: number;        // qdb_category integer
  renderTargets: string[]; // parsed from qdb_render_targets JSON
  createdOn: string;       // ISO 8601
  modifiedOn: string;
}
```

**Note on total count:** Dataverse's `$count=true` returns the count inline. Use `$count=true` and read `@odata.count` from the response. This is one OData request.

#### POST /api/admin/components

Create a new component definition. Validates that `qdb_name` is unique (GET with alternate-key first; 409 if exists).

**OData Create:**
```
POST /qdb_component_definitionses
Headers: MSCRM.SolutionUniqueName: QdbDxpPlatform
Body: {
  "qdb_name":          "<slug>",
  "qdb_display_name":  "<name>",
  "qdb_category":      <integer>,
  "qdb_render_targets": "<JSON string>"
}
```

`qdb_render_targets` is stored as the JSON-serialised string of the validated `string[]` array.

**Response:** `201 { data: ComponentDefinitionDetail }`

**Error Cases:**
- 400 `validation_error` — Zod failure
- 409 `duplicate_component_name` — qdb_name already exists

#### GET /api/admin/components/:id

Retrieve single definition by GUID. OData: `GET /qdb_component_definitionses(<id>)?$select=...`

**Response:** `200 { data: ComponentDefinitionDetail }`

```typescript
interface ComponentDefinitionDetail extends ComponentDefinitionSummary {
  descriptionEn: string | null;
  descriptionAr: string | null;
  isActive: boolean;
}
```

**Error:** `404 component_definition_not_found`

#### PATCH /api/admin/components/:id

Update mutable fields. Schema is `ComponentDefinitionPatchSchema` (qdb_name absent).

**OData:** `PATCH /qdb_component_definitionses(<id>)` with only the supplied fields.

`qdb_render_targets` — if provided, serialised to JSON string before writing.

**Response:** `204`

**Error:** `404`, `400 validation_error`

#### DELETE /api/admin/components/:id

Soft-delete: deactivate via state transition.

**OData:**
```
PATCH /qdb_component_definitionses(<id>)
Body: {
  "statecode":  1,
  "statuscode": 2
}
```

Before deactivating, check for active version records. If any exist, return `409` with code `component_has_versions`. The BRD (FR-041, soft-delete = deactivate) does not require cascading deactivation of versions in this engagement; the route simply blocks deletion if versions exist (consistent with the Restrict cascade on the relationship).

**Response:** `204`

---

### Route Group 2: Component Versions

Base path: `/api/admin/components/:definitionId/versions`

#### GET /api/admin/components/:definitionId/versions

List versions for a definition, newest first.

**OData:**
```
GET /qdb_component_versionses
  ?$select=qdb_component_versionsid,qdb_version_number,qdb_is_latest,
           qdb_change_log,statecode,createdon
  &$filter=_qdb_definition_id_value eq <definitionId> and statecode eq 0
  &$orderby=createdon desc
  &$top=<top>
  &$skip=<skip>
  &$count=true
```

**Response:** `200 { data: ComponentVersionSummary[]; meta: { total: number; top: number; skip: number } }`

#### POST /api/admin/components/:definitionId/versions

Create a new version. Validates uniqueness (definition_id + version_number per Section 5). Validates `qdb_props_schema` with ajv if present.

**props_schema validation:**
```typescript
import Ajv from 'ajv';
const ajv = new Ajv({ strict: false });

function validatePropsSchema(schemaString: string): boolean {
  try {
    const parsed = JSON.parse(schemaString) as unknown;
    ajv.compile(parsed);  // throws if invalid JSON Schema
    return true;
  } catch {
    return false;
  }
}
```

**OData Create:**
```
POST /qdb_component_versionses
Headers: MSCRM.SolutionUniqueName: QdbDxpPlatform
Body: {
  "qdb_version_number":    "<semver>",
  "qdb_props_schema":      "<JSON Schema string>",
  "qdb_change_log":        "<text>",
  "qdb_is_latest":         false,
  "qdb_DefinitionId@odata.bind": "/qdb_component_definitionses(<definitionId>)"
}
```

`qdb_is_latest` is always `false` on creation. To make it latest, call set-latest separately.

**Response:** `201 { data: ComponentVersionDetail }`

**Error Cases:**
- 400 `validation_error`
- 400 `invalid_props_schema` — ajv rejects
- 404 `component_definition_not_found`
- 409 `duplicate_version_number`

#### GET /api/admin/components/:definitionId/versions/:versionId

**OData:** `GET /qdb_component_versionses(<versionId>)?$select=...`

Validates that the returned record's `_qdb_definition_id_value` matches `:definitionId`; returns 404 if mismatched.

**Response:** `200 { data: ComponentVersionDetail }`

```typescript
interface ComponentVersionDetail {
  id: string;
  versionNumber: string;
  propsSchema: string | null;   // raw JSON Schema string
  isLatest: boolean;
  changeLog: string | null;
  createdOn: string;
  definitionId: string;
}
```

#### PATCH /api/admin/components/:definitionId/versions/:versionId

Only `qdb_change_log` is patchable (schema = `ComponentVersionPatchSchema`). All other fields are either immutable or controlled by set-latest.

**Response:** `204`

#### DELETE /api/admin/components/:definitionId/versions/:versionId

Soft-delete version. Blocks if `qdb_is_latest = true` (a latest version cannot be deleted; caller must promote another version to latest first).

**Response:** `204`

**Error:** `409` with code `cannot_delete_latest_version` if `qdb_is_latest` is true.

#### POST /api/admin/components/:definitionId/versions/:versionId/set-latest

Atomically promotes a version to latest. Uses OData $batch with a change set.

**Pre-flight:** Verify the target version belongs to the specified definition (GET the version record, check `_qdb_definition_id_value`). Returns 422 `latest_version_not_found` if mismatched.

**Also GET:** Find the current latest version for this definition:
```
GET /qdb_component_versionses
  ?$filter=_qdb_definition_id_value eq <definitionId> and qdb_is_latest eq true and statecode eq 0
  &$select=qdb_component_versionsid
  &$top=1
```

**OData $batch Request Body:**

If a current latest version exists (the typical case):

```
POST https://org5869857f.crm4.dynamics.com/api/data/v9.2/$batch
Content-Type: multipart/mixed; boundary=batch_set-latest
Authorization: Bearer <token>
OData-MaxVersion: 4.0
OData-Version: 4.0
MSCRM.SolutionUniqueName: QdbDxpPlatform

--batch_set-latest
Content-Type: multipart/mixed; boundary=changeset_set-latest

--changeset_set-latest
Content-Type: application/http
Content-Transfer-Encoding: binary

PATCH /api/data/v9.2/qdb_component_versionses(<currentLatestVersionId>) HTTP/1.1
Content-Type: application/json

{"qdb_is_latest": false}

--changeset_set-latest
Content-Type: application/http
Content-Transfer-Encoding: binary

PATCH /api/data/v9.2/qdb_component_versionses(<targetVersionId>) HTTP/1.1
Content-Type: application/json

{"qdb_is_latest": true}

--changeset_set-latest--

--batch_set-latest--
```

If no current latest exists (first promotion):

```
--batch_set-latest
Content-Type: multipart/mixed; boundary=changeset_set-latest

--changeset_set-latest
Content-Type: application/http
Content-Transfer-Encoding: binary

PATCH /api/data/v9.2/qdb_component_versionses(<targetVersionId>) HTTP/1.1
Content-Type: application/json

{"qdb_is_latest": true}

--changeset_set-latest--

--batch_set-latest--
```

**Response:** `204`

**Error Cases:**
- 404 `component_definition_not_found`
- 422 `latest_version_not_found`
- 500 `dataverse_error` if $batch returns non-2xx

**Structured Logging on Every Route:**

All routes follow the existing pattern from `adminCmsRoutes`:
```typescript
app.log.info({
  operation: 'admin.components.<verb>',
  correlationId: request.correlationId,
  userId: request.userId,
  // context-specific fields
});
```

---

## 8. Frontend Architecture

**File:** `apps/web/src/app/[locale]/admin/components/page.tsx`

The existing admin pages use the `(admin)` route group (parenthesised segment) with a duplicate plain path for compatibility (both `[locale]/(admin)/cms` and `[locale]/admin/cms` exist). The component registry follows the same dual-path pattern:
- `apps/web/src/app/[locale]/(admin)/components/page.tsx` — primary with admin layout
- `apps/web/src/app/[locale]/admin/components/page.tsx` — compatibility alias

### Rendering Strategy

The existing CMS admin page (`[locale]/(admin)/cms/page.tsx`) is a full client component (`'use client'`). Data fetching is done via TanStack Query (`useQuery`, `useMutation`). This pattern is adopted wholesale for the component registry admin pages — no RSC pattern for admin data pages in this codebase.

**All admin component pages:** `'use client'` — TanStack Query for data fetching.

**Rationale:** Admin pages require interactive state (filter dropdowns, form panels, delete confirmations) that makes RSC awkward. The existing CMS admin is a proven client-component pattern. Staying consistent avoids the complexity of mixed RSC/client boundaries for a data-heavy admin grid.

### Page Structure: Single-Route with Panel

The component list and detail are within a single route (`/admin/components`) using a sliding panel (Fluent UI `DrawerBody` or `Dialog`) for create/edit actions, consistent with the existing CMS admin approach (navigate to a separate edit route). However, because a definition has a subordinate version list, a detail view with tabs (definition info + versions sublist) is needed. The structure is:

- `/admin/components` — list page with definition grid and right-panel for create/edit
- `/admin/components/[id]` — detail page: definition info + version list + version create form

This avoids forcing the version list and promotion flow into the main list page panel, which would create a nested-panel UX problem.

### Component Breakdown

```
apps/web/src/
  app/[locale]/(admin)/components/
    page.tsx                     — ComponentDefinitionListPage (client)
    [id]/
      page.tsx                   — ComponentDefinitionDetailPage (client)

  components/components/
    CategoryFilter.tsx            — Fluent UI Select for qdb_component_category values
    ComponentDefinitionGrid.tsx   — DataGrid of definitions (mirrors CmsDataGrid pattern)
    ComponentDefinitionForm.tsx   — Create/edit form (Dialog or Panel)
    ComponentDefinitionDetail.tsx — Header section of detail page
    ComponentVersionGrid.tsx      — DataGrid of versions for a definition
    ComponentVersionForm.tsx      — Create version form
    PromoteLatestButton.tsx       — Calls set-latest mutation, shows confirmation dialog

  hooks/
    useComponentRegistry.ts      — all TanStack Query hooks for definitions + versions
```

### TanStack Query Hooks (useComponentRegistry.ts)

```typescript
const componentKeys = {
  all: ['components'] as const,
  list: (params: { category?: number; top: number; skip: number }) =>
    ['components', 'list', params] as const,
  detail: (id: string) => ['components', 'detail', id] as const,
  versions: (definitionId: string, params: { top: number; skip: number }) =>
    ['components', 'versions', definitionId, params] as const,
  version: (definitionId: string, versionId: string) =>
    ['components', 'versions', definitionId, versionId] as const,
};

// Queries: useComponentDefinitions, useComponentDefinition, useComponentVersions, useComponentVersion
// Mutations: useCreateDefinition, usePatchDefinition, useDeactivateDefinition,
//            useCreateVersion, usePatchVersion, useDeactivateVersion, useSetLatestVersion
```

### RTL Support (C-002, CEO Condition 2)

The Next.js app uses `[locale]` dynamic segments with `en` and `ar`. Fluent UI v9 components support RTL natively via the `FluentProvider dir="rtl"` wrapper — this is already wired in the existing admin layout.

For the component registry pages:
- Display Name columns show `qdb_display_name_ar` when locale is `ar`
- Form labels are translated via the existing `next-intl` messages files (new `components` namespace to be added)
- The CategoryFilter dropdown labels are translated (5 category values mapped to translation keys)
- DataGrid column headers are bilingual

No additional RTL infrastructure is required beyond what the existing CMS admin pages already use.

---

## 9. Widget-Registry Adapter Design

**File:** `packages/widget-registry/src/adapter.ts`

### Design Contract

The adapter is a side-effect module. When imported, it patches itself into the `registerWidget` call chain. To preserve the existing `registerWidget` signature (no breaking change per FR-068), the adapter is initialised via a separate `configureRegistryAdapter()` call made once at app startup. This avoids modifying `registerWidget`'s signature.

```typescript
// packages/widget-registry/src/adapter.ts

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { WidgetDefinition, WidgetConfig } from './types';

/** Configuration for the registry adapter. Call once at app startup. */
export interface RegistryAdapterConfig {
  /** Base URL of the Fastify API, e.g. http://localhost:3001 */
  readonly apiBaseUrl: string;
  /** Bearer token factory — called before each upsert. */
  readonly getAccessToken: () => Promise<string>;
}

let adapterConfig: RegistryAdapterConfig | null = null;

/** Call once at app startup before any registerWidget() calls. */
export function configureRegistryAdapter(config: RegistryAdapterConfig): void {
  adapterConfig = config;
}

/**
 * Fires an async upsert for the given widget definition to the Component Registry API.
 * Uses the OData alternate-key PATCH: PATCH /qdb_component_definitionses(qdb_name='<slug>').
 * Fire-and-forget: errors are caught and logged; the caller is never blocked.
 */
export function syncWidgetToRegistry<TConfig extends WidgetConfig>(
  definition: WidgetDefinition<TConfig>,
): void {
  if (adapterConfig === null) {
    // Adapter not configured — silent no-op in test environments.
    return;
  }

  const config = adapterConfig;

  void (async () => {
    try {
      const token = await config.getAccessToken();
      const propsSchema = JSON.stringify(
        zodToJsonSchema(definition.configSchema, { target: 'jsonSchema7' }),
      );
      await upsertComponentDefinition(config.apiBaseUrl, token, definition, propsSchema);
    } catch (error: unknown) {
      // Fire-and-forget: log but do not rethrow.
      // registerWidget() must not fail due to registry sync failure.
      console.error('[widget-registry:adapter] Registry sync failed:', {
        widgetName: definition.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

async function upsertComponentDefinition<TConfig extends WidgetConfig>(
  apiBaseUrl: string,
  token: string,
  definition: WidgetDefinition<TConfig>,
  propsSchema: string,
): Promise<void> {
  // Calls the Fastify API which owns the OData upsert logic and Zod validation.
  // The API route handles idempotency via the qdb_name alternate key.
  const response = await fetch(`${apiBaseUrl}/api/admin/components/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      qdb_name:          definition.name,
      qdb_display_name:  definition.title.en,
      qdb_display_name_ar: definition.title.ar,
      qdb_description:   definition.description.en,
      qdb_description_ar: definition.description.ar,
      qdb_render_targets: ['portal'],
      qdb_category:      860004001,  // Default: Dashboard Widget; overridable via extended metadata
      propsSchema,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Registry upsert failed: ${response.status} ${body}`);
  }
}
```

**Note on upsert route:** The adapter calls `POST /api/admin/components/upsert` — a dedicated upsert endpoint on the Fastify plugin (separate from the standard POST /api/admin/components) that maps to an OData alternate-key PATCH on the definition. This endpoint is defined in the same `components.ts` plugin file. The route issues:

```
PATCH /qdb_component_definitionses(qdb_name='<slug>')
Headers:
  MSCRM.SolutionUniqueName: QdbDxpPlatform
  If-None-Match: *   (omit to allow upsert; Dataverse upserts when record not found)
Body: { mutable fields only — qdb_display_name, qdb_display_name_ar, qdb_description, qdb_description_ar, qdb_render_targets, qdb_category }
```

`qdb_name` is NOT in the PATCH body — it is in the URL as the alternate key. `qdb_props_schema` is NOT upserted on the definition (it lives on versions, not definitions). A future version of the adapter can POST a version record after the definition upsert; this is deferred to DXP-P1-002 scope.

### Wiring into registerWidget()

In `packages/widget-registry/src/registry.ts`, after the existing `registry.set(...)` call:

```typescript
import { syncWidgetToRegistry } from './adapter.js';

export function registerWidget<TConfig extends WidgetConfig>(
  definition: WidgetDefinition<TConfig>
): void {
  // ... existing duplicate-guard logic ...
  registry.set(definition.name, definition as unknown as WidgetDefinition);
  syncWidgetToRegistry(definition);  // fire-and-forget; never throws
}
```

This is the only change to `registry.ts`. The function signature is unchanged (FR-068 satisfied).

---

## 10. Integration Points

### QdbDxpPlatform and the existing solutions

QdbDxpPlatform and QdbPortalShell share the same publisher (`qdb_`) and the same Dataverse org but have no cross-solution entity foreign keys in this engagement. The `MSCRM.SolutionUniqueName: QdbDxpPlatform` header on all DXP entity creates ensures all new schema artefacts are owned by QdbDxpPlatform, not the Active (Default) solution — per constitution Article XI.

The post-provisioning validator verifies that QdbPortalShell and QdbDynamicFormEngine component counts are unchanged after DXP provisioning completes (ExistingSolutionCheck snapshot compared at the end).

### DXP-P1-002/003/004 downstream consumption

Future engagements will read from the Component Registry API. The integration contract is:

- Consumers resolve components by `qdb_name` slug, never by GUID (C-010).
- The read endpoint `GET /api/admin/components` with `?category=<N>` supports category-scoped enumeration.
- A public (non-admin) read endpoint for portal consumers will be added in a future engagement; in P1-001 all routes are admin-scoped.

### Cross-environment GUID stability (C-010)

Dataverse GUIDs for qdb_component_definitions records differ between dev, staging, and prod environments because they are auto-generated on creation. All consumer code resolves components by `qdb_name` (the alternate key slug). The provisioning script seeds the same 5 records by `qdb_name` in every environment. The GUID is an internal identifier that must never appear in consumer integrations, portal config, or widget-registry resolution.

---

## 11. Non-Functional Architecture

### Pagination

All list endpoints default to `$top=50&$skip=0`. The API accepts caller-provided `top` (max 200) and `skip` via query parameters. The `meta` envelope returns `{ total, top, skip }` using Dataverse `$count=true`. Callers implement cursor-style pagination by incrementing `skip` by `top`.

### Performance (800ms p95 list target)

Achievability analysis:
- `$select` limits payload to required fields only — no `SELECT *`.
- `qdb_name` is an alternate key: Dataverse indexes all alternate key fields. Category filter on a picklist field benefits from Dataverse's native column indexing.
- The typical component registry will have tens to low hundreds of records (not millions). At this scale, OData list queries to Dataverse should complete in well under 800ms on the org4/crm4 tier from an EU-hosted API server.
- The Fastify API adds minimal overhead: Zod parse of query params + OData request construction is sub-millisecond.
- Risk: Dataverse cold-start on the first request after idle can add 200-500ms. This is an accepted p99 outlier, not a p95 concern at typical admin usage patterns.

### Concurrency: set-latest Race Condition

Two admin users simultaneously calling `POST /api/admin/components/:defId/versions/:vidA/set-latest` and `POST /api/admin/components/:defId/versions/:vidB/set-latest` can result in both reading the same "current latest" version GUID and both issuing a $batch that clears it and sets their respective target to true. Under Dataverse's last-write-wins model, the final state will have exactly one `qdb_is_latest = true` record, but it may not be predictably A or B.

**Accepted risk level:** Low. Admin-to-admin concurrent promotion of the same definition at the exact same millisecond is a theoretical scenario. The invariant (at most one latest) is maintained by the $batch's atomic change set. The outcome is deterministic (last writer wins); the data is not corrupted. An audit log query on `modifiedon` + `modifiedby` provides traceability.

**Mitigation if the risk materialises at higher load:** Add OData `If-Match: "<etag>"` to the PATCH of the old latest record in the change set. If the record has been modified by another request between our GET and our $batch, Dataverse will return 412 Precondition Failed, the whole change set rolls back, and the caller retries. This is an enhancement deferred to when concurrent admin access is a demonstrated reality.

---

## 12. Security Architecture

### Authentication / Authorisation

- All `/api/admin/components/**` routes require `app.authenticate` (JWT validation) + `app.requireRole('Admin')`.
- The service principal used by the Fastify API to call Dataverse holds the minimum necessary Dataverse role (same service principal as QdbPortalShell — the existing `Portal Shell API Role` or a new `DXP Platform API Role` to be determined during provisioning). The SP role must include Read/Write/Delete on `qdb_component_definitions` and `qdb_component_versions`.

### Secret Management

- Dataverse SP credentials (CLIENT_ID, CLIENT_SECRET, TENANT_ID) remain in environment variables only — never in source code.
- The provisioning script reads credentials from `.env` via Zod validation at startup.
- The Fastify API reads Dataverse credentials from environment variables via the existing `TokenProvider` pattern.

### Network Boundaries

- The provisioning script runs as a one-time CLI tool, not a long-lived service.
- The Fastify API is the only component that holds Dataverse write credentials at runtime.
- The widget-registry adapter calls the Fastify API, not Dataverse directly — preserving the single credential boundary.

### Input Validation

- All API boundaries validate with Zod before any Dataverse interaction.
- `qdb_props_schema` is validated with ajv before persistence to prevent malformed JSON Schema strings entering the registry.
- `qdb_render_targets` is a string[] — each element is constrained to non-empty strings; no arbitrary JSON is accepted.

---

## 13. Deployment Architecture

### Environments

| Environment | Purpose | Provisioning Script Run |
|---|---|---|
| dev | Active development | `DRY_RUN=false` on first run; idempotent re-runs safe |
| staging | Pre-production validation | Re-run provisioning script; GUIDs will differ |
| prod | Production | Re-run provisioning script; consumers use qdb_name slugs |

### Deployment Sequence (per environment)

Run the DXP provisioning script in this phase order:

1. PHASE 0: Validate environment variables (Zod, fail fast)
2. PHASE 1: Acquire Dataverse token (TokenProvider client-credentials)
3. PHASE 2: Pre-flight checks
   - 2a: Publisher check (qdb_ prefix exists)
   - 2b: Picklist conflict check (qdb_component_category does not exist in another solution)
   - 2c: Snapshot QdbPortalShell + QdbDynamicFormEngine component counts
4. PHASE 3: Provision QdbDxpPlatform solution (idempotent)
5. PHASE 4: Provision qdb_component_category global option set (idempotent)
6. PHASE 5: Entity creation Batch A → B (with 20s settle delay between each entity)
   - Batch A: qdb_component_definitions
   - Batch B: qdb_component_versions
7. PHASE 6: Relationship provisioning (qdb_componentdefinition_versions)
8. PHASE 7: Alternate key provisioning (qdb_name on qdb_component_definitions)
9. PHASE 8: Seed 5 default definition records (idempotent upsert)
10. PHASE 9: Post-provisioning validation (all 9 checks; exit code 1 on failure)
11. PHASE 10: Solution export instruction (PAC CLI command printed to console)

### Fastify Plugin Deployment

The `components.ts` plugin is added to `apps/api/src/routes/admin/components.ts` and registered in the main Fastify app plugin registration file alongside `adminCmsRoutes`, `adminWidgetRoutes`, and `adminNavRoutes`. No new Docker image or separate service — it is part of the existing API build.

### Next.js Page Deployment

New files under `apps/web/src/app/[locale]/(admin)/components/` are included in the standard Next.js build. No additional build configuration required.

### CI/CD

The provisioning script is not run as part of CI/CD. It is a one-time manual operation per environment, executed by an engineer with access to the Dataverse SP credentials. The CI/CD pipeline runs the TypeScript build check and test suite for the provisioning script (`vitest` unit tests covering idempotency logic and entity definition schema names).

---

## 14. ADR Index

| ADR | Title | Status | Date | Decided by |
|---|---|---|---|---|
| ADR-DXP-001 | Provisioning Script Location | Accepted | 2026-06-17 | Architect |
| ADR-DXP-002 | OData $batch for Atomic set-latest | Accepted | 2026-06-17 | Architect |
| ADR-DXP-003 | Widget-Registry Adapter Placement | Accepted | 2026-06-17 | Architect |
| ADR-DXP-004 | props_schema Immutability Enforcement | Accepted | 2026-06-17 | Architect |
| ADR-DXP-005 | API Error Response Schema | Accepted | 2026-06-17 | Architect |

---

## Skeptic Review

> CHALLENGE 1 — OData $batch atomicity (ADR-DXP-002): We assert Dataverse processes change sets in a single database transaction. But is that always true for standard Dataverse (not CE/on-premise) on org-tier environments? The Microsoft documentation describes change sets as atomic for Dataverse Web API v9.x, but behaviour under Dataverse's elastic pool throttling (429 from the platform mid-batch) is undocumented. If Dataverse applies the first PATCH in the change set and then throttles before the second, does the change set roll back? This assumption needs a targeted test in the dev environment before Phase 4 build begins.

> CHALLENGE 2 — Composite uniqueness TOCTOU (Section 5, POST /versions): The GET-then-POST pattern for enforcing definition_id + version_number uniqueness has a race window. We accepted this risk on the basis that simultaneous version creation is unlikely. However, if the adapter fires version creation for 5 widgets simultaneously at application startup, all 5 POST /versions requests arrive within milliseconds of each other. If a future caller re-registers widgets (HMR, process restart), they all arrive simultaneously. The adapter currently only syncs definitions, not versions — but when DXP-P1-002 extends this, the TOCTOU problem on version creation will need a Dataverse plugin or at minimum an application-layer mutex.

> CHALLENGE 3 — Adapter calling Fastify API from the Next.js web process (ADR-DXP-003): The adapter calls `${apiBaseUrl}/api/admin/components/upsert` using the admin user's access token retrieved from `getAccessToken()`. In a server-side Next.js context, this token comes from the session. In a browser context, this means the browser is calling the API with the user's JWT. If the user is not logged in as Admin at the time of widget self-registration (which happens at module import, i.e. during SSR), the request will fail with 401. The fire-and-forget suppresses this. But the implication is that widget-to-registry sync is unreliable unless the Next.js process has a service-account token, not a user token. This is a design gap that must be resolved before Phase 4: how does the adapter authenticate to the Fastify API in an SSR context where no user session exists?

> CHALLENGE 4 — qdb_is_latest not enforced by Dataverse: We rely on the API layer to prevent direct PATCH of `qdb_is_latest`. But any authenticated API client with the service principal credentials could call Dataverse OData directly and set `qdb_is_latest = true` on multiple records. The service principal used by the Fastify API cannot be scoped to deny direct-OData writes to `qdb_is_latest` specifically — Dataverse column-level security is binary (read/write or not) and cannot be scoped to a specific value. This is an accepted risk now, but DXP-P1-003/004 integrations that also call Dataverse directly would need to be aware of this invariant and respect it without enforcement.

> CHALLENGE 5 — Provisioning script 20s settle delay per entity: With 2 entities in Batch A and Batch B, the total entity settle wait is 40 seconds. This is known from portal-shell. However, the alternate key creation in Batch C also triggers an async Dataverse metadata job. If the alternate key provisioning does not wait an equivalent settle delay, the post-provisioning validator's alternate key check might run before the async job completes, producing a false-negative failure. The AlternateKeyProvisioner must include a settle delay after posting the alternate key, or the validator must retry with a backoff.

> CHALLENGE 6 — DELETE soft-delete blocking: The DELETE route blocks if any version records exist. But "active" is checked via `statecode eq 0`. If all versions for a definition are already deactivated (statecode=1), the definition can be deactivated too. This is the correct behaviour. However, the error message (`component_has_versions`) should clarify "active versions" — otherwise an admin who deactivated all versions will still see a confusing error if the query includes statecode=1 records by mistake. The OData filter in the version-existence check must explicitly include `and statecode eq 0`.

> CHALLENGE 7 — RTL and bilingual category labels: The `qdb_component_category` GlobalOptionSet is provisioned with English-only labels (LanguageCode: 1033). The Dataverse org may have Arabic (LanguageCode: 1025) installed. If Arabic language packs are active, the admin UI's CategoryFilter dropdown will show English labels in an Arabic locale because the option set has no Arabic translation. This is a known gap that should be documented as a manual post-provisioning step: add Arabic translations to the option set via Power Apps maker portal.

> CHALLENGE 8 — No versioning of props_schema: The BRD makes props_schema immutable per version. But there is no mechanism to alert downstream consumers when a new version with a different props_schema is promoted to latest. DXP-P1-002/003/004 consumers that cache the props_schema by version GUID will not know to re-fetch. The GET /versions/:id endpoint must always be the authoritative source; caching strategies for consumers must not cache by definition GUID, only by version GUID with an explicit TTL. This is not designed for in P1-001 and must be addressed when consumer integrations are built.

> CHALLENGE 9 — Simpler alternative: Is the full Dataverse entity model necessary at this scope? The 5 seed widgets from the widget-registry could be served from a static config JSON file with zero provisioning overhead. The Dataverse model becomes necessary when: (a) non-developer admins need to add/edit components through the admin UI, and (b) downstream consumers need a platform-wide catalogue. If the only current consumers are the 5 built-in widgets, a config-file approach is simpler. The complexity of Dataverse schema + provisioning script + API + admin UI is justified only if the admin-editable catalogue and the downstream DXP-P1-002/003/004 consumer integration are certain requirements. Confirm with CEO/BA that the dynamic registry is a Phase 1 requirement and not a Phase 2 requirement.

These challenges must be addressed before Phase 4 begins.
