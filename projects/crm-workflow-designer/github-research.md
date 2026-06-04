# GitHub Research Report
## Project: CWFD-001 — Enterprise Visual Workflow Designer
## Phase: 3 — GitHub Research
## Date: 2026-06-01
## Researcher: github-researcher agent

---

## 1. Executive Summary

| Component | Library | Verdict |
|---|---|---|
| React Flow Canvas | @xyflow/react | ADOPT |
| Auto Layout | elkjs | ADOPT |
| Auto Layout (fallback) | @dagrejs/dagre | ADAPT (maintenance risk, use as secondary) |
| State Management | zustand | ADOPT |
| Immutable Helpers | immer | ADOPT |
| Undo / Redo | zundo | ADOPT WITH CAUTION |
| Data Fetching | @tanstack/react-query | ADOPT |
| Form Management | react-hook-form | ADOPT |
| Schema Validation | zod | ADOPT |
| Query Builder (fallback) | react-querybuilder | ADAPT |
| Export (PNG / SVG) | html-to-image | ADOPT |
| Export (PDF) | jspdf | ADOPT |
| CRM Workflow Designer (existing) | — | BUILD |

No existing open-source project covers the full CRM visual workflow designer
use-case at 1000+ stars. Every constituent library is best-of-class and well
maintained. The application shell and CRM integration layer must be built
from scratch.

---

## 2. Dependency Table

| Package | Stars (approx.) | License | Last Commit | Gzipped Size | Verdict |
|---|---|---|---|---|---|
| @xyflow/react (v12.x) | 27 000+ | MIT | 2025 (active) | ~75 KB | ADOPT |
| antvis/G6 (v5.x) | 11 800 | MIT | 2025 (active) | ~500 KB | REJECT (size) |
| jerosoler/Drawflow | 5 900 | MIT | 2022 (stale) | ~25 KB | REJECT (stale) |
| elkjs | 2 300 | EPL-2.0 | 2025 (active) | ~180 KB | ADOPT |
| @dagrejs/dagre | 5 500 | MIT | 2023 (semi-stale) | ~14 KB | ADAPT |
| zustand | 50 500+ | MIT | 2025 (active) | ~1.2 KB | ADOPT |
| immer | 28 000+ | MIT | 2025 (active) | ~2 KB | ADOPT |
| zundo | ~900 | MIT | 2025 (active) | <1 KB | ADOPT WITH CAUTION |
| @tanstack/react-query (v5) | 45 000+ | MIT | 2025 (active) | ~13 KB | ADOPT |
| react-hook-form (v7) | 43 600 | MIT | 2025 (active) | ~8.2 KB | ADOPT |
| zod (v4) | 35 400 | MIT | 2025 (active) | ~2 KB core | ADOPT |
| react-querybuilder (v8) | 1 600 | MIT | 2025 (active) | ~30 KB est. | ADAPT |
| react-awesome-query-builder | 2 100 | MIT | 2025 (active) | ~200 KB est. | REJECT (size) |
| html-to-image | 6 900 | MIT | 2025 (active) | ~5 KB | ADOPT |
| jspdf (v3) | 31 100 | MIT | 2025-11 (active) | ~80 KB | ADOPT |
| niklasvh/html2canvas | 30 000+ | MIT | 2024 (near-stale) | ~45 KB | REJECT (stale/forked) |
| nocode-js/sequential-workflow-designer | ~1 500 | MIT | 2025 (active) | ~40 KB | REJECT (linear only) |

---

## 3. Detailed Findings Per Component

---

### 3.1 React Flow Canvas

**Requirement:** Node-based graph editor with drag-and-drop, zoom/pan, minimap,
custom nodes/edges, undo/redo, multi-select, keyboard shortcuts.

**Repos evaluated:**

**xyflow/xyflow (@xyflow/react)**
- URL: https://github.com/xyflow/xyflow
- Stars: 27 000+
- License: MIT
- Last commit: Active in 2025; React 19 + Tailwind CSS 4 compatibility
  confirmed via official release notes (reactflow.dev/whats-new/2025-10-28)
- Bundle size: ~75 KB gzipped (@xyflow/react v12.x per bundlephobia)
- Fit: Purpose-built for this exact use-case. Supports custom nodes and edges,
  minimap, background, controls, undo/redo hooks, multi-select, keyboard
  shortcuts. The xyflow monorepo contains @xyflow/react (React package) and
  @xyflow/system (framework-agnostic core). Official examples demonstrate
  workflow builders. CRM web resource deployment (no server) is fully
  compatible — pure client-side library.
- Blocking issues: None.
- Verdict: ADOPT

**antvis/G6**
- URL: https://github.com/antvis/G6
- Stars: 11 800
- License: MIT
- Last commit: 2025 (active)
- Bundle size: ~500 KB gzipped (est. from G6 v5 full build) — exceeds budget
- Fit: Powerful graph engine but oriented toward data analysis and exploration
  rather than workflow building. No built-in workflow editor primitives (no
  port connectors, no step handles). Bundle weight alone disqualifies it for
  a 5 MB target.
- Blocking issues: Bundle size incompatible with 5 MB gzip budget.
- Verdict: REJECT

**jerosoler/Drawflow**
- URL: https://github.com/jerosoler/Drawflow
- Stars: 5 900
- License: MIT
- Last commit: 2022 — no releases for 3+ years, effectively unmaintained
- Fit: Vanilla JS library; no React integration; no TypeScript types; lacks
  multi-select, undo/redo. Does not meet stack requirement.
- Blocking issues: Abandoned, vanilla JS only.
- Verdict: REJECT

---

### 3.2 Auto Layout (Dagre / ELK)

**Requirement:** Automatic graph layout — hierarchical (top-down) and layered.
Must run in-browser without a server.

**Repos evaluated:**

**kieler/elkjs**
- URL: https://github.com/kieler/elkjs
- Stars: 2 300
- License: EPL-2.0 (Eclipse Public License 2.0)
- Last commit: 2025 (active)
- Bundle size: ~180 KB gzipped (elk.bundled.js)
- Fit: ELK is the gold-standard layout engine. Supports hierarchical,
  layered, force, and radial layouts. Runs entirely in the browser via a
  compiled JavaScript bundle. Officially recommended by the React Flow team
  for auto-layout in their examples. Can run in a Web Worker to prevent UI
  blocking during layout computation.
- License note: EPL-2.0 is not MIT but is permissive for use within an
  application (not a copyleft requirement for linking). It is widely used in
  commercial web applications. No GPL contamination. Acceptable for CRM web
  resource deployment.
- Blocking issues: EPL-2.0 requires attribution in about/license documentation.
  Legal should confirm acceptability — but this is standard practice for
  enterprise tooling that embeds ELK (VS Code, Eclipse Theia, and many others do).
- Verdict: ADOPT

**dagrejs/dagre (@dagrejs/dagre)**
- URL: https://github.com/dagrejs/dagre
- Stars: 5 500
- License: MIT
- Last commit: 2023 — semi-stale. The original dagre was effectively abandoned
  (last meaningful work circa 2015), then briefly revived by a Google engineer.
  Community GitHub issues (#188, #318, #352) confirm it is receiving minimal
  maintenance with many open bugs.
- Bundle size: ~14 KB gzipped — lightest option
- Fit: Hierarchical layout only. Well-known integration with React Flow
  (officially documented). Limited to Sugiyama layered layout. Works in-browser,
  no Web Worker required.
- Blocking issues: Semi-abandoned. Bug accumulation. Not suitable as primary
  layout engine.
- Verdict: ADAPT — use as lightweight fallback for simple linear flows where
  elk's 180 KB overhead is not yet needed. Include @dagrejs/dagre only if
  the elk.bundled.js exceeds bundle budget at ship time.

---

### 3.3 State Management

**Requirement:** Flat map store, undo/redo, structural sharing, selector
performance at 200+ nodes.

**Repos evaluated:**

**pmndrs/zustand**
- URL: https://github.com/pmndrs/zustand
- Stars: 50 500+
- License: MIT
- Last commit: 2025 (active). Confirmed React 18.0.0 through 19.2.0
  compatibility via CI matrix.
- Bundle size: 1.2 KB gzipped
- Fit: The standard choice for React Flow applications. React Flow's own
  examples and documentation use Zustand for managing flow state. Flat
  key-value store with slices pattern handles 200+ node graphs efficiently.
  No context provider boilerplate. Selector subscriptions prevent unnecessary
  re-renders.
- Blocking issues: None.
- Verdict: ADOPT

**immerjs/immer**
- URL: https://github.com/immerjs/immer
- Stars: 28 000+
- License: MIT
- Last commit: 2025 (active)
- Bundle size: ~2 KB gzipped
- Fit: Used as Zustand middleware (zustand/middleware/immer). Enables
  mutable-style draft updates on immutable state trees — essential for
  undo/redo history snapshots and complex node property edits. Zustand has
  first-class immer middleware included in its package.
- Blocking issues: None.
- Verdict: ADOPT

**charkour/zundo**
- URL: https://github.com/charkour/zundo
- Stars: ~900 (below 1000 threshold)
- License: MIT
- Last commit: 2025 (active). Used in production by Stability AI, Yext,
  KaotoIO, and NutSH.ai.
- Bundle size: <1 KB gzipped
- Fit: Zustand undo/redo middleware. Sub-700 bytes. Provides temporal state
  with configurable partializing (track only node positions, not entire graph).
  Designed specifically for Zustand — not a generic solution.
- Blocking issues: Below 1000-star threshold. However, the library is narrow
  in scope (pure undo middleware), tiny, well-tested, and used by
  well-known production systems. Acceptable under ADOPT WITH CAUTION with
  the understanding that a custom undo stack can replace it if the library
  becomes unmaintained.
- Verdict: ADOPT WITH CAUTION

---

### 3.4 Data Fetching / Server State

**Requirement:** CRM API calls (Xrm.WebApi) with caching, background refetch,
retry, stale-while-revalidate patterns. No Node.js server.

**Repos evaluated:**

**TanStack/query (@tanstack/react-query v5)**
- URL: https://github.com/TanStack/query
- Stars: 45 000+ (gained 26 000+ new stars in 2025; top state-management
  library in State of React 2025 survey)
- License: MIT
- Last commit: 2025 (active)
- Bundle size: ~13 KB gzipped
- Fit: Framework-agnostic query layer. The "server" concept is abstracted
  as any async function — Xrm.WebApi calls slot in perfectly as query
  functions. Provides cache invalidation, retry-on-error, stale-while-
  revalidate, and background refetch without any backend. React 19
  compatible. Used by Microsoft's own internal tooling.
- Blocking issues: None.
- Verdict: ADOPT

---

### 3.5 Form / Validation

**Requirement:** Property panels with validation; Zod schemas for all CRM
field types.

**Repos evaluated:**

**react-hook-form/react-hook-form**
- URL: https://github.com/react-hook-form/react-hook-form
- Stars: 43 600
- License: MIT
- Last commit: 2025 (active)
- Bundle size: 8.2 KB gzipped
- React 19 compatibility: Active discussion and migration guide exist.
  Core library works with React 19; some edge cases with React Compiler
  concurrent mode noted but tracked by maintainers.
- Fit: Uncontrolled form architecture avoids unnecessary re-renders in
  property panels with many fields. Integrates natively with Zod via
  @hookform/resolvers. Ideal for CRM field property panels.
- Blocking issues: None.
- Verdict: ADOPT

**colinhacks/zod**
- URL: https://github.com/colinhacks/zod
- Stars: 35 400
- License: MIT
- Last commit: 2025 (active — v4.1.0 released 2025)
- Bundle size: 2 KB gzipped (Zod v4 core; zod/mini for tree-shaken variant)
- Fit: TypeScript-first schema validation. Zod v4 ships a "Zod Mini" variant
  (zod/mini) for tree-shaking when only a subset of validators is needed —
  critical for staying under 5 MB budget. All CRM field shapes (string,
  number, optionset, datetime, lookup) map naturally to Zod primitives.
  Integration with react-hook-form is first-class via @hookform/resolvers/zod.
- Blocking issues: None.
- Verdict: ADOPT

---

### 3.6 FetchXML Builder / Query Builder

**Requirement:** Visual query builder generating FetchXML (fallback when
the CRM Advanced Filter iframe is unavailable).

**Repos evaluated:**

**react-querybuilder/react-querybuilder**
- URL: https://github.com/react-querybuilder/react-querybuilder
- Stars: 1 600
- License: MIT
- Last commit: 2025 (active — v8.x)
- Bundle size: ~30 KB gzipped (est.)
- Fit: Fully customizable React query builder. Supports SQL, MongoDB, CEL,
  JSONLogic, and many other export formats. Does NOT natively export FetchXML.
  However, the formatQuery function accepts a custom valueProcessor and
  ruleProcessor, making it possible to write a FetchXML serialiser as a thin
  wrapper (~50–100 lines). The component UI (field dropdown, operator
  selector, value inputs) is production-quality and would take weeks to build
  from scratch.
- Blocking issues: No built-in FetchXML output — requires a custom
  formatQuery processor. This is a well-documented extension point, not
  a limitation.
- Verdict: ADAPT — adopt the component, write a custom FetchXML
  formatQuery processor.

**ukrbublik/react-awesome-query-builder**
- URL: https://github.com/ukrbublik/react-awesome-query-builder
- Stars: 2 100
- License: MIT
- Last commit: 2025 (active)
- Bundle size: ~200 KB gzipped (estimated from full build including antd/mui)
  — significantly exceeds budget allocation for this component
- Fit: More opinionated and heavier than react-querybuilder. Tied to
  specific UI frameworks (AntD, MUI, Bootstrap). No FetchXML export. The
  200 KB cost is incompatible with a 5 MB total budget that must also
  accommodate React Flow (~75 KB) and other libraries.
- Blocking issues: Bundle size.
- Verdict: REJECT

---

### 3.7 Export (PNG / SVG / PDF)

**Requirement:** Export the React Flow canvas to PNG, SVG, and PDF from
the browser, with no server round-trip.

**Repos evaluated:**

**bubkoo/html-to-image**
- URL: https://github.com/bubkoo/html-to-image
- Stars: 6 900
- License: MIT
- Last commit: 2025 (active)
- Bundle size: ~5 KB gzipped
- Fit: Generates PNG, JPEG, SVG, and Blob from any DOM node using HTML5
  canvas + SVG foreignObject. Officially recommended by the React Flow team
  in their export examples (reactflow.dev/examples/misc/download-image).
  Handles SVG nodes, foreign objects, and embedded fonts. Works in all
  modern browsers without polyfills.
- Blocking issues: None.
- Verdict: ADOPT

**niklasvh/html2canvas**
- URL: https://github.com/niklasvh/html2canvas
- Stars: 30 000+
- License: MIT
- Last commit: Last meaningful release (v1.4.0) in 2022; 2024 fork attempt
  by maintainer. Snyk classifies maintenance as Inactive. A community fork
  (html2canvas-pro) is more actively maintained.
- Fit: DOM screenshot library. Does not generate SVG output. svg:foreignObject
  is not supported by html2canvas. React Flow canvases rely heavily on SVG —
  this is a direct incompatibility.
- Blocking issues: Stale, no SVG output, incompatible with React Flow canvas
  architecture.
- Verdict: REJECT

**parallax/jsPDF**
- URL: https://github.com/parallax/jsPDF
- Stars: 31 100
- License: MIT
- Last commit: 2025-11 (v3.0.3) — actively maintained
- Bundle size: ~80 KB gzipped
- Fit: Client-side PDF generation in the browser. Workflow: (1) use
  html-to-image to produce a PNG/JPEG of the canvas, (2) embed the image
  into jsPDF. This two-step pattern is standard practice and documented in
  both libraries. No server required. React/TypeScript compatible with
  type definitions included.
- Blocking issues: None.
- Verdict: ADOPT

---

### 3.8 Existing CRM / Dynamics 365 Workflow Designers

**Requirement:** Any open-source Dynamics CRM visual workflow designer built
on React at 1000+ stars that could be adopted or forked.

**Searches run:**
- `site:github.com dynamics crm workflow designer react open source visual`
- `site:github.com power platform workflow visual designer open source react`
- `site:github.com bpm workflow designer react flow crm stars 1000`

**Repos evaluated:**

**demianrasko/Dynamics-365-Workflow-Tools**
- URL: https://github.com/demianrasko/Dynamics-365-Workflow-Tools
- Stars: <500 (does not qualify)
- Description: A CRM solution extending Dynamics 365 workflow with custom
  activities. This is a server-side C# plugin library, not a visual designer.
- Verdict: Not applicable

**optimajet/workflow-designer-react-sample**
- URL: https://github.com/optimajet/workflow-designer-react-sample
- Stars: <200 (does not qualify)
- Description: A sample app for the OptimaJet WorkflowEngine commercial SaaS
  product. Requires a paid backend. Not an open-source library.
- Verdict: Not applicable

**nocode-js/sequential-workflow-designer**
- URL: https://github.com/nocode-js/sequential-workflow-designer
- Stars: ~1 500
- License: MIT
- Last commit: 2025 (active)
- Fit: Renders sequential (linear) workflows — steps in a chain, not a
  directed acyclic graph. Does not support parallel branches, loop-backs,
  or arbitrary graph topologies required for CRM workflows. A CRM workflow
  designer needs a true graph editor, not a linear step editor.
- Blocking issues: Linear-only topology; no DAG/arbitrary graph support.
- Verdict: REJECT for this project

**reaviz/reaflow**
- URL: https://github.com/reaviz/reaflow
- Stars: ~2 200
- License: Apache 2.0
- Last commit: 2024–2025 (maintained)
- Fit: React workflow editor built on top of ELK. More opinionated than
  React Flow; fewer custom node/edge primitives; smaller community and
  ecosystem. React Flow (27 000+ stars vs. 2 200) has a vastly larger
  ecosystem, more examples, and active xyflow team support.
- Blocking issues: Smaller ecosystem; React Flow is the better choice.
- Verdict: REJECT in favour of @xyflow/react

**Conclusion:** No open-source CRM workflow designer with 1000+ stars and the
required graph capabilities exists. The application shell, Xrm.WebApi
integration layer, CRM entity/field discovery service, node type registry,
and Dataverse persistence layer must all be built from scratch on top of the
adopted libraries.

---

## 4. Bundle Size Projection

All sizes are gzipped estimates. The 5 MB total gzip budget must include
React itself, Vite output chunks, and all libraries.

| Package | Gzipped Size |
|---|---|
| react + react-dom (v19) | ~45 KB |
| @xyflow/react (v12.x) | ~75 KB |
| elkjs (elk.bundled.js) | ~180 KB |
| zustand | ~1.2 KB |
| immer | ~2 KB |
| zundo | <1 KB |
| @tanstack/react-query (v5) | ~13 KB |
| react-hook-form (v7) | ~8.2 KB |
| zod (v4, using zod/mini) | ~2 KB |
| react-querybuilder (v8) | ~30 KB |
| html-to-image | ~5 KB |
| jspdf (v3) | ~80 KB |
| **Subtotal (libraries only)** | **~442 KB** |
| Application code (est.) | ~200–350 KB |
| **Projected total** | **~640–800 KB** |
| Budget | 5 120 KB |
| **Headroom** | **~4 300 KB** |

The projected bundle is well under the 5 MB gzip ceiling. elkjs at 180 KB
is the heaviest single dependency. If layout is moved to a Web Worker
(recommended), its parse cost moves off the main thread entirely.

Note: jsPDF (80 KB) should be loaded lazily on the export action to avoid
impacting initial load time.

---

## 5. Risk Flags

**EPL-2.0 (elkjs)**
- Risk level: Low-Medium
- Details: EPL-2.0 is a weak copyleft license. It requires attribution but
  does NOT require the consuming application to be open-sourced. It is used
  commercially by VS Code, Eclipse Theia, and thousands of enterprise apps.
  Acceptable for a CRM web resource. Legal team should add ELK to the
  third-party license notice file.
- Mitigation: Add eclipse/elk to the project's NOTICES.md with correct
  attribution text. This is a one-time action.

**zundo below 1000-star threshold**
- Risk level: Low
- Details: Stars = ~900. The library is sub-1 KB, has a narrow scope
  (pure undo middleware), and is actively used in known production systems.
  If it becomes unmaintained, the replacement path is straightforward:
  implement a simple temporal middleware in Zustand (~30 lines).
- Mitigation: Document the fallback plan in the ADR.

**@dagrejs/dagre semi-stale**
- Risk level: Low (if used only as fallback)
- Details: Dagre is only included as a lightweight fallback for simple
  linear flows. The primary layout engine is elkjs. Dagre's algorithm
  does not change — the library can be treated as frozen and used safely
  without further updates.
- Mitigation: Pin dagre to a fixed version. Do not upgrade without testing.

**niklasvh/html2canvas (REJECTED)**
- Risk level: N/A — rejected in favour of html-to-image.

**react-querybuilder requires custom FetchXML serialiser**
- Risk level: Low
- Details: This is a known extension point, not a limitation. The custom
  formatQuery processor is estimated at 50–100 lines of TypeScript.

---

## 6. Adopt vs Build Recommendation Per Component

| # | Component | Decision | Rationale |
|---|---|---|---|
| 1 | React Flow canvas | ADOPT @xyflow/react | 27 000+ stars, MIT, React 19 confirmed, purpose-built for this use case |
| 2 | Auto layout (primary) | ADOPT elkjs | Best-in-class layout algorithms, browser-ready, React Flow official examples use it |
| 3 | Auto layout (fallback) | ADAPT @dagrejs/dagre | 14 KB, MIT, works for simple linear flows; pin version due to semi-stale status |
| 4 | State management | ADOPT zustand | 50 500+ stars, 1.2 KB, React 19 compatible, used by React Flow team's own examples |
| 5 | Immutable helpers | ADOPT immer | Built-in Zustand middleware, 2 KB, standard for complex state trees |
| 6 | Undo / redo | ADOPT WITH CAUTION zundo | Sub-1 KB, production-tested, narrow scope, easy to replace if abandoned |
| 7 | Data fetching | ADOPT @tanstack/react-query | 45 000+ stars, MIT, works with any async function (including Xrm.WebApi) |
| 8 | Form management | ADOPT react-hook-form | 43 600 stars, MIT, 8.2 KB, Zod integration first-class |
| 9 | Schema validation | ADOPT zod | 35 400 stars, MIT, 2 KB (mini), TypeScript-first |
| 10 | Query builder (fallback) | ADAPT react-querybuilder | 1 600 stars, MIT, write custom FetchXML formatQuery processor on top |
| 11 | PNG / SVG export | ADOPT html-to-image | 6 900 stars, MIT, 5 KB, official React Flow recommendation |
| 12 | PDF export | ADOPT jspdf | 31 100 stars, MIT, 80 KB, active 2025 releases, lazy-load on export action |
| 13 | CRM workflow designer | BUILD | No qualifying open-source project exists. Build application shell on top of adopted libraries. |
