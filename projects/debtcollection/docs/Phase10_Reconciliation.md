# Phase 10 — Reporting capability reconciliation

Read-only inventory of `main` @ `cf4e7642` and the QDB Report Engine, plus live facts from `org5869857f`
(2026-09-26, read-only). Classification: **Delivered** · **Reuse** (existing capability) · **Enhance**
(Phase 10 enhancement) · **New** (new Phase 10 capability) · **Blocked** (data / policy) · **Deferred** ·
**Out of scope**.

## 1. Live data facts that shape Phase 10

| Fact | Value | Consequence |
|---|---|---|
| Open cases | 4,363 (4,359 New; 1 each Assigned / In Progress / PTP Active / Pending Legal Review) | Status distributions are honest but nearly single-valued on the sandbox |
| Closed / cured / second-episode cases | 0 / 0 / 0 | Cure, re-delinquency and roll measures have no data even if defined |
| `qdb_delinquencysnapshot` | 4,373 rows: 4,358 HL observed **2026-06-30** (one ARR load, received 2026-09-18) + 15 DEMO rows over 3 weekly observations (3 / 10 / 17 Sep) for 5 facilities | The real book has **one observation per facility** — no trend; only DEMO has a series |
| Snapshot writes | append-only, deduplicated by `qdb_snapshotkey`; **no scheduler** exists (`BackgroundSyncRunner` runs from tests only) | Cadence is a QDB/ops dependency; Phase 10 reports observations as they are |
| Activities | 14 (all September 2026); 12 activity types; 30 outcomes; 5 promises; 0 faxes; 0 emails; 0 communication runs; 0 legal requests | Communication / legal reporting is structural and near-empty |
| Ownership | every open case owned by `# DFE Backend API`; `qdb_assignedteamid` null; assignment config 0 rows; escalation config 0 rows | "Workload by owner" is computable and honest; "manual assignment required" and "missing configuration" are real exception facts |
| Identity exceptions | 3 (`qdb_identityexception`: status, reason, resolution, source, batch) | Exception view has a real source |
| Bucket | 1 open case carries no MIS bucket | Every bucket total must name the unbucketed remainder |

## 2. Reconciliation matrix

| Capability | Exists today | Classification | Phase 10 action |
|---|---|---|---|
| Officer "what needs action now" | Work Queues (`operationalQueue.ts`): MyAssigned, AwaitingAssignment, Escalated (flag), Legal, Disputes, Complaints, DeceasedReview, Restructuring; DueSoon / Overdue / AssignmentRequiresAttention unavailable (KI-101 / 105) | **Reuse** | Summarise the served buckets on My Day; do not duplicate the lists |
| My Day tiles | Open cases (`$count`), Active / Broken promises (**case status**, not PTP activities), Overdue balance "—" (Phase 10 placeholder), SLA "—" | **Enhance** | Scoped, honest tiles: open cases; follow-ups overdue / upcoming (existing follow-up query); promises due in an explicit window (PTP activities, status Active, `qdb_ptpdate` in [today, +7d)); awaiting assignment; open identity exceptions. Overdue-balance tile becomes a server sum |
| Follow-ups | `followUpQueries.ts` windows overdue / upcoming / all, server-filtered | **Reuse** | Counts only; drill-down to the existing panel |
| Collection Cases list | filters bucket / status / search / open-only / org; fixed DPD sort; 50/page | **Reuse + Enhance** | Accept drill-down filters from the route (owner, strategy, bucket, status) so a card opens the list it counted |
| Customer 360 | browser-side sums over ≤200 rows, partial-total banner | **Reuse** | Unchanged; not a reporting surface |
| Case counts by bucket / status / strategy / source | not present (V2 branch has a bucket × strategy matrix — unmerged) | **New** | FetchXML aggregates from one scope; V2 can adopt the shared layer after merge |
| Arrears / balance sums, distinct customers | none (KI-18 warns totals ≠ distinct customers) | **New** | FetchXML `sum` and `countcolumn distinct` on `_qdb_customerid_value`, grain stated on every card |
| Concentration (top customers by arrears) | none | **New** | FetchXML aggregate grouped by customer, ordered, `top` |
| Trend from snapshots | snapshot grid only; no chart library; no chart anywhere | **New (limited)** | Observations by date × source; explicit cadence note; no interpolation |
| Portfolio MIS (bucket transitions, month vs prior) | route pending, KI-53 (no MIS transport) | **Blocked** | Stays pending; the route says why |
| Supervisor workload | none | **New** | Open activities by owner / type / age band; cases by owner and strategy; escalation flag; PTP by status; queue counts |
| Advanced-process visibility | capability matrix + queues (Phase 9) | **Reuse** | Counts by factual state only; Parked / Deferred wording preserved |
| Communication reporting | unified history per case; bulk runs list | **Reuse (facts only)** | Counts of native records by channel / status; "Native Record Creation Proven — External Delivery Unproven" retained |
| Identity exceptions | intake tile + grid | **Enhance** | By status and reason; drill-down to the grid |
| Configuration gaps | none as a view | **New** | Assignment config 0, escalation config 0, activity types without outcomes (KI-131), strategy actions without activity type (KI-106), cases without customer / bucket / strategy |
| Integration / technical logs | Audit tab reads `qdb_crmlogs` by correlation | **Reuse, labelled** | One technical count (exceptions in the last N days) under "Integration", never as a business KPI |
| Dynamics views / charts / dashboards | none shipped (KI-14: no solution package) | Out of scope | — |
| Export | none in the web app; Report Engine exports client-side (CSV / Excel / PDF / PNG) with a 5,000-row cap | **Deferred → Reuse** | No browser export of the portfolio; Report Engine handoff assessed in WP9 |
| Power BI | no pattern in the repository; ADR-07 rules out embedding | **Deferred** | External dependency; not required by the workspace |
| Approvals | no entity | **Deferred** | Route stays pending |
| Dashboards route | six `$count` tiles + "Beyond counts" notice | **Enhance** | Becomes the management / supervisor surface |

## 3. QDB Report Engine reuse assessment

Runs inside CRM as the initiating user (`qdb_RunReport` / `qdb_RunDashboard` plugins), FetchXML datasets
with **server-side aggregates**, one drill level, browser exports, 5,000-row cap, no paging, no scheduler,
`canexecute` role/team check, Cloud-deployed on the same org, On-Prem compatible by design via a Process
Action. Consumption is `Xrm.WebApi.online.execute({operationName:'qdb_RunReport', …})` or a
`main.aspx?pagetype=webresource` navigation.

Decision: **the operational workspace does not embed the Engine.** Its aggregate mechanism (FetchXML
as the user) is the same one Phase 10 uses directly, without the 5,000-row cap on detail and without a
second security model. The Engine is the right home for **authored, printable, exportable** reports; WP9
records one DCP report definition as a proof only if that needs **no Engine code change** and the org
already carries `qdb_compositionmode`. Any Engine change affecting other QDB applications is a STOP gate.

### 3a. Superseded 2026-09-26 — Option C (Hybrid), decided by the user

**Report Engine owns reporting. DCP owns operational work.** Every DCP report and dashboard is an Engine
*definition* (configuration records, versioned in `reporting/definitions/`, provisioned idempotently by
`crm/scripts/provision-reporting-definitions.mts`); DCP consumes them through `qdb_RunReport` as the
signed-in user behind `IReportingService` and renders natively — no iframe, no second engine. My Day stays
DCP-native (`$count`s and one arrears sum). Drill-down stays DCP (`#cases/scope/…`) and is reconciled to
the Engine aggregate by tests. No Engine **code** changed; a needed change is a STOP gate.

Engine facts established from the runtime (not the repository) while provisioning, 2026-09-26:

| Fact | Consequence |
|---|---|
| A runtime-prompt filter whose parameter is absent is dropped — **except `IsNull`, which always applies** | "No strategy" is a null group in RPT-004 and a DCP narrowing only; never an optional Engine filter |
| `qdb_RunDashboard` takes no parameters, applies no filters, has no access list | DCP dashboards (DB-001…004) are compositions of *reports*, each run with the scope; Engine dashboards are not used for DCP |
| A multi-datasource definition returns `datasets[]`; the **root** datasource yields no columns unless its composition is Joined | RPT-014's first dataset is Joined, the rest Standalone |
| Prompt filters address the main entity only | Activity-, PTP- and exception-grain definitions do not honour `SourceSystem`; the catalogue's `dimensions` omit it and `restrictScope` drops it |
| The case carries `qdb_facilitysourcesystem` = `HL` / `BFD`, partitioning identically to `qdb_organizationcode` (4,360 / 3) | `SourceSystem` is one text contract across case- and snapshot-grain definitions |
| Refusals are HTTP 200 + `errorCode`; access denial is `report_failed` with a permission message | `ReportingOutcome` = ok / refused / accessDenied / unavailable / malformed / timeout |

Live validation figures (admin session, labelled as such): RPT-015 cases 4,363 · customers 3,780 ·
arrears 213,300,523.69 · balance 3,419,587,487.25 — equal to Screen 01 and the smoke; RPT-002 HL 4,360 /
BFD 3; RPT-004 no-strategy 4,358; RPT-007 open activities 5 + 7 = 12 = RPT-009 total; RPT-010 September 14;
RPT-011 Active 3 / Broken 1 / Kept 4 / Partially Kept 1; RPT-012 three exceptions; RPT-013 seven observation
points (one ARR 2026-06-30 of 4,358 facilities; DEMO 3 / 10 / 17 September); RPT-014 assignment 0 ·
escalation 0 · types without outcome 7 · actions without type 4 · cases without customer 0 · without bucket 1
· integration exceptions 4.

## 4. Power BI decision

Not adopted in Phase 10. No tenant, workspace, licence, gateway, service principal or dataset exists in
evidence; the operational workspace must work without it; the design keeps every report reading entity
data through the user's session, which stays Power-BI-compatible later. Recorded as an external dependency.

## 5. What Phase 10 will not invent or build

Cure rate · roll rate · recovery rate · collection effectiveness · PTP kept / broken **rates** · contact rate
· right-party contact · liquidation rate · collector productivity · SLA compliance (all *Definition Pending
QDB Confirmation*) · due-soon / overdue work states (KI-101) · a `qdb_customer` or CRM facility master · a
reporting proxy API or impersonation · client-side portfolio aggregation · Portfolio MIS transitions (KI-53)
· Power BI · browser export of the portfolio · lifecycle semantics for Restructuring / Field Visit /
Warning Letters / Insurance Claims (parked / deferred / out of scope) · delivery claims for SMS / WhatsApp /
email · Dynamics charts or dashboards.
