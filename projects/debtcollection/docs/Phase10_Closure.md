# DCP Phase 10 — Reporting, Dashboards & Operational Oversight — Closure Report

**Branch** `feat/dcp-phase10-reporting-oversight` from `origin/main` `cf4e7642` · **Sandbox** `org5869857f` only ·
**Architecture** Option C — Hybrid, decided by the user 2026-09-26: *Report Engine owns reporting. DCP owns operational work.*
**Status** Built, tested, deployed to the sandbox, browser-validated. **Not merged. No PR raised** — this report precedes the PR, as authorised.

---

## 1. What Phase 10 delivers

| Layer | What exists now | Where |
|---|---|---|
| Reporting contracts | `ReportingScope` (nine dimensions, strict), measure registry with classification (authoritative · factual · definition-pending · deferred), catalogue of 15 reports + 4 dashboards with grain, dimensions, drill-down, security, freshness, status | `packages/domain/src/reporting/` |
| Engine definitions | 15 Report Engine definitions as versioned JSON, provisioned idempotently by `qdb_reportcode`, all run and reconciled on the sandbox | `reporting/definitions/`, `crm/scripts/provision-reporting-definitions.mts`, `reporting/README.md` |
| Consumption | `IReportingService` over `qdb_RunReport` / `qdb_RunDashboard` as the signed-in user; zod contracts for the Engine's answer and refusal shapes; outcomes ok / refused / accessDenied / unavailable / malformed / timeout; scope → Engine parameters as **codes** | `apps/web/src/reporting/` |
| Dashboards | Four DCP dashboards as compositions of Engine reports (the Engine's own dashboard takes no parameters): Portfolio Overview, Supervisor Overview, Exception Overview, Historical Delinquency; KPI row, distribution tables, one count per configuration gap; definition ids resolved on the organisation by code | `apps/web/src/views/ReportingDashboardsView.tsx`, `reportPanel.tsx`, `reporting/dcpDashboards.ts` |
| Drill-down | A dashboard row opens the Cases list at `#cases/scope/…` in the scope it was counted in; CRM, bucket, status, strategy (incl. *Strategy Not Assigned* = null) and owner | `apps/web/src/data/caseListScopeUrl.ts`, `views/index.tsx` |
| Officer oversight (DCP-native) | My Day: eight scoped tiles — open cases, current arrears (one FetchXML sum), my open work, follow-ups overdue / upcoming, promises due in 7 days, awaiting assignment, identity exceptions | `apps/web/src/data/myDayOversight.ts` |
| Defect fixed on the way | KI-147: My Day follow-ups failed (HTTP 400) under a single-CRM scope; activities are now scoped through the case | `apps/web/src/data/activityScope.ts` |

Nothing computes in DCP: every dashboard figure is an Engine aggregate returned to the signed-in user. The dashboard reads **no case rows** (asserted by test); the only platform read it makes is the definition index.

## 2. KPI governance — what is and is not claimed

Every measure shown is **authoritative** (MIS-reported current arrears, balance, bucket) or **factual** (a count or sum whose meaning is fixed by the record fields alone, stated on the panel). Registered and **not computed**, each marked *Definition Pending QDB Confirmation*: cure rate, roll rate, recovery rate, collection effectiveness, PTP kept / broken rates, contact rate, right-party contact, liquidation rate, collector productivity, SLA compliance. Portfolio MIS transitions remain **deferred** (KI-53). Promise statuses are shown as *recorded by an officer, never a verified payment*. Communication facts are unchanged: native record creation proven, external delivery unproven.

## 3. Live evidence (System Administrator session — labelled as such; officer-role evidence remains open, KI-100 / 111 / 120)

| Check | Result |
|---|---|
| Portfolio totals (RPT-015) | 4,363 open cases · 3,780 customers · arrears 213,300,523.69 · balance 3,419,587,487.25 — equal to Screen 01 and the Phase 9 smoke |
| Engine ↔ drill-down parity | Bucket 61–90 row: Engine **228**; the platform `$count` for the identical filter as the same user: **228**; the Cases list opened with `#cases/scope/bucket=61-90` |
| CRM picker | Housing Loan: 4,360 cases · 3,779 customers; `SourceSystem=HL` sent to every case-grain report; drill-down URL carries `sourceSystem=HL&bucket=61-90` |
| Dropped dimensions | Activity-, PTP- and exception-grain panels say *Not narrowed by CRM* under a single-CRM scope; case-grain panels do not |
| Supervisor | Open activities by owner 5 + 7 = 12 = by-week total; promises Active 3 / Broken 1 / Kept 4 / Partially Kept 1 |
| Exceptions | Assignment configuration 0 · escalation configuration 0 · active activity types with no outcome 7 · strategy actions with no type 4 · open cases without customer 0 · without bucket 1 · integration exceptions 4; identity exceptions 3 |
| Historical | 7 observation points; the ARR book's single observation (4,358 facilities, 2026-06-30) shown as one row; weekly DEMO points shown as DEMO |
| Console | No errors |
| Operational workspace with the Engine unreachable | Tested: every panel says *Reporting service unavailable*; My Day, Cases and the rest are untouched |

## 4. Tests

| Suite | Count |
|---|---|
| domain | 829 |
| web | 780 |
| api | 355 |
| dataverse-client | 32 |
| auth-adapters | 14 |
| tooling | 10 |
| C# plugins (on record, unchanged) | 159 |
| **Total** | **2,179** (baseline 2,027; 0 skipped) |

Guard battery: eight planted defects each failed the test written to catch it — a `SourceSystem` filter on the wrong column; a catalogue dimension with no parameter; a null-strategy row with no drill-down; scope not restricted to a definition's dimensions; a bucket label sent to the Engine; a late answer accepted under a changed scope; the two from the definitions contract suite. The parity test drives the fake Engine and the fake list through **two independent interpreters** over one set of rows.

## 5. Report Engine facts established (no Engine code changed — the STOP gate was never approached)

1. A runtime-prompt filter whose parameter is absent is dropped — **except `IsNull`, which always applies** (KI-150). No DCP definition uses an IsNull prompt (guarded).
2. `qdb_RunDashboard` takes no parameters and applies no filters or access list (KI-151). DCP dashboards are compositions of reports.
3. Prompt filters address the main entity only (KI-152); activity-grain reports do not honour `SourceSystem`, and say so.
4. A choice filter given a **label** fails the run (`unexpected_error`); the option value narrows correctly. Scope values leave DCP as codes; an unknown label is refused, never dropped.
5. A multi-datasource definition returns `datasets[]`; the root datasource must be **Joined** or it returns no columns.
6. `dategrouping` groups in the running user's time zone (KI-153); declared on the Historical panel.
7. Money text carries the running user's currency format; DCP formats from the numeric value.
8. Refusals are HTTP 200 + `errorCode`; access denial is `report_failed` with a permission message.

## 6. Security

Every report runs through `Xrm.WebApi.execute` as the signed-in user; CRM security scopes the rows the Engine aggregates. No proxy API, no impersonation, no privileged aggregate, no credentials in code. **No `qdb_reportsecurity` grants were made**; the definitions carry none, which the Engine treats as unrestricted by itself, with CRM security still applying. Required for production, as a QDB decision: `canexecute` for a *DCP Collection Officer* role on DCP-RPT-001…004, 007…011; *DCP Supervisor* additionally 005, 009; *DCP Collection Manager* additionally 006, 013, 015 and the dashboards' member reports; *DCP Operations* 012, 014. Production changes: none.

## 7. Screen 01 Bucket × Strategy matrix — classification

The Workspace V2 Screen 01 matrix (unmerged) is **operational navigation**: each cell is a click-through into the Cases list for one bucket × one strategy, and its counts are the same FetchXML aggregate the list is filtered by. It is *not* rebuilt in the Engine in Phase 10. Its aggregates are already covered by DCP-RPT-001 (by bucket) and DCP-RPT-004 (by strategy); a bucket × strategy cross-tab would be one more generated definition (two group-by columns) if QDB wants it as a *report*. Decision recorded: the matrix stays DCP-native as navigation; the Engine holds the reporting view.

## 8. Workspace V2 reconciliation

V2 remains unmerged and untouched. Phase 10's contracts are workspace-agnostic: `IReportingService`, `ReportingScope`, the catalogue, `dcpDashboards.ts` and `reportPanel.tsx` take no dependency on V1 markup beyond `KpiRow` and the `grid` table class. V2 can host the same panels by supplying its own primitives. Two things will need care at merge time: V2 also added `aggregate()` to the adapter (identical body — take either), and V2's Screen 02 facet counts and Phase 10's Engine counts must keep agreeing (both are FetchXML as the user over the same filters; a smoke comparing them is the right merge check). KI-148 (V2 queue grid) does not apply to main.

## 9. Not done, and why

| Item | State |
|---|---|
| Drill-down from activity-grain reports into Work Queues | **Not wired.** The queue view has no scope route; recorded on the Dashboards notice. Cases drill-down is complete |
| Synthetic 10K / 50K / 100K runs | **Not executed** — they need permanent Dataverse rows, which the authorisation forbids. The scaling argument: DCP performs no client-side aggregation; every figure is one Engine aggregate over the full book (4,363 live); group-by results are bounded by the number of groups; the drill-down is the existing paged list; `$count`s are capped at 5,000+ |
| Officer-role browser evidence | Administrator evidence only (KI-100 / 111 / 120 open) |
| On-Prem | Compatible by design (Process Action wrapper in the Engine, injected operation names); **unproven** — Custom APIs cannot be imported on 9.1 |
| Power BI | Not adopted: external tenant, licensing, gateway and credentials; nothing the operational workspace needs |
| Export / print | Deferred to the Engine's own surfaces |
| KI-149 "awaiting assignment" | `ownerid eq null` is 0 by construction; what the phrase means is QDB's to define |
| `qdb_reportsecurity` grants | Recorded above; not made |

## 10. Known issues touched

KI-147 closed (`d49c02e7`). KI-149 (awaiting-assignment semantics), KI-150 (IsNull prompt), KI-151 (dashboard parameters), KI-152 (prompt reaches main entity only), KI-153 (dategrouping time zone) raised — three closed by design or declaration, two open for QDB.

## 11. Time

Baseline 29.5 effective hours (unchanged). Start 2026-09-26 01:27 +03. Wall-clock to this report is in `Phase10_Tracker.md`; it includes waits on the shared organisation's imports and on the user's browser session, and the Engine capability validation the Option C decision required. No re-estimate.

## 12. Next step

A PR from `feat/dcp-phase10-reporting-oversight` to `main`, raised only on the user's instruction. Nothing here is merged autonomously.
