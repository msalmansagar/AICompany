# ADR-001 — React Flow Canvas Library Selection
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

The designer requires a node-and-edge graph editor that supports:
- Custom node types with multiple handle positions (top, bottom, left, right)
- Custom animated edge types carrying metadata
- Zoom, pan, fit-to-view, and minimap
- Multi-select with rubber-band and Ctrl+Click
- Drag-and-drop from an external toolbox panel onto the canvas
- Keyboard-driven operations (Delete, Ctrl+Z, Ctrl+C, Ctrl+V)
- A 200-node performance floor at 30 fps (NFR-01b)
- MIT license for enterprise deployment

The constitution default stack does not specify a graph editor. This ADR documents
the selection from the evaluated candidates.

Three candidates were evaluated by the github-researcher agent (see `github-research.md`):
1. `@xyflow/react` (xyflow/xyflow) — 27,000+ stars, MIT, React 19 confirmed
2. `antvis/G6` (v5) — 11,800 stars, MIT, ~500 KB gzipped
3. `jerosoler/Drawflow` — 5,900 stars, MIT, abandoned since 2022

Additionally evaluated:
- `reaviz/reaflow` — 2,200 stars, Apache 2.0, built on ELK, smaller ecosystem
- `nocode-js/sequential-workflow-designer` — 1,500 stars, MIT, linear topology only

---

## Decision

Adopt `@xyflow/react` v12.x (MIT).

Reasons:

1. **Purpose fit:** `@xyflow/react` is purpose-built for node-based flow editors. Its
   node/edge model maps directly to the CRM entity hierarchy:
   Step → Outcome → Route. No adaptation of an analysis-oriented API is required.

2. **Star count and community:** 27,000+ GitHub stars. The largest React graph-editor
   library by active usage. Official examples include workflow builders and step editors
   that structurally match the CWFD-001 requirement.

3. **React 19 compatibility:** Confirmed in the xyflow official release notes (2025-10-28).
   No shim or workaround required.

4. **Bundle size:** ~75 KB gzipped. G6 v5 is ~500 KB — immediately disqualifying
   given the 5 MB total budget (COND-04). `@xyflow/react` leaves 4,323 KB of headroom.

5. **Custom node and edge API:** The library's `nodeTypes` and `edgeTypes` registries
   accept arbitrary React components with full TypeScript generics on node/edge data.
   `StepNode`, `OutcomeNode`, `StartNode`, `EndNode`, and `RouteEdge` can each carry
   typed CRM metadata without any casting.

6. **Store integration:** The React Flow team's own documentation and examples use
   Zustand as the application store. The `useReactFlow()` hook provides the bridge
   between the Zustand-derived `nodes` and `edges` arrays and the canvas renderer.

7. **MIT license:** Unrestricted enterprise use. `proOptions={{ hideAttribution: true }}`
   is MIT-permitted (no Pro subscription required).

Rejected alternatives:
- **G6 v5:** Bundle size (~500 KB) alone disqualifies it. The API is also oriented
  toward data analysis, not editable workflow building.
- **Drawflow:** Abandoned since 2022. No TypeScript types. Vanilla JS only.
- **reaflow:** 2,200 stars vs. 27,000. Smaller ecosystem, fewer examples, opinionated
  layout coupling to ELK. `@xyflow/react` is the clearly superior choice.
- **sequential-workflow-designer:** Linear topology only. CRM workflows require a
  directed graph with loops, parallel branches, and arbitrary step-to-step routing.

---

## Implementation Constraints

- Import `@xyflow/react/dist/style.css` in `main.tsx`.
- The Zustand store is the single source of truth. `nodes[]` and `edges[]` passed to
  `<ReactFlow>` are derived from the store via `selectors.ts` — they are never written
  back from React Flow to the store. React Flow is a rendering sink, not a state source.
- Use `useNodesState` / `useEdgesState` only in local drag-position handling during an
  active drag; commit final positions to the store on drag-end.
- Enable `proOptions={{ hideAttribution: true }}` on the `<ReactFlow>` component.
- Set `nodesDraggable`, `nodesConnectable`, and `elementsSelectable` to `false` in
  Preview Mode.

---

## Consequences

**Positive:**
- Eliminates weeks of graph-editor infrastructure work.
- Undo/redo, multi-select, keyboard shortcuts, zoom/pan, and minimap come out of the box.
- The TypeScript generics on node/edge data eliminate `any` casts throughout.

**Negative / Risks:**
- `@xyflow/react` uses an internal state manager that must be kept separate from the
  Zustand store. The dual-state boundary (React Flow internal + Zustand) requires the
  discipline that the store is always authoritative and React Flow always derived.
- Performance at 200+ nodes relies on React Flow's internal node virtualization. If
  virtualization does not engage by default, `nodeExtent` clamping and `only render
  visible nodes` may need explicit configuration. Benchmarking during QA (SC-03,
  SC-04) is mandatory.
- The xyflow team controls the release cadence. A breaking change in v13 would require
  a migration. Mitigated by pinning to `^12.x` and reviewing the changelog before any
  version bump.
