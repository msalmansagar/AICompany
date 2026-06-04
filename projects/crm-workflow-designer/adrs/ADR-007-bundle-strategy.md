# ADR-007 — Bundle Strategy: Chunk Split, Lazy Loading, and 5 MB Constraint
**Project:** CWFD-001 — CRM Visual Workflow Designer
**Status:** Accepted
**Date:** 2026-06-01
**Decided by:** Architect — Maqsad AI

---

## Context

CEO Condition COND-04 requires a formal bundle budget allocated by chunk with gzip
estimates, confirming the total is under 5 MB. The constraint is absolute (C-04):
the entire application must load as a CRM Web Resource with no CDN fallback (C-02,
A-10, NFR-02e).

The technology stack includes several large dependencies:
- `@fluentui/react-components` v9 — Microsoft's Fluent design system, large footprint
- `elkjs` — 180 KB gzipped layout engine
- `jspdf` — 80 KB PDF generation library
- `@xyflow/react` — 75 KB graph editor

Without code splitting, all dependencies load synchronously on the first render,
directly impacting the 3-second load time NFR (NFR-01a, SC-03).

CRM Web Resources are static files served by the CRM server. There is no server-side
rendering, no edge cache, and no CDN. All chunk loading occurs after the initial HTML
loads inside the CRM iframe.

---

## Decision

Use Vite 5 with manual Rollup chunk configuration (`build.rollupOptions.output.manualChunks`).
Split into named vendor chunks by dependency cluster. Lazy-load heavy dependencies
that are not required at initial render.

### Chunk Allocation Table

| Chunk Name | Contents | Estimated Gzip | Load Timing |
|---|---|---|---|
| `vendor-react` | react, react-dom | ~45 KB | Eager (initial load) |
| `vendor-flow` | @xyflow/react | ~75 KB | Eager (canvas renders immediately) |
| `vendor-fluent` | @fluentui/react-components | ~190 KB | Eager (all UI uses Fluent) |
| `vendor-state` | zustand, immer, zundo | ~5 KB | Eager |
| `vendor-query` | @tanstack/react-query | ~13 KB | Eager |
| `vendor-form` | react-hook-form, zod, @hookform/resolvers | ~10 KB | Eager |
| `vendor-layout` | @dagrejs/dagre | ~14 KB | Eager (Dagre fallback must be available before first layout) |
| `vendor-querybuilder` | react-querybuilder | ~30 KB | Eager (must be available when Path B activates without delay) |
| `app` | All application source code | ~150 KB | Eager |
| **Total eager load** | | **~532 KB** | **At initial page render** |
| `lazy-elk` | elkjs (elk.bundled.js) | ~180 KB | Lazy — loaded into Web Worker on first Auto-Layout click |
| `lazy-export-image` | html-to-image | ~5 KB | Lazy — loaded on first Export click |
| `lazy-export-pdf` | jspdf | ~80 KB | Lazy — loaded on first PDF export click |
| **Total including lazy** | | **~797 KB** | **After all lazy chunks triggered** |
| **Budget** | | **5,120 KB** | |
| **Headroom** | | **~4,323 KB** | |

### Vite Configuration (outline)

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-flow': ['@xyflow/react'],
          'vendor-fluent': ['@fluentui/react-components'],
          'vendor-state': ['zustand', 'immer', 'zundo'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-form': ['react-hook-form', 'zod', '@hookform/resolvers'],
          'vendor-layout': ['@dagrejs/dagre'],
          'vendor-querybuilder': ['react-querybuilder'],
        },
      },
    },
  },
});
```

### Lazy Loading Patterns

**ELK in Web Worker (never imported on main thread):**
```typescript
// src/workers/layoutWorker.ts — loaded as a Vite Worker
import ELK from 'elkjs/lib/elk.bundled';
const elk = new ELK();
```
The worker file is the only importer of elkjs. Vite bundles the worker separately
as `lazy-elk.js`. The worker is instantiated on first Auto-Layout click.

**html-to-image:**
```typescript
async function exportToPng(): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(canvasElement);
  downloadFile(dataUrl, 'workflow.png');
}
```

**jsPDF:**
```typescript
async function exportToPdf(): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { toPng } = await import('html-to-image');
  const imageData = await toPng(canvasElement, { pixelRatio: 2 });
  const doc = new jsPDF({ orientation: 'landscape', unit: 'px' });
  doc.addImage(imageData, 'PNG', 0, 0, doc.internal.pageSize.getWidth(), 0);
  doc.save('workflow.pdf');
}
```

### CI Bundle Size Gate

A script at `scripts/checkBundleSize.js` sums all `.js` and `.css` artifacts in
the `dist/` directory after build, computes the total gzip size, and fails the
CI pipeline if the total exceeds 4,500 KB (leaving 620 KB as a safety margin against
the 5,120 KB absolute limit).

```bash
# CI step
node scripts/checkBundleSize.js --limit 4500 --gzip
```

Failure message:
```
BUNDLE SIZE EXCEEDED: 4612 KB gzipped (limit: 4500 KB)
Largest chunks:
  vendor-fluent.js: 190 KB
  lazy-elk.js: 180 KB
  app.js: 150 KB
```

This gate runs on every pull request and every main branch push.

### CRM Web Resource File Structure

Each Vite output chunk becomes an individual CRM Web Resource:
```
qdb_/workflow-designer/index.htm
qdb_/workflow-designer/assets/vendor-react.[hash].js
qdb_/workflow-designer/assets/vendor-flow.[hash].js
qdb_/workflow-designer/assets/vendor-fluent.[hash].js
qdb_/workflow-designer/assets/vendor-state.[hash].js
qdb_/workflow-designer/assets/vendor-query.[hash].js
qdb_/workflow-designer/assets/vendor-form.[hash].js
qdb_/workflow-designer/assets/vendor-layout.[hash].js
qdb_/workflow-designer/assets/vendor-querybuilder.[hash].js
qdb_/workflow-designer/assets/app.[hash].js
qdb_/workflow-designer/assets/app.[hash].css
qdb_/workflow-designer/assets/lazy-elk.[hash].js
qdb_/workflow-designer/assets/lazy-export-image.[hash].js
qdb_/workflow-designer/assets/lazy-export-pdf.[hash].js
```

The `packageSolution.js` script enumerates the `dist/` directory and generates
the CRM solution XML `RootComponents` entries — one per file. No wildcard entries.
This follows the established pattern from Form Designer (FDWR-001, constitution
Article XI).

### Fluent UI Tree-Shaking

`@fluentui/react-components` v9 is fully tree-shaken when imported by component name:
```typescript
import { Button, Dialog, DialogBody } from '@fluentui/react-components';
```
Never import the barrel export (`import * from '@fluentui/react-components'`).
The 190 KB estimate assumes selective imports. The full Fluent UI v9 package is
approximately 600 KB gzipped — selective imports reduce this to ~190 KB for the
components used in CWFD-001.

---

## Alternatives Rejected

**Single bundle (no chunking):** A monolithic bundle cannot be partially cached. If
any dependency version changes, the entire ~797 KB re-downloads. Chunking enables
long-term caching of stable vendor chunks.

**Webpack 5:** Vite 5 produces smaller output for this stack due to Rollup's more
aggressive tree-shaking. Vite's `--reporter` flag provides per-chunk size output
that is trivially parseable by the CI gate script. Webpack configuration for
equivalent chunk splitting is significantly more complex.

**CDN for Fluent UI or React:** Violates C-02 and NFR-02e. All dependencies must
be bundled into the web resource artifact.

---

## Consequences

**Positive:**
- COND-04 is fully resolved: 532 KB eager + 265 KB lazy = 797 KB total,
  well within the 5,120 KB budget. Headroom is 4,323 KB.
- Lazy loading of ELK, html-to-image, and jsPDF keeps the initial parse cost at
  ~532 KB — meeting the 3-second load time NFR on a standard enterprise laptop.
- The CI gate prevents bundle regression — any dependency addition that pushes the
  total over 4,500 KB is caught before merge.
- Each vendor chunk is independently cacheable by the browser. After an application
  update that only changes `app.js`, the browser re-downloads only that chunk.

**Negative / Risks:**
- Fluent UI's 190 KB estimate depends on disciplined selective imports. If a
  developer adds a barrel import, the chunk can balloon significantly. A lint rule
  enforcing named imports from `@fluentui/react-components` must be added to the
  ESLint configuration.
- The hash in chunk filenames changes on every build. CRM Web Resource updates
  require re-uploading all files and updating solution XML. The `packageSolution.js`
  script automates this, but the CRM import process itself is manual in v1.
- jsPDF at 80 KB lazy is still a significant parse cost on the first PDF export
  click (~200-400ms on a low-end laptop). This is acceptable for an infrequent
  action (export is not on the critical path).
