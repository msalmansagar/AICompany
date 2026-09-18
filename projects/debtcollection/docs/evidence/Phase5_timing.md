# Phase 5 — effort estimate and time tracking

**Timezone:** `Asia/Qatar` (UTC+03:00); the machine clock is already on it, so no conversion is applied.
Every timestamp is captured from the machine at the moment it happened, and segment boundaries come
from git commit timestamps. **Nothing here is reconstructed from memory.**

---

## Start

| | |
|---|---|
| **Start (Asia/Qatar)** | **2026-09-18 21:02:36 (+03:00)** — the inventory began as Phase 4 closed |
| **Original estimated effort** | **32.50 hours** |
| **Original expected completion** | **2026-09-20 05:32:36 (+03:00)** |
| Branch | `feat/dcp-phase5-react-workspace`, from the approved Phase 4 baseline `1fc87bfb` |
| Estimate produced | 2026-09-18 21:21:16 (+03:00), after the inventory and before any implementation |

**This estimate is independent.** It is **not** anchored to Phase 4's 25.2 % outcome, and it is not a
conventional developer-day figure converted to hours. It is a bottom-up estimate of Claude execution
hours for work that, unlike Phase 4, has almost nothing to inherit.

---

## What the inventory found

### The approved baseline — `prototype/` (confirmed by the user, 2026-09-18)

14 files, ~150 KB, in git, modified 2026-08-31. A **Dynamics UCI-styled** workspace matching
ADR-DCP-07's full-page web-resource target, explicitly dual-CRM.

**21 views across 7 pages**, with role gating and badge counts:

| Group | Views |
|---|---|
| Workspace | My Day · Work Queues (92) · Collection Cases (10) |
| Customer | Customer & Loan 360 · Case Detail · Delinquency Intake *(manager)* |
| Strategy | Segmentation Matrix · Strategy Rules *(manager)* · Action Plan |
| Engagement | Promise to Pay (7) · Communication · Template Library |
| Workout | Disputes (5) · Restructuring · Legal Hand-off · Deceased & Claims |
| Oversight | Dashboards · Portfolio MIS *(manager, rm)* · Approvals (4) · Audit Trail |
| Admin | Configuration *(manager)* |

**Shared assets to preserve:** 25 helper functions (`bucketPill`, `orgBadge`, `slaChip`, `statusPill`,
`statusTone`, `money`, `moneyM`, `pct`, `toast`, `share`, plus the data selectors), **63 icons**,
**143 design tokens**, `components.css` (21 KB), `uci.css` (14 KB), 22 mock data collections including
`ORGS` (HL/BFD) and `ROLES` (officer/manager/rm/legal).

### Reusable from Phases 1–4 — the backend is ready

| Reusable | Consequence for Phase 5 |
|---|---|
| `paging.ts` — `PageRequest`, `Page`, opaque `ContinuationToken`, `fingerprintQuery` | **The exact contract the frontend needs.** Bounded reads, explicit `hasMore`, named restart refusals |
| `misService.ts` — `freshness`, `misAsOfDate`, `retrievedAt`, `staleReason` | The Live/Cached surface is already modelled server-side |
| `ICrmAdapter` incl. `retrievePage` | One interface; the browser implementation is the missing half |
| Domain types — case, lifecycle, strategy, assignment, eligibility, episode, snapshot, customer, facility | No business rule is re-implemented in JavaScript |
| `@dcp/types`, `@dcp/auth-adapters` | Shared contracts and auth seam |

### Genuinely new — and it is nearly everything on the frontend

> **`apps/` contains only `api`. There is no React application, no build, no component library, no
> browser `ICrmAdapter`, and no HTTP surface for cases or delinquency.**
> The three existing routes (`customers`, `health`, `identity-exceptions`) are Phase 1 legacy still
> bound to `msst_` (KI-50).

That is why this estimate is not a Phase 4-shaped number.

---

## Work-package estimate

| # | Work package | Hours | What is in it |
|---:|---|---:|---|
| 1 | Frontend scaffold & monorepo wiring | 1.50 | `apps/web` (Vite + React + TS), turbo pipeline, vitest, single-bundle build aimed at a web resource |
| 2 | Design system port | 2.00 | 143 tokens, `components.css`, `uci.css`, 63 icons → React styling primitives, preserving the approved visual intent |
| 3 | App shell, navigation & routing | 2.00 | UCI chrome, left nav over all 21 views with role gating and badge counts, command bar, role switcher, deep-link routing |
| 4 | Browser `ICrmAdapter` + CRM context adapter | 2.00 | `Xrm.WebApi` implementation of the **existing** interface incl. `retrievePage`; API version from `GlobalContext`; org URL and API base resolution. **Tracker row 65, Not Started** |
| 5 | Dual-CRM (HL/BFD) context | 1.00 | One workspace, controlled routing/context; contact vs account customer master; no frontend customer or facility master |
| 6 | **Large-data engine** | 3.00 | Virtualized list/grid, infinite scroll, request-state machine, stale-response suppression, duplicate protection by stable row identity. **The heart of the phase** |
| 7 | Server-side search, filter & sort | 1.50 | Wiring to the Phase 4 contract; criteria-change reset — cancel, discard continuation, clear, re-request first page |
| 8 | MIS freshness surface | 0.75 | Live vs Cached/Stale rendered distinctly, with *As of* / *Retrieved at* |
| 9 | Customer & Loan 360 | 1.50 | UI/service aggregation only — not a persistent customer entity |
| 10 | Case Workspace | 2.00 | Summary · Actions · PTP · Communications · Documents · Workout & Legal · Audit tabs |
| 11 | Remaining views + future-phase placeholders | 3.50 | The other 19 views, most of them grids reusing package 6; Phase 6–10 functionality preserved as identified placeholders with their UX contracts, never faked |
| 12 | RBAC UI behaviour | 0.75 | Role-driven visibility as **UX only**; CRM RBAC remains authoritative |
| 13 | Automated tests | 3.00 | Shell, routing, context, adapters, first/next/final page, empty, infinite-scroll trigger, virtualization, duplicate and stale prevention, filter/sort/search reset, loading states, errors and retry, freshness markers, RBAC, placeholders |
| 14 | Frontend performance tests | 1.50 | 10K / 50K / 100K populations, DOM size, memory growth, rapid and repeated scrolling, slow and failed pages |
| 15 | Web-resource packaging validation | 1.00 | Relative assets, routing, refresh and deep-link behaviour, CSP, artifact structure |
| 16 | Cloud runtime validation | 1.50 | The workspace against the real Dataverse-backed Phase 4 services — the KI-52 rule applied to the frontend |
| 17 | Phase 1–4 regression | 0.50 | All existing suites and live smokes |
| 18 | **UI Requirements Matrix** | 1.50 | Every page, view, KPI, grid, column, filter, action, dialog, badge and interaction mapped to its React implementation or its owning future phase |
| 19 | Documentation & 26-item gate report | 2.50 | React architecture, ADRs, API contracts, Known Issues, Risk Register, Testing Strategy, Change Log, Project Tracker, completion report |
| | **TOTAL** | **32.50** | |

### Why this is larger than Phase 4

Phase 4 estimated 19.0 h and consumed 4.783 h, because its fast packages sat on Phase 1–3 foundations
that already existed. **Phase 5 has no frontend foundation whatsoever.** The Phase 4 package that best
predicts this phase is background synchronisation — the one with no precedent — which consumed **77 %**
of its estimate, not 25 %.

Applying that reasoning rather than the headline ratio is the whole point of the calibration note in
`Phase4_timing.md`.

### Risks to the estimate

| Risk | Effect if it lands |
|---|---|
| Dynamics web-resource constraints (CSP, routing, refresh, asset paths) prove restrictive | Packages 1, 15 grow; may force a single-file bundle strategy |
| The browser `ICrmAdapter` meets `Xrm.WebApi` behaviour that differs from the service-side assumption — the KI-52 class again | Package 4 grows; mitigated by validating against the real platform early |
| Virtualization plus infinite scroll interacting badly with filter resets | Package 6 grows; it is already the largest single package |
| 19 views in package 11 turn out to be less uniform than the inventory suggests | Package 11 grows |

---

## Segment ledger

| # | From | To | Hours | Kind | Evidence |
|---|---|---|---:|---|---|
| 1 | 18 Sep 21:02:36 | 18 Sep 21:16:17 | **0.228** | Execution | Baseline inventory of both GUI candidates, rendered and scanned |
| — | 18 Sep 21:16:17 | *pending* | — | **Blocked** | Awaiting the baseline decision — an architectural choice that changes the whole matrix |
| 2 | *(resumed)* | 18 Sep 21:21:16 | **0.083** | Execution | Per-view inventory, reuse analysis, estimate |

*Updated as the phase runs.*

---

## Completion

*Recorded at the end of the phase from the machine clock.*

| | |
|---|---|
| Revised estimate, if any | — |
| Actual completion | — |
| Wall-clock elapsed | — |
| Blocked time | — |
| Effective Claude execution | — |
| Estimate variance | — |
| Percentage of estimate consumed | — |
