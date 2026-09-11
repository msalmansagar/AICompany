# Change note — Document view: the print page, on screen (DV)

**Engagement:** RPT-ENG-001 · **Workflow:** enhancement (refinement within the approved contract —
the runtime already promises the authored print page in PDF; this renders the same page model on
screen) · **Branch:** `feat/rpt-document-viewer` · **Date:** 2026-09-09

## What changed

The runtime viewer's default reading experience is now a **paged document**: white pages on a grey
canvas, sized by the authored page setup (`pdfPageSetup` — the same size/orientation/margins the PDF
obeys), with the report header, footer, page number and watermark repeated on every page. A
thumbnail rail navigates pages; the toolbar carries the report name and code, `‹ N / M ›` paging,
zoom (fit width / 50–150%), **Print** (browser print of exactly the pages, `@page` injected to the
authored size), **Export PDF**, and **Continuous view** — the historical rendering, one click away
and offering the way back. Existing views are otherwise untouched: the Node harness and any host
without a layout engine keep the continuous paths exactly as they were (`docDocumentViewWanted`).

## How pagination works

Two phases, so the decisions are testable:

- **Measure** — the continuous markup (designed layout, or the shared `gridBodyHtml` split out of
  `renderGrid`) renders into an offscreen host at page-content width; block, table-row, and
  band-grid-row heights are read once.
- **Plan (`docPlanPages`, pure)** — blocks are dealt onto pages from those numbers alone. Tables
  split by rows (first chunk keeps the block's heading, later chunks repeat the table head); band
  grids (L1) split by *visual rows* — side-by-side bands move together, a row is as tall as its
  tallest band; anything else is atomic. Every step places at least one piece, so a row or block
  taller than the page overflows visibly instead of looping. The Node suite drives the shipped
  planner with synthetic heights (`tests/test-document-view.mjs`, 26 assertions).
- **Build** — pages are assembled in a detached fragment and attached once. 🔴 Building them live
  re-laid the whole stack out per page while later chunks pulled rows from earlier ones — long
  reports locked the renderer for seconds and scroll anchoring dragged the canvas mid-document.

## Verified

- 806 browser assertions green (22 suites).
- Live-driven via the dev server against org5869857f: **Demo — everything at once** (6 landscape-A4
  pages, repeated header/table-head, masking and conditional formatting intact, RTL direction kept);
  **Loan Origination Lineage** (badge pills on page 1, half-width band-chart page 2 with panel
  chrome); thumbnail jump, page nav, fit-width zoom, continuous↔document round trip all exercised
  in Chrome.

## Also fixed in passing

- `report-engine-core.css` carried **19 lines of stray JavaScript** at top level (lines 294–312,
  an old paste) — invalid CSS that put the conditional-formatting rules after it at the parser's
  mercy. Removed; the same code lives in the JS files where it belongs.
- The browser restores the previous scroll position onto a rebuilt canvas after the wiring handler
  returns — the viewer re-asserts page one a frame later.

## Not in scope (recorded, not built)

- Designer preview parity — the designer's Preview tab keeps its continuous rendering.
- Intra-band table splitting: a single band taller than a page overflows its page rather than
  splitting inside the band shell.
- Per-page conditional-formatting re-scoping is unnecessary — formatting is applied before
  pagination, so styled rows carry their styles wherever they land.
