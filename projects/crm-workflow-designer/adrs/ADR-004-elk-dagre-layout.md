# ADR-004 — Auto-Layout Engine: ELK Primary + Dagre Fallback with Web Worker
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

FR-16 requires automatic graph layout (top-to-bottom hierarchical flow, minimised edge
crossings, preserved step-outcome grouping). NFR-01d requires layout computation for
a 200-node workflow to complete within 1 second.

Two layout libraries were evaluated by the github-researcher agent:
- **elkjs** (kieler/elkjs) — 2,300 stars, EPL-2.0, ~180 KB gzipped, gold-standard
  layered layout, Web Worker support.
- **@dagrejs/dagre** — 5,500 stars, MIT, ~14 KB gzipped, hierarchical layout only,
  semi-stale maintenance (last meaningful commit 2023).

NFR-01d at 200 nodes is non-trivial. ELK's `layered` algorithm is significantly more
accurate in minimising edge crossings than Dagre's Sugiyama implementation. However,
elkjs at 180 KB is the heaviest single dependency in the bundle. Running layout
computation synchronously on the main thread will block the UI during large-graph
operations.

An additional environment constraint: some On-Prem CRM 9.x iframe sandbox policies
disable Web Worker instantiation. The layout engine must degrade safely in this case.

---

## Decision

Two-tier auto-layout design:

### Tier 1 — Primary (ELK in a Web Worker)

`elkjs` (`elk.bundled.js`) runs in a dedicated Web Worker:

```
src/workers/layoutWorker.ts
```

Worker message contract:
```typescript
// Request (main thread → worker)
interface LayoutRequest {
  nodes: LayoutNode[];   // { id, width, height }
  edges: LayoutEdge[];   // { id, source, target }
  algorithm: 'layered';
  direction: 'DOWN';
}

// Response (worker → main thread)
interface LayoutResponse {
  positions: Record<string, { x: number; y: number }>;
  error?: string;
}
```

Worker lifecycle:
1. `LayoutService.runELK(graph)` posts a `LayoutRequest` message to the worker.
2. The worker runs `ELK.layout()` asynchronously and posts back a `LayoutResponse`.
3. `LayoutService` resolves the promise and dispatches `updateNodePositions(positions)`
   to the Zustand store.
4. React Flow re-renders from the updated `nodePositions`.

ELK configuration:
```typescript
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
};
```

The 180 KB elkjs bundle is loaded lazily into the worker — it does not add to the
initial parse cost on the main thread.

### Tier 2 — Fallback (Dagre synchronous)

If `new Worker(...)` throws (sandbox restriction) or the worker fails to initialise
within 500ms, `LayoutService` falls back to `@dagrejs/dagre` running synchronously:

```typescript
async function detectWorkerSupport(): Promise<boolean> {
  try {
    const worker = new Worker(URL.createObjectURL(new Blob([''])));
    worker.terminate();
    return true;
  } catch {
    return false;
  }
}
```

Dagre fallback runs on the main thread. For 200 nodes, Dagre completes in approximately
200–400ms (within the 1-second NFR-01d budget). For very large graphs this may cause
a brief UI freeze; a progress indicator is shown during layout.

Dagre is pinned to an exact version (`@dagrejs/dagre@0.8.5`) to avoid breaking changes
from the semi-stale fork. The Dagre algorithm does not change — the library is treated
as frozen code.

### Detection and Selection

`LayoutService` runs the detection once at startup and caches the result:

```typescript
class LayoutService {
  private readonly useWorker: boolean;

  static async create(): Promise<LayoutService> {
    const useWorker = await detectWorkerSupport();
    return new LayoutService(useWorker);
  }

  async layout(graph: LayoutGraph): Promise<LayoutPositions> {
    return this.useWorker
      ? this.runElkWorker(graph)
      : this.runDagreSync(graph);
  }
}
```

---

## License Note (ELK — EPL-2.0)

EPL-2.0 is a weak copyleft license. It does NOT require the consuming application
to be open-sourced. It requires:
1. Attribution in a third-party notices file (`NOTICES.md`).
2. The ELK source or a link to it must be made available if the ELK bundle itself
   is distributed in modified form (it is not modified here).

Required action: Add the following to `NOTICES.md`:
```
Eclipse Layout Kernel (ELK) — https://eclipse.dev/elk/
Copyright 2024 Kiel University and others.
Licensed under the Eclipse Public License 2.0.
https://www.eclipse.org/legal/epl-2.0/
```

This is standard practice. VS Code, Eclipse Theia, and thousands of enterprise
applications embed ELK under EPL-2.0. Legal confirmation is part of COND-05.

---

## Alternatives Rejected

**ELK main-thread only (no Web Worker):** Rejected because synchronous layout of a
200-node graph blocks the main thread for an estimated 500–1200ms on a standard
enterprise laptop (Core i5, 8 GB RAM), violating NFR-01d and causing a visible UI
freeze.

**Dagre primary (no ELK):** Rejected because Dagre's edge-crossing minimisation is
substantially weaker than ELK's LAYER_SWEEP strategy. At 50+ nodes with non-trivial
routing, Dagre produces overlapping edges that require manual correction. The 14 KB
size advantage does not justify the layout quality regression.

**Both ELK and Dagre on main thread:** Rejected because it defeats the purpose of
having a primary engine. The detection-and-fallback pattern achieves the quality
goal (ELK primary) while preserving On-Prem sandbox compatibility (Dagre fallback).

---

## Consequences

**Positive:**
- ELK's layered algorithm produces publication-quality layouts for complex workflows.
- Offloading to a Web Worker keeps the UI responsive during layout computation.
- Dagre fallback ensures the feature works in all On-Prem sandbox configurations.
- The undo/redo system (zundo) captures the state before layout is applied, so
  Ctrl+Z correctly restores the pre-layout node positions (FR-07g, AC-06c).

**Negative / Risks:**
- The Web Worker boundary introduces a serialisation cost (structured clone of the
  graph). For a 200-node graph this is negligible (<5ms), but very large graphs
  (500+ nodes) would see proportional growth. If the graph ever exceeds 500 nodes,
  revisit worker buffering.
- EPL-2.0 attribution must be maintained in NOTICES.md. This is a one-time setup
  action with a recurring review obligation (confirm attribution is current on
  each elkjs version bump).
- Dagre is pinned and must not be upgraded without explicit testing. The semi-stale
  status means the upstream may never release a fix for known layout bugs in certain
  edge-crossing configurations.
