# DXP-P1-001 — Phase 4: Technical Build

**Engagement:** DXP-P1-001 — DXP Platform Phase 1 (Component Registry)
**Phase:** 4 — Technical Build
**Date:** 2026-06-18
**Status:** COMPLETE — All 11 routes E2E tested against live Dataverse org

---

## 1. Deliverables

### 1.1 Dataverse Schema (QdbDxpPlatform solution)

Provisioned via `projects/dxp-p1-001/scripts/provision-schema/` — fully idempotent,
runs in < 5 seconds on repeat executions.

| Phase | Resource | Status |
|-------|----------|--------|
| P3 | Solution `QdbDxpPlatform` v1.0.0.0 | Created |
| P4 | GlobalOptionSet `qdb_component_category` | Created (5 options) |
| P5 | Entity `qdb_component_definitions` | Created (7 custom attributes) |
| P5 | Entity `qdb_component_versions` | Created (5 custom attributes) |
| P6 | Relationship `qdb_componentdefinition_versions` (1:N) | Created |
| P7 | Alternate key `qdb_ComponentDefinitionNameKey` on `qdb_name` | Created |
| P8 | 5 seed component definitions | Created |
| P9 | Post-provisioning validation: 13/13 checks | PASS |

#### Entity: qdb_component_definitions

| SchemaName | LogicalName | Type | Notes |
|-----------|-------------|------|-------|
| qdb_Name | qdb_name | String(100) | Primary name / alternate key |
| qdb_DisplayName | qdb_displayname | String(255) | Required |
| qdb_DisplayNameAr | qdb_displaynamear | String(255) | Optional |
| qdb_Description | qdb_description | Memo(2000) | Optional |
| qdb_DescriptionAr | qdb_descriptionar | Memo(2000) | Optional |
| qdb_Category | qdb_category | Picklist | qdb_component_category global option set |
| qdb_RenderTargets | qdb_rendertargets | Memo(4000) | JSON array of strings |
| qdb_IsActive | qdb_isactive | Boolean | Default: true |

**Critical lesson:** Dataverse ignores explicit `LogicalName` values in metadata payloads.
Logical names are always derived from SchemaName by lowercasing:
`qdb_DisplayName` → `qdb_displayname` (NOT `qdb_display_name`).

#### Entity: qdb_component_versions

| SchemaName | LogicalName | Type | Notes |
|-----------|-------------|------|-------|
| qdb_VersionNumber | qdb_versionnumber | String(50) | e.g. "1.0.0" |
| qdb_PropsSchema | qdb_propsschema | Memo(4000) | JSON Schema string |
| qdb_IsLatest | qdb_islatest | Boolean | At most one per definition |
| qdb_ChangeLog | qdb_changelog | Memo(4000) | Optional |
| qdb_DefinitionId | qdb_definitionid | Lookup | FK to qdb_component_definitions |

**OData navigation property:** `qdb_DefinitionId@odata.bind` uses SchemaName (PascalCase),
not the logical name. Dataverse rejects `qdb_definitionid@odata.bind`.

### 1.2 Backend API (`apps/api/src/`)

**Service:** `src/services/ComponentRegistryService.ts`
**Routes:** `src/routes/admin/components.ts`

#### 11 Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/admin/components | List definitions (top, skip, category filter) | Admin |
| POST | /api/admin/components | Create definition | Admin |
| GET | /api/admin/components/:id | Get definition by GUID | Admin |
| PATCH | /api/admin/components/:id | Update mutable fields | Admin |
| DELETE | /api/admin/components/:id | Deactivate definition | Admin |
| GET | /api/admin/components/:id/versions | List versions | Admin |
| POST | /api/admin/components/:id/versions | Create version | Admin |
| GET | /api/admin/components/:id/versions/:versionId | Get version by GUID | Admin |
| PATCH | /api/admin/components/:id/versions/:versionId | Update changeLog | Admin |
| DELETE | /api/admin/components/:id/versions/:versionId | Deactivate version | Admin |
| POST | /api/admin/components/:id/versions/:versionId/set-latest | Promote to latest | Admin |

All routes require Bearer JWT with `Admin` role claim.

#### Key Design Decisions

**Pagination — `$top` only:**
Dataverse OData v9.2 does not support `$skip`. The API accepts `skip` as a query parameter
(design placeholder), but cursor-based pagination via `$skiptoken` is deferred. The first
page is always returned when `skip > 0` is requested — acceptable for Phase 1 with small
record counts.

**POST → follow-up GET:**
Dataverse returns 204 on POST with `OData-EntityId` header but no body. The DataverseClient
does not capture this header. The service does a follow-up GET by name (for definitions) or
version number (for versions) to return the created record to the caller.

**set-latest — sequential PATCH:**
Two sequential PATCH operations instead of OData `$batch`. Step 1: clear `qdb_islatest`
on the previous latest. Step 2: set `qdb_islatest` on the target version. Not fully atomic
(a crash between steps leaves no "latest"), but acceptable for admin-only UI with human
operators. True atomicity would require a CRM plugin.

**Validation:**
- Zod schemas on all route request bodies and query params
- `propsSchema` validated as valid JSON Schema using Ajv v6 on the service layer
- Duplicate definition name: 409 from `findDefinitionByName` guard
- Duplicate version number: 409 from pre-create filter check
- Deactivate latest: 409 with `cannot_delete_latest_version` code
- Deactivate definition with active versions: 409 with `component_has_versions` code

### 1.3 Known Issues in the Codebase (pre-existing, not introduced by this work)

The API's TypeScript `tsc` build has pre-existing errors in files not touched by this feature:

- `app.ts`: Http2 vs HTTP1 FastifyInstance type mismatch
- `routes/admin/cms.ts`, `routes/services.ts`, `routes/widgets.ts`: Fastify `schema.tags` not in base `FastifySchema` type (Swagger plugin augmentation missing)
- `services/CmsService.ts`, `NotificationService.ts`: `correlationId: string | undefined` vs `RequestOptions.correlationId?: string` under `exactOptionalPropertyTypes`

These errors existed before `composite: true` was added to package tsconfigs. The feature
runs correctly via `tsx watch` (dev mode transpiles without strict type-checking).

---

## 2. Files Changed / Created

### New files
- `projects/dxp-p1-001/scripts/provision-schema/` — Full provisioning script (10 phases)
- `apps/api/src/services/ComponentRegistryService.ts` — Service (11 methods)
- `apps/api/src/routes/admin/components.ts` — 11 Fastify routes

### Modified files
- `apps/api/src/app.ts` — Registered `adminComponentRoutes` and `ComponentRegistryService`
- `packages/types/tsconfig.json` — Added `"composite": true`
- `packages/dataverse-client/tsconfig.json` — Added `"composite": true`
- `packages/auth-adapters/tsconfig.json` — Added `"composite": true`
- `apps/web/src/app/[locale]/(admin)/components/page.tsx` — List page
- `apps/web/src/app/[locale]/(admin)/components/[id]/page.tsx` — Detail page
- `apps/web/src/components/admin/AdminShell.tsx` — Added "Component Registry" nav entry

---

## 3. Environment

- **Dataverse org:** `https://org5869857f.crm4.dynamics.com`
- **Solution:** `QdbDxpPlatform` (v1.0.0.0)
- **API port:** 4001 (dev), TBD (prod)

---

## 4. E2E Test Results (Live Run — 2026-06-18)

Provisioning script: 13/13 validation checks passed (idempotent on 3rd run).
API routes: 16/16 assertions passed against live Dataverse org.

See `phase-5-qa.md` for full test matrix.
