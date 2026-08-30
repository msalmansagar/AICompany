# CWFD-017 Tracker — Progressive Disclosure Programme

Goal: store the full complexity in the process model, render complexity on
demand. Benchmark: Loan Application Process (35 steps, 29 return outcomes).
No schema changes anywhere in this programme; everything is presentation.

| PR | Scope | Status | Notes |
|----|-------|--------|-------|
| 1 | Edge classification + Flow Display toolbar | ✅ done | `flowClass.ts` (one vocabulary: primary / decision / parallel / return / ending), `applyFlowVisibility`, `FlowDisplayBar` chips on view + edit canvases, **returns hidden by default**. Replaced the 3-state returns cycle button in both toolbars; the deep clean survives as the "return steps" sub-chip. |
| 2 | Return badges + jump references | ✅ done | ↩ badges + popover on Business/Swimlane cards; hover=peek, click=pin+pan-to-pair; spotlight fades the rest; "↩ from …" chip on the target; returns resolve THROUGH correction pills. |
| 3 | Focus Mode + step details panel | — | Selection-neighbourhood fade; Overview/Decisions/Returns tabs on the details panels; card counters ↩ ◆ ∥. |
| 4 | Layout + parallel polish | — | Visual grouping for branch stacks; label-overlap spacing. |
| 5 | View Mode defaults + Overview | — | Stage-level Overview derived from stageRoles/stageBands. |
| 6 | Minimap, legend, validation info tier, perf sweep | — | Plus swimlane collapse if it proves clean. |

## Log

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
