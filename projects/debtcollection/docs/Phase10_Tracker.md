# Phase 10 — Reporting, Dashboards & Operational Oversight — tracker

Branch `feat/dcp-phase10-reporting-oversight` · base `cf4e76427947a5e556369746444eb0fa108f4c05` (= `origin/main`, verified unmoved) ·
worktree `.claude/worktrees/dcp-phase10` · reconciliation `docs/Phase10_Reconciliation.md`.

| | |
|---|---|
| **Instruction received** | **2026-09-26 01:27:11 +03 (Asia/Qatar)** |
| Gate passed / branch created | 2026-09-26 01:28:30 +03 |
| Baseline tests on the branch | **2,027 / 0 / 0** — TS 1,858 measured (domain 817 · web 644 · api 351 · dv-client 32 · auth 14) + tooling 10 + C# 159 on record |
| **Baseline effective hours** | **29.5 h** (14 WPs + 2.0 debug) — AI-assisted effort estimate, not rewritten |
| ETA | 2026-09-27 18:00 +03 |
| Effective time | measured from session transcripts, gaps under 15 minutes counted; idle and blocked recorded separately |

## Timing banner

```
PHASE 10 — REPORTING, DASHBOARDS & OPERATIONAL OVERSIGHT
Start 2026-09-26 01:27:11 +03 · Baseline 29.5 h · ETA 2026-09-27 18:00 +03
Base cf4e7642 (origin/main) · branch feat/dcp-phase10-reporting-oversight
```

## Work packages

| WP | Scope | Est. h | State |
|---|---|---|---|
| WP1 | Baseline gate, reconciliation matrix, live data facts | 1.0 | Done — this file, `Phase10_Reconciliation.md` |
| WP2 | Reporting contracts in `@dcp/domain`: `ReportingScope` filter contract, metric registry with classification (authoritative / factual / definition-pending / deferred), explicit grain per metric, reporting catalogue (DCP-RPT-001…015, DCP-DB-001…004) | 2.0 | Done — `dc90bb7d` + catalogue |
| WP3 | Consumption layer (Option C): `IReportingService` over `qdb_RunReport` / `qdb_RunDashboard` with zod contracts, refusal / access-denied / unavailable / malformed / timeout outcomes; `aggregate()` on the adapter for My Day sums; `ReportingScope` → Engine parameters (codes only) | 3.0 | Done — `af95c92f` |
| WP4 | Officer operational overview: My Day tiles made scoped and honest (open cases, current arrears, my open work, follow-ups overdue / upcoming, promises due in an explicit window, awaiting assignment, identity exceptions), lightweight `$count`s, DCP-native | 2.0 | Done — `21d5ffb9` |
| WP5 | Supervisor / team oversight **as Engine definitions**: open activities by owner (RPT-007), by type (RPT-008), by week recorded × escalation flag (RPT-009), by month (RPT-010), promises by recorded status (RPT-011) | 3.0 | Definitions provisioned + validated live; DCP screen pending |
| WP6 | Portfolio / management **as Engine definitions**: portfolio totals with distinct customers (RPT-015), by bucket (RPT-001), source (RPT-002), status (RPT-003), strategy (RPT-004), owner (RPT-005), concentration (RPT-006) | 3.0 | Definitions provisioned + validated live; DCP screen pending |
| WP7 | Trend analytics **as an Engine definition**: observations by date × source with arrears / balance / DPD (RPT-013), one point per stored observation, no interpolation | 2.0 | Definition provisioned + validated live; DCP screen pending |
| WP8 | Exception / configuration visibility **as Engine definitions**: identity exceptions by status × reason (RPT-012); configuration gaps as one multi-dataset definition (RPT-014: assignment 0, escalation 0, 7 activity types with no outcome, 4 strategy actions with no type, 0 cases without customer, 1 without bucket, 4 integration exceptions) | 2.0 | Definitions provisioned + validated live; DCP screen pending |
| WP9 | Drill-down and filter integration: every card opens the existing Cases list with the same scope via `#cases/scope/…`; Engine ↔ drill-down reconciliation tests; provisioning script idempotent by `qdb_reportcode` | 2.0 | Cases scope route done (`bfa1cdd2`); provisioning done; reconciliation tests pending |
| WP10 | Large-data hardening: aggregate-limit refusal handling, stale-response suppression, 10K / 50K / 100K synthetic runs, bounded DOM | 1.5 | — |
| WP11 | Security / audit validation: every read as the signed-in user, refusals shown as unknown, administrator evidence labelled | 1.0 | — |
| WP12 | Cloud runtime + browser validation (read-only ARR; DEMO fixtures only if a write is needed) | 2.0 | — |
| WP13 | Full regression / hardening (≥ 2,027, 0 skipped; guards bite) | 1.5 | — |
| WP14 | Documentation, KI reconciliation, closure | 1.5 | — |
| | Debugging allowance | 2.0 | |

## Assumptions

- Reporting reads run through the signed-in user's own session (FetchXML aggregates via `Xrm.WebApi`); no proxy, no privileged aggregate, `AggregateQueryRecordLimit` untouched (50,000 default).
- Every aggregate and its drill-down list are rendered from one `ReportingScope`; parity is asserted by tests and by a read-only live smoke.
- The UI lives in the existing workspace routes (`dashboards`, `myday`, `queues`, `mis`) in the V1 design system on `main`; the reporting contracts and query layer are workspace-agnostic so Workspace V2 (unmerged, `feat/dcp-workspace-v2`) can consume them later.
- MIS is authoritative for current DPD / bucket / arrears / balance; snapshot history is shown as observations, never as current.

## Dependencies and blocked work (recorded separately)

| Item | State |
|---|---|
| Portfolio MIS transport contract (KI-53) — roll rates, month-over-month movement | **Blocked by QDB** — not built |
| KPI definitions: cure, roll, recovery, collection effectiveness, PTP kept / broken rates, contact / RPC, liquidation, collector productivity, SLA compliance | **Definition Pending QDB Confirmation** — registered, not computed |
| Time-based work states (due soon / overdue / SLA) | Blocked by KI-101 (no TAT start policy) |
| Officer-role evidence (KI-100 / 111 / 120) | Administrator evidence only |
| Power BI | External dependency (tenant, workspace, licensing, gateway, SP) — not adopted; not required by the operational workspace |
| Snapshot cadence (no scheduler; one ARR observation) | Reported as a limitation, not interpolated |
| Approvals route | No entity exists; stays pending |
| Export | Deferred to the Report Engine's existing export; no browser-side export of the portfolio |

## Time log

| When (+03) | Note |
|---|---|
| 01:27 | Instruction received |
| 01:28 | Gate passed: main unmoved, tree clean, closure artefacts present; worktree + branch created |
| 01:30–01:55 | Reconciliation sweep (code) + live data probes (snapshots, cases, activities, exceptions, config) |
| 01:55 | Baseline 2,027 confirmed after building packages in the fresh worktree |
| 02:00–04:30 | WP2 contracts + catalogue; KI-147 fix (follow-ups scoped through the case); WP3 adapter over `qdb_RunReport` / `qdb_RunDashboard`; WP4 My Day tiles; WP9 cases scope route |
| 04:30–06:00 | Report Engine capability validation: source review (agent) + runtime probes (RunReport / RunDashboard shapes, prompt-filter behaviour, IsNull always-on, no dashboard parameters). User confirmed **Option C — Hybrid** |
| 06:00–15:30 | Provisioning script (idempotent by `qdb_reportcode`, multi-dataset); 15 definitions authored, provisioned and validated live with reconciled figures; `SourceSystem` unified on `qdb_facilitysourcesystem`; catalogue ↔ definition contract tests (89, two guards proven to bite); docs. Wall-clock includes waits on the shared org and the user's browser session |
