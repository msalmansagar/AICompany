# CWFD-017 Tracker — Progressive Disclosure Programme

Goal: store the full complexity in the process model, render complexity on
demand. Benchmark: Loan Application Process (35 steps, 29 return outcomes).
No schema changes anywhere in this programme; everything is presentation.

| PR | Scope | Status | Notes |
|----|-------|--------|-------|
| 1 | Edge classification + Flow Display toolbar | ✅ done | `flowClass.ts` (one vocabulary: primary / decision / parallel / return / ending), `applyFlowVisibility`, `FlowDisplayBar` chips on view + edit canvases, **returns hidden by default**. Replaced the 3-state returns cycle button in both toolbars; the deep clean survives as the "return steps" sub-chip. |
| 2 | Return badges + jump references | ✅ done | ↩ badges + popover on Business/Swimlane cards; hover=peek, click=pin+pan-to-pair; spotlight fades the rest; "↩ from …" chip on the target; returns resolve THROUGH correction pills. |
| 3 | Focus Mode + step details panel | ✅ done | Focus toggle on the edit toolbar (selection-driven fade, hidden return edges restored for the selection); Overview tab (default) on the step panel: counters + incoming/outgoing links + owner + SLA; hover leans on incident edges. Card counters skipped — edit cards already carry rows/badges. |
| 4 | Layout + parallel polish | ✅ done | parallelGroups.ts scenery bands wrap branch children (position-derived, intrusion-guarded — no band beats a wrong band); Parallel chip hides band with the links; edit layout now RANKS branch links so children cluster beside their parent. |
| 5 | Overview view | ✅ done | New first view-mode tab: stage chips (steps/↩/∥/⊘ counts) chained START→END, real inter-stage transitions (outcomes+routes+branch links) bundled per pair, skip-hops arc by the side, faint dotted sequence connectors where no direct transition exists. Click a stage → Business canvas centered on its first step. |
| 6 | Minimap, legend, validation info tier, perf sweep | ✅ done | info severity (ORPHAN_JOIN_GUARD downgraded — never blocks, never acked); dangling-gateway cleanup in the filter; legend + minimap entries; perf measured: every chip toggle 23–36ms on 35 steps, node positions byte-identical. **Swimlane collapse SKIPPED** per the "only if clean" clause — collapsing a lane orphans every edge crossing it, and stage-level collapse already exists via Overview drill + Hierarchy fold. |

## CWFD-018 — floating step action toolbar

- 2026-08-30 — **Built + live-verified** (497 tests, tsc clean, 1.77 MB build).
  React Flow's NodeToolbar (12.10.2) above every edit-canvas step face:
  Edit / Assignment / Clone / Delete / ⋯ (details, SLA, automation, add-after,
  move earlier/later — earlier correctly disabled on step 1). One toolbar at a
  time via a dedicated 3-field interaction store (hover claims it, selection
  keeps it, 250ms grace to travel onto the bar); the step panel is steered by
  a buffered tab bus so Assignment lands right even when the panel mounts in
  the same click. Delete reuses the existing confirm; clone = duplicateStep
  (undone cleanly). Verified: hover→travel→click, selected persistence, More
  menu + Escape, zoom (unscaled, anchored), position-follow via arrow nudge,
  View Mode shows zero toolbars. BA/Developer modes do not exist yet (#93) —
  the gate is edit-only + selectCanvasIsReadOnly. 🔴 CDP synthesized drags
  degraded to clicks again in this tab (the known trap) — drag-follow was
  proven via the keyboard nudge pipeline instead.

## Log

- 2026-08-30 — **MERGED + DEPLOYED + CRM-VERIFIED.** All six PRs merged to
  main bottom-up (#140→#145, each retargeted to main before merging — no
  --delete-branch on the chain; branches deleted after). main @ 10091b8f.
  Built (1.77 MB) and deployed to web resource
  25bdac56-555e-f111-a825-7ced8d96ec97, published. Verified in the org on the
  DataverseAdapter path: Overview tab renders 13 stages, Flow Display chips
  with returns hidden by default, the parallel group band, badge popover →
  spotlight pin (edge drawn, both endpoints ringed 23↔25, "↩ from" chip),
  and the PR6 legend entries. The CRM "Sign in to continue" modal appeared
  once — its X does NOT dismiss it this time; the Sign in button renewed via
  silent SSO (no credential form), as in the 2026-08-24 session.

- 2026-08-30 — **PR 6 done — PROGRAMME COMPLETE.** 493 tests green, tsc clean.
  Validation gained the info tier (error blocks / warning acks / info notes —
  ORPHAN_JOIN_GUARD downgraded: the engine is indifferent to an orphan guard);
  the filter now removes a gateway left dangling when its every route hides
  (entry line and all); the hierarchy branch's dead identity call is gone;
  legend gained Ending + the ↩ badge; minimap gained stageBand (its bands were
  falling through to the disabled grey). Perf verified live on 35 steps:
  all four class toggles render in 23–36ms round-trip and node positions are
  byte-identical across all eight toggles — visibility is pure presentation,
  no re-layout, empirically. Swimlane collapse skipped deliberately (the
  requirement's own escape hatch): collapsing a lane orphans every edge that
  crosses it, and stage-level folding already exists (Overview drill,
  Hierarchy collapse).

- 2026-08-30 — **PR 5 done.** 492 tests green, tsc clean. Overview live on the
  Loan process: 13 stages derived from the real config (the role ping-pong is
  the truth of the sequence), counts agree with the ↩ badges because both use
  collectReturnRefs; correction steps count as returns of the stage that
  DECIDED them, never as stage steps (the correction's own hop is skipped or
  it double-counts into the resubmit target's stage). Drill-through verified:
  click stage 11 Credit → Business canvas centered on Sr Manager Credit
  Analysis Endorsement (seq 24) with its panel open. Branch links count as
  stage transitions (the engine creates the child's task — that is flow).

- 2026-08-30 — **PR 4 done.** 486 tests green, tsc clean. Business view live:
  the band wraps PM Assignment + Technical Analyst Review, labelled with the
  parent, AT-SAME-TIME edges forking in from above — requirement 11's sketch.
  Parallel chip removes band + links together. The band is scenery derived
  from FINAL positions (like stage bands) with an intrusion guard: a stranger
  card inside the box means NO band — a wrong band claims concurrency that
  does not exist. Edit canvas: computeEditLayout now ranks branch links
  (children were layout ORPHANS scattered by the anchor pass). On the Loan
  process the edit band still does not draw even after auto-arrange — the two
  children genuinely live ten ranks apart because their downstream chains
  differ, and the guard correctly refuses a canvas-wide box. Bands appear in
  edit when the branches actually sit together (unit-tested path, same
  service as the view).

- 2026-08-30 — **PR 3 done.** 482 tests green, tsc clean, verified live in edit
  mode on the Loan process: Overview tab reads real org data (incoming from
  both Directors, owner, SLA), its step links walk the process, and Focus Mode
  lit exactly the 4 related nodes the panel lists while fading the other 47 —
  one derivation (stepRelationships) feeds both, so words and light agree.
  Edit-card counters were skipped deliberately: edit cards already carry the
  outcome rows, the CONCURRENT badge and the error dot, so counters would say
  everything twice. 🔴 Trap: the Vite dev server served a STALE EditCanvas
  transform after the branch switch + patch scripts — the new toolbar rendered
  against the old canvas, so the Focus button had no handler and clicks did
  nothing. fetch the served module and grep it before debugging the app;
  restart Vite after git branch switches.

- 2026-08-30 — **PR 2 done.** 471 tests green, tsc clean, verified live on the
  Loan process (badges ↩1/↩2/↩3 on 17 business cards + 29 swimlane cards;
  peek/pin/pan and the target chip all exercised in the browser).
  Key call: the Loan org models every return as a pure CORRECTION STEP, so no
  card has a direct back-edge outcome — `collectReturnRefs` therefore resolves
  returns ROUTED through a correction pill to where the work actually lands
  (source ↩ final target, pill kept lit during the spotlight). The requirement's
  "Credit Manager Approval ↩ 2" is exactly this shape.
  🔴 Traps hit: a state-updater-computed flag is NOT readable after setState
  (React runs updaters later) — the pin's pan never fired until the flag came
  from current state; and spotlight endpoints must FORCE the full card face,
  because the jump lands zoomed out where the compact face drops the ring and
  the "↩ from" chip. Also fixed in passing: swim-card counter chips built
  colours by string-concat (`var(--x)14` = invalid CSS — backgrounds never
  rendered).

- 2026-08-30 — **PR 1 done.** 461 tests green, tsc clean, all five toggles
  verified live against the Loan process in dev (:5175, org data via proxy):
  returns off hides 12 business-view / 29 edit-view return edges; the
  "return steps" clean drops 14 return-only nodes (63→49); decisions off
  removes gateways + entry/route edges but keeps endings; parallel and
  endings toggle independently; node identity stable throughout (no
  measurement churn).
- 2026-08-30 — Found and fixed while classifying edges:
  - 🔴 **Swimlane return edges had NEVER rendered** — they asked for target
    handle `bottom` but the swim step node defines `bottom-t`; React Flow
    dropped all 30 silently (console warning only). Regression test added.
  - Two more live invisible-label pairs (the labelStyle.fill ===
    labelBgStyle.fill pattern): swimlane ↩ labels (accent-on-accent) and
    Technical route labels (success-on-success / warning-on-warning). Both
    now use registered surface pairs under the contrast guard.
