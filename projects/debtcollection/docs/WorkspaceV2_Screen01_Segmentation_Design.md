# Workspace V2 — Screen 01: Segmentation & Strategy — analysis and design (read-only gate)

Branch `feat/dcp-workspace-v2` @ `56795933` (== `origin`), clean. Base `main` @ `cf4e7642`. V1 protected
and default; V2 behind the switch; no PR; Phase 10 not started. **Nothing in this document is
implemented.** All facts below were read from the repository and, read-only, from `org5869857f` on
2026-09-24 (service principal; no record created, changed or deleted; ARR only read).

---

## 1. What the screen is today

| | |
|---|---|
| Route | `buckets` — V1 label *Segmentation Matrix*, V2 nav label *Segmentation* (group *Strategy*) |
| V2 rendering | **V1's `SegmentationView` inside the V2 frame** (KI-142) — no V2-native page |
| Content | Five KPI tiles that all show `—` (Phase-5 placeholders, never filled) + a grid of **strategies and their criteria** (priority, code, name, DPD range, arrears range, exposure range, customer type, risk level, gating rule, state) with an *Active only* toggle |
| Matrix | **There is no matrix.** Nothing on the page is a population count |
| Sibling | `rules` (*Strategy Rules*, manager-only): the same strategy grid + actions per strategy + a disabled rule builder |

**Entities:** `qdb_collectionstrategy` (2 rows, both DEMO), `qdb_strategyaction` (4 rows, **none names an
activity type** — KI-106), `qdb_collectioncase` (4,363 open), `qdb_delinquencysnapshot` (history).
**Services/data:** `createStrategyQuery`, `createStrategyActionQuery`, `buildCaseFilter`/`createCaseQuery`,
`XrmCrmAdapter.count`; API side `StrategyService` → `RuleEngineClient.selectStrategy` →
`CaseStrategyOrchestrator.apply`. **Components:** `SegmentationView`, `StrategyRulesView`, `DataGrid`, `KpiRow`.

## 2. What "Segmentation" actually means here

**A + F: MIS bucket classification, read by the Rule Engine against configured strategy criteria.**

- MIS is authoritative for DPD, arrear bucket, arrears and balance; DCP never recomputes them
  (`MISIntegration.md`, MP §17). The bucket arrives from MIS as one of **ten codes** enforced at the
  normalisation boundary (`ARREAR_BUCKET_CODES`) and stored on the case as the option set
  `qdb_currentarrearbucket` — `1-30, 31-60, 61-90, 91-180, 181-270, 271-360, 361-500, 501-1000,
  1001-2000, >2000`. **Not configurable in Dataverse**; changing it is a MIS-contract change.
- A *strategy* is configuration (`qdb_collectionstrategy`) whose criteria are DPD/arrears/exposure ranges,
  customer type, risk level, NPL flag, broken-PTP count, legal/restructure status. The Rule Engine
  (North52 through `RuleEngineClient`) selects one for a case; the API writes `qdb_strategyid`.
- **There is no Segment entity, no persisted segmentation, and none should be created.**
  `msdyn_segmentid` on contact/account is Dynamics Marketing's, unrelated.

The real flow is exactly the one in the brief:
`MIS → DPD / arrears / balance / bucket → eligibility (Rule Engine) → strategy → strategy actions →
collection activities`. "Segmentation" is a visualisation over the first and fourth steps.

## 3. Facts that decide the design

| Question | Finding |
|---|---|
| Buckets in the reference (5) vs real (10) | Real is **ten**; 548 open cases sit in `>2000` alone (QAR 125.1M arrears). A 5-row matrix would hide 63% of the arrears |
| Risk 1–10 | **No authoritative source for the case population.** `qdb_collectioncase.qdb_risklevel` (Low/Medium/High) is **null on all 4,363**; the strategy criterion `qdb_risklevel` is null on both strategies; HL **contacts carry no risk field at all**; BFD **accounts** carry `qdb_existing_risk_rating` (*QDB/PFR 1–10*), `qdb_grade` (A–D), `qdb_risklevel`, `qdb_riskscore` — populated on **none** of the 6 accounts. → **Risk dimension — Definition/Data Source Pending QDB Confirmation** |
| Grain | Domain: a case is *one delinquent facility, one delinquency episode*. Live: **4,363 open cases = 4,363 distinct facilities**, 3,780 customers. Count grain = **case** (= one open case per delinquent facility). Not "accounts" |
| Financial measure | `SUM(qdb_currenttotalarrears)` over open cases — MIS's last reported **arrears**, stored on the case. Not "exposure": FR-034 forbids exposure segmentation and the amendment (KI-11/KI-32) is still awaiting QDB |
| Freshness | Cases' MIS as-of max `2026-09-17 22:04`; last sync `2026-09-17 22:04` → `2026-09-18 22:45` (two days across the book) |
| Strategy coverage | **5 of 4,363** open cases carry a strategy (the DEMO cases). The 4,358 ARR cases were loaded by `load-arrear-report.mts`, which bypasses strategy resolution |
| Case state | 4,359 *New*; owner: one user for all (KI-100 — no officer can hold work) |
| Customer type | 4,360 Individual, 3 SME (all BFD) |
| `qdb_priority` on case | Option set label is literally `████` (broken metadata); null on all rows |
| Server aggregation | **FetchXML `aggregate="true"` works through the user's session** (`?fetchXml=` on the entity set): count + sum grouped by bucket × org in **~160 ms**, 14 rows. RBAC applies because it runs as the user. Dataverse limits: `$count` caps at **5,000**; aggregate queries fail beyond **`AggregateQueryRecordLimit` (default 50,000)** with `0x8004E023` |
| Strategy runtime | Selection is **product** in the API's MIS-sync path (`BackgroundSyncRunner → CaseStrategyOrchestrator.apply` on CaseCreated/Updated/Reopened). Action materialisation (`planStrategyWork`) is **Contract + Harness only** — no execution host (Phase 8 closure, unchanged) |
| Explainability evidence | Case: `_qdb_strategyid_value`, `qdb_eligibilityrulesetversion`, `qdb_correlationid`; API log: "Strategy X assigned … chosen by ruleset R version V". No matched-condition detail exists |

## 4. Reference vs current V2 vs backend

| Area | Reference | Current V2 | Backend capability | Recommendation |
|---|---|---|---|---|
| Page title | Segmentation & Strategy | Segmentation | see §11 | **IMPROVE → "Portfolio & Strategy"** (recommend; don't rename yet) |
| Navigation | left rail + duplicate top tab strip | left rail only | — | **REMOVE** the top strip (V2 already has none — keep it out) |
| Matrix | bucket × risk, count + QAR + shade | none | FetchXML aggregate, RBAC-scoped | **REPLACE** placeholder tiles with a real bucket × strategy matrix |
| DPD buckets | 5 | 10 (strategy grid) | 10 MIS codes | **KEEP the 10**; **do not** collapse to 5 |
| Risk | 1–2 … 9–10 | — | none authoritative | **BLOCKED — DATA SOURCE REQUIRED** |
| Counts | "Accounts" | — | cases (= facilities) | **REPLACE** label with *cases* |
| Financial | "QAR … exposure" | — | current arrears | **REPLACE** with *current arrears*; balance optional toggle later |
| Heatmap | exposure shade | — | arrears sum | **IMPROVE**: shade = arrears, legend, text always shown |
| Strategies | SR-01… narrative | real 2 DEMO rows | `qdb_collectionstrategy` | **KEEP** real config; render real columns |
| Priority | SR order | `qdb_priority` | real | KEEP |
| Criteria | DPD/segment/risk/QAR | shown | real | KEEP (as config, with "any" where null) |
| Actions | "SMS→Call" chains | actions grid on `rules` | 4 rows, no activity type | **IMPROVE**: actions per strategy inline; say activity type is unconfigured (KI-106) |
| Comms/PTP/assignment/escalation in rules | narrative | — | not configured | **REMOVE** (do not invent) |
| Filters | none | Active only | CaseQuery: scope, bucket, status, search | **IMPROVE**: CRM scope (existing picker), open-only, strategy |
| Drill-down | none | none | `buildCaseFilter` at the source | **REPLACE**: every populated cell opens Cases with the same filter |
| Configuration/editing | — | disabled rule builder (V1) | thresholds live in the Rule Engine | **REMOVE** the builder from V2; read-only here |
| Security | — | — | RBAC applies to aggregate and list alike | KEEP (see §9) |
| Paging/scalability | — | strategy grid paged | aggregate limits above | design in §10 |
| KPI tiles | — | five `—` tiles | — | **REMOVE** |

## 5. Who the page is for, and why

- **Collection Officer:** see where the delinquent book sits (rows), whether a strategy governs it
  (columns), open the cell that needs attention, land on the cases, open one, act. *Decision:* which
  population to work next.
- **Supervisor:** distribution and **strategy coverage gap** ("No strategy" is 4,358 today); drill-down
  to the same lists.
- **Admin:** what is configured (strategies, criteria, actions, gating rule). **Editing is not here** —
  it stays in the CRM configuration forms / Phase 8 authoring; the page stays read-only for every role.

**Process answers:** the page does not duplicate Work Queues (activities by operational bucket) nor
Strategy Rules (configuration) — it is the only place that joins *portfolio* and *strategy coverage*.
It overlaps Phase 10 only if trends, rates or KPIs are added; none are. Shortest useful workflow:
**open page → click cell → open case → Log action** (three clicks).

## 6. Recommended matrix

**Rows:** the ten MIS buckets, in order. **Columns:** the case's resolved strategy — one column per
active strategy plus **"No strategy"** — and a **Total** column. **Filters:** CRM scope (the existing
global picker), open cases only (default; a toggle to include closed is not offered in this version).
**Measure per cell:** count of cases + sum of current arrears; shade = arrears.

*Why not Bucket × CRM or × state:* CRM is 3 cases vs 4,360 and the picker already scopes it; state is
4,359 *New*. Strategy is the only column that tells a supervisor something actionable today: the
uncovered population. If the Rule Engine is later run over the book, the matrix fills in without change.
A column-dimension toggle (Strategy | CRM | State) is a cheap later IMPROVE, not part of this package.

**Cell → filter contract** (one definition, used by the aggregate, the count, the sum and the drill-down):

```
cell(bucket B, strategy S) ⇔
  statecode eq 0
  and qdb_currentarrearbucket eq <code(B)>
  and (_qdb_strategyid_value eq <id(S)> | _qdb_strategyid_value eq null for "No strategy")
  and <scope clause from the CRM picker>
```

Implemented as one `CaseQuery` object per cell: `buildCaseFilter(q)` gives the drill-down `$filter`; a
small, field-restricted translator gives the same conditions as FetchXML `<filter>` for the aggregate.
Reconciliation is asserted, not hoped for (§13). **No DPD-range arithmetic anywhere** — the bucket is a
stored MIS code, so boundary questions (1/30/31/60/61) are MIS's; DCP tests only that each code maps to
exactly one row and that the ten rows are exhaustive.

**Grain and labels:** "cases"; subtitle *one open case per delinquent facility*; count label
`61 cases`, amount label `QAR 6.1M arrears`. Accessible name: *"61 to 90 DPD, DEMO-Early stage, 61 cases,
QAR 6.1 million current arrears. Open matching cases."*

**Zero vs unknown:** `0` renders inert (not focusable, muted). An unanswerable cell (aggregate refused or
over the limit) renders `—` with *"could not be counted"* and **remains openable** — the list pages
regardless. Never `0`.

## 7. Drill-down, destination, context

- **Destination: Collection Cases (V2), not Work Queues.** The matrix counts *cases* by *delinquency*
  bucket; Work Queues lists *activities* by *operational* bucket — a different population that could not
  reconcile. Cases already filters by bucket, scope, status and search at the source and opens the Case
  Workspace.
- **URL:** the existing three-segment router carries it unchanged:
  `#cases/filter/bucket=61-90&strategy=<id|none>` (`recordId = "filter"`, `tab = encoded pairs`). The
  matrix's own state is also in the URL (`#buckets/matrix/scope=HL`) so Back restores it. Scroll position
  and last cell: `sessionStorage`, per browser.
- **Visible context on Cases:** a *Filtered by* strip — `[Bucket 61–90 ×] [Strategy: none ×]` — with
  *← Back to Portfolio & Strategy*, the existing sort/search/paging, and *Clear all*. Removing a chip
  edits the URL, which re-queries the source.
- **Journey:** matrix → cell → Cases (filtered) → row → Case Workspace → Back → Cases (same filters,
  same scroll) → Back → matrix (same scope, same cell highlighted).
- **Additive query change only:** `CaseQuery` gains optional `strategyId?: string` and
  `noStrategy?: boolean`; absent → identical filter to today (asserted).

## 8. Reconciliation

- **Count:** for every populated cell, `adapter.count(buildCaseFilter(cellQuery))` must equal the
  aggregate's `n` (capped `5,000+` is accepted as `≥`). Asserted in unit tests with a shared fake and in
  a **read-only live smoke** across all cells.
- **Amount:** the aggregate's `sum(qdb_currenttotalarrears)` for a cell must equal the sum over the
  drill-down pages of the same query (live smoke pages the cell to its end). Same grain (case), same
  filter, same identity.
- **Totals:** row and column totals come from the same aggregate result, never re-summed in React from
  a different read.

## 9. Security-scoped aggregation

Both the aggregate (`?fetchXml=` through `Xrm.WebApi`/the same-origin transport) and the drill-down run
**as the signed-in user**, so CRM RBAC scopes them identically: an officer who can read 42 cases counts
42. No proxy, no impersonation, no elevated read. Consequence to state plainly: under KI-100 an officer
would see an honest matrix of what they can read (today: nothing), and the page must say *"no cases are
readable in this session"*, not show zeros as facts.

## 10. Large data

| Book | Behaviour |
|---|---|
| ≤ 50K open cases (today 4.4K) | One aggregate per scope partition (HL, BFD) → ≤ 20 groups each; ~200 ms; no rows downloaded |
| > 50K | Dataverse refuses the aggregate (`AggregateQueryRecordLimit`). The page then marks cells *unknown* and falls back to **per-cell `$count`** (10 × ≤ 3 calls, each capped at `5,000+`) — degraded but honest. Raising the limit is an org setting: **QDB admin decision** |
| 100K+ | The right source is MIS's own `GetArrearBreakdown` (bucket aggregates, documented as supported by the supplied data, **API TBD**) — Phase 10 / MIS-contract work, not this screen |

The drill-down is the existing server-paged, virtualised Cases list; nothing loads the portfolio.

## 11. Name, IA, wireframe

**Recommended name: "Portfolio & Strategy"** — rows are the delinquency portfolio as MIS reports it,
columns are strategy coverage; it avoids implying a Segment concept. Route id `buckets` unchanged.

```
─────────────────────────────────────────────────────────────────────────────
Strategy › Portfolio & Strategy
Where the delinquent book sits, and which strategy governs it.
                     Stored MIS position · as of 2026-09-17 22:04 · synced to 2026-09-18 22:45
CRM: [Both ▾]   Open cases only
─────────────────────────────────────────────────────────────────────────────
PORTFOLIO — cases by delinquency bucket and resolved strategy      Shade = current arrears
                 DEMO-Early    DEMO-Pre-legal    No strategy      Total
1–30 DPD         [2 · 3.1K]    [0]               [1,670 · 2.4M]   [1,672 · 2.5M]
31–60 DPD        …
… (10 rows, MIS order) …
>2000 DPD        [0]           [0]               [548 · 125.1M]   [548 · 125.1M]
Total            [2 · 3.1K]    [3 · …]           [4,358 · …]      [4,363 · 212.6M]
legend ▁▂▃▄▅  0 → QAR 125M          ⓘ 4,358 open cases have no resolved strategy.
─────────────────────────────────────────────────────────────────────────────
STRATEGIES — what QDB has configured                  read-only · edited in CRM configuration
Priority | Code | Strategy | DPD | Arrears | Customer type | Risk | Gated on | Cases governed | State
  10     | DEMO-EARLY | … | 1–30 | 500–50,000 | Individual | any | DEMO-RULE-STRATEGY | 2 | Active
  30     | DEMO-PRELEGAL | … | 91–180 | 50,000–5M | SME | any | … | 3 | Active
  ▸ actions (sequence, name, trigger, day, channel, activity type — "not configured" where null)
─────────────────────────────────────────────────────────────────────────────
```
Three sections, three meanings: **Portfolio** (observation), **Strategies** (configuration), and
**Cases governed** (execution/coverage, from the same aggregate). No *Run/Apply/Evaluate* control.

## 12. GUI review of the reference (specific changes)

Keep: calm card, uppercase row/column labels, count-over-amount cell layout, priority-ordered strategy
list. Change: (1) ten rows, not five; (2) label the measure *arrears*; (3) add a *Total* row/column;
(4) show a legend and never rely on shade alone; (5) cells are buttons with hover/focus/pressed states,
not divs; (6) replace the risk columns; (7) drop the second tab strip; (8) replace narrative rule text
with configured fields and *not configured* where empty; (9) add the freshness line; (10) QAR
formatting: `QAR 2.4M` in cells, full `QAR 2,448,031` in the tooltip/accessible name; (11) narrow
widths: the matrix scrolls horizontally inside its card with a sticky first column.

## 13. Test plan

Domain: cell definition from bucket × strategy; exhaustive ten rows; zero → inert, unknown → `—`;
the same `CaseQuery` produces the aggregate filter and the drill-down filter (string equality on both);
FetchXML translator refuses fields outside the contract. Component: populated cell clickable with
mouse, Enter and Space; accessible name; `aria-pressed`/selected; legend present; shade never the only
signal; contrast (extend `v2Contrast`). Page: aggregate answered → cells; refused → unknown, not zero;
cell click → `#cases/filter/…`; Cases reads the URL, shows chips, sends the filter to the source
(recorded query asserted), Back restores; stale response suppression (old aggregate cannot overwrite a
newer scope); scope change re-queries. Reconciliation: fake source where count/sum/list share one
table; every cell's `count(filter)` equals `n`. Live (read-only): aggregate vs `$count` vs paged sum on
every populated cell. V1: unchanged (existing coverage + no V2 classes in V1).

## 14. Lists

**KEEP** ten MIS buckets · real strategy configuration and priority · CRM scope picker · read-only
policy · V1 untouched.
**IMPROVE** page name · freshness line · actions inline under each strategy · Cases page filter chips
and Back link · heatmap with legend.
**REMOVE** (from the V2 page) the five `—` KPI tiles · the disabled rule builder · the reference's top
tab strip · narrative rule text · SMS/call timings, PTP-mandatory, queue names.
**REPLACE** placeholder tiles → real bucket × strategy matrix · "Accounts" → cases · "exposure" →
current arrears · risk columns → strategy columns.
**DEFER TO PHASE 10** trends, roll/cure/recovery rates, collector productivity, portfolio KPIs, MIS
`GetArrearBreakdown`/`GetArrearTrend` dashboards, closed-case history views.
**BLOCKED — DATA/POLICY** Risk dimension (no authoritative source) · exposure as a measure (FR-034 /
KI-32 pending) · aggregate beyond 50K (org setting) · running the ARR book through strategy resolution
(ops decision, not a screen concern).

## 15. Work packages (if approved)

| WP | Scope | Est. h |
|---|---|---|
| S1 | Adapter `aggregate()` over `?fetchXml=` (Xrm path + transport), field-restricted FetchXML builder from `CaseQuery`, limit/refusal handling → unknown | 2.0 |
| S2 | Domain: matrix cell definitions, bucket order, zero/unknown, cell → `CaseQuery` contract | 1.5 |
| S3 | `MatrixCell`/`PortfolioMatrix` components: heatmap, legend, totals, a11y, sticky column | 2.0 |
| S4 | URL filter contract, Cases page chips + Back, additive `strategyId`/`noStrategy` filter | 2.0 |
| S5 | Strategies section: config columns, actions inline, *Cases governed* from the aggregate | 1.5 |
| S6 | Page assembly, freshness line, nav label, styles | 1.0 |
| S7 | Tests incl. reconciliation, and a read-only live reconciliation smoke | 2.0 |
| S8 | Deploy to the same web resource; browser QA (admin evidence); V1 smoke | 1.5 |
| S9 | Docs, KIs, tracker | 0.5 |
| | Debugging allowance | 1.0 |
| | **Estimate** | **15.0 h** |

No schema change. New read-only capability only (aggregate read path). Additive query fields only.

## 16. Decisions required from QDB / the user

1. **Risk dimension:** is BFD's `qdb_existing_risk_rating` (*QDB/PFR 1–10*) the authoritative grade,
   and is there any grade for HL customers? Until answered: no risk column.
2. **Column dimension:** approve *Strategy* (with *No strategy*) as the default column.
3. **Measure:** approve *current arrears* (and whether loan balance may be offered as a toggle given
   FR-034 / KI-32).
4. **Screen name:** *Portfolio & Strategy*.
5. **Scale:** whether `AggregateQueryRecordLimit` may be raised above 50,000 when the book grows.
6. **Metadata defect:** `qdb_collectioncase.qdb_priority` option label is `████` — fix in the solution
   (proposed KI).
7. **Ops:** the 4,358 ARR cases have never been strategy-resolved; whether to run them through the
   Rule Engine is a QDB operational decision and would change the matrix's columns from empty to real.

## 17. Decisions taken and implementation closure (2026-09-24)

| §16 item | Decision | Applied as |
|---|---|---|
| 1 Risk | **Deferred Pending Authoritative Cross-HL/BFD Data Source and Definition** | No risk column, no risk wording (KI-144) |
| 2 Columns | Strategy + explicit **Strategy Not Assigned** | Neutral column, never an error; all ten MIS buckets as rows |
| 3 Measure | **Current arrears** (`qdb_currenttotalarrears`); no loan balance toggle | Labelled *arrears* in every cell, legend and screen-reader text |
| 4 Name | **Portfolio & Strategy** | Route id `buckets` kept; V1 navigation untouched |
| 5 Scale | `AggregateQueryRecordLimit` **not raised, not modified** | Unavailable state above the limit (KI-145) |
| 6 Metadata | Recorded, not fixed | KI-143 |
| 7 ARR resolution | **Not run** — requires explicit QDB authorization; not part of Screen 01 | KI-146 |

Implementation record: `docs/WorkspaceV2_Tracker.md` (Screen 01 section). Commits `15ef385a`, `87763c02`.
