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
| WP5 | Supervisor / team oversight **as Engine definitions**: open activities by owner (RPT-007), by type (RPT-008), by week recorded × escalation flag (RPT-009), by month (RPT-010), promises by recorded status (RPT-011) — shown on the Supervisor Overview dashboard (DCP-DB-002) | 3.0 | Done — `612b3fd7` + `c83d78d8`; live-verified 2026-09-26 |
| WP6 | Portfolio / management **as Engine definitions**: portfolio totals with distinct customers (RPT-015), by bucket (RPT-001), source (RPT-002), status (RPT-003), strategy (RPT-004), owner (RPT-005), concentration (RPT-006) — Portfolio Overview dashboard (DCP-DB-001) | 3.0 | Done — live-verified: 4,363 / 3,780 / 213,300,524; HL 4,360 / 3,779 |
| WP7 | Trend analytics **as an Engine definition**: observations by date × source with arrears / balance / DPD (RPT-013), one point per stored observation, no interpolation — Historical Delinquency dashboard (DCP-DB-004) | 2.0 | Done — live-verified: 7 observation points |
| WP8 | Exception / configuration visibility **as Engine definitions**: identity exceptions by status × reason (RPT-012); configuration gaps as one multi-dataset definition (RPT-014) — Exception Overview dashboard (DCP-DB-003) | 2.0 | Done — live-verified: assignment 0, escalation 0, 7 types without outcome, 4 actions without type, 0 / 1 cases without customer / bucket, 4 integration exceptions |
| WP9 | Drill-down and filter integration: a dashboard row opens the Cases list with the scope it was counted in (`#cases/scope/…`); Engine ↔ list parity proven by two independent interpreters in tests and live (61–90: Engine 228 = platform `$count` 228); scope values leave as codes; definitions resolved by code at run time; provisioning idempotent by `qdb_reportcode` | 2.0 | Done — Work Queue drill-down for activity-grain reports **not wired** (recorded) |
| WP10 | Large-data hardening: the dashboard reads no case rows (test); every figure is an Engine aggregate over the full book (4,363 cases live); drill-down is the existing paged list; stale answers dropped (`useReport`, guard bites); Engine cap (5,000 rows) surfaced as a note; `$count`s on My Day capped at 5,000+ | 1.5 | Done — synthetic 10K / 50K / 100K runs **not executed** (would need permanent Dataverse rows, which the authorisation forbids); scaling argument recorded in the closure report |
| WP11 | Security / audit validation: every read as the signed-in user through `Xrm.WebApi.execute`; refusals named (accessDenied / refused / unavailable / malformed / timeout); no proxy, no impersonation, no grants made; required `canexecute` grants recorded for QDB | 1.0 | Done — evidence is **System Administrator**, labelled |
| WP12 | Cloud runtime + browser validation (QDB Chrome profile, read-only): four dashboards live, Engine ↔ `$count` parity, CRM picker narrowing, dropped-dimension notes, no console errors | 2.0 | Done 2026-09-26 |
| WP13 | Full regression / hardening (≥ 2,027, 0 skipped; guards bite) | 1.5 | Done — TS 2,010 (domain 829 · web 780 · api 355 · dv-client 32 · auth 14) + tooling 10 + C# 159 on record = **2,179**; eight planted defects failed their tests |
| WP14 | Documentation, KI reconciliation, closure | 1.5 | In progress — closure report `Phase10_Closure.md` |
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
