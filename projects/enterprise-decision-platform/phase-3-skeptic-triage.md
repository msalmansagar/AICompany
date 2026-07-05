# EDP-BRE-001 — Phase 3 Skeptic-Challenge Triage

**Engagement:** Enterprise Decision Platform — Business Rules Engine
**Phase:** 3 (Architecture) — pre-Phase-4 gate
**Date:** 2026-07-03
**Prepared by:** Maqsad AI — Solution Architect

The Phase 3 architecture raised 11 skeptic challenges, gated "must be addressed before Phase 4 begins." This document dispositions all 11. Each is one of: **RESOLVED** (already closed), **DESIGN COMMITMENT** (closed here by an architectural rule — no build cost), or **PHASE 4/5 WORK ITEM** (genuine, assigned to a later phase with an owner and exit gate).

## Disposition summary

| # | Challenge | Disposition | Owner / Gate |
|---|-----------|-------------|--------------|
| 1 | PCRM schema governance ownership undefined | **DESIGN COMMITMENT** | Architect (recorded below) |
| 2 | Rule Translator has no independent test suite | **PHASE 4/5 WORK ITEM** | backend + qa; Phase 4 exit gate |
| 3 | NCalc↔ZEN compatibility unproven / contingency | **RESOLVED** (Spike P3-R-1) | — |
| 4 | Metadata cache cold-start on large on-prem | **PHASE 4/5 WORK ITEM** | backend + frontend; benchmark + UX |
| 5 | Execution-log write path vs Dataverse throttle | **PHASE 4/5 WORK ITEM + ADR-13 candidate** | architect + backend |
| 6 | Production-pin flag one-field bypass | **RESOLVED** (ADR-12) | — |
| 7 | Zustand vs Horizon-2 debugger state model | **DESIGN COMMITMENT** | frontend (recorded below) |
| 8 | Complexity ceiling assumed, not measured | **PHASE 4/5 WORK ITEM** | backend + qa; Phase 4 sprint-1; satisfies C-002 |
| 9 | Managed-solution upgrade trap (required attrs) | **DESIGN COMMITMENT** | architect / devops (recorded below) |
| 10 | GoRules lock-in via stored JDM source | **DESIGN COMMITMENT + Phase 4 checkpoint** | architect (recorded below) |
| 11 | On-prem `RetrieveAllEntities` cold-start size | **PHASE 4/5 WORK ITEM** (folded into #4) | backend |

Net: **2 already resolved, 4 closed here as design commitments, 5 routed to Phase 4/5 as genuine work** (one of which is an ADR candidate). Nothing waved through silently.

---

## Design commitments (closed here — no build cost)

### C1 — PCRM Schema Governance (Challenge 1)
The Platform Canonical Rule Model JSON Schema is a **versioned, source-controlled contract owned by the EDP Architecture function**. A named **PCRM Schema Steward** approves every change. Backward-compatible additions are **minor** versions; breaking changes are **major** and require an ADR — and **no major version is permitted in Horizon 1 or Horizon 2**. Every PCRM document is validated by NJsonSchema at **two points**: Rule Translator output (save time) and native runtime load (execution time). A PCRM that fails schema validation is never stored and never executed.

### C7 — Designer State-Store Boundary (Challenge 7)
Zustand is accepted for Horizon 1. State stores are **partitioned by concern** (authoring, metadata, UI). The Horizon 2 visual-debugger replay state is a **new, isolated store**, not a modification of the authoring store — so it does not force a refactor of existing stores. Any future migration (e.g., Zustand → Redux Toolkit) is therefore a **contained, designer-internal change**, not cross-cutting. This boundary contract is the mitigation; no H1 action required.

### C9 — Managed-Solution Upgrade Safety (Challenge 9) — ALM invariant
For all solution versions after Horizon 1: **every new attribute is OPTIONAL with a platform-side default**; the platform **treats a missing optional attribute as its default at runtime**; **no required attribute is ever added to an existing entity that holds records**; any genuinely breaking schema change ships **with a simultaneous data-migration step**. This is an ALM invariant — future ADRs must not violate it.

### C10 — PCRM Author-Friendliness (Challenge 10) — design principle + checkpoint
To prevent GoRules lock-in via the stored JDM source, the PCRM must be designed for **both machine readability and human editability**: readable field aliases (not raw logical names alone), structured logic a UI can render, and no reliance on JDM-only constructs for round-trip. This is added to the PCRM design principles (Section 6). **Phase 4 checkpoint:** before the translator is signed off, verify the PCRM shape meets an "a future PCRM-direct designer could render and edit this" bar — not merely "the runtime can read it."

---

## Phase 4 / 5 work items (genuine — routed with owners and gates)

### W2 — Rule Translator Test Suite (Challenge 2, + Spike P3-R-1 residual)
**Why real:** the translator's output is the only thing the runtime sees; a translation defect is indistinguishable from a rule defect to a business user. The spike specifically flagged the **ZEN date method-chain parser** (`d().add("1d").diff(...)` → nested NCalc) as the primary Phase 4 execution risk.
**Commitment:** the Rule Translator gets an **independent test suite with 100% JDM-construct coverage** (every JDM node type + all 105 catalogued expression constructs) **before Phase 4 ships anything**, plus a **round-trip conformance category** (JDM → PCRM → runtime evaluation vs. known-correct outputs).
**Gate:** Phase 4 exit gate; Phase 5 conformance suite includes a JDM–PCRM round-trip category. **Owners:** backend (build), qa (conformance).

### W4/W11 — Metadata Cold-Start Performance & UX (Challenges 4 and 11)
**Why real:** on a 500+ entity on-prem org, full metadata retrieval can take 10–30s and return 10+ MB; this is on the designer startup path and is not covered by the "warm cache 200ms" target.
**Commitment:** (a) metadata fetch uses **targeted, paged retrieval** (only needed entities/attributes; minimal `EntityFilters`) rather than a blanket `RetrieveAllEntities` where avoidable; (b) the cache is **persisted** (CRM entity/config) so cold-start is rare, not per-session; (c) refresh runs as a **non-blocking background operation** — the designer shows a clear "metadata loading" state and remains usable on last-known cache; (d) a **cold-start SLA target is set from measurement** (see W8), not assumed.
**Gate:** Phase 4 benchmark (shared with W8) + Phase 5 large-org test. **Owners:** backend (retrieval/cache), frontend (loading UX).

### W5 — Execution-Log Write Path vs. Dataverse Throttle (Challenge 5) — **ADR-13 candidate**
**Why real:** a synchronous post-operation plugin writing an execution log per evaluation makes the CRM write a bottleneck at 100k–1M/day and couples decision latency to a CRM write; Dataverse enforces per-org API limits.
**Recommended decision direction (to be ratified as ADR-13 at Phase 4 start):** separate two tiers —
- **Governance audit events** (version transitions, approvals, production pins): **low-volume, durable, append-only, never dropped.**
- **Execution traces** (per-evaluation telemetry): **high-volume, written asynchronously/buffered, configurable retention and sampling, and degrade gracefully under throttle — a trace may be sampled or deferred, but a trace write must NEVER block or fail a decision.** Decision integrity outranks trace completeness.
Exact throttle thresholds and buffer sizing are **measured in Phase 4** (cloud + on-prem) before ADR-13 is finalized.
**Gate:** ADR-13 authored and accepted before runtime trace work; Phase 5 load test at 10× target. **Owners:** architect (ADR), backend (build).

### W8 — Complexity-Ceiling Measurement Harness (Challenge 8) — satisfies C-002 properly
**Why real:** the C-002 complexity ceiling (100 conditions / 200 rows / 5 nesting levels) is currently an **assumption**; the true ceiling could be higher or PCRM deserialization alone could blow the budget.
**Commitment:** **Phase 4 sprint 1** builds a benchmark harness measuring **PCRM deserialize + rule load + evaluation** across multiple complexity profiles on **both cloud and on-prem**. The C-002 ceiling values are then **set from measurement**, and the designer's "approaching ceiling" warning thresholds derive from those measured values. This is the correct, non-hand-waved discharge of CEO condition C-002.
**Gate:** Phase 4 sprint-1 exit; feeds W4/W11 (same harness measures metadata cold-start). **Owners:** backend (harness), qa (profiles).

---

## Cross-references
- **RESOLVED — Challenge 3:** Spike P3-R-1 (`spikes/p3-r1-ncalc-zen-coverage.md`) — ADR-11 confirmed, 0 load-bearing gaps, 31 `EDP_*` bridge functions define the bounded EDP-H1 grammar.
- **RESOLVED — Challenge 6:** ADR-12 (`phase-3-arch.md` §18) — defense-in-depth pin governance + protected production designation.
- **New ADR pending:** ADR-13 (execution-trace vs. audit write path) — direction set in W5, finalized in Phase 4 after measurement.

*This triage is a Phase 3 addendum. The 4 design commitments are binding architectural rules; the 4 work items are Phase 4/5 gates. Changes require an ADR.*
