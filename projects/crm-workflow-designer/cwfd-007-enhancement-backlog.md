# CWFD-007 — Enterprise Enhancement Backlog Brief

| Field | Value |
|---|---|
| Engagement ID | CWFD-007 |
| Title | CRM Workflow Designer — Enterprise Enhancement Backlog |
| Type | Backlog brief (pre-BA consolidation) |
| Status | DRAFT — awaiting CEO triage into discrete engagements |
| Date | 2026-07-19 |
| Author | Maqsad AI |
| Product | CRM Workflow Designer (React Flow web resource, `org5869857f`) |
| Related | CWFD-001/002 (delivered), CWFD-003/004/005/006 (recommended), PR #33 (process wizard) |

---

## 1. Purpose

CWFD-001 and CWFD-002 delivered a working, CEO-approved (with conditions) visual
workflow + SOP designer. During the process-wizard work (PR #33) we ran a structured
comparison of CWFD against enterprise BPM designers (Camunda / Power Automate / Nintex /
Appian / Bizagi / ServiceNow-class tools) to answer two questions: *what should we build
next, and where are the parity gaps?*

This brief consolidates that analysis into a single, ID'd backlog so each item can be
triaged by the CEO into its own BA→build engagement. **It is not itself a build
authorization** — it is the input to that decision.

## 2. Scope boundary (read first)

CWFD is a **design-time modeler**. It writes process configuration into Dataverse
entities; the actual execution happens in a separate CRM layer (plugins / flows).

> 🔴 **Correction (2026-08-09).** This section previously read *"the process engine,
> by current architecture, **has no runtime**."* **That was false**, and it is the
> most expensive sentence in this document — DP-1, DP-2 and DP-2b were all scoped
> against it and all shipped configuration that nothing reads.
>
> `org5869857f` has run `QDB.CRM.ProcessConfiguration`,
> `QDBCatalog.CRM.TatAndEscalations` and `QDB.RoundRobin` since 2026-05-05. The
> runtime was executed and verified end to end on 2026-07-27 (one task in, two
> tasks out, join guard refusing a premature completion by name). See
> `cwfd-005-runtime/discovery-existing-engine.md` and `runtime-verification.md`.
>
> **The engine had never been *used* — zero tasks, zero escalations — which is why
> the duplication went unnoticed. Registered and inert is not the same as absent.**
>
> Before scoping any DP item, read what the engine already does. The right shape
> for most of them is *surface what runs*, not *build what is missing*: DP-5
> dropped from L to S/M that way, and DP-3 turned out to be three capabilities and
> two defects rather than four new features.

The boundary that remains real: several "enterprise BPM" capabilities (live
instance execution, operational monitoring, in-flight impact) are **not the
designer's job**. They are catalogued here under a separate execution track (§5.E) so
they are neither lost nor mistakenly scoped into the designer.

## 3. Current-state capability summary

Grounded in the source tree, CWFD already provides, for a CRM-native modeler, a strong
base: multi-mode canvas (View / Edit / Simulation / Executive / Swimlane / Technical
graph builders), Dagre + ELK auto-layout, PNG/PDF export, drag-to-connect editing,
undo/redo (temporal store), live validation, keyboard shortcuts, step + auto-playback
simulation with path enumeration, a real Advanced-Find FetchXML condition builder,
versioning (major/minor + snapshot), draft→publish, an audit service, a complexity
analyzer, a full SOP designer (roles / swimlanes / typed steps / SOP→process
generation), and now the template-driven "Create a process" wizard.

## 4. Enterprise parity comparison

Legend: ✓ have · ⚠️ partial · ❌ gap · 🔗 belongs to another layer.

| Capability domain | Enterprise baseline | CWFD today | Verdict |
|---|---|---|---|
| Notation | BPMN 2.0 (events, gateways, sub-process, pools/lanes) | Custom notation; swimlanes | ⚠️ |
| Control flow | Exclusive + parallel + inclusive + event gateways; loops; multi-instance | Exclusive/conditional ✓, loops ✓ | ⚠️ |
| Timers / events | Timer, message, error, signal, escalation, boundary | None | ❌ |
| Human task mgmt | Assign, SLA/due dates, escalation, delegation, priority, queues | Assign user/team/round-robin ✓ | ⚠️ |
| Data & forms | Process variables, task form designer, data mapping, expressions | CRM entity binding | ❌ |
| Decisioning | DMN decision tables inline | — (EDP is the rules engine) | 🔗 |
| Connectors | REST/SOAP/DB/SaaS catalog, API tasks, webhooks | Dataverse-native only | ❌ |
| Reusability | Sub-processes, call activities, shared template library, snippets | 5 templates (via wizard) | ⚠️ |
| ALM / lifecycle | Version diff/compare, rollback, dev→test→prod promotion | Versioning + snapshot ✓, publish ✓ | ⚠️ |
| Collaboration | Multi-user editing/locking, comments, model change-approval | Single-user | ❌ |
| Governance / security | Design-time RBAC, publish approval gate, full audit, SoD | Roles screen, audit service | ⚠️ |
| Simulation / testing | What-if + saved regression scenarios, load sim | Step + auto-playback + path enum ✓ | ⚠️ |
| Runtime & monitoring | Live execution, dashboards, heatmaps, SLA breach, in-flight impact | Design-time only | 🔗 |
| Editor UX | Copy/paste, multi-select, snap/align, in-canvas search | Undo/redo, shortcuts, minimap ✓ | ⚠️ |
| AI assist | NL→draft process, layout suggestions, doc generation | — | ❌ |

## 5. Backlog

Effort key: S ≤ 2 days · M ≤ 1 week · L ≤ 2 weeks · XL > 2 weeks (own engagement).

### A. Process wizard (near-term, extends PR #33)

| ID | Item | Rationale | Effort | Depends on |
|---|---|---|---|---|
| WZ-1 | Same-entity binding guard | Prevent Parent == Task binding | S | **DONE (PR #33)** |
| WZ-1b | Regarding-field = lookup targeting Parent | True binding integrity | M | Real `EntityDefinitions` metadata query across 3 adapters + catalog-name reconciliation |
| WZ-2 | Template library (not 5 constants) | Categories + search; org "Save as template" | M | — |
| WZ-3 | Template preview thumbnail | Mini-graph on each tile before Create | S | Reuse in-memory graph build |
| WZ-4 | AI-drafted process | "Describe your process" → Claude API → draft graph | L | Claude API (in-house), graph-mapping schema |
| WZ-5 | "From SOP" inline preview | Show derived graph in Review vs. hand-off | M | `deriveProcessFromSop` |
| WZ-6 | Smart binding defaults | Pre-select parent from regarding target; remember last-used | S | WZ-1b metadata |

### B. Designer enterprise-parity (each ≈ its own engagement)

| ID | Item | Rationale | Effort |
|---|---|---|---|
| DP-1 | Parallel (AND) gateway + split/join | Concurrent branches — core BPM gap | L |
| DP-2 | Timers / SLA / escalation on steps | Due dates + escalation events | L |
| DP-3 | ✅ **DONE** — Human-task depth. Delivered: Read From Parent assignment, allow-bulk-approval, round-robin encoding fix, on-hold hook typed as an Action. **Delegation and queues were NOT delivered because the engine does not perform them** — see `cwfd-005-runtime/dp-3-human-task-depth.md` §6 before reopening | Enterprise task routing | M |
| DP-4 | Sub-processes / reusable call activities | Reuse + large-process readability | XL |
| DP-5 | External Call-API / connector step | Integration beyond Dataverse | L |
| DP-6 | Task form designer + process variables/expressions | Data context + task UX | XL |
| DP-7 | Multi-instance ("for each") steps | Batch/parallel-per-record | M |
| DP-8 | BPMN 2.0 import/export | Interop with external tooling | L |
| DP-9 | Editor UX: copy/paste, multi-select, align guides, search | Modeling productivity | M |
| DP-10 | DMN decision-table step | 🔗 Integrate EDP rules engine, not a rebuild | M |
| DP-11 | Saved test scenarios / regression | Adopt EDP's test-library pattern; project has no unit tests | M |

### C. Governance / CEO go-live conditions (gate production)

| ID | Condition |
|---|---|
| GC-1 | Confirm AuditService writes on SAVE_DRAFT + PUBLISH; native Dataverse audit on `qdb_*` |
| GC-2 | Web resource in managed solution layer in prod |
| GC-3 | Env vars from CI/CD secrets store; no hardcoded fallbacks in prod |
| GC-4 | Security-role audit: Write/Append on `qdb_*` restricted to Process Manager |
| GC-5 | Record TC-070 FPS test (30 FPS min at 50 nodes during drag) |
| GC-6 | Tech-lead sign-off on 30-day remediation (OData sanitisation, assertGuid, console gating, delete-audit logging) |

### D. Previously-recommended engagements (CEO Phase-7)

| ID | Engagement |
|---|---|
| CWFD-003 | Audit Trail Completeness (30-day) |
| CWFD-004 | Impact Analysis Engine + version diff / compare / rollback |
| CWFD-006 | `DataverseAdapter.ts` refactor (1,060 lines — constitution violation) |

### E. Execution-layer track (NOT the designer)

| ID | Item |
|---|---|
| RT-1 | Runtime engine integration — execute instances (CWFD-005) |
| RT-2 | Operational monitoring: live instance view, heatmaps, cycle-time, SLA-breach dashboards |
| RT-3 | In-flight case impact when a published process changes |

### F. Open design decisions (choices, not features)

- **Q1** Template library scope — how many/which starter templates; support org-custom "Save as template"?
- **Q2** "From SOP" — inline preview in the wizard vs. hand-off to the SOP designer?
- **Q3** Collaboration model — single-user (today) vs. model locking + comments + maker-checker on the *design*?

## 6. Prioritization

- **P0 — correctness / trust (clears go-live conditions):** WZ-1b, GC-1..GC-6, design-time RBAC + publish approval gate, CWFD-003.
- **P1 — enterprise parity, high value:** DP-1 (parallel gateway), DP-2 (SLA/escalation), CWFD-004 (version diff/rollback), DP-4 (sub-processes), DP-5 (Call-API).
- **P2 — differentiation / polish:** WZ-4 (AI draft) + WZ-2 (template library), DP-9 (editor UX), DP-11 (test scenarios), DP-8 (BPMN interop), CWFD-006 (adapter refactor).
- **Separate track (execution layer):** RT-1..RT-3 (CWFD-005).

## 7. Recommended sequencing

1. Close remaining **go-live conditions (GC-1..6)** + **CWFD-003** — unblocks production.
2. Land the **near-term wizard items** (WZ-2/3/6) as a fast follow to PR #33; schedule **WZ-1b** with DP-scoped metadata work.
3. Open a **BA engagement for the first P1 parity item** (recommend DP-1 parallel gateway or DP-2 SLA/escalation — highest demand, self-contained).
4. Treat **DP-4 / DP-6 / RT-*** as XL engagements, each with its own BRD.

## 8. Next step (process gate)

Per the Maqsad pipeline, any item selected for build re-enters at the **BA phase**
(BRD) and the **CEO Phase-1 gate** before architecture. This brief is the triage input;
it does not authorize build. **Recommended CEO action:** pick the next 1–2 engagements
from §6 (P0/P1) and greenlight their BRDs.
