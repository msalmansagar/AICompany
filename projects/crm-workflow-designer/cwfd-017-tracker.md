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

## CWFD-019 — BPMN-grammar decisions (approved 2026-08-31)

Analysis delivered; 5-PR plan approved. Model already IS task→decision→routes
with stored isDefault and virtual gateways in view — the real gap was EDIT.

| PR | Scope | Status |
|----|-------|--------|
| 1 | Gateway grammar + edit-canvas virtual gateways | ✅ done |
| 2 | Route labels + default language | ✅ done |
| 3 | Decision panel route cards + navigation | ✅ done |
| 4 | Layout (gateway-aware ranking, no leftward sweeps) | ✅ done |
| 5 | Hover/Focus/View polish + terminating badges | ✅ done — **CWFD-019 COMPLETE** |

- 2026-08-31 — **MERGED + DEPLOYED + CRM-VERIFIED.** All five PRs (#149–#153)
  merged bottom-up into main @ `858b5844`, branches deleted, 511 tests green
  on the merged head, production build 1824.4 KB, web resource
  `25bdac56-555e-f111-a825-7ced8d96ec97` updated + published on org5869857f.
  Verified in the CRM shell against the Loan process edit canvas: 3 gateways,
  50 edges settle correctly (`route_edge_:7, e_entry_:3, start_to:1`), route
  labels are pure business language ("CEO Route", "ICC / Default Route",
  "Rejected / Default"), the outlined diamond renders with its count and name
  chip, Overview panel route rows navigate, terminating badges 0, Validate
  stays at the clean-baseline 19 — nothing saved, org untouched.
  🔴 Trap reconfirmed IN CRM: a canvas measured mid-load can sit at 25 edges
  (start/entry/route edges dropped when React Flow saw them before their
  nodes' handles mounted — they are NOT re-added by later re-renders; even a
  Flow-chip toggle won't restore them). A fresh load lands all 50. Measure
  after a clean load, never mid-transition.

- 2026-08-31 — **PR 5 done — CWFD-019 COMPLETE.** 511 tests, tsc clean.
  Focus Mode understands a selected DECISION: the fade anchors on its gateway
  (incident edges = entry + routes), lighting source → diamond → targets in
  one move — verified live: Director BFD Joint Approval → Reject Proposal ◇ →
  CEO Joint Approval lit, 48 nodes ghosted. The Terminating badge now means
  the WHOLE step ends (every outcome terminal) — 0 badges remain on the Loan
  process where ~7 cards used to shout it while their endings were already on
  rows, stubs and routes (req 20). The diamond answers hover (stroke + glow).
  Gateway hover edge-emphasis already worked via CWFD-017's hover layer.

- 2026-08-31 — **PR 4 done.** 511 tests, tsc clean. computeEditLayout now ranks
  each decision's VIRTUAL diamond between source and destinations (dagre node
  gw_<outcomeId>, never persisted) — a forward route destination can no longer
  land left of the diamond that feeds it. Measured post-Arrange: 6/7 route
  edges flow rightward; the seventh (dx −78) is a genuinely BACKWARD route
  ("Return to …" via route) — truth, not layout failure, and short now.
  alignDefaultContinuations swaps y slots among a gateway's EXCLUSIVE
  destinations so the default continuation sits nearest the source's centre
  line — a pure permutation of dagre's own slots, no new overlaps possible.
  View-side BRANCH_GAP 140→72 (req 3): PR2's short labels made the old
  overlap reason obsolete.

- 2026-08-31 — **PR 3 done.** 511 tests, tsc clean. Route targets are DOORS:
  in the edit Decision panel and the view gateway details, the target step is
  an underlined link that selects it and pans the camera (centerOnNode).
  The floating step toolbar gained [Decision] — shown only when the step owns
  a conditional decision with routes; click = select the outcome = Decision
  Properties. 🔴 REAL BUG FOUND UNDER IT: centerOnNode's animated pan raced
  the selection re-render in the same tick and was INTERMITTENTLY cancelled —
  the shipped validation-stepper pan had the same latent flake (reproduced:
  stepper click, camera stuck). Fix: start the pan 60ms after the click so
  the selection commit lands first; 4/4 distinct pans then succeeded (the
  5th probe was already centred — a no-op, not a failure). Also hit a
  transient HTTP 500 from the dev proxy on the steps query — Retry recovered;
  not an app defect.

- 2026-08-31 — **PR 2 done.** 511 tests, tsc clean. routeDisplay.ts is the one
  voice for route language: NAME FIRST (a named route shows its name, never
  its condition dump), the default says Default in business words (never
  /else), only nameless conditional routes show a short condition — and the
  async metadata-resolved condition now dresses ONLY nameless routes (a name
  always wins). All four builders + editGateways consume it. The shouting
  CONDITION badge on card rows became the quiet ◈ + "→ routes". Panel
  language updated everywhere: "Default — used when no other route matches"
  (Decision panel, Route panel banner, view GatewayDetails). Fixed in
  passing: the resolved-label effect matched 'e_tech_route_' but the builder
  emits 'tn_e_route_' — Technical view labels had NEVER resolved. Verified
  live both modes: CEO Route / ICC · Default Route / Rejected · Default on
  canvas, zero 'else', zero CONDITION badges, clean-state click path.
  🔴 Stale-Vite bit AGAIN after the branch switch (nodes without edges —
  looked like a filter bug, was the server). RESTART VITE FIRST, always.

- 2026-08-31 — **PR 1 done.** 504 tests, tsc clean. RouteGatewayNode redesigned
  (outlined BPMN diamond, name chip ABOVE, route count INSIDE — the old solid
  diamond drew an orange glyph on orange fill, the FIFTH invisible-pair, and
  had never shown its ⋈). buildEditGateways: presentation-only diamonds beside
  the source card (64px), entry + labelled route edges (id `route_edge_<id>` so
  clicking opens the existing RoutePropertiesPanel), terminal routes end at a
  stub under the diamond, plain outcome edge suppressed when a gateway draws
  the decision. Diamond click selects the OUTCOME → existing Decision
  Properties panel. Live-verified: 3 gateways / 7 routes / 3 entries on the
  Loan process in EDIT (BAs saw routing for the first time), real click →
  ringed diamond + Decision Properties with route cards, clean-state proof
  (open → click → not dirty). 🔴 Known for PR4: routes sweep LEFT when the
  ranked destination sits left of the gateway offset. 🔴 Probe hygiene again:
  two dirty flags during verification were BOTH probe artifacts — the clean
  repro (open→click→check) is the arbiter, run it before suspecting the app.

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
