# CWFD-017 Tracker — Progressive Disclosure Programme

Goal: store the full complexity in the process model, render complexity on
demand. Benchmark: Loan Application Process (35 steps, 29 return outcomes).
No schema changes anywhere in this programme; everything is presentation.

| PR | Scope | Status | Notes |
|----|-------|--------|-------|
| 1 | Edge classification + Flow Display toolbar | ✅ done | `flowClass.ts` (one vocabulary: primary / decision / parallel / return / ending), `applyFlowVisibility`, `FlowDisplayBar` chips on view + edit canvases, **returns hidden by default**. Replaced the 3-state returns cycle button in both toolbars; the deep clean survives as the "return steps" sub-chip. |
| 2 | Return badges + jump references | — | Port the Hierarchy badge/peek/pin pattern onto Business/Swimlane cards; long-distance returns as paired jump chips. |
| 3 | Focus Mode + step details panel | — | Selection-neighbourhood fade; Overview/Decisions/Returns tabs on the details panels; card counters ↩ ◆ ∥. |
| 4 | Layout + parallel polish | — | Visual grouping for branch stacks; label-overlap spacing. |
| 5 | View Mode defaults + Overview | — | Stage-level Overview derived from stageRoles/stageBands. |
| 6 | Minimap, legend, validation info tier, perf sweep | — | Plus swimlane collapse if it proves clean. |

## Log

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
