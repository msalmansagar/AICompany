# CWFD-002 SOP Designer — Full Engagement Summary
**Date:** 2026-06-12 | **Status:** APPROVED WITH CONDITIONS | **CEO Decision:** phase-6-ceo.md

---

## What Was Built

A two-tier process design system extending the existing CRM Visual Workflow Designer (CWFD-001).

**Tier 1 — Ops Excellence (SOP layer):**
- Four new Dataverse entities: `qdb_role`, `qdb_sop`, `qdb_sopstep`, `qdb_sopoutcome`
- SOP canvas (ReactFlow-based, role badge on step nodes instead of user/team)
- Roles management screen (CRUD for `qdb_role`)
- SOP validation engine (6 checks: VS-01 through VS-06)
- SOP publish/retire lifecycle

**Tier 2 — Business Analyst (Process layer — unchanged + wizard):**
- Optional `qdb_sop_id` lookup added to `qdb_work_item_record_type` (process entity)
- "Create Process from SOP" 3-step wizard (native RHF pattern, no new library)
- "From SOP" badge on process list

**Plugin:**
- `qdb_CreateProcessFromSop` Custom API — transactional, creates process + steps + outcomes from SOP in one call
- `RoleDeletionGuardPlugin` — prevents deletion of roles referenced by SOP steps

---

## Key Decisions

| Decision | Outcome |
|----------|---------|
| Architecture option | Option B — separate SOP entities; one nullable field on existing process entity |
| Wizard library | BUILD (native RHF `trigger()` pattern) — no new npm dep |
| Adapter extension | ISopAdapter sub-interface (ADR-008); ODataAdapter unchanged |
| Store isolation | Two independent Zustand stores (ADR-009); independent undo histories |
| Plugin type | Dataverse Custom API (not Custom Process Action) — cleaner, transactional |

---

## Release Conditions (must resolve before UAT)

| Code | Description |
|------|-------------|
| C-CEO-SOP-01 | **CRITICAL**: Fix cross-SOP StepId injection in plugin (DEFECT-SOP-001) |
| C-CEO-SOP-02 | Add ITracingService logging to CreateProcessFromSopPlugin |
| C-CEO-SOP-03 | Enable entity-level auditing on 4 new qdb_ entities at deployment |
| C-CEO-SOP-04 | Client written confirmation: new entities deployable to org5869857f |
| C-CEO-SOP-05 | All CWFD-001 regression tests pass |
| C-CEO-SOP-06 | Product owner confirms: role delete policy + SOP retire consequences |

---

## Output Files

| File | Contents |
|------|----------|
| `sop-feature/brd.md` | Full BRD — CWFD-002 v1.0 |
| `sop-feature/brd-approval.md` | CEO BRD review — APPROVED WITH CONDITIONS |
| `sop-feature/github-research.md` | GitHub research — BUILD across all areas |
| `sop-feature/phase-2-arch.md` | Architecture — ISopAdapter, sopStore, plugin design, ADR-008/ADR-009 |
| `sop-feature/phase-2-arch-approval.md` | CEO architecture review — APPROVED |
| `sop-feature/phase-3-tech.md` | Technical build — 15 production-quality files |
| `sop-feature/code-review.md` | Code review — PASS WITH REQUIRED FIX |
| `sop-feature/phase-4-qa.md` | QA strategy — 8 E2E scenarios, unit test stubs |
| `sop-feature/phase-5-audit.md` | Audit — 1 HIGH finding, 2 advisories |
| `sop-feature/phase-6-ceo.md` | CEO final — APPROVED WITH CONDITIONS |
