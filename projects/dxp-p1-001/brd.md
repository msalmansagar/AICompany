# BUSINESS REQUIREMENTS DOCUMENT

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DXP-P1-001 — Component Registry
Prepared by:    Maqsad AI — Business Analyst
Date:           2026-06-17
Version:        1.1
Status:         APPROVED WITH CONDITIONS — CEO 2026-06-17
═══════════════════════════════════════════════════
```

---

## 1. EXECUTIVE SUMMARY

Qatar Development Bank (QDB) operates a citizen-facing Digital Experience Platform
built on two fully-deployed Dataverse solutions: QdbPortalShell (the portal shell with
15 entities covering navigation, CMS, widgets, requests, and notifications) and
QdbDynamicFormEngine (a dynamic form authoring and rendering system). As QDB plans to
extend this platform with new theme capabilities, role-based access control, and content
versioning (DXP Phase 1 engagements P1-002 through P1-004), it currently has no
unified, platform-level mechanism to register, version, and discover the components
that make up the DXP — forms, CMS blocks, page sections, widgets, and navigation
components each exist in isolation with no shared identity or version contract.

This engagement delivers the Component Registry: a new Dataverse solution
(QdbDxpPlatform) containing two entities — qdb_component_definitions and
qdb_component_versions — together with a TypeScript provisioning script, a Fastify
backend plugin with full CRUD API, and a Next.js admin UI at /en/admin/components.
The existing packages/widget-registry is evolved into an adapter that delegates to the
new platform registry, preserving all existing widget contracts and the five registered
widgets without disruption. The Component Registry becomes the identity and versioning
foundation on which all subsequent Phase 1 engagements depend.

---

## 2. BUSINESS CONTEXT

### 2.1 Existing Ecosystem

QDB's DXP rests on two deployed Dataverse solutions in org5869857f.crm4.dynamics.com:

- **QdbPortalShell** — manages portal configuration, CMS content, navigation, widgets
  (qdb_portal_widget_configs, qdb_portal_widget_instances), requests, and notifications.
  The portal shell's dashboard renders widget instances whose type is resolved via the
  in-process packages/widget-registry package.

- **QdbDynamicFormEngine** — manages form templates, tabs, sections, fields, access
  policies, and themes. Forms are authored in a designer and rendered in the portal.

Both solutions use the publisher prefix `qdb_` and share the same Dataverse org.

### 2.2 The Problem

Neither solution has a concept of a platform-wide component identity or version
contract. The existing widget-registry is a process-local in-memory Map that:

- Lives only in the Next.js server process (not in Dataverse)
- Has no versioned schema contract — a widget's config shape can change without
  a formal version increment
- Cannot be queried from the backend API or from other services
- Is limited to widget components — forms, CMS blocks, page sections, and navigation
  components have no equivalent registry

As the DXP grows across Phase 1 engagements, the following downstream capabilities
will require a stable component identity and version source of truth:

- **DXP-P1-002 (Theme Token Engine)** — must know which components exist to apply
  theme tokens per component type and per component identity
- **DXP-P1-003 (Portal RBAC)** — must reference component definitions to grant or
  deny render and configuration permissions per role
- **DXP-P1-004 (Versioning & Snapshots)** — must reference component versions when
  snapshotting portal configurations

### 2.3 Why a Registry is the Correct Solution

A centralised registry stored in Dataverse provides:

- **Durable identity** — a component definition record persists beyond process restarts
  and deployments; its GUID is stable and referenceable by downstream solutions
- **Versioned schema contracts** — each component version carries a JSON Schema that
  describes its props, enabling validation at authoring time and runtime
- **Platform discoverability** — any service can query the Dataverse API to list
  components by category, retrieve the latest version, or resolve a specific version
- **Solution boundary** — all registry records are owned by QdbDxpPlatform, making
  it possible to export, import, and version the platform layer independently of the
  portal shell and form engine

### 2.4 Relationship to Downstream Engagements

```
DXP-P1-001 Component Registry   <-- THIS ENGAGEMENT (foundation)
       |
       +---> DXP-P1-002 Theme Token Engine  (consumes component definitions)
       |
       +---> DXP-P1-003 Portal RBAC         (consumes component definitions)
       |
       +---> DXP-P1-004 Versioning & Snapshots (consumes component versions)
```

All three downstream engagements have an unblocked dependency on this engagement.
DXP-P1-001 must be delivered and approved before any of the three can begin
architecture or implementation.

---

## 3. STAKEHOLDERS

| Stakeholder             | Role                        | Interest in this project                                                                      |
|-------------------------|-----------------------------|-----------------------------------------------------------------------------------------------|
| QDB Digital Team        | Primary client / product owner | Needs a stable component identity layer to build Phase 1 features on                       |
| QDB Portal Administrators | End users of admin UI     | Will use /en/admin/components to view and manage component definitions and versions          |
| DXP-P1-002 Tech Lead    | Downstream consumer         | Will depend on qdb_component_definitions GUIDs and category data for theme token mappings   |
| DXP-P1-003 Tech Lead    | Downstream consumer         | Will depend on qdb_component_definitions GUIDs for RBAC permission grants                  |
| DXP-P1-004 Tech Lead    | Downstream consumer         | Will depend on qdb_component_versions records for snapshot references                       |
| Maqsad AI Backend       | Implementer                 | Builds provisioning script, Fastify plugin, and widget-registry adapter                     |
| Maqsad AI Frontend      | Implementer                 | Builds Next.js admin UI page at /en/admin/components                                        |
| Maqsad AI Architect     | Technical governance        | Ensures the solution boundary, naming conventions, and ADRs are correct                     |
| QDB IT / DevOps         | Infrastructure owner        | Manages Dataverse org, service principal credentials, and solution deployment               |

---

## 4. SCOPE

### 4.1 In Scope

- Creation of a new Dataverse unmanaged solution named **QdbDxpPlatform** with publisher
  prefix `qdb_` in org5869857f.crm4.dynamics.com
- Definition and provisioning of entity **qdb_component_definitions** with all specified
  fields, option sets, and constraints
- Definition and provisioning of entity **qdb_component_versions** with all specified
  fields, option set, and constraints
- Provisioning of a N:1 lookup relationship from qdb_component_versions to
  qdb_component_definitions
- A TypeScript provisioning script following the pattern of
  `projects/portal-shell/scripts/provision-schema/` that provisions the solution,
  entities, relationship, and option sets idempotently
- A Fastify backend plugin in `projects/portal-shell/apps/api/` exposing:
  - CRUD routes for component definitions
  - CRUD routes for component versions
  - A dedicated set-latest endpoint for atomically promoting a version to is_latest
  - A list-by-category query endpoint
- A Next.js admin UI page at `/en/admin/components` (within the existing
  `projects/portal-shell/apps/web/` application) supporting list, create, and
  version-view operations
- A **widget-registry adapter** that bridges the existing
  `packages/widget-registry` to the new platform registry, so that registering
  a widget definition also registers the corresponding component definition and version
  records via the API
- All five existing widgets (MyRequestsSummary, RecentActivity, Announcements,
  QuickActions, Statistics) remain fully functional without modification to their
  definition files
- Atomic is_latest flag management: promoting a version to latest must atomically
  unset the previous latest version in the same operation
- Standard audit fields on both entities: created_by, created_on, modified_by,
  modified_on (provided natively by Dataverse; must be confirmed present in all
  API responses)
- Seed data: the five existing widget definitions registered as component_definition
  records with category = widget, each with one component_version record representing
  the current in-process schema

### 4.2 Out of Scope

- Replacement of the existing `packages/widget-registry` in-memory registry. The
  in-memory registry continues to function for runtime widget resolution in Next.js.
  The adapter adds Dataverse persistence on top; it does not remove the in-memory layer.
- Bundle hosting, CDN, or any mechanism for serving JavaScript bundles referenced by
  bundle_url. The bundle_url field stores a URL string only; this engagement does not
  provision or manage the storage infrastructure behind it.
- Runtime component rendering engine. The registry stores metadata and schema; it does
  not execute, render, or server-side render any component.
- A/B testing or feature flag gating of component versions at runtime.
- Multi-org or multi-tenant deployment. This engagement targets a single Dataverse org.
- Automated migration of existing qdb_portal_widget_configs or qdb_portal_widget_instances
  records to reference component_definition GUIDs. That migration, if required, is a
  separate engagement.
- Role permission model for the component registry API (beyond authenticating as Admin
  role, which is already enforced by the portal shell API). Fine-grained RBAC on registry
  records is delivered in DXP-P1-003.
- Schema validation of props_schema against live component renders. The JSON Schema is
  stored and returned; validation tooling is outside this engagement.
- The QdbDxpPlatform solution export as a managed solution ZIP. That is a post-provisioning
  manual step, identical in process to the QdbPortalShell export instruction.

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Dataverse Solution

**FR-001:** The provisioning script shall create a new Dataverse unmanaged solution with
unique name `QdbDxpPlatform`, display name "QDB DXP Platform", and publisher prefix `qdb_`
in org5869857f.crm4.dynamics.com when the solution does not already exist.

**FR-002:** The provisioning script shall detect an existing solution named `QdbDxpPlatform`
and skip creation without error when the solution already exists (idempotent run support).

**FR-003:** The provisioning script shall add both new entities
(qdb_component_definitions and qdb_component_versions) to the QdbDxpPlatform solution
as root components when those entities are created.

**FR-004:** The provisioning script shall complete all phases and emit a
PROVISIONING-COMPLETE.md file summarising pass/fail results, following the same output
pattern as the existing QdbPortalShell provisioning script.

**FR-005:** The provisioning script shall support a DRY_RUN environment variable that,
when set to true, logs all intended POST/PATCH operations without executing them.

### 5.2 Entity: qdb_component_definitions

**FR-006:** The system shall provision an entity named `qdb_component_definitions` with
display name "Component Definition" (singular) and "Component Definitions" (plural) in
the QdbDxpPlatform solution.

**FR-007:** The entity shall have a primary name attribute `qdb_name` (string, max 200
characters) that stores the unique machine-readable slug for the component (e.g.
`my-requests-summary`, `hero-banner`, `contact-form`).

**FR-008:** The system shall enforce a uniqueness constraint on `qdb_name` within the
qdb_component_definitions entity such that no two component definition records may share
the same slug value.

**FR-009:** The entity shall have a string attribute `qdb_display_name_en` (max 400
characters, required) that stores the English display name of the component.

**FR-010:** The entity shall have a string attribute `qdb_display_name_ar` (max 400
characters, required) that stores the Arabic display name of the component.

**FR-011:** The entity shall have a global option set attribute `qdb_category` that
classifies the component into one of the following categories: form, cms-block,
page-section, widget, nav-component. This option set shall be named
`qdb_component_category` and provisioned as a global option set in QdbDxpPlatform.

**FR-012:** The entity shall have a string attribute `qdb_icon` (max 200 characters,
optional) that stores a Fluent UI icon name for use in admin UI and component pickers.

**FR-013:** The entity shall have a text attribute `qdb_render_targets` (max 4000
characters) that stores a JSON array of strings indicating the render surfaces the
component supports. Valid surface values are: `portal`, `admin`, `mobile`. Example
stored value: `["portal","admin"]`.

**FR-014:** The entity shall have a boolean attribute `qdb_is_active` (default true)
that controls whether the component definition appears in registry queries and component
pickers. A value of false logically deactivates the component without deleting its
record or version history.

**FR-015:** Dataverse standard audit fields (createdon, createdby, modifiedon,
modifiedby) shall be present on qdb_component_definitions and enabled for auditing in
the QdbDxpPlatform solution.

### 5.3 Entity: qdb_component_versions

**FR-016:** The system shall provision an entity named `qdb_component_versions` with
display name "Component Version" (singular) and "Component Versions" (plural) in the
QdbDxpPlatform solution.

**FR-017:** The entity shall have a primary name attribute `qdb_version_label` (string,
max 100 characters) that stores a human-readable label for the version record (e.g.
"my-requests-summary v1.0.0"). This field is generated by the API on create and is not
required from the caller.

**FR-018:** The entity shall have a lookup attribute `qdb_component_definition_id` that
references the qdb_component_definitions entity with relationship name
`qdb_componentdefinition_versions`. This lookup is required (not nullable) on every
version record.

**FR-019:** The entity shall have a string attribute `qdb_version_number` (max 20
characters, required) that stores the semantic version string (e.g. `1.0.0`, `2.1.3`)
of this version record.

**FR-020:** The system shall enforce that the combination of
`qdb_component_definition_id` and `qdb_version_number` is unique within
qdb_component_versions — no component may have two version records with the same
semver string.

**FR-021:** The entity shall have a memo attribute `qdb_props_schema` (max 1,048,576
characters) that stores the JSON Schema text describing the component's props contract
for this version.

**FR-022:** The entity shall have a memo attribute `qdb_default_props` (max 1,048,576
characters, optional) that stores a JSON object representing the default props for
this version. The stored value must be valid JSON at the API boundary.

**FR-023:** The entity shall have a string attribute `qdb_bundle_url` (max 2048
characters, optional) that stores the URL at which the component bundle for this
version may be fetched. The system stores the URL as-is; it does not validate
reachability or serve the bundle.

**FR-024:** The entity shall have a memo attribute `qdb_changelog` (max 4000 characters,
optional) that stores a human-readable description of what changed in this version.

**FR-025:** The entity shall have a boolean attribute `qdb_is_latest` (default false)
that designates whether this version is the current promoted version for its parent
component definition.

**FR-026:** At most one qdb_component_versions record per qdb_component_definition_id
may have `qdb_is_latest = true` at any point in time. This constraint is enforced by
the backend API set-latest endpoint and must be documented as a platform invariant.

**FR-027:** The entity shall have a datetime attribute `qdb_deprecated_on` (optional,
nullable) that records when this version was marked as deprecated. A non-null value
indicates the version is deprecated but its record is retained for audit purposes.

**FR-028:** Dataverse standard audit fields (createdon, createdby, modifiedon,
modifiedby) shall be present on qdb_component_versions and enabled for auditing in
the QdbDxpPlatform solution.

### 5.4 Provisioning Script

**FR-029:** The provisioning script shall authenticate to the Dataverse Web API using
a service principal (client credentials flow) with credentials supplied via environment
variables, following the same TokenProvider pattern as the existing
`projects/portal-shell/scripts/provision-schema/src/auth/TokenProvider.ts`.

**FR-030:** The provisioning script shall run a pre-flight check that confirms the
`qdb_` publisher exists in the target org before any entity creation is attempted.

**FR-031:** The provisioning script shall provision the global option set
`qdb_component_category` before provisioning the qdb_component_definitions entity,
since the entity depends on it.

**FR-032:** The provisioning script shall provision entities in the following order:
(1) qdb_component_definitions, (2) qdb_component_versions, (3) the N:1 lookup
relationship from qdb_component_versions to qdb_component_definitions. This order
ensures the parent entity and its GUID exist before the FK reference is created.

**FR-033:** The provisioning script shall be safe to re-run: every creation step shall
first check whether the target artefact (option set, entity, field, relationship)
already exists and skip creation without error when it does.

**FR-034:** The provisioning script shall run a post-provisioning validation phase that
confirms both entities are queryable via OData and that the lookup relationship resolves
correctly, emitting a per-check pass/fail result.

**FR-035:** The provisioning script shall be located at
`projects/dxp-p1-001/scripts/provision-schema/` and follow the same TypeScript
module structure as the existing portal-shell provisioning script (phases, sub-modules
per concern, index.ts entrypoint).

### 5.5 Backend Fastify Plugin — Component Definitions Routes

All component registry routes require the caller to be authenticated and to hold the
Admin role. Authentication and role enforcement follow the same `app.authenticate` and
`app.requireRole` pre-handler pattern used throughout the existing
`projects/portal-shell/apps/api/` routes.

**FR-036:** The backend shall expose `GET /api/admin/components/definitions` that
returns all qdb_component_definitions records where statecode = 0, ordered by
qdb_name ascending.

**FR-037:** The `GET /api/admin/components/definitions` response shall include all
fields of each definition record: id, qdb_name, qdb_display_name_en,
qdb_display_name_ar, qdb_category, qdb_icon, qdb_render_targets, qdb_is_active,
createdon, modifiedon.

**FR-038:** The backend shall expose `GET /api/admin/components/definitions?category={value}`
that filters results to only those records whose qdb_category option set value matches
the supplied category name string.

**FR-039:** The backend shall expose `GET /api/admin/components/definitions/:id` that
returns a single qdb_component_definitions record by its Dataverse GUID. The endpoint
shall return HTTP 404 with a structured error body when no matching record exists.

**FR-040:** The backend shall expose `POST /api/admin/components/definitions` that
creates a new qdb_component_definitions record. The request body shall be validated
with a Zod schema at the API boundary before any Dataverse write is attempted.

**FR-041:** The `POST /api/admin/components/definitions` endpoint shall return HTTP 409
Conflict when a definition record with the supplied qdb_name value already exists.

**FR-042:** The backend shall expose `PATCH /api/admin/components/definitions/:id` that
updates permitted fields (qdb_display_name_en, qdb_display_name_ar, qdb_icon,
qdb_render_targets, qdb_is_active) on an existing definition record. The qdb_name
and qdb_category fields are immutable after creation and must be rejected with HTTP 400
if included in a PATCH body.

**FR-043:** The backend shall expose `DELETE /api/admin/components/definitions/:id`
that deactivates (sets statecode = 1) a component definition record. Hard deletion is
not permitted. The endpoint shall return HTTP 409 Conflict when the definition has one
or more associated component version records, preventing deactivation of a definition
that has version history.

### 5.6 Backend Fastify Plugin — Component Versions Routes

**FR-044:** The backend shall expose `GET /api/admin/components/definitions/:definitionId/versions`
that returns all qdb_component_versions records whose qdb_component_definition_id
matches the supplied definitionId, ordered by createdon descending.

**FR-045:** The `GET /api/admin/components/definitions/:definitionId/versions` response
shall include all fields: id, qdb_version_label, qdb_version_number, qdb_props_schema,
qdb_default_props, qdb_bundle_url, qdb_changelog, qdb_is_latest, qdb_deprecated_on,
createdon.

**FR-046:** The backend shall expose `GET /api/admin/components/definitions/:definitionId/versions/latest`
that returns the single qdb_component_versions record whose qdb_is_latest = true for
the given definitionId. The endpoint shall return HTTP 404 when no latest version has
been designated.

**FR-047:** The backend shall expose `GET /api/admin/components/definitions/:definitionId/versions/:versionId`
that returns a single version record by its GUID. The endpoint shall return HTTP 404
when the record does not exist or does not belong to the specified definitionId.

**FR-048:** The backend shall expose `POST /api/admin/components/definitions/:definitionId/versions`
that creates a new qdb_component_versions record for the specified definition. The
request body shall be validated with a Zod schema. The generated qdb_version_label
shall be set by the API as `{qdb_name} v{qdb_version_number}`.

**FR-049:** The `POST /api/admin/components/definitions/:definitionId/versions` endpoint
shall return HTTP 409 Conflict when a version record with the same qdb_version_number
already exists for the specified definitionId.

**FR-050:** The `POST /api/admin/components/definitions/:definitionId/versions` endpoint
shall return HTTP 400 when the supplied qdb_props_schema value is not valid JSON.

**FR-051:** The `POST /api/admin/components/definitions/:definitionId/versions` endpoint
shall return HTTP 400 when the supplied qdb_default_props value is not valid JSON
(when provided).

**FR-052:** The backend shall expose
`POST /api/admin/components/definitions/:definitionId/versions/:versionId/set-latest`
that atomically promotes the specified version to is_latest = true while setting
is_latest = false on any previously-latest version for the same definitionId.

**FR-053:** The set-latest operation (FR-052) shall use a Dataverse batch request (OData
$batch) to perform both the unset of the previous latest and the set of the new latest
in a single atomic HTTP round-trip, preventing a partial-update state where two versions
are simultaneously marked as latest.

**FR-054:** The backend shall expose `PATCH /api/admin/components/definitions/:definitionId/versions/:versionId`
that updates permitted mutable fields (qdb_bundle_url, qdb_changelog, qdb_deprecated_on)
on an existing version record. The fields qdb_version_number and qdb_props_schema are
immutable after creation and must be rejected with HTTP 400 if included in the PATCH body.

**FR-055:** The backend plugin shall be implemented as a Fastify plugin registered under
the `/api/admin/components` prefix and located at
`projects/portal-shell/apps/api/src/routes/admin/components.ts`.

### 5.7 Frontend Admin UI — /en/admin/components

**FR-056:** The system shall provide a Next.js page at the route
`/[locale]/admin/components` (file path:
`projects/portal-shell/apps/web/src/app/[locale]/admin/components/page.tsx`) that
renders the Component Registry admin UI.

**FR-057:** The admin components page shall display a tabbed or filterable list of all
active component definitions, showing for each: name (slug), English display name,
Arabic display name, category badge, icon name, render targets, and active status.

**FR-058:** The admin components page shall provide a category filter control that
restricts the displayed list to a single selected category (form, cms-block, page-section,
widget, nav-component) or shows all categories when no filter is active.

**FR-059:** The admin components page shall provide a "New Component" action that opens
a create form collecting: qdb_name (slug), qdb_display_name_en, qdb_display_name_ar,
qdb_category, qdb_icon (optional), qdb_render_targets (multi-select of portal/admin/mobile).

**FR-060:** The create form shall validate that qdb_name conforms to the kebab-case
slug pattern (`^[a-z0-9]+(-[a-z0-9]+)*$`) client-side before submitting to the API.

**FR-061:** The admin components page shall display an inline error message when the
API returns HTTP 409 (duplicate name) on a create attempt, without closing the form.

**FR-062:** Clicking a component definition row in the list shall navigate to a detail
view that shows the component's fields and a sub-list of all version records for that
definition.

**FR-063:** The version sub-list shall display for each version: version_number,
is_latest badge, bundle_url (truncated), deprecated_on indicator, and created date.

**FR-064:** The detail view shall provide a "Promote to Latest" action on each version
row (except the currently-latest row) that calls the set-latest endpoint and refreshes
the version sub-list on success.

**FR-065:** The detail view shall provide an "Add Version" action that opens a form
collecting: qdb_version_number, qdb_props_schema (textarea), qdb_default_props
(textarea, optional), qdb_bundle_url (optional), qdb_changelog (optional).

**FR-066:** The admin UI shall be protected by the existing admin route guard and must
not be accessible to unauthenticated users or users without the Admin role, consistent
with all other pages under /[locale]/admin/.

**FR-067:** The admin UI shall render correctly in both English (LTR) and Arabic (RTL)
locales, using the existing localisation infrastructure of the portal shell web app.

### 5.8 Widget-Registry Adapter

**FR-068:** The system shall provide a widget-registry adapter module at
`projects/portal-shell/packages/widget-registry/src/adapter.ts` that, when
`registerWidget()` is called, additionally creates or updates a corresponding
qdb_component_definitions record (category = widget) via the Component Registry API.

**FR-069:** The adapter shall also create a corresponding qdb_component_versions record
for the widget's current configSchema and defaultConfig, serialising the Zod schema to
JSON Schema format before persisting to qdb_props_schema.

**FR-070:** The adapter shall be fire-and-forget with respect to the Dataverse API call:
a failure to persist to Dataverse must not throw or reject and must not prevent the
in-memory widget registration from completing. The adapter shall log the error using
the structured logger.

**FR-071:** The existing `registerWidget()`, `resolveWidget()`, `listRegisteredWidgets()`,
and `clearRegistry()` functions shall retain their existing signatures and behaviour
without modification to their source. The adapter is an additive layer; it does not
alter the registry contract.

**FR-072:** The five existing widget definitions (MyRequestsSummary, RecentActivity,
Announcements, QuickActions, Statistics) shall each have a corresponding
qdb_component_definitions record seeded in Dataverse as part of the provisioning script
seed phase, so that the adapter's first-run calls find an existing record and update
rather than always create.

**FR-073:** The adapter's Dataverse write operation (FR-068) shall use the `qdb_name`
alternate key as the upsert key. If a definition record already exists with the supplied
slug, the adapter must update that record rather than attempt to create a duplicate.
The upsert must be implemented as an OData alternate-key PATCH (`PATCH
EntitySet(qdb_name='slug')`) rather than a conditional create. This is a correctness
requirement — not optional.

---

## 6. NON-FUNCTIONAL REQUIREMENTS

**NFR-001 Performance — List endpoint response time**
The `GET /api/admin/components/definitions` endpoint shall return a response within
800 ms at the 95th percentile when the qdb_component_definitions entity contains up to
500 active records, measured from the Fastify server receiving the request to sending
the response, under normal Dataverse API latency conditions.

**NFR-002 Performance — Version list response time**
The `GET /api/admin/components/definitions/:definitionId/versions` endpoint shall return
a response within 600 ms at the 95th percentile when the component has up to 50 version
records.

**NFR-003 Availability**
The Component Registry API routes share the availability SLA of the existing portal
shell API (99.5% monthly uptime). No additional infrastructure is introduced; the API
runs within the existing Fastify process.

**NFR-004 Data Integrity — Unique constraint on definition name**
The Dataverse entity and the backend API shall jointly enforce that qdb_name is unique
across all qdb_component_definitions records. The API layer enforces this via a
pre-create existence check; the Dataverse layer enforces it via an alternate key
defined on qdb_name during provisioning.

**NFR-005 Data Integrity — Single latest version invariant**
At no point in time may two qdb_component_versions records for the same
qdb_component_definition_id have qdb_is_latest = true. The set-latest API endpoint
enforces this via an OData $batch operation. This invariant shall be verified in the
post-provisioning validation phase and in the QA test suite.

**NFR-006 Data Integrity — FK enforcement**
Every qdb_component_versions record must reference a valid qdb_component_definitions
record. The Dataverse lookup relationship enforces referential integrity at the platform
layer. The API shall validate that the supplied definitionId exists before creating
a version record.

**NFR-007 Security — API authentication**
All Component Registry API routes (`/api/admin/components/**`) shall require a valid
JWT issued by the portal shell authentication service. Unauthenticated requests shall
receive HTTP 401. Requests authenticated but lacking the Admin role shall receive
HTTP 403.

**NFR-008 Security — Dataverse solution boundary**
All new entities, option sets, and relationships shall be created within the
QdbDxpPlatform solution. No modifications shall be made to the QdbPortalShell or
QdbDynamicFormEngine solutions or their entities during this engagement.

**NFR-009 Security — No secrets in source**
The provisioning script shall read all Dataverse credentials (client ID, client secret,
tenant ID, org URL) from environment variables. No credential values shall appear in
source code or committed configuration files.

**NFR-010 Audit Trail**
Both entities shall have Dataverse auditing enabled in the solution configuration.
All create, update, and deactivation operations via the backend API shall be traceable
via Dataverse audit history. The API shall not bypass Dataverse audit by using service
principal impersonation unless explicitly required and documented.

**NFR-011 Idempotency — Provisioning script**
The provisioning script shall be safe to execute multiple times against the same
Dataverse org without duplicating records, failing, or producing a different final state
than a single run. Every provisioning step shall check for the existence of the target
artefact before attempting creation.

**NFR-012 Scalability**
The Dataverse entity design shall support up to 10,000 component definition records
and 100,000 component version records without schema changes. All list queries shall
use OData `$select` to fetch only required fields and `$top` pagination to avoid
unbounded result sets.

**NFR-013 Compliance — Bilingual support**
All display name fields shall have dedicated EN and AR columns. The admin UI shall
display the correct locale field based on the active Next.js locale. No single-language
field shall serve dual-language purposes.

---

## 7. DATA MODEL

### 7.1 Entity Relationship Overview

```
qdb_component_definitions (1)
         |
         | qdb_componentdefinition_versions (N:1 lookup on versions side)
         |
(N) qdb_component_versions
```

One component definition has zero or more version records. Each version record belongs
to exactly one component definition. The relationship is enforced at the Dataverse layer
as a standard N:1 lookup with referential integrity (restrict delete on parent while
child records exist).

### 7.2 qdb_component_definitions — Field Detail

| Logical Name                 | Display Name          | Type              | Required | Max Length | Notes                                              |
|------------------------------|-----------------------|-------------------|----------|------------|----------------------------------------------------|
| qdb_component_definitionid   | (Primary Key)         | Uniqueidentifier  | Yes      | —          | Auto-generated GUID; Dataverse primary key         |
| qdb_name                     | Name (Slug)           | String            | Yes      | 200        | kebab-case; alternate key; globally unique         |
| qdb_display_name_en          | Display Name (EN)     | String            | Yes      | 400        | English label for admin UI and pickers             |
| qdb_display_name_ar          | Display Name (AR)     | String            | Yes      | 400        | Arabic label for admin UI and pickers              |
| qdb_category                 | Category              | OptionSet         | Yes      | —          | Global option set: qdb_component_category          |
| qdb_icon                     | Icon                  | String            | No       | 200        | Fluent UI icon name (e.g. DataPieRegular)          |
| qdb_render_targets           | Render Targets        | String (JSON)     | Yes      | 4000       | JSON array: ["portal","admin","mobile"]            |
| qdb_is_active                | Is Active             | Boolean           | Yes      | —          | Default: true; false = logically deactivated       |
| statecode                    | Status                | State             | Yes      | —          | Dataverse standard; 0 = Active, 1 = Inactive       |
| createdon                    | Created On            | DateTime          | System   | —          | Dataverse audit; read-only                         |
| createdby                    | Created By            | Lookup (SystemUser)| System  | —          | Dataverse audit; read-only                         |
| modifiedon                   | Modified On           | DateTime          | System   | —          | Dataverse audit; read-only                         |
| modifiedby                   | Modified By           | Lookup (SystemUser)| System  | —          | Dataverse audit; read-only                         |

**Global Option Set: qdb_component_category**

| Value | Label         | Description                                                     |
|-------|---------------|-----------------------------------------------------------------|
| 100000000 | form      | A form component from QdbDynamicFormEngine                      |
| 100000001 | cms-block | A CMS content block from QdbPortalShell                         |
| 100000002 | page-section | A full-page section layout component                         |
| 100000003 | widget    | A dashboard widget from the existing widget-registry            |
| 100000004 | nav-component | A navigation component from QdbPortalShell                  |

### 7.3 qdb_component_versions — Field Detail

| Logical Name                    | Display Name          | Type              | Required | Max Length  | Notes                                                  |
|---------------------------------|-----------------------|-------------------|----------|-------------|--------------------------------------------------------|
| qdb_component_versionid         | (Primary Key)         | Uniqueidentifier  | Yes      | —           | Auto-generated GUID; Dataverse primary key             |
| qdb_version_label               | Version Label         | String (Name)     | Yes      | 100         | Generated: "{slug} v{version_number}"; primary field   |
| qdb_component_definition_id     | Component Definition  | Lookup            | Yes      | —           | N:1 FK to qdb_component_definitions; cascade restrict  |
| qdb_version_number              | Version Number        | String            | Yes      | 20          | SemVer string (e.g. 1.0.0); immutable after creation   |
| qdb_props_schema                | Props Schema          | Memo              | Yes      | 1,048,576   | JSON Schema text; immutable after creation             |
| qdb_default_props               | Default Props         | Memo              | No       | 1,048,576   | JSON object text; must be valid JSON when provided     |
| qdb_bundle_url                  | Bundle URL            | String            | No       | 2048        | URL string only; bundle serving is out of scope        |
| qdb_changelog                   | Changelog             | Memo              | No       | 4000        | Human-readable change notes for this version           |
| qdb_is_latest                   | Is Latest             | Boolean           | Yes      | —           | Default: false; at most one true per definition        |
| qdb_deprecated_on               | Deprecated On         | DateTime          | No       | —           | Non-null = deprecated; record retained                 |
| createdon                       | Created On            | DateTime          | System   | —           | Dataverse audit; read-only                             |
| createdby                       | Created By            | Lookup (SystemUser)| System  | —           | Dataverse audit; read-only                             |
| modifiedon                      | Modified On           | DateTime          | System   | —           | Dataverse audit; read-only                             |
| modifiedby                      | Modified By           | Lookup (SystemUser)| System  | —           | Dataverse audit; read-only                             |

### 7.4 Relationship Detail

| Property         | Value                                                        |
|------------------|--------------------------------------------------------------|
| Relationship name| qdb_componentdefinition_versions                            |
| Type             | N:1 (many versions to one definition)                        |
| Lookup field     | qdb_component_definition_id on qdb_component_versions        |
| Delete behaviour | Restrict — prevents deletion of a definition with versions   |
| Cascade assign   | NoCascade                                                    |
| Cascade share    | NoCascade                                                    |

### 7.5 Data Volumes and Retention

| Entity                       | Initial Volume | Expected Growth          | Retention |
|------------------------------|----------------|--------------------------|-----------|
| qdb_component_definitions    | 5 (widgets)    | 10–30 per quarter        | Indefinite (identity records) |
| qdb_component_versions       | 5 (one per widget) | 2–5 per component per year | Indefinite (audit trail) |

---

## 8. INTEGRATION POINTS

### 8.1 QdbPortalShell

| Integration        | Type                     | Data Exchanged                            | Direction              |
|--------------------|--------------------------|-------------------------------------------|------------------------|
| Dataverse org      | Shared Dataverse instance| Both solutions co-exist in org5869857f    | Co-resident (no API)   |
| Backend API        | Fastify plugin registration | Component registry routes added to existing app.ts | Additive registration |
| Next.js admin UI   | Route addition           | New page under /[locale]/admin/           | Additive page          |
| widget-registry    | Adapter layer            | WidgetDefinition → component_definitions + component_versions | Unidirectional write |
| JWT / auth guard   | Reused middleware        | No data; existing authenticate + requireRole pre-handlers reused | Reuse |

### 8.2 QdbDynamicFormEngine

| Integration        | Type     | Data Exchanged                                              | Direction |
|--------------------|----------|-------------------------------------------------------------|-----------|
| Dataverse org      | Shared   | Form entities co-exist in same org; no direct entity cross-references in this engagement | Passive |
| Seed data          | One-time | Each deployed form template may be registered as a component definition (category=form) in the seed phase | Write at provision time |

Note: A direct FK reference from QdbDynamicFormEngine entities to
qdb_component_definitions is NOT in scope for this engagement. Cross-solution
references, if required, will be designed in a separate engagement.

### 8.3 DXP-P1-002 — Theme Token Engine (Consumer)

The Theme Token Engine will query `GET /api/admin/components/definitions` (filtered by
category) to obtain component GUIDs for theme token assignments. The API contract
established in this engagement (entity field names, GUID stability, category option set
values) must remain stable and backward compatible for the lifetime of the platform.

### 8.4 DXP-P1-003 — Portal RBAC (Consumer)

The Portal RBAC engine will reference qdb_component_definitions GUIDs when creating
permission records. The qdb_name slug must be treated as a stable external identifier
and must not be changed after a definition record is created.

### 8.5 DXP-P1-004 — Versioning & Snapshots (Consumer)

The Versioning & Snapshots engagement will reference qdb_component_versions GUIDs when
recording portal configuration snapshots. The qdb_version_number and qdb_props_schema
fields must be treated as immutable after creation, as snapshot records will encode
them as a point-in-time reference.

---

## 9. USER STORIES

**US-01**
- ID: US-01
- Title: View all registered components
- Priority: Must Have
- Story: As a QDB portal administrator, I want to see a list of all registered component
  definitions so that I can understand what components are available on the platform.
- Acceptance Criteria:
  - Given I am authenticated as an Admin and navigate to /en/admin/components
  - When the page loads
  - Then I see a list of all active component definitions with their name, English display
    name, Arabic display name, category, and active status displayed

**US-02**
- ID: US-02
- Title: Filter components by category
- Priority: Must Have
- Story: As a QDB portal administrator, I want to filter the component list by category
  so that I can quickly find all widgets or all CMS blocks.
- Acceptance Criteria:
  - Given I am on the /en/admin/components page with multiple categories shown
  - When I select "widget" from the category filter
  - Then only component definitions with category = widget are displayed
  - And the count shown reflects the filtered result

**US-03**
- ID: US-03
- Title: Register a new component definition
- Priority: Must Have
- Story: As a QDB portal administrator, I want to create a new component definition
  so that a new component type is recognised by the platform.
- Acceptance Criteria:
  - Given I am on the /en/admin/components page
  - When I click "New Component", fill in name="hero-banner", display_name_en="Hero Banner",
    display_name_ar="لافتة بطل", category="cms-block", render_targets=["portal"], and submit
  - Then a new component definition record is created in Dataverse
  - And the new record appears in the component list
  - And the API returns HTTP 201

**US-04**
- ID: US-04
- Title: Prevent duplicate component name
- Priority: Must Have
- Story: As a QDB portal administrator, I want to be prevented from creating a component
  with a name that already exists so that the registry maintains a unique slug per component.
- Acceptance Criteria:
  - Given a component definition with name="hero-banner" already exists
  - When I submit a new component definition form with name="hero-banner"
  - Then the form displays an error message indicating the name is already taken
  - And no new record is created in Dataverse

**US-05**
- ID: US-05
- Title: View component version history
- Priority: Must Have
- Story: As a QDB portal administrator, I want to see all versions of a component
  definition so that I can understand the version history and identify the latest version.
- Acceptance Criteria:
  - Given I click on the "hero-banner" component in the list
  - When the detail view opens
  - Then I see all version records for hero-banner ordered newest first
  - And the version designated as latest is clearly indicated with a badge

**US-06**
- ID: US-06
- Title: Add a new version to a component
- Priority: Must Have
- Story: As a QDB portal administrator, I want to add a new version to an existing
  component definition so that I can record a new props schema contract for that component.
- Acceptance Criteria:
  - Given I am viewing the detail page for the "hero-banner" component
  - When I click "Add Version", enter version_number="1.1.0", props_schema="{...valid JSON Schema...}", and submit
  - Then a new qdb_component_versions record is created in Dataverse
  - And the new version appears in the version sub-list
  - And the API returns HTTP 201

**US-07**
- ID: US-07
- Title: Promote a version to latest
- Priority: Must Have
- Story: As a QDB portal administrator, I want to designate a specific version as the
  latest so that downstream consumers always know which version to use by default.
- Acceptance Criteria:
  - Given the "hero-banner" component has versions 1.0.0 (latest) and 1.1.0 (not latest)
  - When I click "Promote to Latest" on version 1.1.0
  - Then version 1.1.0 has qdb_is_latest = true in Dataverse
  - And version 1.0.0 has qdb_is_latest = false in Dataverse
  - And at no point during the operation do both versions have qdb_is_latest = true simultaneously

**US-08**
- ID: US-08
- Title: Existing widgets continue to function
- Priority: Must Have
- Story: As a portal shell developer, I want the five existing dashboard widgets to
  continue rendering correctly after the Component Registry is deployed so that there
  is zero disruption to the citizen portal.
- Acceptance Criteria:
  - Given the Component Registry provisioning script has been run
  - When a citizen user loads the portal dashboard
  - Then all five widgets (MyRequestsSummary, RecentActivity, Announcements, QuickActions, Statistics) render correctly
  - And the widget-registry in-memory cache resolves all five widget definitions without error

**US-09**
- ID: US-09
- Title: Query component definitions by category via API
- Priority: Must Have
- Story: As a downstream DXP service (Theme Token Engine, RBAC), I want to query all
  component definitions of a specific category so that I can build category-scoped
  features on top of the registry.
- Acceptance Criteria:
  - Given component definitions of categories widget, form, and cms-block exist in Dataverse
  - When I call GET /api/admin/components/definitions?category=widget
  - Then the response contains only records with category = widget
  - And the response time is within 800 ms

**US-10**
- ID: US-10
- Title: Provisioning script runs idempotently
- Priority: Must Have
- Story: As a Maqsad AI DevOps engineer, I want the provisioning script to be safe to
  re-run so that I can execute it again after a partial failure without creating
  duplicate entities or errors.
- Acceptance Criteria:
  - Given the QdbDxpPlatform solution and both entities have already been provisioned
  - When I run the provisioning script a second time
  - Then the script completes without error
  - And no duplicate entities, option sets, or relationship records are created
  - And the PROVISIONING-COMPLETE.md file reports all checks as passed

---

## 10. ASSUMPTIONS

**A-001:** The `qdb_` publisher already exists in org5869857f.crm4.dynamics.com and is
associated with the correct publisher prefix. If it does not exist, a separate manual
step is required before the provisioning script can run.

**A-002:** The service principal used by the provisioning script has System Administrator
role at provisioning time. This role is reduced to a custom role after provisioning
completes, following the same pattern established for QdbPortalShell.

**A-003:** The portal shell backend API service principal (used at runtime by the
Fastify API) has sufficient Dataverse privileges (Read, Write, Create, Delete) on the
new QdbDxpPlatform entities. These privileges must be granted to the service principal's
Dataverse security role after provisioning.

**A-004:** The existing packages/widget-registry `configSchema` fields use Zod schemas.
A Zod-to-JSON-Schema conversion utility (e.g. zod-to-json-schema) is available or can
be adopted to serialise widget config schemas into the qdb_props_schema field. This
adoption decision must be validated by the GitHub research phase.

**A-005:** The Next.js admin route guard (applied to all /[locale]/admin/ pages) is
already implemented in the portal shell web app and requires no modification for the
new components page.

**A-006:** The five existing widgets' qdb_name values shall be their existing kebab-case
name fields (e.g. `my-requests-summary`, `recent-activity`, `announcements`,
`quick-actions`, `statistics`). These are stable identifiers and will not change.

**A-007:** No existing QdbPortalShell or QdbDynamicFormEngine entity is to be modified
as part of this engagement. Both existing solutions are treated as read-only dependencies.

**A-008:** The Dataverse OData $batch endpoint is available and enabled in
org5869857f.crm4.dynamics.com. This is required for the atomic set-latest operation.

**A-009:** The admin UI does not require a rich JSON Schema editor in this engagement.
A plain textarea accepting raw JSON Schema text is sufficient for the Add Version form.

---

## 11. CONSTRAINTS

**C-001 Technology stack:** The provisioning script must use TypeScript + OData v4 Web
API (same as the portal-shell provisioning script). PAC CLI may be used for solution
export only; it must not be used for entity creation.

**C-002 Publisher prefix:** All new entities, option sets, and fields must use the `qdb_`
publisher prefix. Deviation requires an approved ADR.

**C-003 Solution boundary:** The new entities must be created inside QdbDxpPlatform only.
No new tables or fields may be added to QdbPortalShell or QdbDynamicFormEngine as part
of this engagement.

**C-004 No hard-coded GUIDs:** The provisioning script and API must not hard-code any
Dataverse record GUIDs. GUIDs are discovered at runtime via OData queries.

**C-005 Immutable fields after creation:** qdb_name (on definitions) and qdb_version_number
+ qdb_props_schema (on versions) are immutable after the record is created. The API must
enforce this via HTTP 400 on PATCH attempts targeting these fields.

**C-006 qdb_is_latest invariant:** The single-latest-version invariant must be enforced
exclusively by the set-latest API endpoint. No other code path (including direct PATCH
on a version record) may set qdb_is_latest = true. The PATCH /versions/:id endpoint
must explicitly reject an is_latest field in the request body.

**C-007 No integer primary keys:** All entity primary keys are Dataverse-managed GUIDs.
No integer surrogate keys shall be introduced.

**C-008 Pagination:** All list endpoints must support OData `$top` and `$skip` parameters
for pagination. Unbounded queries are not permitted in production.

**C-009 Timeline dependency:** DXP-P1-002, DXP-P1-003, and DXP-P1-004 cannot begin
implementation until this engagement's Dataverse schema is provisioned and the API
routes are deployed to a shared development environment.

**C-010 Cross-environment GUID stability:** Development, staging, and production Dataverse
orgs will each produce different GUIDs for the same logical component definition when the
provisioning script is executed. Downstream consumers (DXP-P1-002, P1-003, P1-004) must
resolve component definitions by `qdb_name` slug in all cross-environment contexts. They
must never store or hard-code component definition GUIDs as environment-specific constants.
This constraint must be stated explicitly in the BRDs for DXP-P1-002, P1-003, and P1-004.

**C-011 API error response schema:** All API routes under `/api/admin/components/**` must
return error responses following the existing portal-shell error schema. The Architecture
phase must define or reference the error body shape before the backend build begins.
Inconsistent error shapes across DXP engagements are a breaking integration contract.

---

## 12. RISKS AND OPEN QUESTIONS

| Risk / Question                                                                 | Impact                              | Owner              | Resolution needed by |
|---------------------------------------------------------------------------------|-------------------------------------|--------------------|----------------------|
| Zod-to-JSON-Schema library compatibility with the existing Zod version in portal-shell | Widget adapter serialisation failure | GitHub Researcher / Backend | Before architecture phase |
| OData $batch atomicity — does the Dataverse org enforce true transactional semantics or best-effort? | is_latest invariant may be violated under race conditions | Architect | Before backend implementation |
| Service principal runtime privileges — does the existing portal shell SP need new entity permissions manually granted in Power Apps? | API returns 403 on component registry routes at runtime | DevOps / Backend | Before first API deployment |
| Alternate key creation via OData — some Dataverse orgs require managed solutions before alternate keys are usable; unmanaged solution may not enforce them | qdb_name uniqueness enforced only at API layer, not DB layer | Architect | Before provisioning script implementation |
| Arabic display name input — does the existing admin UI form component support RTL input in an LTR locale context? | Arabic names entered incorrectly in EN locale | Frontend | Before UI implementation |
| Bundle URL field — will DXP-P1-004 or another engagement require structured validation of the URL format? | May require a schema change in a later engagement | BA / Architect | Open — to be revisited at DXP-P1-004 kick-off |
| Seed data timing — should the five widget component_definition seed records be created by the provisioning script or by the widget-registry adapter on first run? | Duplicate records possible if both paths run | Backend | Before provisioning script implementation |
| Performance of set-latest under concurrent calls — two Admin users promoting different versions simultaneously | Transient violation of the single-latest invariant | Backend | Before backend implementation |

---

## 13. GLOSSARY

| Term                        | Definition                                                                                                  |
|-----------------------------|-------------------------------------------------------------------------------------------------------------|
| Component Definition        | A permanent Dataverse record that represents the identity of one component type on the DXP. Created once; never deleted. |
| Component Version           | A Dataverse record that represents one versioned schema snapshot of a component. Created once; schema fields are immutable after creation. |
| Component Registry          | The platform capability (two Dataverse entities + API + UI) that stores and exposes component definitions and versions. |
| DXP                         | Digital Experience Platform — the umbrella platform QDB is building on top of QdbPortalShell and QdbDynamicFormEngine. |
| QdbDxpPlatform              | The new Dataverse unmanaged solution created in this engagement. Contains qdb_component_definitions and qdb_component_versions. |
| QdbPortalShell              | The existing Dataverse solution containing 15 entities that power the citizen portal shell.                 |
| QdbDynamicFormEngine        | The existing Dataverse solution containing the dynamic form authoring and rendering system.                  |
| is_latest                   | A boolean flag on qdb_component_versions that designates the currently promoted version. At most one record per definition may be true. |
| set-latest                  | The atomic API operation that promotes one version to is_latest = true and resets all other versions for the same definition to false. |
| widget-registry             | The existing packages/widget-registry package providing in-process registration and resolution of widget definitions in the Next.js app. |
| widget-registry adapter     | The new module (adapter.ts) that bridges the widget-registry's registerWidget() call to the Component Registry API without modifying the registry's public contract. |
| slug / qdb_name             | A unique, immutable, kebab-case machine-readable identifier for a component definition (e.g. my-requests-summary). |
| semver / qdb_version_number | Semantic version string (major.minor.patch) used to label a component version record (e.g. 1.0.0, 2.1.3). |
| props_schema                | A JSON Schema document stored as text in qdb_props_schema that describes the shape of the component's configuration or props for a given version. |
| render_target               | A surface on which a component can be rendered: portal (citizen-facing portal), admin (admin UI), or mobile (React Native app). |
| OData $batch                | An OData v4 protocol mechanism for sending multiple operations in a single HTTP request, used here to enforce atomic is_latest flag management. |
| Alternate Key               | A Dataverse mechanism that defines a uniqueness constraint on one or more fields, enforced at the platform layer (equivalent to a database unique index). |
| Publisher prefix            | The `qdb_` prefix applied to all custom entity, field, and option set names to avoid naming conflicts with Microsoft standard components. |
| Fastify plugin              | A Fastify encapsulated plugin that registers route handlers. Used to add component registry routes to the existing portal shell API. |
| kebab-case                  | A naming convention using lowercase letters and hyphens (e.g. my-requests-summary), required for qdb_name slug values. |

---

## 14. REQUIREMENTS TRACEABILITY MATRIX

| User Story | Functional Requirements                              | Non-Functional Requirements      | Test Case (QA fills) | Status |
|------------|------------------------------------------------------|----------------------------------|----------------------|--------|
| US-01      | FR-036, FR-037, FR-056, FR-057                       | NFR-001, NFR-007                 | TC-xxx (pending)     | Draft  |
| US-02      | FR-038, FR-058                                       | NFR-001, NFR-013                 | TC-xxx (pending)     | Draft  |
| US-03      | FR-040, FR-041, FR-059, FR-060                       | NFR-004, NFR-007                 | TC-xxx (pending)     | Draft  |
| US-04      | FR-008, FR-041, FR-061                               | NFR-004                          | TC-xxx (pending)     | Draft  |
| US-05      | FR-044, FR-045, FR-062, FR-063                       | NFR-002, NFR-007                 | TC-xxx (pending)     | Draft  |
| US-06      | FR-048, FR-049, FR-050, FR-051, FR-065               | NFR-006, NFR-007                 | TC-xxx (pending)     | Draft  |
| US-07      | FR-052, FR-053, FR-064                               | NFR-005, NFR-007                 | TC-xxx (pending)     | Draft  |
| US-08      | FR-068, FR-069, FR-070, FR-071, FR-072, FR-073       | NFR-008, NFR-011                 | TC-xxx (pending)     | Draft  |
| US-09      | FR-038                                               | NFR-001, NFR-012                 | TC-xxx (pending)     | Draft  |
| US-10      | FR-001, FR-002, FR-003, FR-029, FR-030, FR-033, FR-034 | NFR-011                        | TC-xxx (pending)     | Draft  |

---

## 15. APPROVAL

| Role          | Name              | Decision  | Date |
|---------------|-------------------|-----------|------|
| CEO           | Maqsad AI CEO     | APPROVED WITH CONDITIONS | 2026-06-17 |
| Requestor     | Pending           | PENDING   |      |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
═══════════════════════════════════════════════════
DXP-P1-001 Component Registry — BRD v1.0
Maqsad AI — Business Analyst
2026-06-17
═══════════════════════════════════════════════════
```
