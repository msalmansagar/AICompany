# Workspace V2 — tracker

Branch `feat/dcp-workspace-v2` · base `cf4e7642` · **start 2026-09-24 13:03:04 +03 (Asia/Qatar)** ·
plan `docs/WorkspaceV2_Plan.md`.

| | |
|---|---|
| Baseline | **51.00 effective hours** (AI-assisted estimate) — not rewritten |
| Revised forecast | **52.00 h** — +1.00 h: second reference reviewed (13:15 +03), see plan §1b |
| Expected completion | 2026-09-26 18:00 +03 |
| Effective time | measured from session transcripts, gaps under 15 minutes counted |
| Idle / blocked | recorded separately |

**Status: ENGINEERING AND VALIDATION COMPLETE · READY FOR REVIEW** (2026-09-24 ~19:05 +03) — see
`docs/WorkspaceV2_Closure.md`. V1 is the default and is protected. V2 is parallel, behind the switch.
Not a PR, not merged, V2 not default. Phase 10 not started.

| Remaining WPs | State | Commit(s) |
|---|---|---|
| WP10 Action Plan + Activities | Activities native in the case; global Action Plan re-skinned V1 (KI-142) | `e3d53180` |
| WP12 Communications + bulk | Re-skinned V1 in the V2 frame — business rules not copied (KI-142) | `e5964184` |
| WP15 Remaining screens | Re-skinned V1 in the V2 frame (KI-142) | `e5964184` |
| WP16 A11y / responsive / perf | Done — skip link, AA contrast from tokens, bundle measured; narrow widths not live (KI-141) | `660c5716` |
| WP17 Regression | Done — 2,235 passing, 0 skipped | — |
| WP18 Cloud + browser QA | Done — System Administrator evidence; 2 findings fixed | `cb3cd5da` |
| WP19 Docs + closure | Done | closure commit |

**Final timing:** effective **1.93 h** measured; non-working 4.10 h separate; baseline 51.00 h
(forecast 52.00) unchanged; variance −49.07 h, in different units.

### Checkpoint — 2026-09-24 18:35 +03

| | |
|---|---|
| Effective, measured | **1.43 h** since 13:03 (transcript steps, gaps under 15 minutes) |
| Non-working | **4.10 h**: a 3.5 h pause 14:39 → 18:09 (a quick file read returned 3.5 h later — the session was suspended; the cause is not visible in the transcript), plus 21 and 15 minute waits |
| Delivered, at estimate | WP1–WP9, WP11, WP13, WP14 ≈ 30.5 h of the 52.0 h forecast |
| Web tests | 796 (627 at base) |
| Forecast | 2026-09-26 18:00 +03 — unchanged |

| WP | Est. h | State | Commit(s) |
|---|---|---|---|
| WP1 Analysis + inventory (+ second reference) | 1.50 (+1.00) | Done | `6bbbe8fc`, `1c7af34f` |
| WP2 Version resolver + switch | 2.00 | Done | `141cc251` |
| WP3 Tokens + isolation | 2.50 | Done | `141cc251` |
| WP4 Shell + navigation | 3.00 | Done | `21aae852` |
| WP5 Home | 2.00 | Done | `a4b02a12` |
| WP6 Work Queue | 2.50 | Done | `663ec974` |
| WP7 Cases | 2.00 | Done | `1400a07c` |
| WP8 Case Workspace | 5.00 | Done | `e3d53180`, `fd8455f0` |
| WP9 Customer 360 | 2.50 | Done | `da8cbc53` |
| WP10 Action Plan + Activities | 2.50 | Activities done in the case; global Action Plan still V1 content in the V2 frame | `e3d53180` |
| WP11 PTP | 1.50 | Done | `e04a3907` |
| WP12 Communications + bulk | 2.50 | — | |
| WP13 Advanced processes | 1.50 | Done — queues and the case's Workout & Legal tab | `663ec974`, `e3d53180` |
| WP14 Reusable primitives | 2.50 | Done | `c91e8f25` |
| WP15 Remaining screens | 3.00 | — | |
| WP16 A11y / responsive / perf | 2.50 | — | |
| WP17 Regression + tests | 3.00 | — | |
| WP18 Cloud + browser QA | 4.00 | — | |
| WP19 Docs + closure | 2.00 | — | |
| Debugging allowance | 3.00 | | |

## Screen 01 — Portfolio & Strategy (implementation)

| | |
|---|---|
| Authorised | 2026-09-24, design commit `594828aa` accepted |
| **Start (resume)** | **2026-09-24 21:12:42 +03** |
| Baseline | **15.0 effective hours** (9 WPs, design package §15) — not rewritten |
| Expected completion | 2026-09-25 18:00 +03 |
| Decisions applied | name *Portfolio & Strategy* (route id `buckets` kept); rows = 10 MIS buckets; columns = strategy + *Strategy Not Assigned* + Total; measure = current arrears; grain = open case (one per delinquent facility); no risk; no exposure; ARR not run through resolution; `AggregateQueryRecordLimit` untouched |

| WP | Scope | Est. h | State |
|---|---|---|---|
| S1 | Adapter `aggregate()` over FetchXML; refusal → unknown | 2.0 | Done — `15ef385a` |
| S2 | Cell contract: one definition → aggregate filter, count, sum, drill-down | 1.5 | Done — `15ef385a` (`v2/data/portfolioMatrix.ts`) |
| S3 | Matrix components: heatmap, legend, totals, a11y, sticky column | 2.0 | Done — `15ef385a`; cell class collision with the grid fixed in `87763c02` |
| S4 | Drill-down URL, Cases chips + Back, additive strategy filter | 2.0 | Done — `15ef385a`; case → list return added in `87763c02` |
| S5 | Strategies section: config, actions, *Cases governed* | 1.5 | Done — `15ef385a` |
| S6 | Page assembly, freshness, nav label | 1.0 | Done — `15ef385a` |
| S7 | Tests + read-only live reconciliation smoke | 2.0 | Done — 61 new tests (917 web); `crm/scripts/smoke-portfolio-matrix.mts` 57/57 live |
| S8 | Deploy (same web resource), browser QA, V1 smoke | 1.5 | Done — deployed 3×, 11/11 each; 2 live findings fixed (`87763c02`); V1 smoke clean |
| S9 | Docs, KIs | 0.5 | Done — KI-143…146, design §17, this record |
| | Debugging allowance | 1.0 | drawn on for the two live findings |

### Screen 01 closure — 2026-09-24 22:00 +03

**SCREEN 01 — PORTFOLIO & STRATEGY — ENGINEERING AND VALIDATION COMPLETE · AWAITING VISUAL REVIEW.**
Not a PR. V2 not default. V1 intact. Screen 02 not started.

| | |
|---|---|
| Commits | `15ef385a` (feature), `87763c02` (two live findings), docs commit — on `feat/dcp-workspace-v2`, base `cf4e7642` |
| Start | 2026-09-24 21:12:42 +03 (authorization received 21:11:36 +03) |
| End | 2026-09-24 22:00 +03 |
| Baseline | **15.0 h** — not rewritten |
| Effective, measured | **0.79 h** (transcript steps, gaps under 15 minutes counted; there was no gap of 15 minutes or more) |
| Idle / blocked | 0.00 h |
| By commit time | S1–S7 21:12 → 21:32 (0.33 h); S8 incl. two fixes 21:32 → 21:52 (0.33 h); S9 21:52 → 22:00 |
| Variance | −14.21 h against the baseline — different units: an effort estimate against measured AI-assisted session time |
| Tests | web 917 / 917 (913 at S7, +4 for the two live findings); the rest of the 2,235 baseline untouched; 0 skipped |
| Guards that bite | G1 refusal→zeros · G2 drill-down drops strategy · G3 aggregate ignores scope · G4 stale answer repaints · G5 five prototype buckets · G6 activity type inferred · G7 cell forgets origin · G8 Cases ignores URL strategy · G9 page CSS restyles a shared class · G10 case forgets the list · G11 list forgets to record — each planted, each fails a test, each restored |
| Live reconciliation | `smoke-portfolio-matrix.mts`, read-only, service principal: **57/57** — every populated cell in both scopes, count = `$count` = paged rows, arrears equal to the cent (e.g. 1-30 × Not Assigned 1,670 / QAR 2,440,630.56; >2000 × Not Assigned 548 / QAR 125,115,361.07; 91-180 × DEMO-PRELEGAL 1 / QAR 188,400.00) |
| Browser (System Administrator, `data=ui=v2`) | matrix (10 rows; DEMO-EARLY / DEMO-PRELEGAL / Not Assigned / Total; grand 4,362 · QAR 213.3M; 1 unbucketed case named) → 61-90 × Not Assigned (227) → Cases chips *DPD: 61-90* + *Strategy: Strategy Not Assigned* → paged to "227 shown — end of results" → case ARR-HL-01615 → ← Cases returns to the filtered list → ← Back to Portfolio & Strategy with the cell marked (`aria-pressed`) · deep link `#cases/filter/bucket=91-180&strategy=none&scope=HL&from=portfolio` after a frame reload → 3 chips, scope HL, 318 rows · keyboard Enter on a focused cell opens Cases · BFD scope: 3 cases / QAR 214K = both-CRMs minus HL · Strategies: DEMO-EARLY actions SMS day 0, Call day 3, activity type *Not configured* · V1: renders, its navigation unchanged (*Segmentation Matrix*), profile left on V1 |
| Findings fixed live | (1) matrix cells used the grid's `v2-cell` class — Cases headers stacked; renamed to `v2-matrix-cell`, style-contract guard added; (2) ← Cases lost the drill-down filters; the list records them on row open and the case leads back |
| Not proven | narrow viewport (KI-141, DOM-narrowed only); Collection Officer role evidence; On-Prem |

## Screen 02 — Collection Cases (implementation)

| | |
|---|---|
| Authorised | 2026-09-24, reference-accurate Split + Grid redesign; V2 only |
| **Start** | **2026-09-24 23:28:51 +03** (instruction received; pre-coding report returned 23:36) |
| Baseline | **18.5 effective hours** (9 WPs + 1.0 debug) — not rewritten |
| Expected completion | 2026-09-25 20:00 +03 |
| Decisions applied | no KPI cards; no Reassign (KI-100); Export deferred (Phase 10); no Risk (KI-144), Priority (KI-143), SLA/TAT (KI-101), Next review, Contact rate; Segment → *Customer type*; ten MIS buckets with an ordinal bucket-visual contract; counts by one FetchXML aggregate built from the same CaseQuery |

| WP | Scope | Est. h | State |
|---|---|---|---|
| C1 | Bucket visual contract, ten tokens + contrast pairs, dot + badge, adoption across V2 | 2.0 | Done — `c9fdc447` (`v2/data/bucketVisual.ts`) |
| C2 | CaseQuery additions: owner scope, facility/name search, list columns (name, product, strategy, owner); V1 regression | 1.5 | Done — `c9fdc447`; V1 identifier search asserted unchanged |
| C3 | Bucket facet counts from the same query (FetchXML); All chip; unknown on refusal | 2.0 | Done — `c9fdc447` (`v2/data/caseFacets.ts`); live 65/65 |
| C4 | Split view: compact rows, selection, keyboard, preview panel, commands via existing dialogs | 4.0 | Done — `c9fdc447`, `4b06aee1` |
| C5 | Grid view: columns, server header sorting, Split/Grid toggle + preference, narrow behaviour | 2.0 | Done — `c9fdc447` |
| C6 | Portfolio filters, return context, selection restore | 1.0 | Done — `c9fdc447` |
| C7 | Tests + guard battery | 3.0 | Done — 52 tests in `v2CasesPage.test.tsx` (+4 elsewhere); web 964; 12 planted defects bite |
| C8 | Deploy (same web resource), browser QA (three flows), V1 smoke | 1.5 | Done — deployed 2×, 11/11; three flows + search + My cases + sort; V1 clean |
| C9 | Docs, KIs | 0.5 | Done — `WorkspaceV2_Screen02_CollectionCases.md`, KI-147/148, KI-141 amended |
| | Debugging allowance | 1.0 | drawn on for the G1 test-data gap and the stat-strip wrap |

### Screen 02 closure — 2026-09-25 00:41 +03

**SCREEN 02 — COLLECTION CASES — ENGINEERING AND VALIDATION COMPLETE · AWAITING VISUAL REVIEW.**
Not a PR. V2 not default. V1 intact. Screen 03 not started.

| | |
|---|---|
| Commits | `ce410210` (open), `c9fdc447` (feature), `4b06aee1` (preview strip), docs commit — on `feat/dcp-workspace-v2`, base `cf4e7642` |
| Start | 2026-09-24 23:28:51 +03 (instruction received; pre-coding report 23:36) |
| End | 2026-09-25 00:41 +03 |
| Baseline | **18.5 h** — not rewritten |
| Effective, measured | **1.21 h** (transcript steps, gaps under 15 minutes counted) |
| Idle / blocked | 0.00 h |
| Variance | −17.29 h against the baseline — different units: an effort estimate against measured AI-assisted session time |
| Tests | web **964 / 964** (917 at Screen 01 → +47); domain 817 · api 351 · dv-client 32 · auth 14 unchanged; 0 skipped |
| Guards that bite | G1 facet ignores owner · G2 facet ignores search · G3 refusal→zeros · G4 layout switch drops sort · G5 preference forgotten · G6 header sort never flips · G7 row click navigates · G8 My cases without ownership · G9 search narrowed to identifiers · G10 next action invented · G11 arrows do not move · G12 V1 search widened — each planted, each fails a test, each restored |
| Live reconciliation | `smoke-cases-facets.mts`, read-only, service principal: **65/65** across eight narrowings (both CRMs, HL, status New, Strategy Not Assigned, three searches incl. customer name, ownership) — facet total = `$count`, every non-empty bucket = its narrowed `$count` |
| Browser (System Administrator) | see `WorkspaceV2_Screen02_CollectionCases.md` §3 — three flows, search "1614" (4 = 4), My cases 0, Grid header sort desc/asc on the wire, V1 unchanged |
| Not proven | narrow viewport (KI-141); Collection Officer role evidence; On-Prem |

**Post-closure, by the user's instruction (2026-09-25 01:45–02:15 +03):** the reference's thin vertical bucket bar now leads every record row — V2 Split (`16802ea0`) and Grid, case History, Customer 360 facilities; **V1** Collection Cases, Case Detail history, Customer & Loan 360 facilities and snapshots, Delinquency Intake (`88fd44e3`). One shared contract (`apps/web/src/data/bucketVisual.ts`); V1's five-tone `--dpd` ramp replaced by the same ten per-bucket hues V2 uses (equality asserted). Presentation only; V1 queries and behaviour unchanged. Deployed 11/11, verified in both workspaces; web 976/976.

**Post-closure, Option 2 alignment (2026-09-25 02:20–02:55 +03, user-approved after analysis):** `a7bfd491` + `bf6def9f` — identity packed into two columns (case over `CRM · customer type`, customer over product), order Case · Customer · Arrears · Bucket · DPD · Status · Strategy · Owner, Loan balance out of the Grid (kept in Split, the preview and the sort options), two-row toolbar with the Split-only sort select and the unbucketed count folded into the All chip, a count-and-order footer from the facet total, header search wording. **No command bar in Grid, by decision:** a Grid row opens the case; actions live on the record and in the Split preview. Presentation only. Web 977/977; deployed 11/11.

**Promise to Pay — Split and Grid (2026-09-26 00:50–01:20 +03, by the user's instruction):** `713db4e1` — a promise row carries its case (bucket, DPD, arrears, CRM, customer type, name) expanded in the same read through `qdb_collectioncaseid_qdb_collectionactivity`, never per row; Split previews the promise's case with the shared `CasePreview` and `CaseCommandDialogs`; Grid opens the case on its Promises tab; preference `dcp.v2.promisesLayout`; V1's Promise to Pay list gains the bar from the same read. Also `928722c4` (fitted-grid padding + widths) landed after the org's customization window cleared. Web 982/982; four planted defects bite; deployed 11/11; both layouts and V1 verified live.

## Rebase onto main + Phase 10 integration (authorised 2026-09-26)

| Item | Value |
|---|---|
| Start (Qatar) | 2026-09-26 20:21 +03 |
| Old V2 tip | `0dbcf59f` (last reported to the user as `226836be`; the Promise to Pay Split/Grid work moved it) — safety tag `v2-pre-rebase-0dbcf59f`, branch `backup/dcp-workspace-v2-pre-rebase`, both on origin |
| New base | `main` @ `a997496d` (Phase 10 merge commit; merge-base was `cf4e7642`; V2 38 ahead / 12 behind) |
| Expected conflicts | `apps/web/src/App.tsx`, `apps/web/src/data/collectionQueries.ts`, `docs/KnownIssues.md` (from `git merge-tree`); five more files auto-merge |
| V2 pre-rebase baseline | **2,365** = TS 2,196 (domain 817 · web 982 · api 351 · dv-client 32 · auth 14) + tooling 10 + C# 159 on record; 0 failed, 0 skipped |
| Main / Phase 10 baseline | **2,179** = TS 2,010 (domain 829 · web 780 · api 355 · dv-client 32 · auth 14) + tooling 10 + C# 159 |
| Baseline estimate | **9.75 effective hours** — rebase + three conflicts 0.75 · shared report presentation (one integration, two skins) 0.75 · V2 Dashboards page 1.5 · ReportingScope ↔ V2 case-list filter mapping and drill-down 1.0 · request coordination for `qdb_RunReport` 0.75 · My Day reconciliation 0.75 · integration tests 2.0 · deploy + browser validation 1.0 · docs / KI register 0.75. The earlier "2–3 h" covered the rebase alone; §8–§14 of this authorisation add the integration |
| Expected completion | 2026-09-27 ~06:00 +03 at the estimate, wall-clock permitting |

### Rebase result

| Item | Value |
|---|---|
| Rebased tip | `6967501c` (39 commits: the 38 V2 commits replayed on `a997496d` + this tracker note) |
| Conflicts | three, as predicted — `App.tsx` (import block only: both sides' imports kept), `collectionQueries.ts` (Phase 10's `ownerId`/`strategy` beside V2's — V2's superset kept, the auto-merge's **duplicate `ownerId` declaration and duplicate `_ownerid_value` clause removed after the rebase**; one `CaseQuery`, clause order strategy → owner → bucket → status → customer → search), `KnownIssues.md` (three docs commits, union each time: V2 rows then the Phase 10 section; the V2 KI-147 row updated to *Closed* on Phase 10's evidence, the Phase 10 row kept) |
| Post-rebase type error | one — V2's `ViewRequest` lacked Phase 10's `onOpenCases`; added, routed to V2's own list |
| Integration commit | `feat(dcp): bring Phase 10 reporting into Workspace V2 on the rebased branch` |
| Post-rebase integrated baseline | **2,539** = TS 2,370 (domain 829 · web 1,140 · api 355 · dv-client 32 · auth 14) + tooling 10 + C# 159; 0 failed, 0 skipped; type-check clean across 10 tasks |
| Composition of the difference | web 1,140 = V2's 982 + Phase 10's 136 web tests + 22 new (coordinated service 5 · scope ↔ filter mapping 6 · V2 Dashboards 9 · My Day 2); domain 829 and api 355 are main's counts (Phase 10 added 12 and 4); nothing lost |
| Guards proven to bite | status dropped from the scope mapping · no run sharing in the coordinated service · activity panels dressed as scoped · V1 `#cases/scope/…` link ignored · a drill-down that forgets its way back. One planted defect (the bridged-view door in `V2Workspace`) did **not** bite because no bridged view calls it — recorded, not counted |

### Timing

| Item | Value |
|---|---|
| Start → completion report | 2026-09-26 20:21 → 21:20 +03, **0.98 h wall-clock**, uninterrupted |
| Baseline | 9.75 h effective, **kept, not re-estimated** |
| Variance | −8.77 h. The three conflicts were an import block, a duplicated field and appended register rows; the integration reused Phase 10's adapter, catalogue, compositions, resolver and hook wholesale, so V2 needed one page and one shared presentation module rather than a second implementation; the estimate priced a hand-built V2 reporting layer. Different units, as before: an effort estimate against measured AI-assisted session time |

### Cloud + browser validation (2026-09-26 21:00–21:15 +03, same web resource `qdb_dcp_workspace.html`, System Administrator, QDB Chrome profile)

| Check | Result |
|---|---|
| V1 default | With no stored version the resource opens **V1**: V1 Dashboards (six Engine panels ok) and V1 Collection Cases load; the V1/V2 switch is present |
| V2 Dashboards | Native (`v2-bridged` absent). Portfolio: open cases 4,363 · customers 3,780 · arrears QAR 213,300,524 · balance QAR 3,419,587,487; six panels ok |
| Dashboard → Cases → Case → back → Dashboards | 61–90 row **228** → `#cases/filter/bucket=61-90&from=dashboard` → chip *DPD: 61-90*, bucket chip **61-90 228** → Split preview → *Open full record* → case → *← Cases* lands on the same filtered URL → *← Back to Dashboards* returns to Portfolio Overview |
| Reconciliation, HL scope (Engine row vs list filter) | bucket 61–90: **228 = 228** (chip) · status New: **4,358 = 4,358** (footer) · Strategy Not Assigned: **4,358 = 4,358** · owner *# DFE Backend API*: **4,360** → list opens on the owner filter with its name · source BFD **3 = 3**. Same five reconciled read-only as the service principal (Engine vs `$count`): all equal |
| Activity-grain limitation | Supervisor under HL: RPT-007 wears *Not narrowed by CRM*; footer says the figures are for both CRMs; RPT-005 carries no such badge |
| Portfolio & Strategy → Cases → Split/Grid → Case → back | cell 61–90 × Strategy Not Assigned (HL) **227** → `#cases/filter/bucket=61-90&strategy=none&scope=HL&from=portfolio` → chips DPD / Strategy / CRM, bucket chip **227** → Grid (20 rows loaded) → case → *← Cases* keeps Grid + filters → *← Back to Portfolio & Strategy* |
| My Day V2 | My open work 7 · Overdue follow-ups 5 · Upcoming 0 · Open cases 4,363 · Promises due, 7 days 0 (with the recorded-status sentence) · Identity exceptions 3 |
| Engine calls | Fresh V2 Dashboards load (Portfolio): **6 `qdb_RunReport` calls = 6 panels**, none repeated; all HTTP 200 |
| Console / network | No console errors; no failed requests |
| Observation | KI-154 (pre-existing Screen 02): the list footer states the *All* count while a bucket chip is active — recorded, not changed |
| Not proven | Collection Officer role; On-Prem; narrow viewport (KI-141) |

Browser left on **V1** (stored version cleared).
