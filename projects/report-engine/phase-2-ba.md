# Business Requirements Document — Metadata-Driven Report Engine

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Project** | report-engine |
| **Document** | Phase 2 — Business Requirements Document (BRD) |
| **Version** | 1.0 |
| **Date** | 2026-07-07 |
| **Author** | BA (Maqsad AI) |
| **Status** | Draft — pending CEO approval (Phase 1 gate) |
| **Target platforms** | Dynamics 365 CRM on-premise 9.x **and** Dataverse cloud; future on-prem→cloud migration |

---

## 1. Executive Summary

The client operates ~300 operational and regulatory reports built in SQL Server Reporting Services (SSRS). Every new report and every change to an existing report requires a developer, creating a delivery bottleneck, a cost centre, and a dependency that slows the business. Approximately 90% of the underlying data resides in Dynamics 365 CRM / Dataverse; the remaining ~10% is sourced from Core Banking, MIS, external REST APIs, SQL databases, and middleware services.

This engagement will design and build a **metadata-driven Report Engine and configurable Report Designer**, delivered as a Dynamics CRM web resource, enabling business power users and system administrators to **create, modify, publish, and run reports without developer involvement for the majority of cases**. Report definitions are stored as configuration (metadata) in Dataverse rather than as compiled artefacts, so authoring and change become a configuration activity, not a development activity.

This is explicitly **not a report viewer**. It is a full authoring + execution platform: a designer surface, a metadata schema, a multi-source data-provider layer, filter/parameter/transformation/drilldown engines, a layout and export engine, ribbon integration, and a governance/security model — with a phased path to migrate the existing 300 SSRS reports.

---

## 2. Business Problem

| # | Problem | Impact |
|---|---|---|
| P-1 | Every report/report-change requires a developer | Delivery bottleneck; business waits on IT backlog |
| P-2 | ~300 SSRS reports are hand-built and hand-maintained | High maintenance cost; key-person risk; inconsistent style |
| P-3 | Report changes have long lead times | Business decisions delayed; shadow reporting in Excel |
| P-4 | ~10% of reporting needs cross-system data (Core Banking, MIS, SQL, APIs) | Manual data stitching; reconciliation errors |
| P-5 | No self-service authoring for power users | IT is a gatekeeper for trivial changes (a column, a filter) |
| P-6 | SSRS is a separate stack from CRM | Context switching; no in-context (record/grid) reporting |

---

## 3. Business Objectives & Success Criteria

| ID | Objective | Measurable success criterion (target for v1 + 12 months) |
|---|---|---|
| OBJ-1 | Remove developer dependency for most report authoring | ≥ 70% of **new** reports authored by power users/admins with **zero developer involvement** |
| OBJ-2 | Reduce report-change lead time | Median change lead time reduced from days to **< 1 hour** for config-only changes |
| OBJ-3 | Migrate the SSRS estate | ≥ 60% of the 300 SSRS reports (the "simple/medium" tier) migrated within the programme; remainder assessed |
| OBJ-4 | In-context reporting | Reports runnable from entity forms, grids, subgrids, dashboards and sitemap with automatic context passing |
| OBJ-5 | Governed self-service | 100% of production report executions are audit-logged; masking + data-source access control enforced on every run |
| OBJ-6 | Multi-source reporting | Power users can combine CRM data with at least one external source (staged) without code |
| OBJ-7 | Cloud-ready | Architecture supports on-prem 9.x today and Dataverse cloud with no schema redesign; migration path documented |

Success is measured through the Report Execution Log and Audit Log (built into the engine) plus a migration tracker maintained during rollout.

---

## 4. Stakeholders

| Stakeholder | Interest / role |
|---|---|
| Business power users | Primary authors — create/modify/run reports self-service |
| System administrators | Configure data sources, connectors, ribbon placement, security, publish |
| Report owners | Accountable for a report's correctness and lifecycle |
| Report approvers | Approve governed reports before they may run in production |
| IT / developers | Build/maintain the engine; handle the residual complex reports and connectors |
| Compliance / audit | Require audit trail, masking, access control, data residency assurance |
| Report consumers | Run and export reports; receive outputs |
| CRM platform team | Own the CRM/Dataverse environment, solutions, and security roles |
| Data owners (Core Banking, MIS, SQL) | Govern external-source access and credentials |

---

## 5. Scope

### 5.1 In scope
- Configurable Report Designer web resource (authoring surface) inside Dynamics CRM.
- Metadata schema in Dataverse for report definitions and all supporting configuration (18 table areas).
- Report execution engine (server-side) that reads metadata and produces results.
- Multi-source data provider layer (CRM + external), with a data-source abstraction.
- Filter, parameter, transformation, drilldown/relationship, layout, and export engines.
- Ribbon/button placement configuration and CRM context passing.
- Security, governance, versioning, publish/unpublish, clone, audit, execution history.
- Phased SSRS migration strategy and tooling to support inventory/classification.
- On-prem 9.x and Dataverse-cloud support with a documented migration path.

### 5.2 Out of scope (v1 — candidates for later releases)
- **Scheduled/automated report distribution** (email bursting, subscriptions) — *later release*.
- **Predictive / ML / AI-generated analytics** — out of scope for this programme.
- **Cross-tenant / external-portal report sharing** (anonymous public reports) — out of scope for v1.
- **Real-time streaming dashboards** (live auto-refresh sub-second) — out of scope; near-real-time via cache refresh only.
- **Ad-hoc write-back** from reports into CRM — out of scope (reports are read-only by design).
- **Pixel-perfect SSRS re-creation** of complex letter/document reports — v1 targets *functional* parity; pixel-perfect handled case-by-case (see OQ-009).
- **Replacing Power BI** for enterprise BI/semantic-model analytics — this engine targets operational/transactional reporting, not enterprise BI.

*(Final in/out decisions on several of these are CEO-gated — see §12 Open Questions.)*

---

## 6. Assumptions & Dependencies

| ID | Assumption / dependency |
|---|---|
| A-1 | The client can provide a full SSRS inventory (RDL files or catalogue export) for Phase 1 classification. |
| A-2 | External systems (Core Banking, MIS, SQL, middleware) expose reachable APIs/endpoints with documented contracts and can issue service credentials. |
| A-3 | A dual-target (on-prem 9.x + Dataverse cloud) build is required; the metadata schema must be portable across both. |
| A-4 | Power users receive training and a governance model is agreed before broad rollout. |
| A-5 | A middle-tier service (ASP.NET Core) can be hosted **if** required for heavy rendering/export and external calls (see OQ-001) — pending confirmation. |
| D-1 | Availability, latency, and credential-management for external sources are owned by the respective data owners. |
| D-2 | CRM/Dataverse security roles and business units already exist and are the basis for report RBAC. |
| D-3 | Export/rendering library choices depend on whether a middle tier is permitted (OQ-001), which is on the critical path. |

---

## 7. Functional Requirements

Priorities use MoSCoW: **M**ust / **S**hould / **C**ould / **W**on't-have-in-v1. "Release" indicates the recommended cut (V1 = MVP; V2/V3 = later releases).

### 7.1 Report Designer UI (FR-001 … FR-021)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-001 | Capture report header metadata: name, description, category, module, owner, status | M | V1 | Report cannot be saved without name, category, owner, status |
| FR-002 | Select a main (primary) entity for the report | M | V1 | Entity picker lists Dataverse entities the user can read |
| FR-003 | Select one or more data sources for the report | M | V1 | At least one source required; V1 supports CRM-native sources |
| FR-004 | Column selector: choose columns from the main entity and joined entities | M | V1 | Columns persist to metadata; ordering preserved |
| FR-005 | Related entity / drilldown selector | S | V1 (single level) / V2 (multi) | Single-level drill in V1; configurable depth in V2 |
| FR-006 | Filter designer (visual) | M | V1 | Filters map to §7.6 operators; preview reflects filters |
| FR-007 | Parameter designer (runtime prompts) | M | V1 | Parameters typed per §7.6; required/optional; default values |
| FR-008 | Sorting configuration (multi-column, asc/desc) | M | V1 | Sort order persisted and applied on execution |
| FR-009 | Grouping configuration | S | V1 | Group-by columns produce grouped output |
| FR-010 | Aggregation (count, sum, avg, min, max) | S | V1 | Aggregates computed per group and grand total |
| FR-011 | Formula / calculated fields | S | V2 | Expression evaluated per row; safe expression language (no code exec) |
| FR-012 | Conditional formatting rules | S | V2 | Rule = condition + style; applied in preview and export |
| FR-013 | Layout designer | S | V1 (tabular/grouped) / V2 (advanced) | See §7.8 layout types by release |
| FR-014 | Live preview panel | M | V1 | Preview runs against real/sample data with current config |
| FR-015 | Publish / unpublish a report | M | V1 | Only published reports are runnable by consumers (BR-1) |
| FR-016 | Version history | M | V1 | Each publish creates an immutable version snapshot |
| FR-017 | Clone report | S | V1 | Clone copies full definition to a new draft |
| FR-018 | Test execution (author test-run) | M | V1 | Author can execute a draft without publishing |
| FR-019 | Save draft without publishing | M | V1 | Draft state distinct from published state |
| FR-020 | Designer respects the author's CRM read permissions | M | V1 | Author cannot select entities/columns they cannot read |
| FR-021 | Fluent UI / Power Platform visual style | M | V1 | Designer matches Power Platform design language |

### 7.2 Configuration Tables / Metadata Schema (FR-022 … FR-024)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-022 | Persist all report configuration as Dataverse metadata across the 18 table areas (Report Definition, Version, Data Source, Entity Mapping, Column, Filter, Parameter, Relationship/Drilldown, Transformation, Formula, Layout, Export Setting, Ribbon Placement, Security, Execution Log, Audit Log, External Connector, Cache) | M | V1 (subset) / V2 (full) | Detailed schema (logical/display names, columns, types, relationships, required fields, option sets, indexes/alternate keys) delivered in Phase 3 |
| FR-023 | Every configuration entity carries created_by/created_on/modified_by/modified_on; all IDs are GUIDs | M | V1 | Enforced at schema level per enterprise rules |
| FR-024 | Report definitions are portable across on-prem and cloud (no environment-specific hardcoding) | M | V1 | No hardcoded GUIDs/URLs in a report definition; references resolved by logical name/alternate key |

### 7.3 Data Source Layer (FR-025 … FR-031)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-025 | Support CRM-native sources: CRM View, FetchXML, QueryExpression, Dataverse Web API | M | V1 | Each selectable as a source type; returns tabular result |
| FR-026 | Support Custom API / Plugin source (server-side custom query) | S | V2 | Registered custom operation returns a dataset |
| FR-027 | Support SQL source | C | V2 | Parameterised queries only (BR-8); read-only connection |
| FR-028 | Support External REST API source | C | V2 | Configurable endpoint, auth, response mapping |
| FR-029 | Support Middleware / Core Banking / MIS API sources | C | V3 | Via External Connector configuration |
| FR-030 | Support Static / manual dataset (for testing) | S | V1 | Author supplies inline sample rows |
| FR-031 | Combine multiple sources into one report (join/merge) | C | V2/V3 | Combined via defined join keys; see §7.5 and §7.7 |

### 7.4 FetchXML Limitation Handling (FR-032 … FR-035)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-032 | Provide a query abstraction that selects the right mechanism per need: FetchXML (simple), QueryExpression (SDK), Web API (flexible reads), Custom Plugin/Action (complex) | M | V1 | Engine chooses/uses the configured mechanism transparently to the author |
| FR-033 | Support pre-aggregated reporting tables where native query cannot aggregate efficiently | S | V2 | Aggregation table populated and queried by the engine |
| FR-034 | Support external staging/cache tables for cross-system data | S | V2/V3 | Staged data queried like a native source |
| FR-035 | Surface query limits gracefully (row caps, timeout, aggregation limits) to the author | M | V1 | Author sees a clear message, not a raw platform error |

### 7.5 Drilldown & Relationship Engine (FR-036 … FR-044)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-036 | Single-level drilldown (parent → child) | M | V1 | e.g. Customer → Applications |
| FR-037 | Configurable multi-level drilldown (e.g. Customer→Applications→Facilities→Collaterals→Documents→Tasks→Approvals) | S | V2 | Depth configurable; each level defined by relationship metadata |
| FR-038 | Support 1:N relationships | M | V1 | Uses CRM relationship metadata |
| FR-039 | Support N:1 relationships | M | V1 | Uses CRM relationship metadata |
| FR-040 | Support N:N relationships | C | V2 | Intersect entity handled by engine |
| FR-041 | Manual join mapping (define join keys where no relationship exists) | C | V2 | Author maps left/right keys |
| FR-042 | External key mapping (join CRM to external data by business key) | C | V3 | e.g. customer number → Core Banking |
| FR-043 | Sub-report drilldown (row opens a nested report) | S | V2 | Row action runs a child report with context |
| FR-044 | Clickable rows open the underlying CRM record | S | V1 | Row navigates to the record form (respecting security) |

### 7.6 Filter & Parameter Engine (FR-045 … FR-049)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-045 | Typed inputs: text, number, date range, lookup, option set, multi-select option set, boolean | M | V1 | Each renders the correct control at runtime |
| FR-046 | Context tokens: current user, current business unit, current record ID, current entity context | M | V1 | Resolved from CRM execution context at run time |
| FR-047 | Security-role-based filter (restrict data by the runner's role) | S | V2 | Filter applied server-side based on runner's roles |
| FR-048 | Operator set: equals, not equals, contains, begins with, ends with, >, <, between, in, not in, is null, is not null, last X days, this month, this year | M | V1 | Operators available per data type; relative-date operators resolved at run time |
| FR-049 | Advanced conditions (grouped AND/OR logic) | S | V2 | Nested condition groups supported |

### 7.7 Transformation Engine (FR-050 … FR-067)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-050 | Rename columns | M | V1 | Display name overrides source name |
| FR-051 | Lookup name resolution (GUID → display name) | M | V1 | Lookups show name, not GUID |
| FR-052 | Option set label resolution (value → label) | M | V1 | Option sets show label, localised |
| FR-053 | Currency formatting | M | V1 | Respects currency + precision |
| FR-054 | Date formatting | M | V1 | Configurable format + timezone handling |
| FR-055 | Number formatting | M | V1 | Precision, thousands separators |
| FR-056 | Null handling (default/placeholder values) | M | V1 | Configurable null display |
| FR-057 | Conditional values (if/then value mapping) | S | V2 | Rule-based value substitution |
| FR-058 | Value mapping (code → friendly value) | S | V2 | Lookup map applied |
| FR-059 | Aggregation (within transform) | S | V1 | Sum/avg/count/min/max |
| FR-060 | Grouping (within transform) | S | V1 | Group rows by key |
| FR-061 | Merge columns | C | V2 | Concatenate with separator |
| FR-062 | Split values | C | V2 | Split one column into many |
| FR-063 | Pivoting | C | V3 | Rows → columns |
| FR-064 | JSON flattening (external payloads) | C | V3 | Nested JSON → tabular |
| FR-065 | External data mapping (map external fields to columns) | C | V3 | Field map per connector |
| FR-066 | Data masking (sensitive fields) | M | V1 | Masked pre-render and pre-export (BR-5) |
| FR-067 | Formula fields (calculated) | S | V2 | Safe expression evaluation (no arbitrary code) |

### 7.8 Layout & Output Designer (FR-068 … FR-080)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-068 | Table (tabular) layout | M | V1 | Columns render as a grid |
| FR-069 | Grouped layout | S | V1 | Group headers + section breaks |
| FR-070 | Summary layout | S | V1 | Aggregates only |
| FR-071 | Card / KPI layout | C | V2 | Metric tiles |
| FR-072 | Master-detail layout | C | V2 | Header record + detail rows |
| FR-073 | Drilldown layout | S | V2 | Expandable levels |
| FR-074 | Letter / document-style layout | C | V3 | Free-form document; see OQ-009 |
| FR-075 | Dashboard-style layout | C | V3 | Multiple panels on one canvas |
| FR-076 | Chart-based layout | C | V2 | Bar/line/pie from aggregated data |
| FR-077 | Layout chrome: header, footer, logo, page number, generated date, generated-by user, watermark | S | V1 (basic) / V2 (full) | Configurable per report |
| FR-078 | Group headers, totals, subtotals, page breaks | S | V1/V2 | Applied in preview and export |
| FR-079 | Column width, alignment, font size | S | V1 | Per-column style persisted |
| FR-080 | Conditional formatting in layout | S | V2 | Style driven by row/cell condition |

### 7.9 Export Engine (FR-081 … FR-088)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-081 | Export to PDF | M | V1 | Layout-faithful PDF |
| FR-082 | Export to Excel | M | V1 | Native .xlsx with typed cells |
| FR-083 | Export to CSV | M | V1 | RFC-4180 CSV |
| FR-084 | Export to Word | M | V1 | .docx (document/letter reports) — *pulled into V1 per OQ-005 resolution* |
| FR-085 | Export to HTML | S | V1 | Standalone HTML |
| FR-086 | Export to Image / PNG | M | V1 | Chart/card export as image — *pulled into V1 per OQ-005 resolution* |
| FR-087 | Print preview | S | V1 | Print-ready rendered view |
| FR-088 | Export honours masking + access control | M | V1 | Masked/authorised data only (BR-5, BR-6) |

### 7.10 Ribbon / Button Placement (FR-089 … FR-096)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-089 | Configure placement: entity form ribbon, home-grid ribbon, subgrid ribbon, dashboard button, sitemap page | S | V1 (form + grid) / V2 (rest) | Admin configures without code |
| FR-090 | Scope placement to specific form / entity / security role / business unit | S | V2 | Placement rules honoured |
| FR-091 | Pass context: current entity name | M | V1 | Available to the report at run time |
| FR-092 | Pass context: current record ID | M | V1 | Report filters by the record |
| FR-093 | Pass context: selected grid records | S | V2 | Multi-select passed as an id list |
| FR-094 | Pass context: current user | M | V1 | Resolved from execution context |
| FR-095 | Pass context: current business unit | M | V1 | Resolved from execution context |
| FR-096 | Report launches in-context from the placement without leaving CRM | M | V1 | Opens in a dialog/page within CRM |

### 7.11 Security & Governance (FR-097 … FR-107)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-097 | Role-based access to reports (who can see/run) | M | V1 | Report visibility bound to CRM roles |
| FR-098 | Report owner assignment | M | V1 | Owner recorded and enforced |
| FR-099 | Report approver + approval before production run | S | V2 | Approver ≠ author for governed reports (BR-3) |
| FR-100 | Draft / published status lifecycle | M | V1 | Only published runs in production (BR-1) |
| FR-101 | Version control with rollback | M | V1 | Any prior published version can be restored |
| FR-102 | Execution permission (who can run) | M | V1 | Separate from authoring permission |
| FR-103 | Export permission (who can export) | S | V1 | Separate from run permission |
| FR-104 | Sensitive-field masking configuration | M | V1 | Fields flagged; masked on render/export |
| FR-105 | Audit log (append-only) of report changes | M | V1 | No update/delete on audit rows (BR-4) |
| FR-106 | Execution history (who ran what, when, with which params) | M | V1 | Logged per execution |
| FR-107 | Data-source access control (per source, per role) | S | V2 | A user cannot run a source they cannot access (BR-7) |

### 7.12 Runtime Architecture Capabilities (FR-108 … FR-113)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-108 | Server-side execution engine reads metadata and produces results | M | V1 | Designer holds no business logic that the engine needs to re-run |
| FR-109 | Cache layer for expensive/repeated executions | S | V2 | Cache keyed by report+params+identity; TTL configurable |
| FR-110 | External connector layer (pluggable sources) | C | V2/V3 | New connector added by configuration + registration |
| FR-111 | Logging & monitoring of executions and failures | M | V1 | Failures captured with correlation id |
| FR-112 | Support Dynamics 365 on-prem 9.x | M | V1 | Runs on-prem |
| FR-113 | Support Dataverse cloud; documented on-prem→cloud migration path | M | V1 (cloud parity) | Same metadata runs on cloud; migration guide delivered |

### 7.13 SSRS Migration Support (FR-114 … FR-117)

| ID | Requirement | Priority | Release | Acceptance criteria |
|---|---|---|---|---|
| FR-114 | Inventory tooling/template to catalogue the 300 SSRS reports | M | V1 | Inventory sheet with metadata per report |
| FR-115 | Complexity-classification model (simple/medium/complex) | M | V1 | Each report classified with rationale |
| FR-116 | Migration tracker (status per report) | S | V1 | Tracks migrated / in-progress / deferred |
| FR-117 | Parity checklist per migrated report (functional sign-off) | S | V2 | Business owner signs off parity |

---

## 8. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-001 | Performance | Interactive reports return first page within target (e.g. ≤ 10s for typical CRM datasets); large sets paginated/streamed. |
| NFR-002 | Performance | Heavy queries and rendering must not violate the CRM plugin execution ceiling (~2 minutes); long work handed to async/middle tier (OQ-001, OQ-002). |
| NFR-003 | Scalability | Engine handles the concurrent execution load of the report estate without degrading CRM interactive performance. |
| NFR-004 | Result-set limits | Enforce configurable row caps and export size limits; warn before runaway queries. |
| NFR-005 | Security | All access enforced server-side against CRM security; the designer's client-side checks are convenience only. |
| NFR-006 | Security | No secrets/credentials in source, logs, or metadata in plaintext; external credentials stored in a secret store. |
| NFR-007 | Data residency | Cached/staged data respects the client's data-residency requirements (OQ-004). |
| NFR-008 | Availability | Engine availability aligned to CRM platform availability; external-source failures degrade gracefully (partial results flagged). |
| NFR-009 | Maintainability | Clean-code standards enforced; files ≤ 400 lines typical; no god classes; DI throughout. |
| NFR-010 | Accessibility | Designer meets WCAG 2.1 AA via Fluent UI; keyboard-navigable. |
| NFR-011 | On-prem/cloud parity | A report definition authored on one target runs unchanged on the other, save for connector configuration. |
| NFR-012 | Localization | Option set labels, dates, currencies, and numbers render per user locale; RTL support where the client requires (OQ-010). |
| NFR-013 | Auditability | Audit and execution logs are append-only and retained per the client's retention policy (OQ-004). |
| NFR-014 | Observability | Structured logging with correlation ids; execution metrics queryable. |
| NFR-015 | Portability | No hardcoded GUIDs/URLs/thresholds/business rules in engine or metadata. |
| NFR-016 | Extensibility | New data-source types and export formats added without modifying the core engine (Open/Closed). |

---

## 9. Business Rules

| ID | Rule |
|---|---|
| BR-1 | Only **published** reports may be executed by consumers in production; drafts are author-test-only. |
| BR-2 | Every published version is an **immutable snapshot**; edits create a new version. |
| BR-3 | For **governed** reports, the approver must be different from the author (segregation of duties). |
| BR-4 | Audit log tables are **append-only** — no UPDATE or DELETE of audit records. |
| BR-5 | Sensitive-field **masking is enforced before rendering and before export** — never rely on the client to mask. |
| BR-6 | No report may return or export data the runner is **not authorised** to see (server-side enforcement). |
| BR-7 | A report cannot execute a **data source the runner cannot access**. |
| BR-8 | External/SQL queries use **parameterised** queries only — no string concatenation. |
| BR-9 | Report definitions contain **no hardcoded environment identifiers** (GUIDs/URLs) — references resolve by logical name/alternate key. |
| BR-10 | Every configuration record carries created/modified by/on; all primary keys are GUIDs. |
| BR-11 | Execution of every production report is **logged** (who, when, params, source, row count, outcome). |

---

## 10. Data & Integration Requirements

- **Source types (11):** CRM View, FetchXML, QueryExpression, Dataverse Web API, Custom API/Plugin, SQL, External REST API, Middleware API, Core Banking API, MIS API, Static/manual dataset.
- **Combination:** the engine must be able to select one or more sources and combine them by defined join/business keys (later releases for external combination).
- **Staging/cache:** cross-system and pre-aggregated data may be staged in Dataverse or a cache layer to keep interactive queries within platform limits.
- **Credentials:** external-source credentials are managed in a secret store (Azure Key Vault / on-prem equivalent), never in metadata; access is per-connector and audited.
- **Contracts:** each external connector has a documented request/response contract and a field map to report columns.

---

## 11. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **CRM 2-minute plugin ceiling** cannot accommodate heavy multi-source queries + PDF/Word rendering, especially on-prem | High | High | Introduce an async/middle-tier execution path for heavy work; keep interactive plugin work light; stage/cache expensive data (drives OQ-001/OQ-002). |
| R-2 | **FetchXML limitations** (aggregation caps, no true joins across unrelated entities, paging) block complex reports | High | Med | Query abstraction (FR-032) selects QueryExpression/Web API/Custom API/pre-agg tables as needed. |
| R-3 | **External API latency / availability** degrades report runs | Med | Med | Async staging + cache; partial-result flagging; per-source timeouts; circuit-breaker on connectors. |
| R-4 | **On-prem vs cloud export-library divergence** (rendering/export libs differ across targets) | Med | Med | Abstract export behind an interface; select implementation per target; validate parity early (spike). |
| R-5 | **Security of external credentials** | Med | High | Secret store, no plaintext, per-connector RBAC, audit; principle of least privilege. |
| R-6 | **Scope: replacing 300 reports** is a large programme; scope creep | High | High | MoSCoW MVP cut (§13); phased migration; classify-then-migrate; defer complex/pixel-perfect reports. |
| R-7 | **Power-user misuse** producing runaway/expensive queries | Med | Med | Row caps, timeouts, cost guards, published-only execution, monitoring/kill-switch. |
| R-8 | **Pixel-perfect SSRS parity** expectation for regulatory letters | Med | High | Set expectation of functional parity in v1; treat pixel-perfect letters as a specialised later track (OQ-009). |
| R-9 | **Expression/formula engine** becomes a code-execution vector | Low | High | Use a sandboxed, non-Turing-complete expression evaluator; no arbitrary code (FR-011/FR-067). |
| R-10 | **Data residency** for staged/cached external data | Med | High | Residency-aware cache placement; document per OQ-004. |

---

## 12. Open Questions

**Legend:** 🚦 = BRD-gating (CEO must resolve before architecture may begin). ⚙️ = Architecture-phase (resolve during Phase 3).

| ID | Question | Type | Resolution |
|---|---|---|---|
| OQ-001 | Is a **middle-tier service (ASP.NET Core, on-prem and/or Azure) permitted**? This is the single most architecture-shaping decision. | 🚦 | ✅ **RESOLVED 2026-07-07: YES** — a middle-tier ASP.NET Core service is permitted (on-prem and/or Azure). Heavy rendering, external connectors, async jobs, and caching live in the middle tier. |
| OQ-002 | For external-source and heavy queries, may execution be **asynchronous/staged** (job + cache), or is **synchronous, in-request** execution mandatory? | 🚦 | ✅ **RESOLVED 2026-07-07: ASYNC/STAGED ALLOWED** — heavy/external reports run as background jobs with a cache; interactive CRM reports remain synchronous. |
| OQ-005 | Which **export formats are must-have for v1**? | 🚦 | ✅ **RESOLVED 2026-07-07: PDF + Excel + CSV + Word + Image all in V1** — client pulled Word (.docx) and Image/PNG into the V1 must-have set (feasible via the middle tier). Only HTML/print-preview remain "should". |
| OQ-009 | For **letter/document-style regulatory reports**, is **functional parity** acceptable for v1, or is pixel-perfect mandatory? | 🚦 | ✅ **RESOLVED 2026-07-07: FUNCTIONAL PARITY for V1** — pixel-perfect regulatory letters handled case-by-case in a later specialised track. |
| OQ-003 | Exact **CRM on-prem 9.x build/version** and whether an outbound network path exists from the CRM tier to external systems (or only from a middle tier). | 🚦 | ⏳ OPEN — CEO condition C-1. Answer during discovery; middle tier now owns outbound calls, reducing urgency but still needed for connectivity design. |
| OQ-004 | **Data-residency and audit-retention** requirements for cached/staged external data and audit/execution logs. | 🚦 | ⏳ OPEN — CEO condition C-2. Required before external-data (V2) and before cache placement is finalised. |
| OQ-006 | Are **N:N relationships and unlimited-depth drilldown** required in v1, or acceptable in a later release? | 🚦 | ➡️ DEFERRED to V2 by MVP recommendation (BA); confirm at CEO gate. |
| OQ-007 | Which **external sources are in scope for the first external-data release** (Core Banking, MIS, SQL, generic REST) and in what priority? | ⚙️ | Architecture-phase. |
| OQ-008 | Is a **single new Dataverse solution + `qdb_`-style publisher prefix** to be used, and what is the solution/prefix name? | ⚙️ | Architecture-phase. |
| OQ-010 | Is **Arabic / RTL** localization required for report output and the designer in this programme? | ⚙️ | Architecture-phase. |
| OQ-011 | What is the **expected concurrency / peak** (reports/hour, largest result set) to size performance and caching? | ⚙️ | Architecture-phase. |
| OQ-012 | Governance model: which report categories are **"governed"** (require approver) vs **self-service** (no approval)? | ⚙️ | Architecture-phase. |

---

## 13. MoSCoW Summary & Recommended MVP (V1) Cut

Given the size of the request, delivering everything at once is high-risk. The recommended phased cut:

### V1 — MVP (prove self-service on CRM data end-to-end)
- **Sources:** CRM-native only (CRM View, FetchXML, QueryExpression, Web API) + static dataset for testing.
- **Designer:** header metadata, main entity, column selector, filter designer, parameter designer, sort, group, basic aggregation, live preview, test-run, publish/unpublish, version history, clone.
- **Query abstraction:** FetchXML/QueryExpression/Web API selection with graceful limit handling.
- **Drilldown:** single-level; clickable rows open records.
- **Filters/params:** all typed inputs + full operator set + context tokens (user/BU/record/entity).
- **Transformations:** rename, lookup/option-set resolution, currency/date/number formatting, null handling, masking, basic aggregation/grouping.
- **Layouts:** table, grouped, summary; basic header/footer/branding; column width/alignment/font.
- **Export:** PDF, Excel, CSV, Word (.docx), Image/PNG, HTML, print preview *(Word + Image pulled into V1 per OQ-005 resolution — feasible via the middle tier)*.
- **Ribbon:** form + home-grid placement with context passing.
- **Security/governance:** RBAC, owner, draft/published, version rollback, execution + export permission, masking, append-only audit, execution history.
- **Migration:** inventory + complexity-classification tooling; migrate the "simple" SSRS tier.

### V2 — Extend (power features + first external data)
Multi-level configurable drilldown, N:N, manual joins, sub-reports; formula/calculated fields; conditional formatting; card/KPI, master-detail, chart layouts; Word/PNG export; Custom API/SQL/REST sources; cache layer; approver workflow; data-source access control; security-role-based filters; advanced conditions; pivot/merge/split (partial).

### V3 — Complete (full external ecosystem + advanced layouts)
Core Banking/MIS/middleware connectors; external key mapping + cross-source combination; JSON flattening; pivoting; dashboard and letter/document layouts; external staging pipelines; migrate the "complex" SSRS tier.

### Priority counts (indicative)
- **Must (M):** ~40 FRs — the V1 backbone.
- **Should (S):** ~30 FRs — mostly V1/V2.
- **Could (C):** ~17 FRs — V2/V3.
- Total functional requirements: **117 FR**, **16 NFR**, **11 BR**, **12 OQ**.

---

## 14. Phased Delivery — Mapping the Client's 11-Phase SSRS Plan to Maqsad AI Engagement Phases

| Client migration phase | Maqsad AI activity |
|---|---|
| 1. Inventory 300 SSRS reports | Discovery (parallel to this BRD); FR-114 tooling |
| 2. Classify by complexity | FR-115 classification model |
| 3. Build core metadata schema | Phase 3 Architecture → Phase 4 build (schema) |
| 4. Simple tabular designer | V1 build |
| 5. Filters + export | V1 build |
| 6. Drilldown + external data | V1 (single-level drill) → V2 (external) |
| 7. Transformation engine | V1 (core) → V2/V3 (advanced) |
| 8. Layout designer | V1 (tabular/grouped) → V2/V3 (advanced) |
| 9. Migrate simple reports | End of V1 |
| 10. Migrate complex reports | V3 |
| 11. Governance, training, rollout | Cross-cutting; formalised at each release |

---

## 15. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO (Phase 1 gate) | _pending_ | _Approve / Approve-with-conditions / Reject_ | |

**This BRD requires CEO approval before Phase 3 (Architecture) may begin. The 🚦 open questions (OQ-001, OQ-002, OQ-003, OQ-004, OQ-005, OQ-006, OQ-009) should be resolved or explicitly deferred-with-assumption as part of that approval.**
