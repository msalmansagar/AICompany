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
