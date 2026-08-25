# CWFD-009 Tracker — Large-Process Readability

Branch: `feat/cwfd-009-readability` (off main @ fe15d33d).
Analysis: `cwfd-009-large-process-readability.md`.
Benchmark process: Loan Application Process (35 steps / 69 decisions / 14 returns).
Baseline: 390 tests green.

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | Narrative layout core (rank forward-only from entry; orphans beside targets; gateways glued to source) | ✅ done | Commit 1. Forward-only ranking in both canvases; orphan anchors; rank-centre grouping; collision pass. |
| P2 | Collapse correction loops into expandable pills | ✅ done | Commit 1. 12 of 35 Loan steps collapse; select to expand; short e_back return edges under the returns toggle. |
| P3 | Smart initial view + minimap default + go-to-step search | ✅ done | Commit 2. Entry-stage fit; search in both canvases pans+selects; minimap auto-on >15 steps.  |
| P4 | Validation UX (grouped rules, badges not floods, next/prev) | ✅ done | Commit 2. 77 issues → 6 groups; ‹ › stepper centres each; corner badge unless selected. |
| P5 | Stage bands (layout-annotation stages, collapsible) | ✅ done | Commit 4. Auto-derived from name role hints, row-set labels for parallel sections. Authored/renamable stages deferred — needs a UX decision. |
| P6 | Semantic zoom (card / compact / dot) | ✅ done | Commit 4. Screen-stable name size below reading zoom; fit-all is scannable. |
| P7 | Edge discipline (edit end stubs, return gutter + toggle in edit, fallback slash) | ✅ done | Commit 3. Edit end stubs (parentId-mounted); ending edges red+dashed; fallback ∕ slash. Returns toggle already existed in edit; a dedicated side-gutter routing was judged unnecessary once stubs+pills removed the noise. | |
| P8 | Executive = actual happy path | ✅ done | Commit 3. Corrections removed outright; anchors + rank-group fix applied to exec layout. |
| P9 | Swimlane role-hint lanes | ✅ done | Commit 5. Unassigned lanes split by name role hint (warning tint); parallel steps share their parent's time-slot column. |

## Log

- 2026-08-25 — Tracker created; branch cut from main @ fe15d33d; baseline 390 tests green.
- 2026-08-25 — **P1+P2 done.** Classifier bug found against real data: conditional
  decisions carry null nextStepId, so RM Review Approve/CEO Joint Approval collapsed
  as "corrections" until conditional+terminal decisions counted as forward. TB
  centering flattened rank-siblings onto one column (rank must group by CENTRE,
  Dagre centres nodes within a rank). Verified against the live Loan process:
  entry at top, 12 pills, 0 rect overlaps. 408 tests green.
- 2026-08-25 — **P3+P4 done.** Verified live: edit opens on START+entry readable,
  "ceo"+Enter pans to CEO Joint Approval and opens its panel, validation shows
  28+49 as six rule groups with a 77-issue stepper. 408 tests green.
- 2026-08-25 — **P7+P8 done.** Edit END funnel gone (stubs ride cards via parentId);
  Executive is a clean single-column happy path, verified live. 408 tests green.
- 2026-08-25 — **P5+P6 done.** Bands verified live: Relationship Manager /
  EPD · Technical / EPD · Financial Forecasting / Credit · EPD…; fit-all shows
  every step name readable. 408 tests green.
- 2026-08-25 — **P9 done — ALL NINE ITEMS COMPLETE.** Swimlane verified live:
  ~13 lanes (role lanes in warning tint + named users) instead of one giant
  "(unassigned)" strip. Final: 408 tests green, tsc clean, 5 commits on
  `feat/cwfd-009-readability`.
