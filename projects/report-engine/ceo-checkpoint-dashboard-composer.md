# CEO Checkpoint — Dashboard Composer Scope Addendum
# RPT-ENG-001 · Metadata-Driven Report Engine

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Document** | CEO Mid-Project Scope Checkpoint |
| **Addendum reviewed** | `scope-addendum-dashboard-composer.md` (ADD-001, v1.0) |
| **Phase 1 reference** | `phase-1-ceo.md` (approved 2026-07-07) |
| **BRD reference** | `phase-2-ba.md` (BRD v1.0, approved 2026-07-07) |
| **Decision date** | 2026-07-19 |
| **Decision authority** | CEO (Maqsad AI) |

---

## Decision: APPROVED WITH CONDITIONS — as a Distinct V2-Dashboard Increment

The Dashboard Composer and Business-User Authoring Tooling (ADD-001) are approved to plan, scope, and design — but **not yet to build** — as a standalone fast-follow increment designated **V2-Dashboard (milestone M2.5)**. This addendum is explicitly **not folded into V1**. The approved V1 scope remains locked per condition C-3.

---

## Rationale

### Why approve at all

The Customer-360 use case is not a cosmetic feature request. Relationship managers aggregating loan application counts, facility utilisation, branch concentration, and SLA status across five or more CRM entities today do that work manually in Excel. The Dashboard Composer eliminates that manual step and delivers the QDB RM productivity narrative that is one of the three headline business outcomes we sold on this engagement. Deferring this to V3 — as the original BRD had FR-075 — is no longer credible given that a stakeholder-validated prototype exists. The business will not wait for a V3.

The BA's analysis confirms that the prototype interaction model is validated. The UX design risk is low. The build effort — 80 to 110 person-days — is proportionate: it is roughly the size of V1's designer and export modules combined, not a new programme. The reuse of existing interfaces (IReportDataProvider, ITransformationPipeline, ICacheStore, SecurityEnforcer) is credible. I accept the estimate with the caveat that the fan-out model must be validated by a spike before the estimate is treated as a commitment.

### Why not fold into V1

Three reasons, all non-negotiable.

First, C-3 of my Phase-1 approval explicitly locked V1 scope to the BRD §13 MVP cut. Absorbing 95 pd of new scope into V1 increases the programme by 60 percent. That is not a scope adjustment; it is a new programme layered onto an in-flight one. The phased-delivery risk-management rationale for the MVP cut was precisely to avoid this.

Second, the Customer-360 dashboard — the primary use case and the commercial justification for this addendum — aggregates personally identifiable data across multiple CRM entities. CEO condition C-2 (data-residency and PDPPL retention requirements) is still open. If the dashboard composer is coupled to V1, the open C-2 condition becomes a V1 go-live blocker. That is an unacceptable risk to the critical path.

Third, the +6 Dataverse tables (qdb_dashboard through qdb_dashboardexecutionlog) provisioned mid-V1 build introduce schema and migration complexity into a build that has its hands full with the existing 18-table schema. Schema additions mid-build are a risk multiplier.

### Why not defer to V3

The competitive and strategic case has changed since BRD sign-off. The dotnetreport gap analysis (gap G-3) confirms a dashboard composer is a competitive necessity, not a nice-to-have. The prototype has been shown to QDB stakeholders. Relationship managers now expect it. Putting it on a V3 roadmap that may be 18 months away is not a credible answer to a validated stakeholder expectation.

---

## Authorised Scope for V2-Dashboard

The following scope is authorised for V2-Dashboard. Any capability not listed here requires a further change request.

**Dashboard artifact management:**
Standalone Dashboards gallery with draft/published lifecycle, versioning (immutable publish snapshots), clone, soft-delete, and append-only audit log. ADD-FR-001 through ADD-FR-009, all priorities.

**Composer canvas and sections:**
Section-based 1-to-4 column grid canvas; add, duplicate, reorder, and delete sections; empty-cell add-widget placeholders; friendly field panel with business display names and type chips. ADD-FR-010 through ADD-FR-016.

**Widget types:**
Must Have and Should Have widget types: Metric, Gauge, Status Badge, Chart (6 types), Info Cards, Profile, Checklist, and Table. ADD-FR-018 through ADD-FR-025 and ADD-FR-027.
The Matrix (cross-tab) widget ADD-FR-026 is authorised as a Could Have and must not be built if it creates timeline risk. The architect will assess Matrix feasibility during Phase 4 design and escalate to me if it threatens the milestone. Matrix may slip to V2.1 without a further CEO decision.

**Per-tile independent data binding:**
ADD-FR-017. This is the core architectural distinction and is non-negotiable.

**Authoring tooling:**
Undo and redo (minimum 30 steps, in-browser memory per session — persistent history is not in scope); duplicate widget; duplicate section; drag-to-auto-viz (Should Have); properties panel edit without leaving canvas; live preview mode. ADD-FR-028 through ADD-FR-033.

**Filter bar and cross-filter:**
Interactive filter bar with slicers in authoring mode; click-to-cross-filter in preview and runtime (entity-exact scope only — relationship-aware cross-filter is not in scope). ADD-FR-034 and ADD-FR-038 through ADD-FR-039.

**Fan-out execution service:**
Configurable parallelism (default 6, environment variable, not hardcoded); per-widget cache keying; progressive widget loading with per-tile spinner or skeleton; async path via existing IJobOrchestrator for heavy dashboards. ADD-FR-035 through ADD-FR-037.

**Security and governance:**
Dashboard-level RBAC (view, run, edit, export), enforced server-side. Per-widget entity permission check: if the running user lacks read access to a widget's bound entity, that widget fails gracefully with a visible "no access" indicator rather than silently returning empty rows. This is a hard requirement, not a Should Have. ADD-FR-009 and ADD-FR-040.

**Execution audit log:**
Append-only log of every dashboard run with per-widget outcome and row count. ADD-FR-041.

**CRM placement and context:**
Dashboard ribbon placement reusing qdb_reportribbonplacement (with nullable qdb_dashboardid extension); context-passing from CRM entity form (recordId + entityName) to filter widgets with a matching entity binding. ADD-FR-042 through ADD-FR-043 and ADD-FR-046.
Grid-selection context-passing (ADD-FR-045) is authorised as Should Have; may slip to V2.1 without a further CEO decision.
Customer profile header banner (ADD-FR-044) is authorised as Should Have.

**Report-side enhancements:**
Chart Report layout with 6 chart types (promotes FR-076 from V2); click-to-drill on chart segments (extends FR-036); filter/parameter bar on report runtime view (ADD-FR-049). These are Should Have.
Info Cards report layout (ADD-FR-050), Workflow History template (ADD-FR-051), and SLA Compliance template (ADD-FR-052) are authorised as Could Have and may slip to V2.1.
Running totals and percentage-of-total presets (ADD-FR-053) are authorised as Should Have.

**Schema:**
Six new Dataverse tables (qdb_dashboard, qdb_dashboardversion, qdb_dashboardsection, qdb_dashboardwidget, qdb_dashboardsecurity, qdb_dashboardexecutionlog), extending the schema to 24 tables within the existing QdbReportEngine solution. The existing qdb_reportauditlog may be extended with a nullable qdb_dashboardid lookup rather than a second audit table — this is an architecture decision for Phase 4, subject to the architect's recommendation.

---

## Scope Excluded from V2-Dashboard

The following are explicitly excluded and must not be built under this addendum without a further change request:

- Real-time or streaming dashboards (auto-refresh below the existing cache TTL floor)
- Write-back from any dashboard widget into CRM
- Scheduled dashboard delivery (email/PDF snapshots on a cron) — deferred to the V2/V3 scheduling track (BRD gap G-1)
- AI natural-language widget creation — deferred (BRD gap G-2)
- Embedded external BI (Power BI, Tableau)
- Public or anonymous dashboard sharing
- Cross-tenant dashboard sharing
- Full PDF export of the complete dashboard canvas — per-widget PNG export using existing ScottPlot infrastructure is in scope; compositing a multi-page PDF of the full canvas is not
- Relationship-aware cross-filter (ADD-OQ-3) — entity-exact cross-filter is in scope; relationship-aware is not, and would require a separate change request and approximately 10 to 15 additional person-days
- Persistent undo history across sessions (ADD-OQ-4) — within-session only

---

## Conditions of Approval

These conditions must be satisfied in the sequence specified. V2-Dashboard Phase-4 build does not begin until all pre-build conditions are cleared.

### Pre-build conditions (must be cleared before Phase-4 build authorisation for V2-Dashboard)

**DC-1 — Fan-out architecture spike (hard gate).**
A time-boxed architecture spike of maximum 2 person-days must be completed before any V2-Dashboard build begins. Exit criteria: a 12-widget test dashboard executes within a defined per-widget SLA on both on-prem and cloud targets at the expected peak user concurrency without triggering CRM API throttle. The architect must produce written exit criteria and spike results. If the spike fails, the fan-out model must be revised before the build begins. This is not optional.

**DC-2 — C-2 (PDPPL data-residency) production gate formalised.**
The original Phase-1 condition C-2 (OQ-004) remains open. Before V2-Dashboard build begins, the client must formally accept in writing that: (a) the Customer-360 dashboard will not be deployed to production until C-2 is resolved, and (b) development and staging may proceed on the stated assumption that data-residency requirements will be met by the approved middle-tier architecture. A production deployment gate on C-2 is mandatory and non-waivable. If QDB data governance does not eventually satisfy C-2, the Customer-360 dashboard cannot go live regardless of build completion.

**DC-3 — GitHub research: client-side charting library.**
Before any chart widget frontend build begins, the github-researcher agent must confirm a suitable MIT-licensed client-side charting library with 1000-plus stars (per the technology constitution). The selected library must be documented in projects/report-engine/dependencies.md with repo URL, version, stars count, license, and rationale. ScottPlot remains the server-side chart renderer for PNG export.

**DC-4 — Dashboard governance model answered by client (ADD-OQ-1).**
The client must answer whether dashboards follow the same governed/ungoverned distinction as reports (approver distinct from author, maker-checker publish). This determines whether qdb_dashboard.qdb_isgoverned and a governance workflow are required. A default assumption (dashboards are ungoverned by default, governance optional per dashboard) is acceptable if the client does not respond within 5 business days, but I must be informed of the assumption before it is baked into the schema.

### Production deployment conditions (permanent, non-waivable)

**DC-5 — C-2 (PDPPL) resolved before any Customer-360 dashboard is promoted to production.**
This is a restatement of C-2 from Phase-1 as a hard gate specific to the dashboard composer. No dashboard that aggregates customer-level PII (account name, CIF, loan amounts, facility status, ownership data) may be deployed to the QDB production environment until written data-residency and PDPPL compliance sign-off is obtained from the appropriate compliance authority.

**DC-6 — Data quality disclaimer in the Customer-360 dashboard header.**
Given the prototype-observed data quality issues (duplicate shareholders, shareholding percentages not summing to 100%, over-limit facility lines), the Customer-360 dashboard must display a prominent disclaimer banner advising relationship managers that data accuracy reflects the underlying CRM records. The banner must link to the QDB data quality remediation process or contact. This is a non-negotiable go-live requirement for the Customer-360 template.

**DC-7 — Per-widget entity permission enforcement verified by QA.**
The Security Enforcer's per-widget entity permission check (see Authorised Scope above) must be verified by a dedicated QA test scenario: a user with dashboard-run permission but without CRM read access to a widget's bound entity must see a "no access" indicator for that widget and must not receive any data from it. This must be a passing automated test before the dashboard goes to production.

---

## V1 Critical Path Protection

V2-Dashboard has no authority to touch the V1 build, schema, or delivery timeline.

V2-Dashboard build may begin only after V1 M1 is complete — meaning the data providers, transformation pipeline, CRM entry points, cache service, and security enforcer are built, tested, and available as interfaces. Until that point, the V2-Dashboard effort is limited to: architecture spike (DC-1), GitHub research (DC-3), schema design for the 6 new tables, and client-side prototyping. These activities must not require any V1 developer allocation.

If V1 M1 slips, V2-Dashboard start date slips with it. The V1 go-live date is not adjusted to accommodate V2-Dashboard.

If a separate frontend squad is available at QDB, the dashboard composer UI can begin in parallel with V1 M2 (designer + export modules). In that case, the dashboard team consumes the V1 interfaces as contracts (TypeScript interfaces and API contracts), not as running implementations. Interface breaking changes must be communicated to the dashboard team immediately.

---

## Sequencing

| Milestone | Prerequisite | Status |
|---|---|---|
| M0 — Schema provisioning | — | V1 (approved) |
| M1 — Core engine: data providers, transformation, cache, security | M0 | V1 (approved) |
| M2 — Report Designer: authoring surface, layout engine, export | M1 | V1 (approved) |
| M3 — SSRS migration: inventory, classification, simple-tier migration | M2 | V1 (approved) |
| M2.5 — Dashboard Composer (this addendum) | M1 complete; DC-1 through DC-4 cleared | V2-Dashboard (this approval) |
| M4 — Multi-level drilldown, N:N, formula engine V2, external sources, cache V2 | M2, M2.5 | V2 (not yet authorised) |

M2.5 runs in parallel with M3 (SSRS migration) if and only if M1 is complete and all pre-build conditions in this document are cleared. M2.5 does not block M3.

---

## Success Criteria for V2-Dashboard

These are the measurable outcomes I will judge V2-Dashboard delivery against at Phase-7 CEO final decision.

1. A relationship manager can open a published Customer-360 dashboard from an Account form in CRM, see all widgets load progressively, and apply a cross-filter by clicking a chart segment — with no developer involvement and no manual Excel aggregation step.
2. At least one Customer-360 dashboard template is live and in active use by at least one major business unit within 6 months of V2-Dashboard delivery.
3. A power user can compose a new dashboard (add sections, add widgets, configure data binding, publish) in under 30 minutes without developer assistance.
4. Every dashboard execution is audit-logged with the identity of the running user, the dashboard run, and per-widget outcome. Audit log is append-only and satisfies the same retention standards as the report audit log.
5. A user without CRM read access to a widget's bound entity sees a "no access" indicator for that widget and receives no data from it. This is validated by an automated QA test.
6. The fan-out execution model does not cause CRM API throttle events under a load of at least 10 simultaneous dashboard opens on a 12-widget dashboard. Validated by the DC-1 spike and confirmed by QA load testing.
7. The dashboard composer is delivered within the 80-to-110 person-day estimate band. Any estimate overrun above 110 pd requires a CEO change request before additional effort is authorised.

---

## Answers to Open Questions

**ADD-OQ-2 (dashboard export format):** Per-widget PNG export using existing ScottPlot infrastructure is in scope. Full PDF export of the complete dashboard canvas is not in scope for V2-Dashboard. This decision protects the timeline. If QDB requires full-canvas PDF, it requires a separate change request and approximately 5 additional person-days.

**ADD-OQ-3 (cross-filter scope):** Entity-exact cross-filter is approved. Relationship-aware cross-filter is not in scope for V2-Dashboard. The complexity increase (10 to 15 pd) and the UX complexity are not justified for the initial increment.

**ADD-OQ-4 (undo/redo persistence):** Within-session undo/redo only. Persistent undo history across sessions is not in scope.

**ADD-OQ-1 (dashboard governance):** Client must answer before schema is finalised (DC-4). Default assumption if no response within 5 business days: dashboards are ungoverned by default; governance is optional and configurable per dashboard via qdb_dashboard.qdb_isgoverned.

---

## What Must Happen Before Phase-4 Build Authorisation for V2-Dashboard

The following are the exact pre-build gates. Nothing may be built until all four are cleared and reported to me.

1. DC-1: Fan-out architecture spike completed with written exit criteria and results.
2. DC-2: Client written acceptance of the C-2 production deployment gate for Customer-360.
3. DC-3: GitHub research confirming client-side charting library selection, documented in dependencies.md.
4. DC-4: Client answer on dashboard governance model (or 5-business-day default assumption invoked and reported to me).

Once these four conditions are cleared, the architect produces a V2-Dashboard Phase-3 addendum (schema for 6 tables, DashboardExecutionService design, cross-filter model, RBAC extension design), and I will issue Phase-4 build authorisation for V2-Dashboard at that point.

---

## Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | Maqsad AI | APPROVED WITH CONDITIONS — as V2-Dashboard (M2.5), not V1 | 2026-07-19 |
| Requestor (BA) | Maqsad AI | Submitted | 2026-07-19 |

---

*V1 Phase-4 build authorisation is not affected by this addendum and remains subject to the original Phase-1 conditions C-1 through C-9. This checkpoint ruling governs V2-Dashboard only.*
