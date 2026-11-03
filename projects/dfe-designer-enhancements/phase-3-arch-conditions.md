# DFE-ENH-001 — Architecture Conditions Clearance
**Prepared by:** Maqsad AI — Architect
**Date:** 2026-07-10
**Engagement:** DFE-ENH-001 — Dynamic Form Engine Form Designer Enhancement Backlog
**Purpose:** Evidence-based clearance of CEO pre-Phase-1 conditions C-002 and C-003
(see `phase-1-ceo.md`, Conditions section).

---

## ADR-C002 — Dataverse ETag / Optimistic-Concurrency Support on DFE Entities

**Status:** Accepted
**Date:** 2026-07-10
**Decided by:** Architect (Maqsad AI)
**Condition cleared:** C-002 — "Maqsad AI Architect confirms whether Dataverse etag / If-Match
optimistic-concurrency is supported on all custom DFE entities in org5869857f."

---

### Context

FR-001 (Optimistic Concurrency Control) depends on the Dataverse Web API honoring the standard
OData etag / `If-Match` pattern: a GET returns an `@odata.etag` header on each record; a
subsequent PATCH with `If-Match: <etag>` must be rejected with HTTP 412 if the record was
modified by another caller between the GET and the PATCH.

The CEO required this to be confirmed against the live org (`org5869857f`) before FR-001
architecture could be finalized, because the consequence of the platform not supporting it is a
full alternative design (e.g., `versionnumber` column compare enforced by a plugin).

### Evidence — Live Probe Results

A three-step Node.js probe (`etag-probe.mjs`) was executed against
`https://org5869857f.crm4.dynamics.com/api/data/v9.2` using the existing service-principal
credentials (client ID `08e80e93-0bab-45ef-8372-2e554fa9af9b`, tenant
`d79e793c-f6de-4204-8508-7980a63df957`). Representative entity used: `qdb_form_definition`
(entity set `qdb_form_definitions`, record ID `4f3e199d-167b-f111-ab0e-000d3abcf32d`).

| Step | Operation | Sent | Observed HTTP status | Result |
|------|-----------|------|----------------------|--------|
| 1 | GET `qdb_form_definitions?$select=qdb_title&$top=1` | — | 200 OK | `@odata.etag: W/"187623029"` returned in response body |
| 2 | PATCH record with `If-Match: W/"000000000"` (stale / fabricated) | stale etag | **412 Precondition Failed** | Concurrency conflict correctly rejected |
| 3 | PATCH record with `If-Match: W/"187623029"` (correct current etag) | real etag | **204 No Content** | Correct-etag write accepted |

All three steps passed. The probe is in the session scratchpad at
`C:\Users\salma\AppData\Local\Temp\claude\...\scratchpad\etag-probe.mjs`.

### Platform Coverage Assumption

The etag / `If-Match` behavior is enforced by the Dataverse OData endpoint at the platform
layer, not per-entity configuration. It is not an opt-in feature on individual tables. All
Dataverse tables — standard and custom — participate in the same concurrency mechanism because
the engine is responsible for stamping and verifying the etag, not the table definition.

The DFE entities (`qdb_form_definition`, `qdb_form_tab`, `qdb_form_section`, `qdb_form_field`,
`qdb_validation_rule`, `qdb_business_rule`, `qdb_form_translation`, `qdb_submission_mapping`,
`qdb_access_policy`, `qdb_form_version`, and all design-layer entities) are standard custom
Dataverse tables and therefore inherit this platform-level behavior without entity-specific
configuration.

One representative entity (the primary form-definition table) was probed to confirm the
mechanism is active on this org. Probing every entity individually would be redundant given
the platform-layer enforcement; this assumption is explicitly stated here so it can be
challenged if Dataverse behavior changes in a future platform update.

### Decision

Dataverse etag / `If-Match` optimistic-concurrency **is confirmed supported** on org5869857f.
Condition C-002 is **CLEARED**. FR-001 architecture proceeds using the native etag mechanism.

### Recommended FR-001 Implementation Approach

The following approach is adopted for the Phase 1 architecture document:

1. **State shape:** The designer Zustand store carries an `etag` field alongside each loaded
   entity record. On `loadForm`, every API GET response captures the `@odata.etag` value from
   the response body and stores it keyed by record ID.

2. **Save requests:** Every PATCH (field save, tab save, section save, rule save, mapping save)
   must include the `If-Match: <stored-etag>` header derived from the store. The API client
   wrapper must enforce this — no PATCH without an etag is permitted at the service layer.

3. **Conflict response:** When Dataverse returns HTTP 412, the save is NOT retried silently.
   The designer surfaces a conflict resolution dialog:
   - "This form was modified by [other editor's display name] at [timestamp]. Your changes
     were not saved."
   - Options: (a) Reload latest version (discard local changes after confirmation), or (b)
     Review conflict (shows a read-only diff of local state vs server state — reuses the
     FR-004 diff component).

4. **Etag refresh:** After every successful 204 response, the new etag is read from the
   `OData-EntityId` or re-fetched via a lightweight GET. This keeps the store current for
   the next save without requiring a full form reload.

5. **Presence indicator (FR-002) relationship:** FR-002 (heartbeat banner) reduces conflict
   frequency but does not replace FR-001. Both run independently: FR-002 warns before work
   begins; FR-001 catches the conflict if warnings were ignored or missed.

### Consequences

- **Positive:** No alternative concurrency mechanism (plugin-enforced version counter,
  server-side locking, timestamp comparison) is needed. The implementation is a thin
  client-side wrapper on the standard OData pattern — approximately one service-layer method
  and one dialog component.
- **Positive:** The etag is stable across entity types, meaning the same pattern applies to
  tabs, sections, fields, rules, and all other DFE entities without per-entity adaptation.
- **Risk to monitor:** The etag value changes on every PATCH, including writes by other system
  processes (Power Automate flows, API scripts, provisioning jobs). A conflict raised against
  a non-human writer will surface the generic "form was modified by [system account]" message.
  The designer's conflict dialog should handle the case where the modifier's display name
  resolves to a service principal or system account and display "by a system process" rather
  than a blank name.

---

## ADR-C003 — DFE-STYLE-001 Status and FR-009 / FR-012(b) Ownership Boundary

**Status:** Accepted
**Date:** 2026-07-10
**Decided by:** Architect (Maqsad AI)
**Condition cleared:** C-003 — "Maqsad AI Architect confirms STYLE-001 status (paused with no
resume date in the next 90 days, or resumed with a target date). This determines whether
FR-009 and FR-012(b) scope is owned by this engagement or coordinated with STYLE-001."

---

### Context

The CEO's BRD approval noted a surface-area overlap risk (R-001): two DFE-ENH-001 requirements
(FR-009 keyboard/drag-drop and FR-012(b) Field Properties panel overflow) touch the same React
components as the paused DFE-STYLE-001 engagement. The CEO's ruling was: if STYLE-001 remains
paused with no confirmed resume date within 90 days, ENH-001 takes full ownership of both items;
if STYLE-001 resumes, the architect must define a coordination boundary before Phase 1 build
authorization.

### Evidence — STYLE-001 Status from Repository

**Branch inventory (as of 2026-07-10):**

| Branch | Last commit date | Last commit hash | Subject |
|--------|-----------------|-----------------|---------|
| `feat/dfe-style-001` | 2026-06-29 | `0819574f` | chore(dfe-style): clear CEO 'begin now' conditions S-06/S-07/S-08 (+SEC-07) |
| `feat/dfe-designer-style-load` | **2026-07-10** | `fff8eeef` | fix(designer): button-design load 400 + resilient style-load (DFE-STYLE-001) |

The `feat/dfe-designer-style-load` branch carries explicit `(DFE-STYLE-001)` scope tags in its
commit messages. As of today (2026-07-10) it has received six commits in the last two days
(2026-07-09 and 2026-07-10), covering style-load wiring, lookup filter syntax fixes, and
metadata-driven attribute dropdowns. This is active implementation work.

**STYLE-001 engagement state (from memory file and branch history):**
- All seven pipeline phases completed on `feat/dfe-style-001` by 2026-06-29.
- CEO final decision: APPROVED WITH CONDITIONS (8 staging conditions, 4 production conditions).
- The `feat/dfe-designer-style-load` branch represents the post-CEO-approval implementation
  continuation — the "begin now" items from the CEO decision are being executed.
- STYLE-001 is **ACTIVE** with confirmed build activity this week.

**STYLE-001 is not paused. The CEO's 90-day pause criterion is not met.**
The coordination path applies.

### STYLE-001 Scope vs. ENH-001 FR-009 and FR-012(b)

To draw the ownership boundary, the STYLE-001 scope must be understood:

- **What STYLE-001 owns:** Visual design system — section/field/button styling panels in the
  designer, CSS class injection (`cssClassName` on sections and fields), theme token persistence,
  CSS sanitizer, WCAG contrast enforcement at the token level, `qdb_css_allowlist_config` entity,
  layout-grid responsive columns, and the Field Properties panel's new "Data Governance" styling
  section. The active commits on `feat/dfe-designer-style-load` are wiring the style-load call
  on form open (loading `SectionDesign`, `FieldDesign`, `ButtonDesign` records) and fixing
  Dataverse $filter/$select syntax for the metadata-driven attribute dropdowns.

- **What STYLE-001 does not own:** Functional drag-drop behavior, keyboard reordering of fields
  and sections, dnd-kit event handling, virtualized rendering of the field list for performance,
  or any change to how items are moved within the canvas. STYLE-001 works on what things look
  like; FR-009 works on how things move.

### Decision

**FR-009 — Keyboard Reordering and Drag-Drop Reliability**

DFE-ENH-001 **owns FR-009 in full.** Rationale:

STYLE-001's scope is visual styling of existing canvas components — it does not modify the
drag-drop event system, the dnd-kit `DndContext` / `SortableContext` configuration, or the
keyboard interaction model. The functional requirements of FR-009 (Alt+Up / Alt+Down keyboard
reorder, dnd-kit freeze elimination, field-list virtualization) do not conflict with STYLE-001's
styling work at the behavior level.

**Structural coordination requirement:** Both engagements modify React components in the
designer's canvas area (field list, section containers, tab panels). To prevent merge conflicts
at the DOM/component level, ENH-001 Phase 1 work on FR-009 must be branched from
`feat/dfe-designer-style-load` (the active STYLE-001 branch), not from `main`. This means
FR-009 implementation assumes the STYLE-001 component structure as its baseline. When
STYLE-001 merges to `main`, ENH-001 rebases on top before its own merge.

This coordination rule applies to **FR-009 only** among the ENH-001 requirements because it
is the only FR-009 item that modifies shared canvas component files (drag-drop container
structure). All other Phase 1 items (FR-001, FR-002, FR-003, FR-006, FR-007, ENT-005, ENT-008
initial audit) operate on separate service, hook, or panel layers with no STYLE-001 overlap
and may branch from `main` independently.

No STYLE-001 team action is required to unblock FR-009 implementation. The boundary is
defined by what each engagement modifies in the component tree.

**FR-012(b) — Field Properties Panel Horizontal Overflow**

FR-012(b) is **deferred to DFE-STYLE-001.** Rationale:

The Field Properties panel is being actively extended by STYLE-001 on `feat/dfe-designer-style-load`
(the style-load wiring commit on 2026-07-10 includes loading `FieldDesign` records and rendering
them inside the Field Properties panel). FR-012(b) is a CSS layout fix (constrain content width
to panel width; eliminate horizontal scroll at viewport >= 1024px). Delivering this fix in
ENH-001 independently while STYLE-001 is restructuring the same panel would produce conflicting
layout rules that require re-resolution at merge time.

**STYLE-001 delivery commitment:** The STYLE-001 team must include the FR-012(b) overflow fix
as an explicit deliverable in the current STYLE-001 sprint (the active `feat/dfe-designer-style-load`
work). The acceptance criterion from ENH-001 FR-012(b) applies verbatim: no content in the
Field Properties panel overflows its container boundary at any viewport width above 1024px.

**Fallback clause:** If STYLE-001 does not deliver the overflow fix before ENH-001 Phase 1
build authorization is granted, ENH-001 will pick up FR-012(b) as a standalone CSS fix on its
own branch. The architect will reassess at the architecture checkpoint. This clause exists to
prevent FR-012(b) from becoming a permanent STYLE-001 blocker on ENH-001's delivery timeline.

FR-012(a) (Form Code auto-derive behavior) has no STYLE-001 overlap and proceeds in ENH-001
Phase 1 unconditionally, as stated in the CEO's phase plan rulings.

### Summary Ruling

| Item | Owner | Condition |
|------|-------|-----------|
| FR-009 (keyboard nav + dnd-kit performance) | **DFE-ENH-001** (full ownership) | Branch from `feat/dfe-designer-style-load`; rebase on STYLE-001 before merge |
| FR-012(a) (Form Code auto-derive) | **DFE-ENH-001** (full ownership) | No coordination needed; branch from `main` |
| FR-012(b) (Field Properties panel overflow) | **DFE-STYLE-001** (primary); fallback to DFE-ENH-001 | STYLE-001 team must commit to delivery in current sprint; architect reassesses at ENH-001 architecture checkpoint |

### Consequences

- **Positive:** Duplicate dnd-kit refactoring is avoided. One engagement owns the drag-drop
  behavior layer; one owns the visual styling layer. No duplicate work is funded.
- **Positive:** FR-012(b) is delivered as part of STYLE-001's active panel restructuring,
  where it is a natural side effect of the layout work already in progress.
- **Risk:** ENH-001 FR-009 takes a dependency on `feat/dfe-designer-style-load` as its branch
  base. If STYLE-001 introduces breaking changes to the component structure before ENH-001
  rebases, a rebase conflict must be resolved. This risk is low given both engagements are
  active simultaneously and the teams share codebase knowledge.
- **Risk:** The fallback clause for FR-012(b) adds a contingency decision point at the
  architecture checkpoint. The architect must verify STYLE-001's delivery status at that gate.

---

## ADR Index

| ADR | Title | Status | Date | Decided by |
|-----|-------|--------|------|------------|
| ADR-C002 | Dataverse ETag / Optimistic-Concurrency Support on DFE Entities | Accepted | 2026-07-10 | Architect |
| ADR-C003 | DFE-STYLE-001 Status and FR-009 / FR-012(b) Ownership Boundary | Accepted | 2026-07-10 | Architect |
