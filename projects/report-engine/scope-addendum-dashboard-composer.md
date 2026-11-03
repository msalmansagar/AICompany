# BA Scope Addendum — Dashboard Composer + Business-User Authoring Tooling
# RPT-ENG-001 · Metadata-Driven Report Engine

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Parent document** | `phase-2-ba.md` (BRD v1.0, approved 2026-07-07) |
| **Addendum ID** | ADD-001 |
| **Document** | BA Scope Addendum — Dashboard Composer |
| **Version** | 1.0 |
| **Date** | 2026-07-19 |
| **Author** | BA (Maqsad AI) |
| **Status** | DRAFT — Pending CEO Approval |
| **Trigger** | Stakeholder-validated prototype (`prototype/report-designer.html`) produced mid-project, demonstrating a Customer-360 dashboard composer capability that exceeds approved Phase-3 scope |

---

## 1. Context and Trigger

The RPT-ENG-001 engagement completed BRD approval, GitHub research, and Phase-3 architecture. The project is at the pre-build gate, awaiting Phase-4 authorization for the V1 MVP (estimated 150–190 person-days).

During the pre-build period, a self-contained HTML prototype (`projects/report-engine/prototype/report-designer.html`) was produced and validated with QDB stakeholders. The prototype demonstrates a **Grid Dashboard Composer** — a multi-widget, independently-bound dashboard authoring surface — as a distinct product surface alongside the approved Report Designer.

The QDB Customer-360 use case motivated this work: relationship managers and branch heads need a single composable view that aggregates loan application counts, facility utilisation, branch concentration, product coverage, and SLA status for a customer — information that spans five or more CRM entities and that cannot be expressed as a single-entity tabular report, which is the design basis of V1.

The dashboard composer **exceeds the approved scope** in two ways:

1. The approved BRD listed `FR-075 Dashboard-style layout` as a **Could Have, V3** item — described minimally as "multiple panels on one canvas." The prototype delivers a materially richer, architecturally distinct capability.
2. CEO condition C-3 locked V1 scope to the BRD §13 MVP cut. Adding the dashboard composer to V1 would require a formal change request with CEO approval. This addendum constitutes that request.

This document assesses the delta, formalises the requirements, and provides a recommendation to the CEO before any build work begins on the dashboard composer.

---

## 2. What Was Prototyped — New Capability Summary

The prototype demonstrates two classes of new capability: a standalone Dashboard Composer and report-side enhancements. Both are described below.

### 2.1 Grid Dashboard Composer (New Product Surface)

A dashboard is a separate artifact from a report. It has its own gallery entry point ("Dashboards"), its own lifecycle, and its own authoring surface. A dashboard is not a report with a different layout; it is a different kind of metadata object.

**Structure:** A dashboard is composed of one or more **sections**. Each section has a configurable column count (1–4 columns) and contains a variable number of **widgets** arranged in a grid. Empty grid cells display placeholders.

**Ten widget types demonstrated:**

| Widget | Purpose |
|---|---|
| Metric | Single aggregated KPI value (e.g. Total Requested Amount) |
| Gauge | Radial utilisation indicator (value ÷ max) |
| Status badge | Categorical status indicator with configurable alert level |
| Progress bar | Linear utilisation or completion indicator |
| Chart | Bar / Column / Line / Pie / Donut / Funnel with click-to-drill |
| Info cards | Card-per-row display of aggregated data with icons |
| Profile | Key-value pair summary for a named entity (e.g. a customer) |
| Checklist | List with ticked/unticked status per category value |
| Matrix | Cross-tabulation (two-dimensional group-by) |
| Table | Standard tabular data within a dashboard section |

**Per-tile data binding:** Each widget is independently bound to its own entity, group-by attribute, measure attribute, and aggregation function (Sum / Avg / Count / Max / Min). This is architecturally distinct from a single-entity report, where all columns share one primary entity and one data source. A 12-widget Customer-360 dashboard may query five or more distinct entities.

**Drag-and-drop authoring:** Widgets can be dragged within and across sections. The position of a widget in the grid is persisted as part of the dashboard definition.

**Add / duplicate / delete:** Widgets and sections can be added, duplicated, and deleted. Duplicate preserves the source configuration and appends "copy" to the title. Section duplication clones all widgets with new IDs.

### 2.2 Business-User Authoring Tooling (New Authoring Capabilities)

**Undo / redo:** A 60-step history stack per dashboard session, accessible via toolbar buttons and keyboard shortcuts (Ctrl+Z / Ctrl+Y). Each mutating action (add widget, move, delete, change property) pushes a snapshot before the change.

**Friendly field panel:** The authoring surface's left panel displays data sources with business-friendly names and typed field chips (Currency, Text, Option set, Lookup). Authors see entity names and display names — not logical attribute names.

**Drag-to-canvas auto-viz:** A field chip dragged from the field panel onto a section placeholder is automatically converted to an appropriate widget type: a Currency or Decimal field becomes a Metric widget; a Text, Option set, or Lookup field becomes a Chart widget (column chart, grouped by that field). The engine selects the widget type and pre-populates its binding.

**Interactive filter bar with slicers:** In authoring mode the dashboard exposes a filter bar populated from the category-typed attributes of the entities present on the canvas. Selecting a slicer value filters all widgets simultaneously on the same entity-attribute combination.

**Click-to-cross-filter (preview mode):** In preview mode, clicking a chart segment, info-card row, or matrix cell applies that dimension value as a cross-filter across every other widget on the dashboard that shares the same entity. This is the primary interaction model for Customer-360 exploration.

### 2.3 Report-Side Enhancements Also Validated in the Prototype

These are enhancements to already-approved report designer scope, not net-new surfaces:

| Enhancement | Relation to approved BRD |
|---|---|
| Chart Report layout with 6 chart types (Bar, Column, Line, Pie, Donut, Funnel) | FR-076 "Chart-based layout" was Could Have, V2 — this promotes it |
| Click-to-drill on chart segments | Extension of FR-036 (drilldown) into chart layouts |
| Info Cards report layout | Extension of FR-071 "Card/KPI layout" which was Could Have, V2 |
| Applied filter / parameter bar rendered on the report runtime view | Enhancement to FR-045–FR-049 (filter engine, runtime display) |
| Workflow-history report template (table + timeline) | Net-new template variant within the approved layout engine |
| SLA-compliance report template | Net-new template variant within the approved layout engine |

These report-side enhancements do not require new schema entities. They extend the existing layout engine (`ILayoutRenderer`, `qdb_reportlayout.qdb_layouttype` option set). They are assessed as **V2-grade enhancements** that should be included if the dashboard composer is authorised.

---

## 3. Net-New vs Enhancement Mapping

| Capability | Classification | Parent BRD ref |
|---|---|---|
| Standalone dashboard artifact with its own gallery | NET-NEW — not in BRD at this fidelity | FR-075 (Could Have, V3) described as "multiple panels on one canvas" only |
| Section-based 1–4 column grid layout | NET-NEW structural model | Not in BRD |
| 10 widget types with per-tile data binding | NET-NEW | FR-071 (Card/KPI, V2) partially covers metric; rest not in BRD |
| Per-widget independent entity + measure binding | NET-NEW architectural requirement | Reports bind one primary entity |
| Undo / redo (60-step history) | NET-NEW | Not in BRD |
| Drag-to-canvas auto-viz | NET-NEW authoring convenience | Not in BRD |
| Interactive filter bar / slicers | NET-NEW (dashboard-scoped) | FR-045–049 cover report filters, not dashboard cross-widget slicers |
| Click-to-cross-filter | NET-NEW interaction model | Not in BRD |
| Duplicate widget / section | NET-NEW | FR-017 covers report clone, not widget/section duplication |
| Dashboard governance (draft/publish/RBAC) | NET-NEW entities | FR-097–107 cover reports; dashboard security is a separate concern |
| Chart Report layout with 6 chart types | ENHANCEMENT of FR-076 (V2 promotion) | FR-076 Could Have, V2 |
| Click-to-drill on chart segments | ENHANCEMENT of FR-036 | FR-036 M, V1 (drilldown); chart variant not specified |
| Info Cards report layout | ENHANCEMENT of FR-071 | FR-071 Could Have, V2 |
| Filter bar on report runtime view | ENHANCEMENT of FR-045–049 | Runtime display form not specified |
| Workflow-history template | ENHANCEMENT — new template variant | Within approved layout engine scope |
| SLA-compliance template | ENHANCEMENT — new template variant | Within approved layout engine scope |

---

## 4. Business Requirements — Dashboard Composer and Authoring Tooling

Priorities use MoSCoW. All items below are **in addition to** the approved BRD requirements.

### 4.1 Dashboard Artifact Management (ADD-FR-001 … ADD-FR-009)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-001 | The system shall provide a "Dashboards" gallery alongside the "Reports" gallery, listing all dashboards the user can view, with name, owner, last-modified date, and status (Draft / Published) | M | Separate navigation tab/route |
| ADD-FR-002 | A power user shall be able to create a new dashboard by providing a name, description, category, owner, and optional context entity | M | Context entity scopes the dashboard (e.g. account = Customer-360) |
| ADD-FR-003 | A dashboard definition shall be persisted as metadata in Dataverse (new entities — see §7) | M | Must be portable on-prem ↔ cloud (BR-9) |
| ADD-FR-004 | A dashboard shall be saveable as Draft and publishable as a distinct lifecycle action | M | Only published dashboards run for consumers (BR-1 equivalent for dashboards) |
| ADD-FR-005 | Each publish action shall create an immutable version snapshot of the dashboard definition | M | Consistent with BR-2 |
| ADD-FR-006 | A dashboard shall be cloneable | S | Produces a new Draft copy |
| ADD-FR-007 | A dashboard shall be deleteable by its owner or a Report Admin | M | Soft-delete; retain execution logs |
| ADD-FR-008 | The system shall log an audit record (append-only) for every dashboard create / update / publish / unpublish / clone / delete action | M | Extend `qdb_reportauditlog` or add `qdb_dashboardauditlog` |
| ADD-FR-009 | Role-based access (view, run, edit, export) shall be configurable per dashboard, enforced server-side | M | Mirrors report security model |

### 4.2 Dashboard Composer — Canvas and Sections (ADD-FR-010 … ADD-FR-016)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-010 | The dashboard composer shall provide a canvas onto which the author adds sections | M | Canvas = stack of sections |
| ADD-FR-011 | Each section shall have a configurable column count of 1, 2, 3, or 4 | M | Stored in section definition |
| ADD-FR-012 | Each section shall display a title (optional) | S | |
| ADD-FR-013 | The author shall be able to add, duplicate, reorder, and delete sections | M | Reorder = drag section header |
| ADD-FR-014 | Empty widget positions within a section shall display an "Add widget" placeholder | M | Tapping a placeholder opens the widget picker |
| ADD-FR-015 | The author shall be able to drag-and-drop widgets to reposition them within a section or move them to another section | M | Position persisted in definition |
| ADD-FR-016 | The system shall display a friendly field panel listing available entities and their attributes (grouped by entity, with business display names and type chips) | M | Same entity list the user can read (respects CRM read permissions) |

### 4.3 Widget Types and Data Binding (ADD-FR-017 … ADD-FR-027)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-017 | Each widget shall be independently bound to: a target entity, a group-by attribute, a measure attribute, and an aggregation function (Sum / Avg / Count / Max / Min) | M | This is the core architectural distinction from single-entity reports |
| ADD-FR-018 | The system shall support a Metric widget displaying a single aggregated value with label and trend indicator | M | |
| ADD-FR-019 | The system shall support a Gauge widget displaying a radial utilisation indicator (aggregated value ÷ configurable maximum) | M | |
| ADD-FR-020 | The system shall support a Status Badge widget displaying a categorical flag with configurable alert level (neutral / low / medium / high) | M | |
| ADD-FR-021 | The system shall support a Progress Bar widget displaying a linear utilisation indicator | S | |
| ADD-FR-022 | The system shall support a Chart widget with selectable chart type: Bar, Column, Line, Pie, Donut, Funnel | M | Rendered by ScottPlot (server) or a client-side chart library |
| ADD-FR-023 | The system shall support an Info Cards widget displaying one card per distinct group-by value, with a configurable icon | S | |
| ADD-FR-024 | The system shall support a Profile widget displaying key-value pairs for an entity record | S | Used for Customer header |
| ADD-FR-025 | The system shall support a Checklist widget displaying one row per group-by value with a ticked/unticked visual | S | |
| ADD-FR-026 | The system shall support a Matrix (cross-tab) widget displaying a two-dimensional group-by with aggregated values at each intersection | C | Complex — may slip to V2.1 |
| ADD-FR-027 | The system shall support a Table widget displaying standard tabular rows within a dashboard section | M | Reuses the report table layout engine |

### 4.4 Authoring Tooling (ADD-FR-028 … ADD-FR-034)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-028 | The composer shall support undo and redo for all mutating actions (add / move / delete widget or section; change widget property), with a minimum 30-step history | M | Keyboard: Ctrl+Z / Ctrl+Y |
| ADD-FR-029 | The author shall be able to duplicate a widget (creates a copy adjacent to the source within the same section) | M | |
| ADD-FR-030 | The author shall be able to duplicate a section (creates a copy with all widgets cloned with new IDs) | S | |
| ADD-FR-031 | Dragging a field chip from the field panel onto a section placeholder shall automatically create an appropriately-typed widget (numeric field → Metric; category field → Chart) and pre-populate its binding | S | Drag-to-auto-viz |
| ADD-FR-032 | The widget properties panel shall allow the author to change widget type, entity, group-by, measure, aggregation, chart type (for Chart widget), and display title without leaving the canvas | M | |
| ADD-FR-033 | The composer shall provide a live preview mode that renders each widget with real data | M | Preview respects the author's CRM read permissions |
| ADD-FR-034 | The composer shall display a filter bar (slicers) above the canvas; selecting a slicer value shall filter all widgets that share the same entity and attribute | M | Authoring-mode filter interaction |

### 4.5 Runtime and Execution (ADD-FR-035 … ADD-FR-041)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-035 | At runtime the dashboard execution service shall fan out one independent data fetch per widget, execute them concurrently up to a configurable parallelism limit, and return per-widget results | M | Fan-out model; each widget has its own cache key |
| ADD-FR-036 | Each widget's result shall be independently cached using the key: SHA-256(widgetId + sortedParamJson + roleSetHash) | M | Reuses ICacheStore; TTL per widget |
| ADD-FR-037 | The runtime viewer shall support progressive loading: widgets render as their individual results arrive; a spinner is shown per widget until its data is ready | M | Avoids "all-or-nothing" dashboard blank screen |
| ADD-FR-038 | In preview mode, clicking a chart segment or info-card row shall apply that dimension value as a cross-filter on all other widgets sharing the same entity | M | Cross-filter state held in the viewer client; triggers a re-execution of affected widgets with the filter injected |
| ADD-FR-039 | Cross-filter state shall not be persisted to the dashboard definition; it is a transient runtime interaction only | M | |
| ADD-FR-040 | The dashboard execution service shall enforce the same RBAC, masking, and data-source access-control rules as the report execution service | M | Server-side; no client-side trust |
| ADD-FR-041 | Dashboard execution events shall be logged to the execution audit log (who ran which dashboard, when, with which context, per-widget outcome and row count) | M | |

### 4.6 CRM Placement and Context (ADD-FR-042 … ADD-FR-046)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-042 | A published dashboard shall be launchable from CRM ribbon placements (form, home-grid, dashboard button, sitemap) using the same `qdb_reportribbonplacement` mechanism or a dedicated placement entity | M | Reuse existing ribbon infrastructure where possible |
| ADD-FR-043 | When launched from a CRM entity form, the dashboard shall receive the current record ID and entity name as context, allowing widgets with a matching entity to pre-filter to that record | M | Customer-360 primary use case |
| ADD-FR-044 | The context record (e.g. the account) shall be displayed in the dashboard header (Customer name, CIF, classification) | S | Profile widget or header banner |
| ADD-FR-045 | A dashboard launched from a grid selection shall receive the selected record IDs as context | S | V2.1 candidate if not in initial build |
| ADD-FR-046 | Dashboard context tokens shall follow the same `ExecutionContext` model as reports (userId, buId, recordId, entityName) | M | Reuses existing CRM entry point |

### 4.7 Report-Side Enhancements (ADD-FR-047 … ADD-FR-053)

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| ADD-FR-047 | The report layout engine shall support a Chart Report layout with six selectable chart types: Bar, Column, Line, Pie, Donut, Funnel | S | Promotes FR-076 from V2 |
| ADD-FR-048 | Chart Report segments shall be clickable to drill to a filtered detail view | S | Extension of FR-036 drilldown |
| ADD-FR-049 | The report runtime view shall display an applied filter / parameter bar showing the active parameter values for the current execution | S | Transparency for the report consumer |
| ADD-FR-050 | The report layout engine shall support an Info Cards layout (card per row with an icon column) | C | |
| ADD-FR-051 | The report designer shall provide a Workflow History template: a pre-configured grouped layout showing status-change history as a table and an optional timeline view | C | Template; no new engine components |
| ADD-FR-052 | The report designer shall provide an SLA Compliance template: a pre-configured layout with traffic-light conditional formatting based on configurable SLA thresholds | C | Template variant |
| ADD-FR-053 | Running totals and percentage-of-total transformation presets shall be added to the transformation pipeline | S | Carried from dotnetreport-comparison gap G-6 |

---

## 5. Scope: In vs Out for This Addendum

### 5.1 In Scope (Dashboard Composer Addendum)

- Standalone Dashboard artifact with its own gallery, lifecycle (Draft/Published), versioning, cloning, and deletion
- Dashboard Composer authoring surface: section-based 1–4 column grid canvas
- Ten widget types with per-tile independent entity + measure binding
- Undo / redo (30+ steps), duplicate widget, duplicate section
- Friendly field panel with drag-to-auto-viz
- Interactive filter bar / slicers (authoring mode)
- Click-to-cross-filter (preview / runtime mode)
- Fan-out dashboard execution service in the middle tier
- Per-widget independent caching
- Progressive widget loading in the runtime viewer
- Dashboard RBAC: view / run / export permissions per dashboard, enforced server-side
- Dashboard append-only audit log (create / update / publish / unpublish / clone / delete events)
- Dashboard execution audit log (who ran what, when, per-widget outcome)
- CRM ribbon placement for dashboards (reusing existing placement infrastructure)
- Context-passing from CRM entity form to dashboard (Customer-360 record scoping)
- New Dataverse schema entities for dashboards (~5-6 new tables — see §7)
- Report-side enhancements: Chart Report layout (6 types), click-to-drill on charts, Info Cards layout, filter/parameter bar on runtime view, Workflow History template, SLA Compliance template, running totals / %-of-total transforms

### 5.2 Out of Scope for This Addendum

The following are explicitly excluded and must not be built under this addendum without a further change request:

- **Real-time / streaming dashboards**: auto-refresh intervals below the existing report cache TTL floor are out of scope; near-real-time is achievable via TTL = 0 (no cache), consistent with the approved BRD
- **Write-back from dashboard widgets into CRM**: dashboards are read-only by design (consistent with BRD §5.2)
- **Scheduled dashboard delivery** (email/PDF snapshots on a cron): deferred to V2/V3 scheduling track (BRD gap G-1)
- **AI natural-language widget creation** ("ask in plain English"): deferred (BRD gap G-2)
- **Embedded external BI (Power BI embed, Tableau)**: out of scope for the entire programme
- **Public / anonymous dashboard sharing**: out of scope (BRD §5.2)
- **Cross-tenant dashboard sharing**: out of scope
- **Dashboard print / PDF export of the full canvas**: out of scope for the initial build; per-widget PNG export (using existing ScottPlot infrastructure) is in scope
- **Matrix widget** (cross-tab): included in ADD-FR-026 as Could Have — this is the most complex widget type and may be deferred to V2.1 if it risks the timeline
- **Grid selection context-passing to dashboards** (ADD-FR-045): Should Have — may be deferred to V2.1

---

## 6. Assumptions and Dependencies

| ID | Assumption / Dependency |
|---|---|
| ADD-A-1 | The prototype (`report-designer.html`) constitutes stakeholder sign-off on the interaction model. No further UI research is needed before build; only production hardening of the prototype interactions is required. |
| ADD-A-2 | The middle tier's `IReportDataProvider`, `ITransformationPipeline`, and `ICacheStore` interfaces (approved in Phase 3) are reusable by the dashboard execution service without modification. The dashboard composer is an orchestration layer above the existing engine components. |
| ADD-A-3 | Per-widget data binding uses the same CRM query abstraction (`IQueryStrategySelector`, FetchXML / QueryExpression / Web API) as single-entity reports. No new query mechanism is needed for V1 of the dashboard. |
| ADD-A-4 | A ScottPlot server-side render is acceptable for chart widgets in export (PNG). A client-side charting library (e.g. Chart.js or the Fluent UI chart surface) may be used for the interactive runtime viewer to avoid a server round-trip per chart render. If a client-side chart library is introduced, it must be MIT-licensed with 1000+ stars. This requires a GitHub research check before build. |
| ADD-A-5 | The QDB data quality issues observed in the prototype demo (duplicate shareholders, ownership percentages not summing to 100%, over-limit lines) are CRM data quality problems, not engine problems. The dashboard composer must surface data accurately as stored, with no engine-level deduplication or correction. A data quality disclaimer banner in the Customer-360 dashboard header is an acceptable mitigation. |
| ADD-A-6 | CEO condition C-2 (data-residency and PDPPL compliance for cached/staged PII) must be resolved before a Customer-360 dashboard that aggregates account-level PII is deployed to production. Development and staging can proceed under an assumption, but a production go-live gate on C-2 is mandatory. |
| ADD-A-7 | The parallelism limit for the fan-out execution service (ADD-FR-035) defaults to 6 concurrent widget fetches per dashboard execution, consistent with typical CRM throttling headroom. This is a configurable environment variable, not a hardcoded value. |
| ADD-A-8 | Cross-filter state (ADD-FR-038) is managed entirely in the runtime client. The server receives per-widget execution requests with the filter applied in the parameter bag; it does not maintain cross-filter session state. |
| ADD-A-9 | The dashboard composer is delivered as an additional section of the same `qdb_rpt_designer.html` web resource with a separate routing state (`view = "dashboards"` / `"dashboardcomposer"`), consistent with the prototype. No new web resource file is required. |
| ADD-D-1 | Client-side charting library selection (if different from ScottPlot) is a GitHub-research deliverable before frontend build begins (mandatory per constitution). |
| ADD-D-2 | CEO condition C-2 (OQ-004) resolution is on the critical path for production deployment of any Customer-360 dashboard. |
| ADD-D-3 | The approved V1 build (M0–M3) provides the `IReportDataProvider`, `IJobOrchestrator`, `ICacheStore`, and `SecurityEnforcer` components that the dashboard execution service depends on. If V1 build and dashboard composer build run in parallel, the dashboard team must consume these interfaces as contracts, not implementations. |

---

## 7. Schema Impact — New Dataverse Entities Required

The approved 18-table schema is entirely `qdb_reportdefinition`-centric. Dashboards are an independent artifact class and require their own entity tree. The following new tables are needed (notation consistent with `phase-3-schema.md`):

| # | Table | Purpose | Key fields (abbreviated) |
|---|---|---|---|
| 19 | `qdb_dashboard` | Dashboard aggregate root: name, category, owner, context entity, status (Draft/Published), current version | qdb_name, qdb_status, qdb_maincontextentity, qdb_isgoverned, qdb_currentversionid |
| 20 | `qdb_dashboardversion` | Immutable snapshot of the dashboard at publish time (mirrors qdb_reportversion) | qdb_dashboardid, qdb_versionnumber, qdb_snapshotjson, qdb_publishedbyid |
| 21 | `qdb_dashboardsection` | One row per section in a dashboard | qdb_dashboardid, qdb_title, qdb_columncount (1-4), qdb_sequence |
| 22 | `qdb_dashboardwidget` | One row per widget, with its full per-tile data binding | qdb_sectionid, qdb_widgettype, qdb_entitylogicalname, qdb_groupbyattribute, qdb_measureattribute, qdb_aggregation, qdb_charttype, qdb_sequence, qdb_configjson |
| 23 | `qdb_dashboardsecurity` | Per-principal ACL rows for dashboard access (mirrors qdb_reportsecurity) | qdb_dashboardid, qdb_principaltype, qdb_principalref, qdb_canview, qdb_canrun, qdb_canexport, qdb_canedit |
| 24 | `qdb_dashboardexecutionlog` | Append-only log of dashboard run events and per-widget outcomes | qdb_dashboardid, qdb_runbyid, qdb_runon, qdb_widgetresultsjson, qdb_outcome |

These 6 new tables extend the schema to **24 tables** within the same `QdbReportEngine` Dataverse solution. All new tables follow the established conventions (GUID PKs, platform audit columns, no hardcoded identifiers, append-only log table).

The existing `qdb_reportauditlog` can be extended with a nullable `qdb_dashboardid` lookup to capture dashboard audit events without a second audit table, provided the lookup is optional (a single audit log for both artifact types is operationally preferable). This is an architecture decision for Phase 4.

The existing `qdb_reportribbonplacement` can be extended with an optional `qdb_dashboardid` lookup to cover dashboard ribbon placements, avoiding a duplicate placement table.

---

## 8. Architecture and Effort Impact

### 8.1 Architecture Delta (Qualitative)

The Phase-3 architecture remains valid and unchanged for the report engine. The dashboard composer introduces a **parallel execution layer** above the existing engine components, not a replacement or modification of them.

The key architectural additions are:

**Dashboard Execution Service (new middle-tier service):** A `DashboardExecutionService` that accepts a dashboard definition and a runtime context, reads all widget bindings, fans out one `IReportDataProvider` call per widget (up to the parallelism limit), applies transformations, and returns a `WidgetResultSet` per widget. It reuses the existing `DataProviderFactory`, `TransformationPipeline`, `SecurityEnforcer`, and `CacheService` via their existing interfaces with zero modification.

**Widget Result Cache:** The `CacheService` already abstracts `ICacheStore` (Redis / SQL). Widget-level cache keys follow the same SHA-256 scheme as report cache keys: SHA-256(widgetId + sortedParamJson + roleSetHash). No change to the cache interface.

**Cross-Filter Execution Model:** Cross-filter is a client-side concern. The runtime viewer maintains a cross-filter map (`{entity|attribute: value}`). When the user clicks a chart segment, the viewer re-requests the affected widgets' data with the filter injected into the `parametersJson`. The server sees a normal per-widget execution request with an additional filter parameter; it does not need to understand cross-filter semantics.

**Dashboard Composer UI:** The dashboard composer is a new rendering path within the existing `qdb_rpt_designer.html` web resource. It uses the same React + Fluent UI stack, the same `Xrm.WebApi` calls for Dataverse reads/writes, and the same middle-tier entry point invocation pattern. Prototype routing (`state.view === "dashboardcomposer"`) maps directly to the production routing model.

**CRM Entry Points:** No change to the existing `qdb_RunReport` Custom Action / Custom API. A new `qdb_RunDashboard` Custom Action / Custom API follows the same thin-proxy pattern, forwarding to a new middle-tier endpoint `/api/v1/dashboards/{id}/run`. The async path (for heavy dashboards) reuses the existing `IJobOrchestrator`.

### 8.2 Incremental Effort Estimate

The following estimate covers only the delta above the approved 150–190 pd V1 estimate. It assumes the V1 engine (data providers, transformation pipeline, cache, middle-tier host, CRM entry points, security enforcer) is available as a dependency.

| Module | Est. person-days |
|---|---|
| Schema — 6 new tables (provisioning + solution) | 5 |
| Dashboard execution service (fan-out, per-widget cache, async path) | 12 |
| `qdb_RunDashboard` CRM entry point (on-prem + cloud) | 4 |
| Dashboard Composer UI — canvas, sections, placeholders, properties panel | 15 |
| Widget rendering (10 types, client-side + server-side chart PNG) | 12 |
| Undo/redo, duplicate, drag-to-auto-viz, field panel | 6 |
| Filter bar (slicers) + cross-filter viewer wiring | 6 |
| Dashboard gallery, lifecycle (draft/publish/version/clone/delete) | 6 |
| Dashboard RBAC + security enforcer extension | 4 |
| Dashboard ribbon placement + CRM context wiring | 3 |
| Dashboard audit + execution log | 3 |
| Report-side enhancements (chart layout, info cards, filter bar, templates, running totals) | 8 |
| GitHub research — client-side charting library | 1 |
| QA and test automation | 10 |
| **Total delta estimate** | **~95 pd** |

**Confidence band:** 80–110 person-days. The lower bound assumes the dashboard composer is built immediately after V1 M1 (when the data provider and transformation layers are proven). The upper bound reflects uncertainty in cross-filter UX complexity and the Matrix widget. If the Matrix widget is deferred (ADD-FR-026, Could Have), the estimate reduces by approximately 6–8 pd.

**V-assignment recommendation for this addendum's scope: V2** (see §10).

---

## 9. Risks and Open Questions

| ID | Risk / Question | Impact | Owner | Resolution needed by |
|---|---|---|---|---|
| ADD-R-1 | **Fan-out query storm**: a 12-widget Customer-360 dashboard fires up to 12 independent FetchXML / QueryExpression queries concurrently. Under peak load (multiple users opening dashboards simultaneously) this could saturate the CRM platform's API throttle. Mitigation: configurable parallelism limit (ADD-A-7); per-widget caching (ADD-FR-036); pre-warm cache on publish. | High | Architect | Architecture spike before Phase-4 dashboard build |
| ADD-R-2 | **PDPPL / data-residency for Customer-360 PII**: a Customer-360 dashboard aggregates personally identifiable data (customer name, CIF, loan amounts, facility status) across multiple entities. CEO condition C-2 (OQ-004) is still open. The dashboard composer must not be deployed to production until C-2 is resolved. | High | Compliance / Client | Before production deployment |
| ADD-R-3 | **RBAC granularity for per-widget entity access**: a widget bound to `qdb_facility` executes a query against that entity. If the running user does not have read access to `qdb_facility`, the widget should fail gracefully with a "no access" indicator — not return empty rows silently. The `SecurityEnforcer` must be extended to validate per-widget entity permissions, not just the dashboard-level run permission. | High | Architect | Phase-4 design |
| ADD-R-4 | **QDB data quality in the Customer-360**: the prototype demo surfaced known data quality issues — duplicate shareholders, shareholding percentages not summing to 100%, and over-limit facility lines. These are CRM data issues, not engine bugs. If the Customer-360 dashboard goes live before data is cleaned, it will expose these inconsistencies to relationship managers at scale. A data quality disclaimer banner and a data quality pre-requisite checklist are recommended. | Medium | Client / Data team | Before Customer-360 dashboard go-live |
| ADD-R-5 | **Client-side chart library licensing**: if a client-side charting library (e.g. Chart.js, ApexCharts) is used for interactive dashboard widget rendering, it must be MIT-licensed with 1000+ stars (constitution). GitHub research must be completed before any chart widget build begins. | Medium | github-researcher | Before Phase-4 frontend build |
| ADD-R-6 | **Matrix widget complexity**: the cross-tab Matrix widget (ADD-FR-026) requires a two-dimensional group-by query, which may require the `PreAggregated` or `CustomApi` query mechanism for large datasets. If aggregate caps are hit at both dimensions simultaneously, the fallback path is non-trivial. | Medium | Architect | Before Matrix widget build |
| ADD-R-7 | **Progressive loading UX and perceived performance**: a 12-widget dashboard that loads widgets independently can create a disorienting "spinner storm" — tiles popping in sequentially while the user watches. A loading skeleton (placeholder shimmer per tile) and a priority-order load strategy (above-the-fold widgets first) are needed. | Low–Medium | Frontend | Phase-4 design |
| ADD-R-8 | **Cross-filter interaction model on mobile / small screens**: the prototype assumes a desktop screen. Dashboard widgets on smaller viewports (tablets in branch context) will require a responsive collapse strategy (sections stack to single column; slicers collapse to a drawer). Not budgeted in the current estimate. | Low | Frontend | If mobile CRM is in scope for QDB |
| ADD-OQ-1 | **Dashboard-level governance**: should dashboards follow the same "governed / ungoverned" distinction as reports (approver ≠ author, BR-3 equivalent)? If yes, `qdb_dashboard.qdb_isgoverned` and an approver workflow are required before production publication. If no, a publish-without-approver model is acceptable. | Medium | CEO / Client | Phase-4 design |
| ADD-OQ-2 | **Dashboard export format**: should a published dashboard be exportable as a multi-page PDF (one page per section) or as individual widget PNG exports only? Full PDF export of a dashboard canvas requires QuestPDF to render a composite document from multiple widget outputs. The current estimate covers per-widget PNG; full PDF export is an additional ~5 pd. | Medium | CEO / Client | Phase-4 |
| ADD-OQ-3 | **Cross-filter scope**: the prototype cross-filters widgets that share the same entity. A more powerful model would cross-filter by a shared join key (e.g. clicking a branch in widget A filters all widgets bound to any entity that has a relationship to that branch). Should cross-filter scope be entity-exact or relationship-aware? Relationship-aware cross-filter increases complexity by approximately 10–15 pd. | Low | CEO / Client | Phase-4 |
| ADD-OQ-4 | **Undo/redo persistence**: the 60-step undo history is currently in-browser memory only. If the author closes and re-opens the composer, history is lost. Is persistent undo-history (across sessions) required, or is within-session undo sufficient? | Low | Client | Phase-4 |

---

## 10. BA Recommendation

### 10.1 Recommendation: Approve as a Dedicated V2 Increment

The BA recommends that the dashboard composer be **approved as a distinct V2 increment** ("V2-Dashboard"), not folded into V1, for the following reasons:

**Against folding into V1:**
1. CEO condition C-3 explicitly locked V1 scope to the BRD §13 MVP cut. Adding ~95 pd of new scope to V1 increases the V1 timeline from ~150–190 pd to ~245–285 pd — approximately a 60% increase. This undermines the phased-delivery risk-management rationale for the MVP cut.
2. The dashboard composer requires 6 new Dataverse entities not in the approved 18-table schema. Provisioning and testing these mid-V1 build increases schema and migration risk.
3. CEO condition C-2 (PDPPL / data-residency) is still open. The Customer-360 dashboard is the primary use case. Building it before C-2 is resolved creates a deployment blocker that would delay V1 go-live if they are coupled.

**In favour of V2 as an early, fast-follow increment:**
1. The prototype is stakeholder-validated and interaction-complete. The UX design risk is low. Most of the V2-Dashboard build effort is production hardening of demonstrated interactions.
2. The V1 engine components (data providers, transformation pipeline, middle tier, CRM entry points, cache, security enforcer) are the exact building blocks the dashboard composer reuses. V2-Dashboard can begin as soon as V1 M1 (V1 core) is complete — the teams can run in parallel if a separate frontend squad is available.
3. The DotNetReport comparison analysis (gap G-3) confirms a dashboard composer is a competitive necessity. Deferring it to V3 (as the original BRD had FR-075) is no longer appropriate given the validated prototype and the Customer-360 business need.
4. The ~95 pd delta estimate is proportionate: it is roughly the size of V1's designer + export modules combined, not a new programme.

### 10.2 Recommended V2-Dashboard Milestone Placement

The proposed V2-Dashboard milestone sits between V1 M2 and V1 M3 in the roadmap, running in parallel with SSRS migration activities:

| Milestone | Prerequisite | Scope |
|---|---|---|
| M0–M2 (V1) | — | Full V1 report engine as approved |
| M3 (V1) | M2 | SSRS inventory + simple-tier migration (can start in parallel) |
| M2.5 (V2-Dashboard) | M1 complete (data providers, transformation, CRM entry points available) | Dashboard composer + 6 new schema tables + report-side enhancements |
| M4 (V2) | M2, M2.5 | Multi-level drilldown, N:N, formulas, chart/card/master-detail layouts, external sources, cache V2 |

### 10.3 Pre-Conditions for CEO Approval of V2-Dashboard Build

Before V2-Dashboard build begins, the following must be in place:

1. CEO approves this addendum (ADD-001).
2. CEO condition C-2 (OQ-004 — data-residency / PDPPL) resolution is obtained, or a production deployment gate on C-2 is formally accepted.
3. GitHub research confirms a suitable MIT-licensed client-side chart library (ADD-A-4, ADD-R-5).
4. An architecture spike validates the fan-out query model against CRM throttle limits under realistic concurrency (ADD-R-1). Maximum 2 days; exit criteria: a 12-widget dashboard executes within a defined SLA on both targets without triggering CRM API throttle at the expected user concurrency.
5. ADD-OQ-1 (dashboard governance model) is answered by the client.

### 10.4 Items the CEO Need Not Resolve Now

- ADD-OQ-2 (dashboard export format) and ADD-OQ-3 (cross-filter scope) can be resolved in Phase 4 design without blocking V2-Dashboard approval.
- ADD-OQ-4 (undo/redo persistence) is a low-impact decision for Phase 4.

---

## 11. Traceability — Addendum Requirements to Business Objectives

| Business Objective (BRD §3) | Addendum requirements served |
|---|---|
| OBJ-1: ≥70% of new reports authored by power users, zero developer involvement | ADD-FR-001–009 (dashboard gallery + lifecycle), ADD-FR-028–034 (authoring tooling), ADD-FR-031 (drag-to-auto-viz) |
| OBJ-2: Median change lead time < 1 hour | ADD-FR-028 (undo/redo), ADD-FR-029–030 (duplicate), ADD-FR-032 (properties panel edit) |
| OBJ-4: In-context reporting from entity forms, grids, dashboards, sitemap | ADD-FR-042–046 (CRM ribbon placement, context-passing) |
| OBJ-5: 100% of production executions audit-logged; masking + access enforced | ADD-FR-008 (dashboard audit), ADD-FR-009 (RBAC), ADD-FR-040 (security enforcement), ADD-FR-041 (execution log) |
| OBJ-7: Cloud-ready; on-prem + cloud with no schema redesign | ADD-FR-003 (portable metadata), ADD-A-2 (reuse existing interfaces) |

New business objective introduced by this addendum:

| OBJ-8 | Enable business users to compose multi-entity Customer-360 dashboards without developer involvement, replacing manual Excel aggregation of CRM data across five or more entities | Measurable success: at least one Customer-360 dashboard live per major business unit within 6 months of V2-Dashboard delivery |

---

## 12. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | Pending | APPROVE / APPROVE-WITH-CONDITIONS / REJECT | |
| Requestor (BA) | Maqsad AI | Submitted | 2026-07-19 |

---

*This addendum requires CEO approval before any architecture, design, or build work begins on the dashboard composer. The approved Phase-3 architecture (V1 report engine) is not affected by this addendum and may proceed to Phase-4 build independently.*
