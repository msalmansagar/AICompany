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
| 5 | View Mode defaults + Overview | — | Stage-level Overview derived from stageRoles/stageBands. |
| 6 | Minimap, legend, validation info tier, perf sweep | — | Plus swimlane collapse if it proves clean. |

## Log

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
