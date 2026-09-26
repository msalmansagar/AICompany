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
| WP2 | Reporting contracts in `@dcp/domain`: `ReportingScope` filter contract, metric registry with classification (authoritative / factual / definition-pending / deferred), explicit grain per metric | 2.0 | — |
| WP3 | Server-side query layer: `aggregate()` on the adapter (FetchXML, user session, refusal → unknown), FetchXML renderers for cases / activities / snapshots / identity exceptions from the same scope the lists filter by, distinct counts, parity tests | 3.0 | — |
| WP4 | Officer operational overview: My Day tiles made scoped and honest (open cases, follow-ups overdue / upcoming, promises due in an explicit window, awaiting assignment, open identity exceptions), queue summary reusing Work Queues | 2.0 | — |
| WP5 | Supervisor / team oversight: open work by owner, by type, by age band; assignment state; escalation flag; PTP status distribution; advanced-process workload; activity volume by month | 3.0 | — |
| WP6 | Portfolio / management: open cases by bucket × source system with arrears and balance sums, distinct customers (KI-18), status and strategy distribution, concentration (top customers by arrears), freshness line | 3.0 | — |
| WP7 | Trend analytics from `qdb_delinquencysnapshot`: observations by date × source with arrears / balance / DPD, cadence honesty (one ARR observation; DEMO series only) | 2.0 | — |
| WP8 | Exception / configuration visibility: identity exceptions by status and reason, cases without bucket / strategy / customer, config gaps (assignment 0, escalation 0, activity types with no outcomes, strategy actions with no activity type), integration exceptions as a labelled technical count | 2.0 | — |
| WP9 | Drill-down and filter integration: every card opens the existing Cases / Work Queue / Intake list with the same scope via route parameters; Report Engine handoff assessed, one proof definition only if it needs no Engine change; export otherwise deferred | 2.0 | — |
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
