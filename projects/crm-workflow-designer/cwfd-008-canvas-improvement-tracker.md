# CWFD-008 — Canvas Improvement Tracker

Source: canvas audit of 2026-08-23 (18 findings, code-verified + confirmed live
against org data) plus the FlowOn Process Orchestrator comparison. One row per
work item; this file is updated as each PR lands.

**Status legend:** ✅ done · 🔨 in progress · ⬜ not started · ⏸ deferred (needs a decision)

| PR | Scope | Branch | Status |
|---|---|---|---|
| PR 1 | Canvas correctness | `feat/cwfd-edit-minimap` (#108) | ✅ implemented, verified live |
| PR 2 | Theme & contrast | `feat/cwfd-canvas-pr2-theme` (#109, stacked on #108) | ✅ implemented, verified live |
| PR 3 | Validator & entry-step truth | `feat/cwfd-canvas-pr3-validator` (#TBD, stacked on #109) | ✅ implemented, verified live |
| PR 4 | FlowOn quick canvas wins | — | ⬜ |
| PR 5 | Step panel tabs | — | ⬜ |
| PR 6 | Hygiene / dead code | — | ⬜ |
| PR 7 | Guided replay / demo mode | — | ⬜ |

---

## PR 1 — Canvas correctness ✅

| # | Item | Audit ref | Status | Notes |
|---|---|---|---|---|
| 1.1 | Edit minimap draws nodes: `useSyncedNodes` keeps React Flow's measured dimensions across blueprint rebuilds; all NodeChanges applied via `applyNodeChanges` | A1 | ✅ | Verified live: 5 minimap rects vs 0 before. Root cause: `onNodesChange` discarded `dimensions` changes and the memo rebuilt nodes without `measured`. |
| 1.2 | Warnings no longer paint the error border — `collectErrorNodeIds` gates on `severity === 'error'` | A2 | ✅ | Verified live: 3 task-subject warnings no longer ring cards red; a genuinely unassigned step still does. |
| 1.3 | Sim/auto-sim start/end placement: `resolveSimEndpoints` reuses the stored edit-canvas terminals, else derives the dominant axis — no more TB fallbacks under an LR graph | A4 | ✅ | Verified live: simulation renders in one LR row, fully framed; END no longer clipped off-screen. |
| 1.4 | Deterministic fit: `FitOnceMeasured` (fit once when every node is measured) replaces the fixed 80 ms `setTimeout` fits in EditCanvas + SopCanvas; sim canvases get it too | A5 | ✅ | React Flow's own fitView-on-init proved unreliable against synced controlled nodes — the guard is explicit. |

Tests: 337 passing (12 new: `useSyncedNodes.test.ts`, `simEndpoints.test.ts` incl. `collectErrorNodeIds`). tsc clean.

Files: `hooks/useSyncedNodes.ts` (new), `services/simEndpoints.ts` (new),
`components/common/FitOnceMeasured.tsx` (new), `hooks/useEditMode.ts`,
`hooks/useSimulationMode.ts`, `hooks/useAutoSimMode.ts`,
`services/ValidationService.ts`, `components/edit/EditCanvas.tsx`,
`components/SopCanvas/SopCanvas.tsx`.

---

## PR 2 — Theme & contrast ✅

| # | Item | Audit ref | Status |
|---|---|---|---|
| 2.1 | Technical (New) outcome pills: text = `--text-on-primary`, never the pill's own accent (today text colour === background colour, invisible in every theme) | A7 | ✅ |
| 2.2 | Executive edge labels: real surface pair (today label bg = `--text`, text = `--text-secondary` — text-on-text in both themes) | A8 | ✅ |
| 2.3 | SOP swimlane body `rgba(248,250,252,0.6)` → token (light slabs in dark theme) | A9 | ✅ |
| 2.4 | Minimap: tokenized `maskColor`; node colours for exec/tech/technew/swimlane types (today they fall through to grey) | A10, A11 | ✅ |
| 2.5 | Sweep remaining hardcoded `rgba()` accents: SimStepNode pulse + white overlay, RouteGatewayNode, SopGateway/SopOutcome/SopEnd, SOP "CRM" chip (~2.4:1) | A12 | ✅ (bonus: ${ACCENT}30 built an invalid colour — SOP selection glow never rendered) |
| 2.6 | Extend the `surfacePairs` test to edge `labelStyle`/`labelBgStyle` and node pill pairs so 2.1/2.2 stay dead | A12 | ✅ (30 new contrast checks) |

## PR 3 — Validator & entry-step truth ✅

| # | Item | Audit ref | Status |
|---|---|---|---|
| 3.1 | One entry-step rule (lowest sequenceNo vs literal 1) across validator + canvases; kills the false MISSING_START error and the cascading false ORPHAN_STEP on a working process | A3 | ✅ entry = lowest sequenceNo; MISSING_START retired |
| 3.2 | One numbering scheme: canvas badge (seqNo) vs navigator (ordinal) vs properties ("Order #") — pick one user-facing number | A13 | ✅ sequenceNo everywhere (canvas · navigator · properties) |
| 3.3 | New rule: warn when all of a step's outcomes are conditional and none is an unconditional fallback (FlowOn "default transition prevents stuck instances") | FlowOn #8 | ✅ ALL_OUTCOMES_CONDITIONAL warning |

## PR 4 — FlowOn quick canvas wins ⬜

| # | Item | Source | Status |
|---|---|---|---|
| 4.1 | Labels on outcome edges in edit mode | FlowOn #2 | ⬜ |
| 4.2 | Back edges visible (drop the 0.45-opacity near-invisible dashes) | Audit | ⬜ |
| 4.3 | Per-step accent colour: card bar → step navigator → panel header | FlowOn #1 | ⬜ |
| 4.4 | "Terminating" badge on cards whose outcomes end the process | FlowOn #4 | ⬜ |
| 4.5 | Canvas legend per view mode (edge/severity encodings) | FlowOn #5 | ⬜ |
| 4.6 | Draft/published status pill beside the process name in edit + view | FlowOn #6 | ⬜ |

## PR 5 — Step panel tabs ⬜

| # | Item | Status |
|---|---|---|
| 5.1 | `StepPropertiesPanel` → General / Assignment / SLA & Escalation / Automation tabs (610-line single scroll today) | ⬜ |

## PR 6 — Hygiene ⬜

| # | Item | Audit ref | Status |
|---|---|---|---|
| 6.1 | Delete dead code: `LayoutService`, `useAutoLayout`, `useExport` + `ExportService` (duplicate of WorkflowCanvas's inline export), `WorkflowToolbox`, legacy Start/Step/Outcome/End nodes + `deriveNodes`/`deriveEdges`, `fitViewTrigger` ref | A6, A16 | ⬜ |
| 6.2 | One toast implementation (`Notify`); EditCanvas + SopCanvas bespoke toasts removed (z-index 8000 off-scale; SOP timer hides a second toast early) | A14 | ⬜ |
| 6.3 | SopCanvas store subscription cleanup (whole-store double subscribe) — partially improved by PR 1's memoized blueprint | A15 | ⬜ |
| 6.4 | PNG/PDF export: pass the computed background colour (CSS `var()` doesn't resolve in the serialized SVG) | A17 | ⬜ |

## PR 7 — Guided replay / demo mode ⬜

| # | Item | Status |
|---|---|---|
| 7.1 | Scripted build playback (add step → assign → wire → publish) reusing `useAutoSimPlayback` + HUD, with narration line à la FlowOn | ⬜ |

## Deferred (user decision needed) ⏸

| Item | Question |
|---|---|
| Swimlane grouping | Group by actual assignee/role instead of assignment *type* (today three named users collapse into one "SPECIFIC USER" lane)? |
| Retire old "Technical" view | Technical and Technical (New) both ship — retire the old one once (New) is accepted? |
| `fitViewOptions maxZoom` 1 vs 1.2 | Edit opens slightly smaller than view — changing it also reframes both simulation canvases. |
| Runtime track (RT-1..3, DP-4, Q2 deletion) | Still blocked on the #90 platform-team answers. |
