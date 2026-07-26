# Dependencies — CRM Visual Workflow Designer
## Project: CWFD-001
## Last updated: 2026-06-01 (github-researcher agent — full Phase 3 research pass)

All packages below have been evaluated for stars, license, bundle size, React 19
compatibility, and on-premise / browser-only deployment fit. See
`github-research.md` for the full evaluation detail.

---

## Adopted Libraries

| Package | Version Range | License | GitHub | Verdict |
|---|---|---|---|---|
| @xyflow/react | ^12.x | MIT | https://github.com/xyflow/xyflow | ADOPT |
| elkjs | ^0.9.x | EPL-2.0 | https://github.com/kieler/elkjs | ADOPT |
| @dagrejs/dagre | ^1.x | MIT | https://github.com/dagrejs/dagre | ADAPT (fallback) |
| zustand | ^5.x | MIT | https://github.com/pmndrs/zustand | ADOPT |
| immer | ^10.x | MIT | https://github.com/immerjs/immer | ADOPT |
| zundo | ^2.x | MIT | https://github.com/charkour/zundo | ADOPT WITH CAUTION |
| @tanstack/react-query | ^5.x | MIT | https://github.com/TanStack/query | ADOPT |
| react-hook-form | ^7.x | MIT | https://github.com/react-hook-form/react-hook-form | ADOPT |
| zod | ^4.x | MIT | https://github.com/colinhacks/zod | ADOPT |
| react-querybuilder | ^8.x | MIT | https://github.com/react-querybuilder/react-querybuilder | ADAPT |
| html-to-image | ^1.x | MIT | https://github.com/bubkoo/html-to-image | ADOPT |
| jspdf | ^3.x | MIT | https://github.com/parallax/jsPDF | ADOPT |
| graphlib algorithms | (via @dagrejs/dagre ^1.x) | MIT | https://github.com/dagrejs/graphlib | ADOPT (DP-1) — no new package |

---

## DP-1 addendum (2026-07-26) — parallel gateway research pass

Full detail: `dp-1-parallel-gateway/github-research.md`.

**Adopted:** graphlib's algorithms, reached through the **existing** `@dagrejs/dagre`
dependency, which already re-exports the `graphlib` namespace (`EditGraphLayout.ts`
already uses `dagre.graphlib.Graph`, and `graphlib.alg` is fully typed in dagre's
`index.d.ts`). Supplies `tarjan` (SCC), `topsort`, `dfs`, `components` and `findCycles`
for reachability and AND-join deadlock analysis.

**No package.json change, no new package to license, review or audit.** Rationale: the
graph-theoretic half of DP-1 validation is not domain logic and should not be hand-rolled;
O(V+E) algorithms also satisfy NFR-004, where repeated hand-rolled DFS would trend
quadratic on large processes.

**Rejected for DP-1:**

| Package | Stars | Reason for rejection |
|---|---|---|
| bpmn-js / bpmn-moddle | 8 000+ | Adopting BPMN notation is DP-8, not DP-1 — a model migration disguised as a dependency. Revisit if DP-8 is authorised |
| ts-edge | < 1 000 | Runtime execution engine; CWFD is design-time only |
| workflow-es | ~1 000 | Runtime engine, same architectural inversion; stale |
| serverlessworkflow/sdk-typescript | ~200 | Validates its own DSL, not an arbitrary graph; below threshold |
| lyraproj/ts-workflow | < 100 | FSM library, unmaintained, below threshold |
| Workflow SDK (workflow-sdk.dev) | n/a | Commercial durable-execution service; wrong layer |
| Woflan / PM4Py | n/a | Java/Python server-side soundness checkers; incompatible with a single-file browser web resource |

---

## Package Detail

---

### @xyflow/react
- **npm package:** `@xyflow/react`
- **Version range:** `^12.x`
- **License:** MIT — unrestricted commercial use, no attribution required in UI
- **GitHub:** https://github.com/xyflow/xyflow
- **Stars (2026-06):** 27 000+
- **Bundle size (gzipped):** ~75 KB
- **React 19 compatible:** Yes — confirmed in official release notes (2025-10-28)
- **Rationale:** The only node-graph editor for React that scores well on all
  criteria: 27 000+ stars, MIT license, React 19 compatible, TypeScript-first,
  client-side only (no server dependency), built-in minimap / controls /
  background / selection / keyboard shortcuts. React Flow is the de-facto standard
  for workflow designer UIs in the React ecosystem. Official examples demonstrate
  workflow builders, step editors, and DAG visualisers.
- **Usage note:** Import `@xyflow/react/dist/style.css` in `main.tsx`.
  Use `proOptions={{ hideAttribution: true }}` — MIT-permitted, no subscription.
- **Vite note:** Vite will inline the CSS via `assetsInlineLimit`. Ensure
  the web resource bundle includes the compiled CSS.

---

### elkjs
- **npm package:** `elkjs`
- **Version range:** `^0.9.x`
- **License:** EPL-2.0 (Eclipse Public License 2.0)
- **GitHub:** https://github.com/kieler/elkjs
- **Stars (2026-06):** 2 300
- **Bundle size (gzipped):** ~180 KB (elk.bundled.js)
- **Rationale:** Gold-standard automatic graph layout engine. Supports
  hierarchical, layered, force, and orthogonal layouts. Runs entirely in the
  browser with no server dependency. Officially recommended by the React Flow
  team in their auto-layout examples. The Web Worker mode prevents UI freeze
  during layout computation for large graphs (200+ nodes).
- **License note:** EPL-2.0 is a weak copyleft license that does NOT require
  the consuming application to be open-sourced. It requires attribution in the
  project's third-party license notice file. This is standard practice —
  VS Code, Eclipse Theia, and many enterprise applications embed ELK.
- **Required action:** Add Eclipse Layout Kernel attribution to NOTICES.md.
- **Usage note:** Load `elk.bundled.js` via a Web Worker for 200+ node graphs.
  Use `elk.min.js` in tests and for small graphs where synchronous layout is
  acceptable.

---

### @dagrejs/dagre
- **npm package:** `@dagrejs/dagre`
- **Version range:** `^1.x` (pin to exact version after install)
- **License:** MIT
- **GitHub:** https://github.com/dagrejs/dagre
- **Stars (2026-06):** ~5 500
- **Bundle size (gzipped):** ~14 KB
- **Rationale:** Lightweight fallback layout engine for simple linear or
  shallow-depth workflows where the 180 KB elk.bundled.js overhead is not
  warranted. Hierarchical (top-down) layout only. Well-known integration with
  React Flow (documented in reactflow.dev examples). Algorithm is stable and
  does not change — semi-stale maintenance is acceptable for a pinned fallback.
- **Risk:** Semi-stale maintenance. Pin to a specific version.
  Use elkjs as the primary layout engine. Include dagre only if
  bundle analysis shows elk is causing budget pressure.

---

### zustand
- **npm package:** `zustand`
- **Version range:** `^5.x`
- **License:** MIT
- **GitHub:** https://github.com/pmndrs/zustand
- **Stars (2026-06):** 50 500+
- **Bundle size (gzipped):** 1.2 KB
- **React 19 compatible:** Yes — CI matrix validates React 18.0.0 through 19.2.0
- **Rationale:** Standard state management for React Flow applications. Provides
  flat key-value stores with selector subscriptions that prevent unnecessary
  re-renders at 200+ nodes. The React Flow team's own examples use Zustand.
  Zero boilerplate (no actions, reducers, or Provider wrapping required).
  First-class immer middleware included at `zustand/middleware/immer`.
- **Usage note:** Use the slices pattern to separate flow state, UI state,
  and CRM metadata state into composable stores.

---

### immer
- **npm package:** `immer`
- **Version range:** `^10.x`
- **License:** MIT
- **GitHub:** https://github.com/immerjs/immer
- **Stars (2026-06):** 28 000+
- **Bundle size (gzipped):** ~2 KB
- **Rationale:** Used via `zustand/middleware/immer`. Enables mutable-style
  draft updates on immutable state trees. Essential for complex node property
  edits (update a nested field on a specific node without copying the entire
  graph) and for producing clean undo/redo snapshots via zundo.
- **Usage note:** Do not import immer directly in business logic. Use only
  through the Zustand immer middleware to avoid two sources of truth.

---

### zundo
- **npm package:** `zundo`
- **Version range:** `^2.x`
- **License:** MIT
- **GitHub:** https://github.com/charkour/zundo
- **Stars (2026-06):** ~900 (below 1000 threshold)
- **Bundle size (gzipped):** <1 KB
- **Rationale:** Sub-700 byte undo/redo middleware for Zustand. Designed
  specifically for Zustand temporal state. Used in production by Stability AI,
  Yext, KaotoIO, and NutSH.ai. The narrow scope (pure undo middleware) and
  tiny size make the risk of needing to replace it very low.
- **Adoption rationale (below threshold):** The library is below the 1000-star
  threshold but passes on all other criteria. The fallback is straightforward:
  a custom temporal middleware is approximately 30 lines of Zustand code.
  Document the fallback in the ADR.
- **Usage note:** Use the `partialize` option to snapshot only node positions
  and edge connections, not the entire UI state. This keeps undo history
  memory-efficient.

---

### @tanstack/react-query
- **npm package:** `@tanstack/react-query`
- **Version range:** `^5.x`
- **License:** MIT
- **GitHub:** https://github.com/TanStack/query
- **Stars (2026-06):** 45 000+ (top library in State of React 2025 survey)
- **Bundle size (gzipped):** ~13 KB
- **React 19 compatible:** Yes
- **Rationale:** Provides caching, background refetch, retry-on-error, and
  stale-while-revalidate patterns for all Xrm.WebApi calls. The "server" is
  any async function — Xrm.WebApi queries, entity metadata lookups, and form
  definition loads all work as query functions. Eliminates ad-hoc loading/error
  state management in components.
- **Usage note:** Wrap Xrm.WebApi calls in typed query functions. Use
  queryClient.invalidateQueries() after workflow saves to trigger refetches.
  QueryClientProvider must be placed at the application root.

---

### react-hook-form
- **npm package:** `react-hook-form`
- **Version range:** `^7.x`
- **License:** MIT
- **GitHub:** https://github.com/react-hook-form/react-hook-form
- **Stars (2026-06):** 43 600
- **Bundle size (gzipped):** 8.2 KB
- **React 19 compatible:** Yes (core library; some React Compiler edge cases
  tracked by maintainers — monitor v8 releases)
- **Rationale:** Uncontrolled form architecture avoids re-rendering the entire
  property panel on every keystroke. Zod integration via `@hookform/resolvers/zod`
  is first-class. Suitable for CRM field property panels that may have 15–30
  fields per node type.
- **Additional package required:** `@hookform/resolvers` (for Zod integration)

---

### zod
- **npm package:** `zod`
- **Version range:** `^4.x`
- **License:** MIT
- **GitHub:** https://github.com/colinhacks/zod
- **Stars (2026-06):** 35 400
- **Bundle size (gzipped):** ~2 KB (zod/mini tree-shaken core)
- **React 19 compatible:** Yes (framework-agnostic)
- **Rationale:** TypeScript-first schema validation. Zod v4 ships `zod/mini`
  for tree-shaking when only a subset of validators is needed — critical for
  the 5 MB budget. All CRM field types (string, integer, decimal, datetime,
  boolean, optionset, lookup) map naturally to Zod primitives. Schemas serve
  double duty: runtime validation and TypeScript type inference.
- **Usage note:** Use `import { z } from 'zod/mini'` to minimise bundle
  contribution. Define CRM field schemas in a shared `crmFieldSchemas.ts`
  file to avoid duplication across node property panels.

---

### react-querybuilder
- **npm package:** `react-querybuilder`
- **Version range:** `^8.x`
- **License:** MIT
- **GitHub:** https://github.com/react-querybuilder/react-querybuilder
- **Stars (2026-06):** 1 600
- **Bundle size (gzipped):** ~30 KB (estimated)
- **Rationale:** Production-quality visual query builder for React. Used as the
  FetchXML filter fallback when the CRM Advanced Filter Page iframe
  (`/SFA/goal/ParticipatingQueryCondition.aspx`) is unavailable. The library
  does not natively export FetchXML, but the `formatQuery` function accepts a
  custom `ruleProcessor` and `valueProcessor` to produce any output format.
  A FetchXML serialiser is estimated at 50–100 lines of TypeScript and is a
  well-documented extension point.
- **Custom work required:** Write a `fetchXmlFormatQuery` function that wraps
  `formatQuery` and produces valid Dataverse FetchXML. Unit-test against known
  CRM query patterns (equals, contains, begins-with, in, between, on-or-after).

---

### html-to-image
- **npm package:** `html-to-image`
- **Version range:** `^1.x`
- **License:** MIT
- **GitHub:** https://github.com/bubkoo/html-to-image
- **Stars (2026-06):** 6 900
- **Bundle size (gzipped):** ~5 KB
- **Rationale:** Generates PNG, JPEG, SVG, and Blob from any DOM node. Uses
  HTML5 canvas and SVG foreignObject — compatible with React Flow's SVG-based
  canvas. Officially recommended in React Flow export examples. Tiny footprint.
  Works in all modern browsers without polyfills.
- **Usage note:** Use `toPng()` for PNG export and `toSvg()` for SVG. For PDF,
  pipe the PNG output to jsPDF (see below). Set the background colour on the
  React Flow wrapper element before calling export to avoid transparent
  backgrounds in PNG output.

---

### jspdf
- **npm package:** `jspdf`
- **Version range:** `^3.x`
- **License:** MIT
- **GitHub:** https://github.com/parallax/jsPDF
- **Stars (2026-06):** 31 100
- **Bundle size (gzipped):** ~80 KB
- **Rationale:** Client-side PDF generation in the browser. No server required.
  Workflow: (1) html-to-image produces a PNG of the React Flow canvas at the
  desired DPI, (2) jsPDF embeds the PNG into a PDF document. This two-step
  pattern is standard and documented. TypeScript types included. v3.x active
  as of November 2025.
- **Usage note:** Import jsPDF lazily on the export action to avoid adding
  80 KB to the initial bundle parse time.
  ```typescript
  const { jsPDF } = await import('jspdf');
  ```

---

## Packages Evaluated and Rejected

| Package | Stars | Reason for Rejection |
|---|---|---|
| antvis/G6 | 11 800 | ~500 KB gzipped — exceeds budget; wrong use case (analysis, not workflow building) |
| jerosoler/Drawflow | 5 900 | Abandoned since 2022; vanilla JS only; no TypeScript; no React |
| niklasvh/html2canvas | 30 000+ | Stale (maintenance inactive per Snyk); no SVG output; incompatible with React Flow canvas |
| react-awesome-query-builder | 2 100 | ~200 KB gzipped — budget incompatible |
| nocode-js/sequential-workflow-designer | ~1 500 | Linear workflows only; no DAG / arbitrary graph topology |
| reaviz/reaflow | ~2 200 | Superseded by @xyflow/react (27 000+ stars, larger ecosystem, better support) |

---

## Third-Party License Notices Required

| Package | License | Action Required |
|---|---|---|
| elkjs | EPL-2.0 | Add Eclipse Layout Kernel attribution to project NOTICES.md |
| All others | MIT | No special action required beyond standard license file inclusion |
