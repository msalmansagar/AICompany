# Phase 4 Build Authorization — V2-Dashboard (Milestone M2.5)
# RPT-ENG-001 · Metadata-Driven Report Engine

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Document** | Phase-4 Build Authorization — V2-Dashboard |
| **Milestone** | M2.5 — Dashboard Composer and Business-User Authoring Tooling |
| **Prior ruling** | `ceo-checkpoint-dashboard-composer.md` — Approved With Conditions (2026-07-19) |
| **Gate closure input** | `v2-dashboard-gate-signoff.md` — All four pre-build gates cleared (2026-07-19) |
| **Decision date** | 2026-07-19 |
| **Decision authority** | CEO (Maqsad AI) |

---

## Decision: AUTHORIZED WITH CONDITIONS

Phase-4 build of **V2-Dashboard (Milestone M2.5)** is authorized to begin, subject to the conditions carried forward in this document. All four pre-build gates required by the CEO checkpoint ruling are closed. No gate remains open.

---

## Rationale

### Why authorize now

The four gates I named as non-negotiable pre-build requirements are all satisfied.

DC-1 (fan-out performance) has been resolved at the design level by a rigorous, 1 person-day architecture spike. The architect has produced a credible eight-layer mitigation stack — OBO token distribution, a global process-level semaphore, a per-dashboard parallelism cap, ExecuteMultiple batching, per-widget role-keyed caching, progressive streaming, retry/circuit-breaker logic, and query coalescing. The analysis demonstrates that the naive 240-concurrent-request load is reduced to at most 6 active Dataverse requests per user, comfortably within documented service-protection limits on both cloud and on-prem targets. Three load-test proof obligations remain (DC-1a, DC-1b, DC-1c), but these are build-phase activities, not authorization blockers.

DC-2 (PDPPL data-residency) has been formally answered by QDB: cloud deployment is permitted in a QDB-approved Azure region. This lifts the on-prem-only constraint for the Customer-360 PII scenario and confirms that the OBO delegated-token path — the primary fan-out mitigation — is production-viable. One deployment detail is outstanding: QDB must name the specific approved region. This is an operational step, not a design decision, and does not block the build start.

DC-3 (charting library) is clear. Recharts (MIT, 27.4k stars) has been selected, evaluated, and documented in `dependencies.md` Area 10. No license trap. No bundle-size risk for the six required chart types. The DC-3 gate is fully satisfied.

DC-4 (governance model) is answered by QDB: configurable per dashboard, ungoverned by default. This matches the default assumption I stated in the checkpoint and adds explicit per-dashboard control. The schema retains the governance tables (`qdb_dashboardsecurity`, dashboard version history). No schema reduction is needed. The build implements the governed workflow gated on the `qdb_dashboard.qdb_isgoverned` flag.

### Why authorize this increment and not a larger one

V2-Dashboard does not touch V1 scope, the V1 schema, or the V1 delivery timeline. It builds on top of V1 interfaces as a consumer, not as a modifier. The business case — eliminating manual Excel aggregation for relationship managers and delivering the Customer-360 view that QDB stakeholders validated in the prototype — is strong and time-sensitive. Deferring this to V3 is not credible given the validated prototype and the QDB competitive position identified in the gap analysis.

The estimate band (80–110 person-days) is proportionate. It is not a new programme.

---

## Conditions Carried Into Build

The following conditions are binding from this authorization through the M2.5 milestone exit. No condition may be waived without a further CEO decision.

### Pre-implementation conditions (must be satisfied before writing DashboardExecutionService)

**AUTH-C-1 — ADR-RPT-008 written and accepted before DashboardExecutionService implementation begins.**
The architect must produce ADR-RPT-008 (Dashboard fan-out concurrency control and OBO query execution model) and it must be accepted before any code is written in `DashboardExecutionService`. The content is already drafted in `dc1-fanout-spike.md` §7; the architect converts this to a formal ADR. This is a process gate, not a design uncertainty.

**AUTH-C-2 — QDB names the specific approved Azure region before production deployment plan is written.**
The deployment/hosting plan for the cloud execution path must pin the specific QDB-approved Azure region (DC-2 open detail). This is not required before coding begins, but must be in place before any infrastructure provisioning document is produced. If QDB does not provide the region within 5 business days of build start, escalate to me before proceeding with any cloud hosting design.

### During-build proof obligations (phase-4 activities, not post-build)

**AUTH-C-3 — DC-1c: confirm OBO / user impersonation on the actual on-prem CRM 9.x target at M1 integration.**
The architect confirmed that OBO on an on-prem hybrid setup (RC-1 in the spike document) is a risk. The `OrganizationServiceFactory.CreateOrganizationService(userId)` impersonation path must be tested and confirmed functional on the actual QDB on-prem CRM 9.x server during M1 integration work, before the dashboard execution service is relied upon for any on-prem dashboard run. If it fails, the on-prem execution path requires a design revision.

**AUTH-C-4 — DC-1b: QDB confirms record-ownership model for Customer-360 entities before production cache is enabled.**
Before the Customer-360 dashboard's widget cache is enabled in any environment above staging, QDB must confirm whether `account`, `qdb_loanapplication`, and `qdb_facility` are BU-level/organisation-level owned or user-level owned. If any entity is user-owned, the cache key for that widget must be extended to include `userId`. This confirmation is required before the Customer-360 dashboard is promoted beyond the staging cache.

**AUTH-C-5 — DC-1a: scenario-3 load test must pass before M2.5 milestone closes.**
The DC-1 gate is cleared at design level only. Before M2.5 is closed, the team must execute the scenario-3 load test (20 concurrent cold-cache opens of the 12-widget Customer-360 dashboard), and the following must all pass on both cloud and on-prem targets:
- Per-widget P95 latency at or below 4.0 seconds
- Dashboard P95 latency at or below 15 seconds
- Zero Dataverse 429 responses on cloud
- Zero connection refused or timeout errors on on-prem

If any criterion fails, the milestone does not close until the mitigation is revised and the load test is re-run. This is a non-negotiable M2.5 exit gate.

### Permanent non-waivable conditions (carried from the CEO checkpoint)

**AUTH-C-6 — DC-5: no Customer-360 dashboard promoted to production until PDPPL sign-off is obtained.**
No dashboard that aggregates customer-level PII (account name, CIF, loan amounts, facility status, ownership data) may be deployed to the QDB production environment until written data-residency and PDPPL compliance sign-off is obtained from the appropriate compliance authority. DC-2 confirmed cloud is permitted in an approved region. The sign-off on that specific region is what is needed before production promotion. This gate is non-waivable and supersedes any commercial delivery pressure.

**AUTH-C-7 — DC-6: data quality disclaimer banner in the Customer-360 dashboard header is a go-live requirement.**
The Customer-360 dashboard must display a prominent disclaimer banner advising relationship managers that data accuracy reflects the underlying CRM records and links to the QDB data quality remediation contact or process. This is a hard go-live requirement. It is not a Should Have. It must be present in staging and confirmed in QA before production promotion.

**AUTH-C-8 — DC-7: per-widget entity permission enforcement verified by a dedicated QA automated test.**
A user with dashboard-run permission but without CRM read access to a specific widget's bound entity must see a visible "no access" indicator for that widget and must receive no data from it. This behavior must be validated by an automated QA test case that passes before the dashboard enters production. Silent empty-row returns are a defect, not an acceptable fallback.

**AUTH-C-9 — DC-4: per-dashboard governance flag, ungoverned by default.**
New dashboards are ungoverned by default (`qdb_isgoverned = false`). The governed workflow (draft, submit, approver distinct from author, immutable version snapshot on publication) is implemented and activated only when the flag is set to true. The schema retains all governance tables. The build does not implement a reduced schema.

**AUTH-C-10 — Matrix widget (ADD-FR-026): architect must assess feasibility and escalate if timeline risk materializes.**
The Matrix (cross-tab) widget is authorized as a Could Have and must not be built if it creates timeline risk for M2.5. The architect assesses Matrix feasibility during Phase-4 design. If it threatens the milestone, the architect escalates to me. Matrix may slip to V2.1 without a further CEO decision, but I must be informed before the decision is made unilaterally by the build team.

---

## Sequencing and Budget

**V2-Dashboard does not begin until V1 Milestone M1 is complete.**
M1 delivers the core engine: data providers, transformation pipeline, CRM entry points, cache service, and security enforcer. V2-Dashboard is a consumer of these components via their TypeScript interfaces and API contracts. Until M1 interfaces are stable and tested, V2-Dashboard work is limited to: ADR-RPT-008 finalization (AUTH-C-1), schema design for the six new tables, and client-side prototyping that consumes V1 interface contracts. No V1 developer allocation may be diverted to V2-Dashboard.

**If V1 M1 slips, V2-Dashboard start date slips with it.** The V1 go-live date is not adjusted to accommodate V2-Dashboard.

**V2-Dashboard runs in parallel with V1 M3 (SSRS migration) once M1 is complete.** V2-Dashboard does not block M3 and M3 does not block V2-Dashboard. They share a V1 interface dependency on M1 only.

**If a separate frontend squad is available at QDB**, the dashboard composer UI may begin in parallel with V1 M2 (the report designer and export modules), consuming V1 interfaces as contracts. Any V1 interface breaking change must be communicated to the dashboard team immediately. The backend and schema work for V2-Dashboard requires M1 to be at least at an interface-complete state.

**Budget:** ~95 person-days (confidence band 80–110 pd). Any overrun above 110 pd requires a CEO change request before additional effort is authorized. If the Matrix widget is deferred (Could Have, AUTH-C-10), the estimate reduces by approximately 6–8 pd.

**Milestone placement:**

| Milestone | Prerequisite | Delivery |
|---|---|---|
| M0 — Schema provisioning | — | V1 (authorized separately) |
| M1 — Core engine: data providers, transformation, cache, security | M0 | V1 (authorized separately) |
| M2 — Report Designer: authoring surface, layout engine, export | M1 | V1 (authorized separately) |
| M3 — SSRS migration | M2 | V1 (authorized separately) |
| M2.5 — Dashboard Composer (this authorization) | M1 complete; all four gates cleared | V2-Dashboard — runs parallel to M3 |
| M4 — Multi-level drilldown, N:N, formula engine V2, external sources | M2 + M2.5 | V2 (not yet authorized) |

---

## Success Criteria — M2.5 Exit Gate

I will judge V2-Dashboard delivery against the following criteria at Phase-7 CEO final decision. All seven must be satisfied.

1. A relationship manager can open a published Customer-360 dashboard from an Account form in CRM, see all widgets load progressively, and apply a cross-filter by clicking a chart segment — with no developer involvement and no manual Excel aggregation step.
2. At least one Customer-360 dashboard template is live and in active use by at least one major business unit within 6 months of V2-Dashboard delivery.
3. A power user can compose a new dashboard (add sections, configure widget data binding, publish) in under 30 minutes without developer assistance.
4. Every dashboard execution is audit-logged with the identity of the running user, the dashboard run start time, and per-widget outcome. The audit log is append-only and satisfies the same retention standards as the report audit log.
5. A user without CRM read access to a widget's bound entity sees a "no access" indicator for that widget and receives no data from it. This is validated by a passing automated QA test (AUTH-C-8).
6. The DC-1a load test passes on both targets: P95 per-widget latency at or below 4.0 seconds and zero throttle events at 20 concurrent cold-cache dashboard opens on a 12-widget dashboard (AUTH-C-5).
7. V2-Dashboard is delivered within the 80–110 person-day estimate band. Any overrun above 110 pd requires a CEO change request.

---

## Scope Boundary — Locked

The authorized scope is defined in `ceo-checkpoint-dashboard-composer.md` under "Authorised Scope for V2-Dashboard." That scope lock is carried forward unchanged. Nothing in this authorization expands or contracts it.

The following remain explicitly excluded and must not be built without a further change request:
- Real-time or streaming dashboards (auto-refresh below the existing cache TTL floor)
- Write-back from any dashboard widget into CRM
- Scheduled dashboard delivery (email or PDF snapshots on a cron)
- AI natural-language widget creation
- Embedded external BI (Power BI, Tableau)
- Public or anonymous dashboard sharing
- Cross-tenant dashboard sharing
- Full PDF export of the complete dashboard canvas
- Relationship-aware cross-filter
- Persistent undo history across sessions

---

## Note on Core V1 Engine — Phase-4 Build Authorization Status

V1 (Milestones M0 through M3) completed Phase 3 architecture and is at the pre-build gate. The memory record confirms Phase 3 is complete. V1 has not yet received an explicit Phase-4 build authorization document from me.

**I am issuing that authorization now, in this document, as a companion ruling.**

The V1 core engine is **authorized to begin Phase-4 build** on the following basis:

- Phase 1 CEO conditions C-1 through C-9 were carried into and addressed by Phase 3 architecture. The architecture phase is complete.
- C-3 (scope lock to BRD §13 MVP cut) remains in force.
- C-4 (N:N and multi-level drilldown deferred to V2) remains in force.
- C-5 (sandboxed, non-Turing-complete formula evaluator — NCalc adopted) is satisfied per `dependencies.md` Area 1.
- GitHub research is complete; all rendering primitives have adoption decisions in `dependencies.md`.

The architect must produce the Phase-4 build plan (M0–M3 task breakdown, team allocation, sprint structure) before the first V1 sprint begins. The V1 Phase-4 build authorization conditions (C-1 through C-9 from Phase 1) are inherited as build-phase obligations, not re-opened as gates.

**V2-Dashboard sequencing depends on V1 M1 completing first.** Authorizing V1 build now is therefore a prerequisite for V2-Dashboard to proceed on the planned timeline. Both tracks are authorized as of this document.

---

## Authorization

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | Maqsad AI | **AUTHORIZED WITH CONDITIONS** — V2-Dashboard Phase-4 build; V1 Phase-4 build authorized concurrently | 2026-07-19 |

---

*This document is the Phase-4 build authorization for V2-Dashboard (M2.5) and the companion Phase-4 build authorization for V1 (M0–M3). It supersedes all open authorization questions from the CEO checkpoint ruling dated 2026-07-19. The scope addendum (`scope-addendum-dashboard-composer.md`) and CEO checkpoint (`ceo-checkpoint-dashboard-composer.md`) remain the governing scope and design documents. This document governs only the build-start authorization and the conditions carried into build.*
